"""Runtime model loading utilities for Jarvis Core."""

from __future__ import annotations

import asyncio
import gc
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from threading import Thread
from typing import Any, AsyncGenerator, Dict, Iterable, List, Optional, Tuple

import psutil

LOGGER = logging.getLogger("jarvis-core")


class ModelRuntimeError(RuntimeError):
    """Base error for model runtime issues."""


class ModelNotLoadedError(ModelRuntimeError):
    """Raised when a generation request is executed without an active model."""


class ModelLoadError(ModelRuntimeError):
    """Raised when a model cannot be loaded."""


@dataclass(slots=True)
class GenerationResult:
    """Structured result returned by non-streaming generation."""

    message: str
    actions: Optional[List[Dict[str, Any]]] = None


class LLMManager:
    """Manage lifecycle of a single active large language model."""

    def __init__(self, *, max_new_tokens: int = 512) -> None:
        self._model: Any = None
        self._tokenizer: Any = None
        self._model_id: Optional[str] = None
        self._model_type: Optional[str] = None
        self._monitor_task: Optional[asyncio.Task[None]] = None
        self._lock = asyncio.Lock()
        self._generation_lock = asyncio.Lock()
        self._status: Dict[str, Any] = {
            "memory": {},
            "active_model": None,
            "model_type": None,
        }
        self.max_new_tokens = max_new_tokens

    # ------------------------------------------------------------------
    # Lifecycle helpers
    # ------------------------------------------------------------------
    async def start(self) -> None:
        """Start background monitoring of process metrics."""

        if self._monitor_task is None:
            self._monitor_task = asyncio.create_task(self._monitor_process(), name="llm-monitor")

    async def shutdown(self) -> None:
        """Release resources and stop background tasks."""

        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:  # pragma: no cover - cancellation path
                pass
            self._monitor_task = None
        await self.unload_model()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    @property
    def active_model(self) -> Optional[str]:
        return self._model_id

    @property
    def model_type(self) -> Optional[str]:
        return self._model_type

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    async def load_from_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Load a model using registry metadata payload."""

        path_str = metadata.get("active_path") or metadata.get("local_path")
        if not path_str:
            raise ModelLoadError("Model metadata does not include a valid local path")
        model_path = Path(path_str)
        if not model_path.exists():
            raise ModelLoadError(f"Model path {model_path!s} does not exist")

        tags: Iterable[str] = metadata.get("tags") or []
        model_id = metadata.get("model_id") or model_path.stem

        await self.load_model(model_path, tags=tags, model_id=model_id)
        return {
            "model_id": self._model_id,
            "model_type": self._model_type,
            "path": str(model_path),
        }

    async def load_model(
        self,
        model_path: Path,
        *,
        tags: Iterable[str] | None = None,
        model_id: Optional[str] = None,
    ) -> None:
        """Load a model from ``model_path`` with optional ``tags`` hints."""

        resolved_path = model_path.resolve()
        tags = set(tag.lower() for tag in (tags or []))

        await self.unload_model()

        if resolved_path.suffix.lower() == ".gguf" or "gguf" in tags:
            await self._load_gguf(resolved_path)
            model_type = "gguf"
        else:
            await self._load_transformers(resolved_path)
            model_type = "transformers"

        self._model_id = model_id or resolved_path.stem
        self._model_type = model_type
        self._status["active_model"] = self._model_id
        self._status["model_type"] = self._model_type
        LOGGER.info("Model loaded", extra={"model_id": self._model_id, "type": self._model_type})

    async def unload_model(self) -> None:
        """Dispose of the currently active model."""

        async with self._lock:
            if not self._model:
                return
            LOGGER.info(
                "Unloading model", extra={"model_id": self._model_id, "type": self._model_type}
            )
            model_type = self._model_type
            model = self._model
            tokenizer = self._tokenizer
            self._model = None
            self._tokenizer = None
            self._model_id = None
            self._model_type = None
            self._status["active_model"] = None
            self._status["model_type"] = None

        try:
            if model_type == "transformers":
                # torch may not be installed; guard import
                try:
                    import torch
                except ImportError:  # pragma: no cover - optional dependency
                    torch = None  # type: ignore[assignment]
                if hasattr(model, "cpu"):
                    await asyncio.to_thread(model.cpu)
                if torch and torch.cuda.is_available():
                    torch.cuda.empty_cache()
                del model
                if tokenizer is not None:
                    del tokenizer
            elif model_type == "gguf":
                del model
            else:  # pragma: no cover - defensive branch
                del model
        finally:
            gc.collect()

    async def generate(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
        stream: bool = False,
    ) -> GenerationResult | AsyncGenerator[Dict[str, Any], None]:
        """Generate a response for ``prompt``.

        When ``stream`` is ``True`` an async generator is returned yielding
        dictionaries suitable for SSE consumption. Otherwise a ``GenerationResult``
        is produced with the final response and optional structured actions.
        """

        async with self._lock:
            if not self._model:
                raise ModelNotLoadedError("No model is currently loaded")
            model = self._model
            tokenizer = self._tokenizer
            model_type = self._model_type or "unknown"

        formatted_prompt = self._build_prompt(prompt, system_prompt, history)

        if stream:
            return self._streaming_response(model, tokenizer, model_type, formatted_prompt)

        text = await self._complete(model, tokenizer, model_type, formatted_prompt)
        message, actions = self._extract_actions(text)
        return GenerationResult(message=message, actions=actions)

    def get_status(self) -> Dict[str, Any]:
        """Return a snapshot of the current runtime metrics."""

        return dict(self._status)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    async def _monitor_process(self) -> None:
        process = psutil.Process(os.getpid())
        while True:
            try:
                mem_info = process.memory_info()
                system_memory = psutil.virtual_memory()
                self._status["memory"] = {
                    "rss": mem_info.rss,
                    "vms": mem_info.vms,
                    "percent": process.memory_percent(),
                    "system": {
                        "total": system_memory.total,
                        "available": system_memory.available,
                        "percent": system_memory.percent,
                    },
                }
            except Exception:  # pragma: no cover - monitoring best effort
                LOGGER.exception("Unable to collect process metrics")
            await asyncio.sleep(5)

    async def _load_transformers(self, model_path: Path) -> None:
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ModelLoadError(
                "transformers is required to load this model"
            ) from exc

        model_dir = model_path if model_path.is_dir() else model_path.parent

        def _load() -> Tuple[Any, Any]:
            tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
            model = AutoModelForCausalLM.from_pretrained(model_dir, local_files_only=True)
            if hasattr(model, "eval"):
                model.eval()
            return model, tokenizer

        model, tokenizer = await asyncio.to_thread(_load)

        async with self._lock:
            self._model = model
            self._tokenizer = tokenizer

    async def _load_gguf(self, model_path: Path) -> None:
        try:
            from llama_cpp import Llama
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ModelLoadError("llama-cpp-python is required for GGUF models") from exc

        def _load() -> Any:
            return Llama(model_path=str(model_path), n_ctx=4096)

        model = await asyncio.to_thread(_load)

        async with self._lock:
            self._model = model
            self._tokenizer = None

    async def _complete(
        self,
        model: Any,
        tokenizer: Any,
        model_type: str,
        prompt: str,
    ) -> str:
        async with self._generation_lock:
            if model_type == "transformers":
                return await self._complete_transformers(model, tokenizer, prompt)
            if model_type == "gguf":
                return await self._complete_gguf(model, prompt)
            raise ModelRuntimeError(f"Unsupported model type: {model_type}")

    async def _streaming_response(
        self,
        model: Any,
        tokenizer: Any,
        model_type: str,
        prompt: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        buffer: List[str] = []

        async with self._generation_lock:
            if model_type == "transformers":
                async for chunk in self._stream_transformers(model, tokenizer, prompt):
                    buffer.append(chunk)
                    yield {"type": "chunk", "delta": chunk}
            elif model_type == "gguf":
                async for chunk in self._stream_gguf(model, prompt):
                    buffer.append(chunk)
                    yield {"type": "chunk", "delta": chunk}
            else:  # pragma: no cover - defensive branch
                raise ModelRuntimeError(f"Unsupported model type: {model_type}")

        message, actions = self._extract_actions("".join(buffer))
        yield {"type": "result", "message": message, "actions": actions}

    async def _complete_transformers(self, model: Any, tokenizer: Any, prompt: str) -> str:
        if tokenizer is None:
            raise ModelRuntimeError("Tokenizer not available for transformers model")

        try:
            import torch
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ModelRuntimeError("transformers generation requires torch") from exc

        def _run() -> str:
            inputs = tokenizer(prompt, return_tensors="pt")
            inputs = {k: v.to(model.device) if hasattr(model, "device") else v for k, v in inputs.items()}
            with torch.no_grad():
                output = model.generate(**inputs, max_new_tokens=self.max_new_tokens)
            generated = output[0][inputs["input_ids"].shape[-1] :]
            return tokenizer.decode(generated, skip_special_tokens=True)

        return await asyncio.to_thread(_run)

    async def _complete_gguf(self, model: Any, prompt: str) -> str:
        def _run() -> str:
            result = model.create_completion(prompt=prompt, max_tokens=self.max_new_tokens)
            return result["choices"][0]["text"]

        return await asyncio.to_thread(_run)

    async def _stream_transformers(
        self, model: Any, tokenizer: Any, prompt: str
    ) -> AsyncGenerator[str, None]:
        if tokenizer is None:
            raise ModelRuntimeError("Tokenizer not available for transformers model")

        try:
            from transformers import TextIteratorStreamer
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ModelRuntimeError("transformers streaming requires TextIteratorStreamer") from exc

        try:
            import torch
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise ModelRuntimeError("transformers streaming requires torch") from exc

        streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
        inputs = tokenizer(prompt, return_tensors="pt")
        inputs = {k: v.to(model.device) if hasattr(model, "device") else v for k, v in inputs.items()}
        generation_kwargs = dict(inputs)
        generation_kwargs.update({"streamer": streamer, "max_new_tokens": self.max_new_tokens})

        loop = asyncio.get_running_loop()

        def _produce() -> None:
            with torch.no_grad():
                model.generate(**generation_kwargs)

        future = loop.run_in_executor(None, _produce)
        try:
            while True:
                try:
                    chunk = await loop.run_in_executor(None, streamer.__next__)
                except StopIteration:
                    break
                if chunk:
                    yield chunk
        finally:
            await future

    async def _stream_gguf(self, model: Any, prompt: str) -> AsyncGenerator[str, None]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

        def _produce() -> None:
            try:
                for token in model.create_completion(
                    prompt=prompt, stream=True, max_tokens=self.max_new_tokens
                ):
                    text = token["choices"][0]["text"]
                    asyncio.run_coroutine_threadsafe(queue.put(text), loop)
            finally:
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        thread = Thread(target=_produce, name="gguf-stream", daemon=True)
        thread.start()

        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                if chunk:
                    yield chunk
        finally:
            thread.join()

    def _build_prompt(
        self,
        prompt: str,
        system_prompt: Optional[str],
        history: Optional[List[Dict[str, str]]],
    ) -> str:
        segments: List[str] = []
        if system_prompt:
            segments.append(f"System: {system_prompt.strip()}")
        for entry in history or []:
            role = entry.get("role", "user").strip().capitalize()
            content = entry.get("content", "").strip()
            if content:
                segments.append(f"{role}: {content}")
        segments.append(f"User: {prompt.strip()}")
        segments.append("Assistant:")
        return "\n".join(segments)

    def _extract_actions(self, text: str) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
        marker = "```actions"
        end_marker = "```"
        if marker not in text:
            return text.strip(), None

        start = text.find(marker)
        after_marker = start + len(marker)
        end = text.find(end_marker, after_marker)
        if end == -1:
            return text.strip(), None

        action_block = text[after_marker:end].strip()
        message = (text[:start] + text[end + len(end_marker) :]).strip()
        actions = self._parse_actions(action_block)
        return message, actions

    def _parse_actions(self, payload: str) -> Optional[List[Dict[str, Any]]]:
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, list):
            return None
        cleaned: List[Dict[str, Any]] = []
        for entry in data:
            if not isinstance(entry, dict):
                continue
            action_type = entry.get("type")
            action_payload = entry.get("payload", {})
            if not isinstance(action_type, str) or not isinstance(action_payload, dict):
                continue
            cleaned.append({"type": action_type, "payload": action_payload})
        return cleaned or None
