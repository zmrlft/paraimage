# src/api.py
from __future__ import annotations

from typing import Any

from services.generation import generate_batch, generate_single
from storage import (
    CustomProvider,
    Settings,
    add_custom_provider,
    delete_custom_provider,
    get_custom_provider,
    init_db,
    list_custom_providers,
    list_settings,
    save_settings,
)


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

    def generate_image(self, payload: dict[str, Any]) -> dict[str, Any]:
        return generate_single(payload)

    def generate_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        return generate_batch(payload)
