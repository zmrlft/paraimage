from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from peewee import CharField, DateTimeField, Model, SqliteDatabase, TextField

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "paraimage.db"
database = SqliteDatabase(DB_PATH)


class BaseModel(Model):
    class Meta:
        database = database


class Settings(BaseModel):
    provider_name = CharField(unique=True)
    api_key = CharField()
    base_url = CharField()
    model_ids = TextField(default="[]")
    updated_at = DateTimeField(default=datetime.utcnow)

    def get_model_ids(self) -> list[str]:
        """Parse model_ids JSON string to list"""
        try:
            return json.loads(self.model_ids) if self.model_ids else []
        except (json.JSONDecodeError, TypeError):
            return []

    def set_model_ids(self, model_ids: list[str]) -> None:
        """Store model_ids as JSON string"""
        self.model_ids = json.dumps(model_ids)


class ChatSession(BaseModel):
    session_id = CharField(unique=True)
    model_id = CharField()
    title = CharField(default="")
    messages = TextField(default="[]")
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    def get_messages(self) -> list[dict]:
        try:
            return json.loads(self.messages) if self.messages else []
        except (json.JSONDecodeError, TypeError):
            return []

    def set_messages(self, messages: list[dict]) -> None:
        self.messages = json.dumps(messages, ensure_ascii=False)


class AppSetting(BaseModel):
    key = CharField(unique=True)
    value = TextField(default="")
    updated_at = DateTimeField(default=datetime.utcnow)


PROMPT_LIBRARY_KEY = "prompt_library"
PROMPT_LIBRARY_PATH_ENV = "PARAIMAGE_PROMPT_LIBRARY_PATH"


def _migrate_legacy_db_path() -> None:
    if DB_PATH.exists():
        return
    candidates = [
        path for path in DATA_DIR.glob("*.db") if path.name != DB_PATH.name
    ]
    if len(candidates) != 1:
        return
    legacy_path = candidates[0]
    try:
        legacy_path.replace(DB_PATH)
    except Exception:
        # Best-effort migration; keep legacy path if rename fails.
        pass


def _build_prompt_title(content: str) -> str:
    trimmed = " ".join(content.split())
    if not trimmed:
        return "Untitled prompt"
    return trimmed if len(trimmed) <= 24 else f"{trimmed[:24]}..."


def _normalize_prompt_item(item: object, now: str) -> dict | None:
    if isinstance(item, str):
        content = item.strip()
        if not content:
            return None
        return {
            "id": f"prompt-{uuid4().hex}",
            "title": _build_prompt_title(content),
            "content": content,
            "createdAt": now,
            "updatedAt": now,
        }
    if not isinstance(item, dict):
        return None
    content_raw = (
        item.get("content")
        if isinstance(item.get("content"), str)
        else item.get("prompt")
        if isinstance(item.get("prompt"), str)
        else item.get("text")
        if isinstance(item.get("text"), str)
        else ""
    )
    content = content_raw.strip() if isinstance(content_raw, str) else ""
    if not content:
        return None
    title_raw = item.get("title") if isinstance(item.get("title"), str) else ""
    title = title_raw.strip() if isinstance(title_raw, str) else ""
    if not title:
        title = _build_prompt_title(content)
    prompt_id = item.get("id") if isinstance(item.get("id"), str) else ""
    if not prompt_id:
        prompt_id = f"prompt-{uuid4().hex}"
    created_at = item.get("createdAt") if isinstance(item.get("createdAt"), str) else now
    updated_at = item.get("updatedAt") if isinstance(item.get("updatedAt"), str) else now
    return {
        "id": prompt_id,
        "title": title,
        "content": content,
        "createdAt": created_at,
        "updatedAt": updated_at,
    }


def _parse_prompt_library_payload(payload: object) -> list[dict]:
    items: list[object]
    if isinstance(payload, dict):
        candidate = payload.get("prompts") or payload.get("items")
        if not isinstance(candidate, list):
            return []
        items = candidate
    elif isinstance(payload, list):
        items = payload
    else:
        return []
    now = datetime.utcnow().isoformat()
    normalized: list[dict] = []
    for item in items:
        prompt_item = _normalize_prompt_item(item, now)
        if prompt_item:
            normalized.append(prompt_item)
    return normalized


def _load_default_prompt_library() -> list[dict]:
    candidates: list[Path] = []
    env_path = os.environ.get(PROMPT_LIBRARY_PATH_ENV)
    if env_path:
        candidates.append(Path(env_path))
    candidates.extend(
        [
            Path(__file__).resolve().parent.parent.parent / "prompt-library.json",
            DATA_DIR / "prompt-library.json",
            Path.cwd() / "prompt-library.json",
        ]
    )
    for path in candidates:
        try:
            if not path.is_file():
                continue
            raw = path.read_text(encoding="utf-8")
        except Exception:
            continue
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        prompts = _parse_prompt_library_payload(payload)
        if prompts:
            return prompts
    return []


def _seed_prompt_library() -> None:
    record = get_app_setting(PROMPT_LIBRARY_KEY)
    if record is not None:
        return
    prompts = _load_default_prompt_library()
    if prompts:
        set_prompt_library(prompts)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _migrate_legacy_db_path()
    database.connect(reuse_if_open=True)
    database.create_tables(
        [Settings, ChatSession, AppSetting], safe=True
    )
    _ensure_settings_model_ids_column()
    _migrate_legacy_custom_providers()
    _seed_prompt_library()


def ensure_db() -> None:
    if database.is_closed():
        database.connect(reuse_if_open=True)


def list_settings() -> list[Settings]:
    ensure_db()
    return list(Settings.select().order_by(Settings.updated_at.desc()))


def save_settings(
    provider_name: str,
    api_key: str,
    base_url: str,
    model_ids: list[str] | None = None,
) -> Settings:
    ensure_db()
    existing = Settings.get_or_none(Settings.provider_name == provider_name)
    if existing:
        existing.api_key = api_key
        existing.base_url = base_url
        if model_ids is not None:
            existing.set_model_ids(model_ids)
        existing.updated_at = datetime.utcnow()
        existing.save()
        return existing
    return Settings.create(
        provider_name=provider_name,
        api_key=api_key,
        base_url=base_url,
        model_ids=json.dumps(model_ids or []),
        updated_at=datetime.utcnow(),
    )


def get_settings(provider_name: str) -> Settings | None:
    ensure_db()
    return Settings.get_or_none(Settings.provider_name == provider_name)


def _ensure_settings_model_ids_column() -> None:
    cursor = database.execute_sql("PRAGMA table_info(settings)")
    columns = [row[1] for row in cursor.fetchall()]
    if "model_ids" in columns:
        return
    database.execute_sql(
        "ALTER TABLE settings ADD COLUMN model_ids TEXT DEFAULT '[]'"
    )


def _table_exists(table_name: str) -> bool:
    cursor = database.execute_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    return cursor.fetchone() is not None


def _migrate_legacy_custom_providers() -> None:
    legacy_table = None
    for candidate in ("customprovider", "custom_provider"):
        if _table_exists(candidate):
            legacy_table = candidate
            break
    if not legacy_table:
        return
    try:
        cursor = database.execute_sql(
            f"SELECT provider_name, api_key, base_url, model_ids FROM {legacy_table}"
        )
    except Exception:
        return

    rows = cursor.fetchall()
    if not rows:
        return

    for provider_name, api_key, base_url, model_ids in rows:
        if not provider_name:
            continue
        try:
            parsed_model_ids = (
                json.loads(model_ids) if model_ids else []
            )
        except (json.JSONDecodeError, TypeError):
            parsed_model_ids = []

        existing = Settings.get_or_none(Settings.provider_name == provider_name)
        if existing:
            updated = False
            if api_key and not existing.api_key:
                existing.api_key = api_key
                updated = True
            if base_url and not existing.base_url:
                existing.base_url = base_url
                updated = True
            if parsed_model_ids and not existing.get_model_ids():
                existing.set_model_ids(parsed_model_ids)
                updated = True
            if updated:
                existing.updated_at = datetime.utcnow()
                existing.save()
            continue

        Settings.create(
            provider_name=provider_name,
            api_key=api_key or "",
            base_url=base_url or "",
            model_ids=json.dumps(parsed_model_ids),
            updated_at=datetime.utcnow(),
        )


def list_chat_sessions(model_id: str) -> list[ChatSession]:
    ensure_db()
    return list(
        ChatSession.select()
        .where(ChatSession.model_id == model_id)
        .order_by(ChatSession.updated_at.desc())
    )


def delete_chat_session(session_id: str) -> bool:
    ensure_db()
    if not session_id:
        return False
    deleted = (
        ChatSession.delete()
        .where(ChatSession.session_id == session_id)
        .execute()
    )
    return deleted > 0


def upsert_chat_session(
    session_id: str,
    model_id: str,
    title: str,
    messages: list[dict],
) -> ChatSession:
    ensure_db()
    now = datetime.utcnow()
    existing = ChatSession.get_or_none(ChatSession.session_id == session_id)
    if existing:
        existing.model_id = model_id
        existing.title = title
        existing.set_messages(messages)
        existing.updated_at = now
        existing.save()
        return existing
    record = ChatSession(
        session_id=session_id,
        model_id=model_id,
        title=title,
        created_at=now,
        updated_at=now,
    )
    record.set_messages(messages)
    record.save()
    return record


def get_app_setting(key: str) -> AppSetting | None:
    ensure_db()
    return AppSetting.get_or_none(AppSetting.key == key)


def set_app_setting(key: str, value: str) -> AppSetting:
    ensure_db()
    record = AppSetting.get_or_none(AppSetting.key == key)
    if record:
        record.value = value
        record.updated_at = datetime.utcnow()
        record.save()
        return record
    return AppSetting.create(
        key=key,
        value=value,
        updated_at=datetime.utcnow(),
    )


def get_prompt_library() -> list[dict]:
    record = get_app_setting(PROMPT_LIBRARY_KEY)
    if not record or not record.value:
        return []
    try:
        payload = json.loads(record.value)
    except (json.JSONDecodeError, TypeError):
        return []
    if isinstance(payload, list):
        return payload
    return []


def set_prompt_library(prompts: list[dict]) -> AppSetting:
    return set_app_setting(
        PROMPT_LIBRARY_KEY,
        json.dumps(prompts, ensure_ascii=False),
    )
