from __future__ import annotations

from typing import Literal

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


class ProcessImageItem(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    id: str = ""
    image_url: str = Field(alias="imageUrl")


class ProcessImagesRequest(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    action: Literal["remove_bg", "split"] = "remove_bg"
    images: list[ProcessImageItem] = Field(default_factory=list)
    rows: int = Field(default=2, ge=1, le=8)
    cols: int = Field(default=2, ge=1, le=8)


class SaveImageItem(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    id: str = ""
    image_url: str = Field(alias="imageUrl")
    filename: str | None = None


class SaveImagesRequest(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    images: list[SaveImageItem] = Field(default_factory=list)
    directory: str | None = None


class AppSettingsPayload(PydanticBaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    default_save_dir: str | None = Field(default=None, alias="defaultSaveDir")
