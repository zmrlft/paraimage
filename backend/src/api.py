# src/api.py
from __future__ import annotations

from typing import Any

from services.generation import generate_batch, generate_single
from services.image_processing import process_images
from services.image_saving import choose_save_directory, save_images
from storage import (
    CustomProvider,
    ChatSession,
    Settings,
    add_custom_provider,
    delete_custom_provider,
    get_custom_provider,
    get_app_setting,
    init_db,
    list_chat_sessions,
    list_custom_providers,
    list_settings,
    save_settings,
    set_app_setting,
    upsert_chat_session,
)
from schemas import AppSettingsPayload


class ProApi:
    def __init__(self):
        self._window = None
        init_db()

    def set_window(self, window):
        self._window = window

    # 供前端调用的测试接口
    def get_app_status(self):
        return {
            "status": "online",
            "version": "1.0.0",
            "message": "后端已就绪！",
        }

    # 模拟获取支持的模型列表
    def get_available_models(self):
        return [
            {"id": "dalle3", "name": "DALL-E 3", "provider": "OpenAI"},
            {"id": "flux-pro", "name": "Flux Pro", "provider": "Replicate"},
            {"id": "sdxl", "name": "Stable Diffusion XL", "provider": "Stability AI"},
        ]

    def _config_to_dict(self, record: Settings) -> dict[str, Any]:
        return {
            "provider_name": record.provider_name,
            "api_key": record.api_key,
            "base_url": record.base_url,
            "updated_at": record.updated_at.isoformat(),
        }

    def _custom_provider_to_dict(self, record: CustomProvider) -> dict[str, Any]:
        return {
            "provider_name": record.provider_name,
            "api_key": record.api_key,
            "base_url": record.base_url,
            "model_ids": record.get_model_ids(),
            "is_enabled": record.get_is_enabled(),
            "updated_at": record.updated_at.isoformat(),
        }

    def _session_to_dict(self, record: ChatSession) -> dict[str, Any]:
        return {
            "id": record.session_id,
            "modelId": record.model_id,
            "title": record.title,
            "messages": record.get_messages(),
            "createdAt": record.created_at.isoformat(),
            "updatedAt": record.updated_at.isoformat(),
        }

    def save_config(self, provider: str, key: str, url: str) -> dict[str, Any]:
        provider_name = (provider or "").strip()
        api_key = (key or "").strip()
        base_url = (url or "").strip()

        if not provider_name:
            return {"ok": False, "error": "provider is required"}

        record = save_settings(provider_name, api_key, base_url)
        return {"ok": True, "config": self._config_to_dict(record)}

    def get_configs(self) -> list[dict[str, Any]]:
        records = list_settings()
        return [self._config_to_dict(record) for record in records]

    def add_custom_provider(
        self, provider: str, key: str, url: str, model_ids: list[str]
    ) -> dict[str, Any]:
        """Add or update a custom provider with model IDs"""
        provider_name = (provider or "").strip()
        api_key = (key or "").strip()
        base_url = (url or "").strip()
        model_ids = [m.strip() for m in (model_ids or []) if m.strip()]

        if not provider_name:
            return {"ok": False, "error": "provider is required"}

        if not model_ids:
            return {"ok": False, "error": "at least one model_id is required"}

        record = add_custom_provider(provider_name, api_key, base_url, model_ids)
        return {"ok": True, "config": self._custom_provider_to_dict(record)}

    def get_custom_providers(self) -> list[dict[str, Any]]:
        """Get all custom providers"""
        records = list_custom_providers()
        return [self._custom_provider_to_dict(record) for record in records]

    def delete_custom_provider(self, provider: str) -> dict[str, Any]:
        """Delete a custom provider"""
        provider_name = (provider or "").strip()

        if not provider_name:
            return {"ok": False, "error": "provider is required"}

        success = delete_custom_provider(provider_name)
        if success:
            return {"ok": True, "message": f"Custom provider '{provider_name}' deleted"}
        return {"ok": False, "error": f"Custom provider '{provider_name}' not found"}

    def get_chat_sessions(self, model_id: str) -> list[dict[str, Any]]:
        model_id = (model_id or "").strip()
        if not model_id:
            return []
        records = list_chat_sessions(model_id)
        return [self._session_to_dict(record) for record in records]

    def save_chat_session(self, payload: dict[str, Any]) -> dict[str, Any]:
        session_id = (payload.get("id") or "").strip()
        model_id = (payload.get("modelId") or "").strip()
        title = (payload.get("title") or "").strip()
        messages = payload.get("messages") or []

        if not session_id or not model_id:
            return {"ok": False, "error": "session id and modelId are required"}

        if not isinstance(messages, list):
            return {"ok": False, "error": "messages must be a list"}

        record = upsert_chat_session(session_id, model_id, title, messages)
        return {"ok": True, "session": self._session_to_dict(record)}

    def generate_image(self, payload: dict[str, Any]) -> dict[str, Any]:
        return generate_single(payload)

    def generate_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        return generate_batch(payload)

    def process_images(self, payload: dict[str, Any]) -> dict[str, Any]:
        return process_images(payload)

    def save_images(self, payload: dict[str, Any]) -> dict[str, Any]:
        return save_images(payload, window=self._window)

    def get_app_settings(self) -> dict[str, Any]:
        default_save_dir = get_app_setting("default_save_dir")
        return {"defaultSaveDir": default_save_dir.value if default_save_dir else None}

    def save_app_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            request = AppSettingsPayload.model_validate(payload)
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        if request.default_save_dir is None:
            set_app_setting("default_save_dir", "")
        else:
            set_app_setting("default_save_dir", request.default_save_dir)
        return {
            "ok": True,
            "defaultSaveDir": request.default_save_dir,
        }

    def choose_save_directory(self) -> dict[str, Any]:
        return choose_save_directory(window=self._window)
