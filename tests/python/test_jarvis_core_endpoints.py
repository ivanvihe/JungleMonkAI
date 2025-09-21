from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from jarvis_core.JarvisCore import AppConfig, configure_logging, create_app
from jarvis_core.models import ModelMetadata, ModelRegistry, ModelState
from jarvis_core.llm import GenerationResult, ModelNotLoadedError


class DummyRegistry:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = Path(base_dir)
        self.download_requests: list[dict[str, object]] = []
        self.models_payload = [
            {
                "model_id": "alpha",
                "state": "ready",
                "local_path": str(self.base_dir / "alpha.bin"),
                "tags": ["test"],
            }
        ]
        self.subscribers: set[asyncio.Queue[dict[str, object]]] = set()

    async def list_models(self) -> list[dict[str, object]]:
        return self.models_payload

    def get_all_progress(self) -> dict[str, dict[str, object]]:
        return {}

    async def start_download(
        self,
        model_id: str,
        repo_id: str,
        filename: str,
        *,
        hf_token: str | None = None,
        checksum: str | None = None,
        tags: list[str] | None = None,
    ) -> dict[str, object]:
        payload = {
            "model_id": model_id,
            "repo_id": repo_id,
            "filename": filename,
            "hf_token": hf_token,
            "checksum": checksum,
            "tags": tags or [],
        }
        self.download_requests.append(payload)
        return {"accepted": True, **payload}

    async def shutdown(self) -> None:  # pragma: no cover - API requirement only
        return None

    def subscribe_progress(self) -> asyncio.Queue[dict[str, object]]:
        queue: asyncio.Queue[dict[str, object]] = asyncio.Queue()
        self.subscribers.add(queue)
        return queue

    def unsubscribe_progress(self, queue: asyncio.Queue[dict[str, object]]) -> None:
        self.subscribers.discard(queue)

    def notify_progress(self, model_id: str, **payload) -> None:  # pragma: no cover - not used
        event = {"model_id": model_id, **payload}
        for queue in list(self.subscribers):
            queue.put_nowait(event)


class DummyLLMManager:
    def __init__(self) -> None:
        self.generate_calls: list[dict[str, object]] = []
        self.raise_error: Exception | None = None

    async def start(self) -> None:  # pragma: no cover - API requirement only
        return None

    async def shutdown(self) -> None:  # pragma: no cover - API requirement only
        return None

    async def generate(self, prompt: str, **kwargs) -> GenerationResult:
        if self.raise_error:
            error = self.raise_error
            self.raise_error = None
            raise error
        payload = {"prompt": prompt, **kwargs}
        self.generate_calls.append(payload)
        return GenerationResult(
            message="Hola desde Jarvis",
            actions=[{"id": "open-file", "label": "Abrir", "status": "pending"}],
        )

    async def unload_model(self) -> None:  # pragma: no cover - not used in tests
        return None

    async def load_from_metadata(self, metadata):  # pragma: no cover - not used
        return {"model_id": metadata.get("model_id", "test"), "model_type": "stub", "path": ""}

    def get_status(self) -> dict[str, object]:
        return {"active_model": "alpha", "model_type": "stub", "memory": {}}

    @property
    def is_loaded(self) -> bool:
        return True


@pytest.fixture()
def api_client(monkeypatch, tmp_path):
    registry = DummyRegistry(tmp_path)
    llm_manager = DummyLLMManager()

    monkeypatch.setattr("jarvis_core.JarvisCore.ModelRegistry", lambda base_dir: registry)
    monkeypatch.setattr("jarvis_core.JarvisCore.LLMManager", lambda: llm_manager)

    config = AppConfig(host="127.0.0.1", port=8000, models_dir=tmp_path, token=None, auto_start=False)
    log_handler = configure_logging()
    app = create_app(config, log_handler)

    with TestClient(app) as client:
        yield SimpleNamespace(client=client, registry=registry, llm=llm_manager, models_dir=tmp_path)


def _parse_sse_chunk(chunk: str) -> dict[str, object]:
    for line in chunk.splitlines():
        if line.startswith(":"):
            continue
        if line.startswith("data:"):
            return json.loads(line[len("data:") :].strip())
    raise AssertionError("SSE chunk did not contain a data line")


@pytest_asyncio.fixture()
async def sse_client(monkeypatch, tmp_path):
    monkeypatch.setattr("jarvis_core.JarvisCore.LLMManager", lambda: DummyLLMManager())
    config = AppConfig(host="127.0.0.1", port=8000, models_dir=tmp_path, token=None, auto_start=False)
    log_handler = configure_logging()
    app = create_app(config, log_handler)

    await app.router.startup()
    stream_route = next(route for route in app.routes if getattr(route, "path", None) == "/models/stream")
    try:
        registry: ModelRegistry = app.state.model_registry
        yield SimpleNamespace(app=app, registry=registry, stream_route=stream_route)
    finally:
        await app.router.shutdown()


def test_chat_completions_returns_message_and_actions(api_client):
    response = api_client.client.post("/chat/completions", json={"prompt": "Hola"})

    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Hola desde Jarvis"
    assert data["actions"][0]["id"] == "open-file"
    assert api_client.llm.generate_calls[0]["stream"] is False


def test_chat_completions_returns_503_when_model_missing(api_client):
    api_client.llm.raise_error = ModelNotLoadedError("Model not ready")

    response = api_client.client.post("/chat/completions", json={"prompt": "Hola"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Model not ready"


def test_model_download_records_request(api_client):
    payload = {"repo_id": "org/model", "filename": "model.bin", "tags": ["gguf"]}

    response = api_client.client.post("/models/alpha/download", json=payload)

    assert response.status_code == 202
    assert api_client.registry.download_requests == [
        {
            "model_id": "alpha",
            "repo_id": "org/model",
            "filename": "model.bin",
            "hf_token": None,
            "checksum": None,
            "tags": ["gguf"],
        }
    ]


def test_actions_open_and_read_use_allowed_paths(api_client):
    target_dir = api_client.models_dir / "workspace"
    target_dir.mkdir()
    target_file = target_dir / "notes.txt"
    target_file.write_text("Contenido de prueba", encoding="utf-8")

    open_response = api_client.client.post("/actions/open", json={"path": str(target_dir)})
    assert open_response.status_code == 200
    listing = open_response.json()
    assert listing["type"] == "directory"
    assert any(child["name"] == "notes.txt" for child in listing["children"])

    read_response = api_client.client.post(
        "/actions/read",
        json={"path": str(target_file), "encoding": "utf-8", "offset": 0, "length": 10},
    )
    assert read_response.status_code == 200
    body = read_response.json()
    assert body["content"].startswith("Contenido")
    assert body["encoding"] == "utf-8"


@pytest.mark.asyncio()
async def test_models_stream_emits_progress_events(sse_client):
    models_snapshot = await sse_client.registry.list_models()
    progress_snapshot = sse_client.registry.get_all_progress()

    request = SimpleNamespace(is_disconnected=lambda: asyncio.sleep(0, result=False))
    response = await sse_client.stream_route.endpoint(request)
    generator = response.body_iterator

    try:
        initial_chunk = await asyncio.wait_for(generator.__anext__(), timeout=5)
        initial_event = _parse_sse_chunk(initial_chunk)
        assert initial_event["type"] == "snapshot"
        assert initial_event["models"] == models_snapshot
        assert initial_event["progress"] == progress_snapshot

        sse_client.registry._initialise_progress("gamma")
        queued_chunk = await asyncio.wait_for(generator.__anext__(), timeout=5)
        queued_event = _parse_sse_chunk(queued_chunk)
        assert queued_event["model_id"] == "gamma"
        assert queued_event["progress"]["status"] == "queued"

        sse_client.registry._update_progress(
            "gamma", status="downloading", downloaded=10, total=20
        )
        progress_chunk = await asyncio.wait_for(generator.__anext__(), timeout=5)
        progress_event = _parse_sse_chunk(progress_chunk)
        assert progress_event["progress"]["status"] == "downloading"
        assert progress_event["progress"]["percent"] == 50.0
    finally:
        await generator.aclose()

    assert not getattr(sse_client.registry, "_subscribers")


@pytest.mark.asyncio()
async def test_models_stream_emits_error_events(sse_client, tmp_path):
    async with sse_client.registry._lock:  # type: ignore[attr-defined]
        metadata = ModelMetadata(model_id="delta", local_path=str(tmp_path / "delta.bin"))
        sse_client.registry._models["delta"] = metadata  # type: ignore[attr-defined]
        sse_client.registry._save()  # type: ignore[attr-defined]

    request = SimpleNamespace(is_disconnected=lambda: asyncio.sleep(0, result=False))
    response = await sse_client.stream_route.endpoint(request)
    generator = response.body_iterator

    try:
        await asyncio.wait_for(generator.__anext__(), timeout=5)  # snapshot

        sse_client.registry._initialise_progress("delta")
        await asyncio.wait_for(generator.__anext__(), timeout=5)

        sse_client.registry._update_progress(
            "delta", status="error", error="boom", error_code=500
        )
        error_chunk = await asyncio.wait_for(generator.__anext__(), timeout=5)
        error_event = _parse_sse_chunk(error_chunk)
        assert error_event["progress"]["status"] == "error"
        assert error_event["progress"]["error"] == "boom"
        assert error_event["progress"]["error_code"] == 500

        await sse_client.registry._mark_download_failed("delta")
        failure_chunk = await asyncio.wait_for(generator.__anext__(), timeout=5)
        failure_event = _parse_sse_chunk(failure_chunk)
        assert failure_event["metadata"]["state"] == ModelState.NOT_INSTALLED.value
    finally:
        await generator.aclose()

    assert not getattr(sse_client.registry, "_subscribers")
