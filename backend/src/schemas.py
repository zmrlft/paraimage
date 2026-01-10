from __future__ import annotations

from pydantic import BaseModel as PydanticBaseModel, ConfigDict, Field


class ImageReference(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    name: str = ""
    data_url: str = Field(default="", alias="dataUrl")


class GenerateRequest(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    model_id: str = Field(alias="modelId")
    provider_name: str | None = Field(default=None, alias="providerName")
    prompt: str = ""
    references: list[ImageReference] = Field(default_factory=list)
    size: str | None = None


class GenerateResponse(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    ok: bool = True
    model_id: str = Field(alias="modelId")
    prompt: str = ""
    image_url: str = Field(alias="imageUrl")
    error: str | None = None


class BatchGenerateRequest(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    model_ids: list[str] = Field(default_factory=list, alias="modelIds")
    provider_name: str | None = Field(default=None, alias="providerName")
    prompt: str = ""
    references: list[ImageReference] = Field(default_factory=list)
    size: str | None = None

class AddCustomProviderRequest(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    provider_name: str = Field(alias="providerName")
    api_key: str = Field(alias="apiKey")
    base_url: str | None = Field(default=None, alias="baseUrl")
    model_ids: list[str] = Field(default_factory=list, alias="modelIds")


class CustomProviderConfig(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    provider_name: str = Field(alias="providerName")
    api_key: str = Field(alias="apiKey")
    base_url: str = Field(alias="baseUrl")
    model_ids: list[str] = Field(alias="modelIds")
    is_enabled: bool = Field(alias="isEnabled")
    updated_at: str = Field(alias="updatedAt")


class DeleteCustomProviderRequest(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    provider_name: str = Field(alias="providerName")