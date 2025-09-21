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
import asyncio
import json
import logging
import os
import shlex
from collections import deque
from pathlib import Path
from typing import Any, AsyncGenerator, Deque, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, DirectoryPath, Field, PositiveInt, ValidationError, validator
from starlette.requests import Request
from starlette.responses import JSONResponse
import uvicorn

from jarvis_core.llm import (
    GenerationResult,
    LLMManager,
    ModelLoadError,
    ModelNotLoadedError,
    ModelRuntimeError,
)
from jarvis_core.models import ModelRegistry, ModelRegistryError, ModelState


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


class DownloadModelRequest(BaseModel):
    repo_id: str
    filename: str
    hf_token: Optional[str] = None
    checksum: Optional[str] = None
    tags: list[str] = Field(default_factory=list)

    @validator("repo_id", "filename")
    def validate_not_empty(cls, value: str) -> str:  # noqa: D417
        if not value:
            raise ValueError("This field cannot be empty")
        return value


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    prompt: str
    system_prompt: Optional[str] = None
    history: List[ChatMessage] = Field(default_factory=list)
    stream: bool = False


class ActionPathRequest(BaseModel):
    path: str


class ActionReadRequest(ActionPathRequest):
    encoding: Optional[str] = "utf-8"
    offset: int = Field(0, ge=0)
    length: Optional[int] = Field(None, ge=0)
    max_bytes: int = Field(65536, gt=0)


class ActionRunRequest(BaseModel):
    command: List[str] | str
    cwd: Optional[str] = None
    timeout: int = Field(60, ge=1)
    shell: bool = False

    @validator("command")
    def validate_command(cls, value: List[str] | str) -> List[str] | str:  # noqa: D417
        if isinstance(value, list):
            if not value:
                raise ValueError("command cannot be empty")
            if not all(isinstance(item, str) and item for item in value):
                raise ValueError("command entries must be non-empty strings")
        else:
            if not value or not value.strip():
                raise ValueError("command cannot be empty")
        return value


class InMemoryLogHandler(logging.Handler):
    """Logging handler that stores structured log entries in memory."""

    def __init__(self, max_records: int = MAX_LOG_RECORDS) -> None:
        super().__init__()
        self.records: Deque[Dict[str, Any]] = deque(maxlen=max_records)

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(structured_log_record(record))


def _format_sse_event(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _is_subpath(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _resolve_allowed_path(path_str: str, allowed_roots: List[Path]) -> Path:
    if not allowed_roots:
        raise HTTPException(status_code=500, detail="Path restrictions not configured")

    candidate = Path(path_str)
    if not candidate.is_absolute():
        for root in allowed_roots:
            resolved = (root / candidate).resolve()
            if _is_subpath(resolved, root):
                return resolved
        resolved = (allowed_roots[0] / candidate).resolve()
    else:
        resolved = candidate.resolve()

    if not any(_is_subpath(resolved, root) for root in allowed_roots):
        raise HTTPException(status_code=403, detail="Path is outside of the allowed directories")
    return resolved


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
    registry = ModelRegistry(Path(config.models_dir))
    llm_manager = LLMManager()
    allowed_roots = sorted({Path.cwd().resolve(), Path(config.models_dir).resolve()})

    app.state.model_registry = registry
    app.state.llm_manager = llm_manager
    app.state.allowed_paths = allowed_roots

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

    @app.post("/chat/completions")
    async def chat_completions(payload: ChatCompletionRequest):
        history_payload = [item.dict() for item in payload.history]
        try:
            if payload.stream:
                generator = await llm_manager.generate(
                    payload.prompt,
                    system_prompt=payload.system_prompt,
                    history=history_payload,
                    stream=True,
                )

                async def event_stream() -> AsyncGenerator[str, None]:
                    try:
                        async for event in generator:
                            yield _format_sse_event(event)
                    except ModelRuntimeError as error:
                        yield _format_sse_event(
                            {"type": "error", "message": str(error)}
                        )

                return StreamingResponse(event_stream(), media_type="text/event-stream")

            result = await llm_manager.generate(
                payload.prompt,
                system_prompt=payload.system_prompt,
                history=history_payload,
                stream=False,
            )
        except ModelNotLoadedError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except ModelRuntimeError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

        assert isinstance(result, GenerationResult)
        response: Dict[str, Any] = {"message": result.message}
        if result.actions:
            response["actions"] = result.actions
        return response

    @app.get("/models")
    async def list_models() -> list[Dict[str, Any]]:
        return await registry.list_models()

    @app.post("/models/{model_id}/download", status_code=202)
    async def download_model(model_id: str, payload: DownloadModelRequest) -> Dict[str, Any]:
        try:
            return await registry.start_download(
                model_id,
                payload.repo_id,
                payload.filename,
                hf_token=payload.hf_token,
                checksum=payload.checksum,
                tags=payload.tags,
            )
        except ModelRegistryError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error

    @app.post("/models/{model_id}/activate")
    async def activate_model(model_id: str) -> Dict[str, Any]:
        try:
            metadata_obj = await registry.get_metadata(model_id)
        except ModelRegistryError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error

        if metadata_obj.state not in {ModelState.READY, ModelState.ACTIVE}:
            raise HTTPException(status_code=409, detail="Model is not ready to be activated")

        metadata_dict = metadata_obj.to_dict()

        try:
            runtime_info = await llm_manager.load_from_metadata(metadata_dict)
            metadata = await registry.activate_model(model_id)
        except ModelLoadError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error
        except ModelRegistryError as error:
            await llm_manager.unload_model()
            raise HTTPException(status_code=error.status_code, detail=error.message) from error

        enriched = dict(metadata)
        enriched["runtime"] = runtime_info
        return enriched

    @app.delete("/models/{model_id}", status_code=204)
    async def delete_model(model_id: str) -> Response:
        metadata = None
        try:
            metadata = await registry.get_metadata(model_id)
        except ModelRegistryError:
            metadata = None
        try:
            await registry.remove_model(model_id)
        except ModelRegistryError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error
        if metadata and metadata.state == ModelState.ACTIVE:
            await llm_manager.unload_model()
        return Response(status_code=204)

    @app.get("/models/{model_id}/progress")
    async def model_progress(model_id: str) -> Dict[str, Any]:
        try:
            return await registry.get_progress(model_id)
        except ModelRegistryError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error

    @app.get("/models/stream")
    async def models_stream(request: Request) -> StreamingResponse:
        queue = registry.subscribe_progress()
        initial_models = await registry.list_models()
        initial_progress = registry.get_all_progress()

        async def event_stream() -> AsyncGenerator[str, None]:
            try:
                snapshot = {
                    "type": "snapshot",
                    "models": initial_models,
                    "progress": initial_progress,
                }
                yield _format_sse_event(snapshot)

                while True:
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=15)
                        yield _format_sse_event(event)
                    except asyncio.TimeoutError:
                        if await request.is_disconnected():
                            break
                        yield ": keep-alive\n\n"
            finally:
                registry.unsubscribe_progress(queue)

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.post("/actions/open")
    async def action_open(payload: ActionPathRequest) -> Dict[str, Any]:
        target = _resolve_allowed_path(payload.path, allowed_roots)
        if not target.exists():
            raise HTTPException(status_code=404, detail="Path not found")
        if target.is_dir():
            children = []
            for child in sorted(target.iterdir(), key=lambda item: item.name)[:200]:
                child_type = "directory" if child.is_dir() else "file"
                children.append({
                    "name": child.name,
                    "path": str(child),
                    "type": child_type,
                })
            return {"path": str(target), "type": "directory", "children": children}
        if target.is_file():
            stat = target.stat()
            return {
                "path": str(target),
                "type": "file",
                "size": stat.st_size,
                "modified": stat.st_mtime,
            }
        raise HTTPException(status_code=400, detail="Unsupported filesystem entry")

    @app.post("/actions/read")
    async def action_read(payload: ActionReadRequest) -> Dict[str, Any]:
        target = _resolve_allowed_path(payload.path, allowed_roots)
        if not target.exists() or not target.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        read_length = payload.length if payload.length is not None else payload.max_bytes
        read_length = min(read_length, payload.max_bytes)

        try:
            with target.open("rb") as handle:
                if payload.offset:
                    handle.seek(payload.offset)
                data = handle.read(read_length)
        except OSError as error:
            raise HTTPException(status_code=400, detail=f"Unable to read file: {error}") from error

        encoding = payload.encoding or "utf-8"
        try:
            content = data.decode(encoding, errors="replace")
        except LookupError as error:
            raise HTTPException(status_code=400, detail=f"Unknown encoding: {encoding}") from error

        return {
            "path": str(target),
            "offset": payload.offset,
            "length": len(data),
            "content": content,
            "encoding": encoding,
        }

    @app.post("/actions/run")
    async def action_run(payload: ActionRunRequest) -> Dict[str, Any]:
        cwd = (
            _resolve_allowed_path(payload.cwd, allowed_roots)
            if payload.cwd
            else allowed_roots[0]
        )
        if not cwd.exists():
            raise HTTPException(status_code=400, detail="Working directory does not exist")

        command_repr: Any
        try:
            if isinstance(payload.command, list) and not payload.shell:
                process = await asyncio.create_subprocess_exec(
                    *payload.command,
                    cwd=str(cwd),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                command_repr = payload.command
            else:
                if isinstance(payload.command, list):
                    quoted = " ".join(shlex.quote(item) for item in payload.command)
                    command_str = quoted
                else:
                    command_str = payload.command
                process = await asyncio.create_subprocess_shell(
                    command_str,
                    cwd=str(cwd),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                command_repr = command_str

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=payload.timeout
                )
            except asyncio.TimeoutError as error:
                process.kill()
                await process.communicate()
                raise HTTPException(status_code=504, detail="Command timed out") from error
        except FileNotFoundError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except OSError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

        max_output = 65536
        stdout_text = stdout.decode("utf-8", errors="replace")[:max_output]
        stderr_text = stderr.decode("utf-8", errors="replace")[:max_output]

        return {
            "command": command_repr,
            "cwd": str(cwd),
            "returncode": process.returncode,
            "stdout": stdout_text,
            "stderr": stderr_text,
        }

    @app.get("/status")
    async def status() -> Dict[str, Any]:
        metrics = llm_manager.get_status()
        return {
            "model": {
                "active": metrics.get("active_model"),
                "type": metrics.get("model_type"),
                "loaded": llm_manager.is_loaded,
            },
            "memory": metrics.get("memory"),
            "actions": {
                "available": ["open", "read", "run"],
                "roots": [str(path) for path in allowed_roots],
            },
        }

    @app.on_event("shutdown")
    async def shutdown_registry() -> None:
        await llm_manager.shutdown()
        await registry.shutdown()

    @app.on_event("startup")
    async def startup_runtime() -> None:
        await llm_manager.start()

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
