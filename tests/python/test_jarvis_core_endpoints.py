from pathlib import Path
from types import SimpleNamespace
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from fastapi.testclient import TestClient

from jarvis_core.JarvisCore import AppConfig, configure_logging, create_app
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

    async def list_models(self) -> list[dict[str, object]]:
        return self.models_payload

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
