"""Jarvis Core FastAPI service.

Usage
-----
python JarvisCore.py [--host HOST] [--port PORT] [--models-dir PATH] [--token TOKEN] [--no-auto-start]

This script exposes a small HTTP API with the following endpoints:
* ``GET /health``   – simple status check.
* ``GET /config``   – returns the current configuration (the token is masked).
* ``GET /logs``     – returns the most recent structured log entries.

Configuration resolution order (highest priority first):
1. Command line arguments.
2. Environment variables (prefixed with ``JARVIS_CORE_``).
3. ``jarvis_core/config.json``.
4. Built-in defaults.

Logs are formatted as JSON objects to make downstream processing easier.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from collections import deque
from pathlib import Path
from typing import Any, Deque, Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, DirectoryPath, Field, PositiveInt, ValidationError, validator
from starlette.requests import Request
from starlette.responses import JSONResponse
import uvicorn


APP_NAME = "jarvis-core"
DEFAULT_CONFIG_PATH = Path(__file__).with_name("config.json")
ENV_PREFIX = "JARVIS_CORE_"
MAX_LOG_RECORDS = 200


class AppConfig(BaseModel):
    """Application configuration validated by Pydantic."""

    host: str = Field("0.0.0.0", description="Host/IP where the API will listen")
    port: PositiveInt = Field(8000, description="TCP port for the API server")
    models_dir: DirectoryPath = Field(..., description="Directory containing ML models")
    token: Optional[str] = Field(None, description="Optional authentication token")
    auto_start: bool = Field(True, description="Whether to automatically start the server")

    @validator("host")
    def validate_host(cls, value: str) -> str:  # noqa: D417
        if not value:
            raise ValueError("Host cannot be empty")
        return value


class InMemoryLogHandler(logging.Handler):
    """Logging handler that stores structured log entries in memory."""

    def __init__(self, max_records: int = MAX_LOG_RECORDS) -> None:
        super().__init__()
        self.records: Deque[Dict[str, Any]] = deque(maxlen=max_records)

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(structured_log_record(record))


def structured_log_record(record: logging.LogRecord) -> Dict[str, Any]:
    """Convert a log record into a JSON-serialisable dictionary."""

    standard_keys = {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
    }
    extra = {
        key: value
        for key, value in record.__dict__.items()
        if key not in standard_keys and not key.startswith("_")
    }

    payload = {
        "name": record.name,
        "level": record.levelname,
        "timestamp": record.created,
        "message": record.getMessage(),
        "module": record.module,
        "function": record.funcName,
        "line": record.lineno,
    }
    if extra:
        payload["extra"] = extra
    return payload


def configure_logging() -> InMemoryLogHandler:
    """Set up structured logging and return the in-memory handler."""

    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    in_memory_handler = InMemoryLogHandler()
    stream_handler = logging.StreamHandler()

    formatter = logging.Formatter(
        '{"timestamp": %(created)f, "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}'
    )
    stream_handler.setFormatter(formatter)

    logger.handlers = [stream_handler, in_memory_handler]
    return in_memory_handler


def load_config_from_file(path: Path = DEFAULT_CONFIG_PATH) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as config_file:
            return json.load(config_file)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid JSON in configuration file {path!s}: {error}") from error


def load_config_from_env() -> Dict[str, Any]:
    mapping = {
        "host": os.getenv(f"{ENV_PREFIX}HOST"),
        "port": os.getenv(f"{ENV_PREFIX}PORT"),
        "models_dir": os.getenv(f"{ENV_PREFIX}MODELS_DIR"),
        "token": os.getenv(f"{ENV_PREFIX}TOKEN"),
        "auto_start": os.getenv(f"{ENV_PREFIX}AUTO_START"),
    }

    cleaned: Dict[str, Any] = {k: v for k, v in mapping.items() if v is not None}
    if "auto_start" in cleaned:
        cleaned["auto_start"] = cleaned["auto_start"].lower() not in {"0", "false", "no"}
    if "port" in cleaned:
        try:
            cleaned["port"] = int(cleaned["port"])
        except ValueError as error:
            raise RuntimeError("Environment variable JARVIS_CORE_PORT must be an integer") from error
    return cleaned


def parse_cli_args(args: Optional[list[str]] = None) -> Dict[str, Any]:
    parser = argparse.ArgumentParser(description="Launch the Jarvis Core HTTP service.")
    parser.add_argument("--host", help="Host/IP address to bind the server")
    parser.add_argument("--port", type=int, help="Port to expose the HTTP server")
    parser.add_argument("--models-dir", help="Path to the directory containing ML models")
    parser.add_argument("--token", help="Optional API token for securing the service")
    parser.add_argument(
        "--no-auto-start",
        action="store_true",
        help="Load configuration but do not launch the HTTP server (useful for validation only)",
    )

    parsed = parser.parse_args(args=args)
    cli_config: Dict[str, Any] = {k: v for k, v in vars(parsed).items() if v is not None}
    if cli_config.get("no_auto_start"):
        cli_config["auto_start"] = False
        del cli_config["no_auto_start"]
    return cli_config


def resolve_config(cli_args: Optional[list[str]] = None) -> AppConfig:
    """Merge configuration sources with well-defined precedence."""

    file_config = load_config_from_file()
    env_config = load_config_from_env()
    cli_config = parse_cli_args(cli_args)

    combined: Dict[str, Any] = {**file_config, **env_config, **cli_config}

    # Ensure models_dir is resolved relative to the configuration file directory when needed
    if "models_dir" in combined:
        models_path = Path(str(combined["models_dir"]).strip()).expanduser()
        if not models_path.is_absolute():
            models_path = (DEFAULT_CONFIG_PATH.parent / models_path).resolve()
        combined["models_dir"] = models_path

    try:
        config = AppConfig(**combined)
    except ValidationError as error:
        raise RuntimeError(f"Invalid configuration: {error}") from error

    return config


def create_app(config: AppConfig, log_handler: InMemoryLogHandler) -> FastAPI:
    app = FastAPI(title="Jarvis Core", version="0.1.0")

    @app.middleware("http")
    async def authenticate_request(request: Request, call_next):  # type: ignore[override]
        if config.token:
            request_token = request.headers.get("Authorization")
            if request_token != config.token:
                logging.getLogger(APP_NAME).warning("Unauthorized access attempt")
                raise HTTPException(status_code=401, detail="Unauthorized")
        response = await call_next(request)
        return response

    @app.get("/health")
    async def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.get("/config")
    async def get_config() -> Dict[str, Any]:
        data = config.dict()
        if data.get("token"):
            data["token"] = "***"
        return data

    @app.get("/logs")
    async def get_logs() -> JSONResponse:
        return JSONResponse(list(log_handler.records))

    return app


def main(cli_args: Optional[list[str]] = None) -> None:
    log_handler = configure_logging()
    logger = logging.getLogger(APP_NAME)

    config = resolve_config(cli_args)
    logger.info("Configuration loaded", extra={"config": config.dict(exclude={"token"})})

    app = create_app(config, log_handler)

    if not config.auto_start:
        logger.info("Auto-start disabled; HTTP server not launched")
        return

    uvicorn.run(app, host=config.host, port=config.port, log_config=None)


if __name__ == "__main__":
    main()
