from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from peewee import CharField, DateTimeField, Model, SqliteDatabase, TextField

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "omniimage.db"
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


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    database.connect(reuse_if_open=True)
    database.create_tables(
        [Settings, ChatSession, AppSetting], safe=True
    )
    _ensure_settings_model_ids_column()
    _migrate_legacy_custom_providers()


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
