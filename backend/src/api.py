# src/api.py
from __future__ import annotations

from threading import Timer
from typing import Any

from app_info import APP_REPO_URL, APP_VERSION
from storage import (
    ChatSession,
    Settings,
    get_app_setting,
    get_prompt_library,
    init_db,
    list_chat_sessions,
    list_settings,
    save_settings,
    set_prompt_library,
    set_app_setting,
    upsert_chat_session,
    delete_chat_session as delete_chat_session_record,
)
from schemas import AppSettingsPayload


class ProApi:
    def __init__(self):
        self._window = None
        init_db()

    def set_window(self, window):
        self._window = window

    def _schedule_app_exit(self) -> None:
        if not self._window:
            return
        def _close() -> None:
            try:
                self._window.destroy()
            except Exception:
                pass
        Timer(0.6, _close).start()

    # 供前端调用的测试接口
    def get_app_status(self):
        return {
            "status": "online",
            "version": APP_VERSION,
            "message": "后端已就绪！",
        }

    def get_app_info(self) -> dict[str, Any]:
        return {
            "version": APP_VERSION,
            "repoUrl": APP_REPO_URL,
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
            "model_ids": record.get_model_ids(),
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

    def save_config(
        self, provider: str, key: str, url: str, model_ids: list[str] | None = None
    ) -> dict[str, Any]:
        provider_name = (provider or "").strip()
        api_key = (key or "").strip()
        base_url = (url or "").strip()
        normalized_model_ids = (
            [m.strip() for m in model_ids if m.strip()]
            if model_ids is not None
            else None
        )

        if not provider_name:
            return {"ok": False, "error": "provider is required"}

        record = save_settings(
            provider_name, api_key, base_url, normalized_model_ids
        )
        return {"ok": True, "config": self._config_to_dict(record)}

    def get_configs(self) -> list[dict[str, Any]]:
        records = list_settings()
        return [self._config_to_dict(record) for record in records]

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

    def delete_chat_session(self, session_id: str) -> dict[str, Any]:
        session_id = (session_id or "").strip()
        if not session_id:
            return {"ok": False, "error": "session id is required"}
        deleted = delete_chat_session_record(session_id)
        return {"ok": deleted, "deleted": deleted, "id": session_id}

    def generate_image(self, payload: dict[str, Any]) -> dict[str, Any]:
        from services.generation import generate_single

        return generate_single(payload)

    def generate_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        from services.generation import generate_batch

        return generate_batch(payload)

    def process_images(self, payload: dict[str, Any]) -> dict[str, Any]:
        from services.image_processing import process_images

        return process_images(payload)

    def save_images(self, payload: dict[str, Any]) -> dict[str, Any]:
        from services.image_saving import save_images

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
        from services.image_saving import choose_save_directory

        return choose_save_directory(window=self._window)

    def get_prompt_library(self) -> dict[str, Any]:
        return {"prompts": get_prompt_library()}

    def save_prompt_library(self, payload: dict[str, Any]) -> dict[str, Any]:
        prompts = payload.get("prompts") if isinstance(payload, dict) else payload
        if not isinstance(prompts, list):
            return {"ok": False, "error": "prompts must be a list"}
        set_prompt_library(prompts)
        return {"ok": True, "prompts": prompts}

    def check_update(self) -> dict[str, Any]:
        from services.update import check_for_updates

        return check_for_updates()

    def download_update(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            return {"ok": False, "error": "payload must be an object"}
        asset_url = payload.get("assetUrl")
        from services.update import download_update

        return download_update(asset_url)

    def get_update_download_progress(self) -> dict[str, Any]:
        from services.update import get_download_progress

        return get_download_progress()

    def open_update_directory(self) -> dict[str, Any]:
        from services.update import open_updates_directory

        return open_updates_directory()

    def install_update(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            return {"ok": False, "error": "payload must be an object"}
        archive_path = payload.get("path")
        from services.update import install_update

        response = install_update(archive_path)
        if response.get("ok"):
            self._schedule_app_exit()
        return response
