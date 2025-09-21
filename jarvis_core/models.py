"""Model registry and download management utilities for Jarvis Core."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

import requests
from huggingface_hub import HfApi, hf_hub_url
from huggingface_hub.utils import HfHubHTTPError, build_hf_headers


LOGGER = logging.getLogger("jarvis-core")


class ModelState(str, Enum):
    """Known lifecycle states for a model inside the registry."""

    NOT_INSTALLED = "not_installed"
    DOWNLOADING = "downloading"
    READY = "ready"
    ACTIVE = "active"


class ModelRegistryError(Exception):
    """Base exception for model registry errors."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ModelAuthorizationError(ModelRegistryError):
    def __init__(self, message: str = "Hugging Face authorization required") -> None:
        super().__init__(message, status_code=403)


class ModelConflictError(ModelRegistryError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=409)


class ModelNotFoundError(ModelRegistryError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=404)


class ChecksumMismatchError(ModelConflictError):
    def __init__(self, expected: str, received: str) -> None:
        super().__init__(
            f"Checksum mismatch. Expected {expected}, received {received}."
        )
        self.expected = expected
        self.received = received


@dataclass
class ModelMetadata:
    """Metadata persisted for each model entry."""

    model_id: str
    repo_id: Optional[str] = None
    filename: Optional[str] = None
    checksum: Optional[str] = None
    tags: List[str] | None = None
    state: ModelState = ModelState.NOT_INSTALLED
    local_path: Optional[str] = None
    active_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "model_id": self.model_id,
            "repo_id": self.repo_id,
            "filename": self.filename,
            "checksum": self.checksum,
            "tags": self.tags or [],
            "state": self.state.value,
            "local_path": self.local_path,
            "active_path": self.active_path,
        }

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "ModelMetadata":
        state = payload.get("state", ModelState.NOT_INSTALLED)
        if not isinstance(state, ModelState):
            state = ModelState(state)
        return cls(
            model_id=payload["model_id"],
            repo_id=payload.get("repo_id"),
            filename=payload.get("filename"),
            checksum=payload.get("checksum"),
            tags=payload.get("tags") or [],
            state=state,
            local_path=payload.get("local_path"),
            active_path=payload.get("active_path"),
        )


class ModelRegistry:
    """Utility class that maintains model metadata and download lifecycle."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

        self.storage_dir = self.base_dir / "models"
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        self.registry_path = self.base_dir / "models.json"
        self._lock = asyncio.Lock()
        self._progress_lock = Lock()
        self._progress: Dict[str, Dict[str, Any]] = {}
        self._tasks: Dict[str, asyncio.Task[Any]] = {}
        self._models: Dict[str, ModelMetadata] = {}
        self._load()

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def _load(self) -> None:
        if not self.registry_path.exists():
            self._save()
            return
        try:
            with self.registry_path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive
            LOGGER.warning("Invalid models.json detected; resetting file", exc_info=exc)
            data = []
        for entry in data:
            metadata = ModelMetadata.from_dict(entry)
            self._models[metadata.model_id] = metadata

    def _save(self) -> None:
        payload = [metadata.to_dict() for metadata in self._models.values()]
        with self.registry_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def list_models(self) -> List[Dict[str, Any]]:
        async with self._lock:
            return [metadata.to_dict() for metadata in self._models.values()]

    async def get_metadata(self, model_id: str) -> ModelMetadata:
        async with self._lock:
            if model_id not in self._models:
                raise ModelNotFoundError(f"Model '{model_id}' is not registered")
            return self._models[model_id]

    async def start_download(
        self,
        model_id: str,
        repo_id: str,
        filename: str,
        *,
        hf_token: Optional[str] = None,
        checksum: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        remote_size = await self._ensure_remote_file_access(repo_id, filename, hf_token)

        async with self._lock:
            if model_id in self._tasks:
                raise ModelConflictError("A download is already in progress for this model")

            metadata = self._models.get(model_id) or ModelMetadata(model_id=model_id)
            if metadata.state == ModelState.DOWNLOADING:
                raise ModelConflictError("Model is already downloading")

            metadata.repo_id = repo_id
            metadata.filename = filename
            metadata.tags = tags or []
            metadata.checksum = checksum
            metadata.state = ModelState.DOWNLOADING
            metadata.active_path = None

            target_dir = self.storage_dir / model_id
            target_dir.mkdir(parents=True, exist_ok=True)
            metadata.local_path = str(target_dir / filename)

            self._models[model_id] = metadata
            self._save()

            self._initialise_progress(model_id)
            if remote_size:
                self._update_progress(model_id, total=remote_size)

            task = asyncio.create_task(
                self._download_and_finalize(metadata, hf_token=hf_token)
            )
            self._tasks[model_id] = task

        return metadata.to_dict()

    async def activate_model(self, model_id: str) -> Dict[str, Any]:
        async with self._lock:
            if model_id not in self._models:
                raise ModelNotFoundError(f"Model '{model_id}' is not registered")

            metadata = self._models[model_id]
            if metadata.state not in {ModelState.READY, ModelState.ACTIVE}:
                raise ModelConflictError("Model is not ready to be activated")

            if not metadata.local_path or not Path(metadata.local_path).exists():
                raise ModelConflictError("Local model files are missing")

            for entry in self._models.values():
                if entry.state == ModelState.ACTIVE and entry.model_id != model_id:
                    entry.state = ModelState.READY
                    entry.active_path = None

            metadata.state = ModelState.ACTIVE
            metadata.active_path = metadata.local_path
            self._save()

            return metadata.to_dict()

    async def remove_model(self, model_id: str) -> None:
        async with self._lock:
            if model_id in self._tasks:
                self._tasks[model_id].cancel()

            metadata = self._models.pop(model_id, None)
            self._progress.pop(model_id, None)
            self._tasks.pop(model_id, None)
            if metadata is None:
                raise ModelNotFoundError(f"Model '{model_id}' is not registered")

            if metadata.local_path:
                local_path = Path(metadata.local_path)
                if local_path.exists():
                    try:
                        local_path.unlink()
                    except OSError:  # pragma: no cover - best effort cleanup
                        LOGGER.warning("Unable to delete model file %s", local_path)

                parent_dir = local_path.parent
                if parent_dir.exists() and parent_dir.is_dir():
                    try:
                        for item in parent_dir.iterdir():
                            if item.is_file():
                                item.unlink()
                        parent_dir.rmdir()
                    except OSError:
                        LOGGER.warning("Unable to clean up directory %s", parent_dir)

            self._save()

    async def get_progress(self, model_id: str) -> Dict[str, Any]:
        with self._progress_lock:
            progress = self._progress.get(model_id)
            if progress is None:
                raise ModelNotFoundError(f"No progress tracked for model '{model_id}'")
            return dict(progress)

    async def shutdown(self) -> None:
        for task in list(self._tasks.values()):
            task.cancel()
        self._tasks.clear()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    async def _ensure_remote_file_access(
        self, repo_id: str, filename: str, hf_token: Optional[str]
    ) -> Optional[int]:
        api = HfApi(token=hf_token)
        try:
            url = hf_hub_url(repo_id, filename)
            metadata = await asyncio.to_thread(api.get_hf_file_metadata, url=url)
            return getattr(metadata, "size", None)
        except HfHubHTTPError as error:
            status = getattr(error.response, "status_code", None)
            if status in {401, 403}:
                raise ModelAuthorizationError(str(error)) from error
            if status == 404:
                raise ModelNotFoundError("Model file not found on Hugging Face") from error
            raise ModelRegistryError(f"Hugging Face error: {error}", status_code=502) from error
        except TypeError as error:  # pragma: no cover - defensive fallback
            raise ModelRegistryError(f"Invalid Hugging Face response: {error}", status_code=502) from error

    def _initialise_progress(self, model_id: str) -> None:
        with self._progress_lock:
            self._progress[model_id] = {
                "status": "queued",
                "downloaded": 0,
                "total": None,
                "percent": 0.0,
                "error": None,
                "error_code": None,
            }

    def _update_progress(
        self,
        model_id: str,
        *,
        status: Optional[str] = None,
        downloaded: Optional[int] = None,
        total: Optional[int] = None,
        error: Optional[str] = None,
        error_code: Optional[int] = None,
    ) -> None:
        with self._progress_lock:
            if model_id not in self._progress:
                self._progress[model_id] = {
                    "status": status or "unknown",
                    "downloaded": downloaded or 0,
                    "total": total,
                    "percent": 0.0,
                    "error": error,
                    "error_code": error_code,
                }
            entry = self._progress[model_id]
            if status is not None:
                entry["status"] = status
            if downloaded is not None:
                entry["downloaded"] = downloaded
            if total is not None:
                entry["total"] = total
            if error is not None:
                entry["error"] = error
            if error_code is not None:
                entry["error_code"] = error_code

            total_bytes = entry.get("total") or 0
            if total_bytes:
                entry["percent"] = round((entry["downloaded"] / total_bytes) * 100, 2)
            else:
                entry["percent"] = None

    async def _download_and_finalize(
        self, metadata: ModelMetadata, *, hf_token: Optional[str]
    ) -> None:
        model_id = metadata.model_id
        try:
            checksum = await asyncio.to_thread(
                self._download_file, metadata, hf_token
            )
            if metadata.checksum and checksum != metadata.checksum:
                raise ChecksumMismatchError(metadata.checksum, checksum)

            async with self._lock:
                stored = self._models.get(model_id)
                if stored:
                    stored.state = (
                        ModelState.ACTIVE if stored.state == ModelState.ACTIVE else ModelState.READY
                    )
                    stored.checksum = checksum
                    stored.local_path = metadata.local_path
                    self._models[model_id] = stored
                    self._save()

            progress_entry = self._progress.get(model_id, {})
            completed_bytes = (
                progress_entry.get("total") if progress_entry.get("total") is not None else progress_entry.get("downloaded")
            )
            self._update_progress(
                model_id,
                status="completed",
                downloaded=completed_bytes,
            )
        except asyncio.CancelledError:  # pragma: no cover - cancellation handling
            self._update_progress(
                model_id,
                status="cancelled",
                error="Download cancelled",
                error_code=499,
            )
            await self._mark_download_failed(model_id)
            raise
        except ChecksumMismatchError as error:
            LOGGER.error("Checksum validation failed for %s", model_id)
            self._update_progress(
                model_id,
                status="error",
                error=str(error),
                error_code=409,
            )
            await self._mark_download_failed(model_id)
        except ModelRegistryError as error:
            LOGGER.error("Model registry error for %s: %s", model_id, error)
            self._update_progress(
                model_id,
                status="error",
                error=error.message,
                error_code=error.status_code,
            )
            await self._mark_download_failed(model_id)
        except Exception as error:  # pragma: no cover - unexpected failures
            LOGGER.exception("Unexpected error downloading model %s", model_id)
            self._update_progress(
                model_id,
                status="error",
                error=str(error),
                error_code=500,
            )
            await self._mark_download_failed(model_id)
        finally:
            self._tasks.pop(model_id, None)

    async def _mark_download_failed(self, model_id: str) -> None:
        async with self._lock:
            metadata = self._models.get(model_id)
            if not metadata:
                return
            metadata.state = ModelState.NOT_INSTALLED
            metadata.active_path = None
            if metadata.local_path:
                local_path = Path(metadata.local_path)
                if local_path.exists():
                    try:
                        local_path.unlink()
                    except OSError:
                        LOGGER.warning("Unable to delete partial download %s", local_path)
            metadata.local_path = None
            self._models[model_id] = metadata
            self._save()

    def _download_file(self, metadata: ModelMetadata, hf_token: Optional[str]) -> str:
        if not metadata.repo_id or not metadata.filename:
            raise ModelRegistryError("Repository information is incomplete", status_code=400)

        url = hf_hub_url(metadata.repo_id, metadata.filename)
        headers = build_hf_headers(token=hf_token, library_name="jarvis-core")
        self._update_progress(metadata.model_id, status="downloading")

        target_path = Path(metadata.local_path or (self.storage_dir / metadata.model_id / metadata.filename))
        target_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = target_path.with_suffix(target_path.suffix + ".part")

        hasher = hashlib.sha256()
        total = 0
        downloaded = 0

        try:
            response = requests.get(url, headers=headers, stream=True, timeout=60)
        except requests.RequestException as error:
            raise ModelRegistryError(f"Download failed: {error}", status_code=502) from error

        if response.status_code in {401, 403}:
            raise ModelAuthorizationError("Unauthorized to download this model")
        if response.status_code == 404:
            raise ModelNotFoundError("Model file not found on Hugging Face")
        response.raise_for_status()

        if response.headers.get("content-length"):
            try:
                total = int(response.headers["content-length"])
            except ValueError:  # pragma: no cover - defensive
                total = 0
        self._update_progress(metadata.model_id, total=total or None)

        with temp_path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                handle.write(chunk)
                hasher.update(chunk)
                downloaded += len(chunk)
                self._update_progress(metadata.model_id, downloaded=downloaded)

        os.replace(temp_path, target_path)
        return hasher.hexdigest()
