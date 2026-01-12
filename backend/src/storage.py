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
    updated_at = DateTimeField(default=datetime.utcnow)


class CustomProvider(BaseModel):
    """Custom provider configuration with model mappings"""

    provider_name = CharField(unique=True)
    api_key = CharField()
    base_url = CharField(default="")
    model_ids = CharField(default="[]")  # JSON array of model IDs
    is_enabled = CharField(default="true")  # JSON boolean string
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

    def get_is_enabled(self) -> bool:
        """Parse is_enabled JSON boolean string"""
        try:
            return json.loads(self.is_enabled) if self.is_enabled else True
        except (json.JSONDecodeError, TypeError):
            return True

    def set_is_enabled(self, enabled: bool) -> None:
        """Store is_enabled as JSON boolean string"""
        self.is_enabled = json.dumps(enabled)


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
        [Settings, CustomProvider, ChatSession, AppSetting], safe=True
    )


def ensure_db() -> None:
    if database.is_closed():
        database.connect(reuse_if_open=True)


def list_settings() -> list[Settings]:
    ensure_db()
    return list(Settings.select().order_by(Settings.updated_at.desc()))


def save_settings(provider_name: str, api_key: str, base_url: str) -> Settings:
    ensure_db()
    existing = Settings.get_or_none(Settings.provider_name == provider_name)
    if existing:
        existing.api_key = api_key
        existing.base_url = base_url
        existing.updated_at = datetime.utcnow()
        existing.save()
        return existing
    return Settings.create(
        provider_name=provider_name,
        api_key=api_key,
        base_url=base_url,
        updated_at=datetime.utcnow(),
    )


def get_settings(provider_name: str) -> Settings | None:
    ensure_db()
    return Settings.get_or_none(Settings.provider_name == provider_name)


def add_custom_provider(
    provider_name: str, api_key: str, base_url: str, model_ids: list[str]
) -> CustomProvider:
    """Add or update a custom provider with its model IDs"""
    ensure_db()
    existing = CustomProvider.get_or_none(
        CustomProvider.provider_name == provider_name
    )
    if existing:
        existing.api_key = api_key
        existing.base_url = base_url
        existing.set_model_ids(model_ids)
        existing.updated_at = datetime.utcnow()
        existing.save()
        return existing
    return CustomProvider.create(
        provider_name=provider_name,
        api_key=api_key,
        base_url=base_url,
        model_ids=json.dumps(model_ids),
        is_enabled="true",
        updated_at=datetime.utcnow(),
    )


def get_custom_provider(provider_name: str) -> CustomProvider | None:
    """Get custom provider by name"""
    ensure_db()
    return CustomProvider.get_or_none(
        CustomProvider.provider_name == provider_name
    )


def list_custom_providers() -> list[CustomProvider]:
    """List all custom providers ordered by update time"""
    ensure_db()
    return list(CustomProvider.select().order_by(CustomProvider.updated_at.desc()))


def delete_custom_provider(provider_name: str) -> bool:
    """Delete a custom provider"""
    ensure_db()
    custom = CustomProvider.get_or_none(
        CustomProvider.provider_name == provider_name
    )
    if custom:
        custom.delete_instance()
        return True
    return False


def find_custom_provider_by_model(model_id: str) -> CustomProvider | None:
    """Find custom provider that supports a specific model"""
    ensure_db()
    providers = CustomProvider.select()
    lowered_model = (model_id or "").lower()
    for provider in providers:
        if provider.get_is_enabled():
            model_ids = provider.get_model_ids()
            if any(
                lowered_model == (m or "").lower() for m in model_ids
            ):
                return provider
    return None


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
