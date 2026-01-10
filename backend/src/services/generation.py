from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from providers.gemini_provider import generate_image as generate_gemini_image
from providers.openai_provider import generate_image
from schemas import BatchGenerateRequest, GenerateRequest, GenerateResponse
from storage import get_settings
from utils import (
    collect_reference_images,
    get_provider_settings,
    is_seedream_provider,
    resolve_default_base_url,
    resolve_provider_model_id,
    resolve_provider_name_with_custom,
)


def generate_single(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        request = GenerateRequest.model_validate(payload)
    except ValidationError as exc:
        return {"ok": False, "error": exc.errors()}

    # Resolve provider with custom provider priority
    if request.provider_name:
        provider_name = request.provider_name
    else:
        provider_name, is_custom = resolve_provider_name_with_custom(request.model_id)

    if not provider_name:
        return {
            "ok": False,
            "error": "provider not found for model",
            "modelId": request.model_id,
            "prompt": request.prompt,
        }

    # Get provider settings (custom or built-in, custom takes priority)
    settings = get_provider_settings(provider_name)
    if not settings or not settings.api_key:
        return {
            "ok": False,
            "error": "provider config not found or apiKey missing",
            "modelId": request.model_id,
            "prompt": request.prompt,
        }

    base_url = settings.base_url or resolve_default_base_url(
        provider_name, request.model_id
    )
    if provider_name != "Google Gemini" and not base_url:
        return {
            "ok": False,
            "error": "baseUrl missing for provider",
            "modelId": request.model_id,
            "prompt": request.prompt,
        }

    references = collect_reference_images(request.references)
    provider_model_id = resolve_provider_model_id(
        provider_name, request.model_id
    )
    if provider_name == "Google Gemini":
        image_url, error = generate_gemini_image(
            model_id=provider_model_id,
            prompt=request.prompt,
            api_key=settings.api_key,
            references=references,
        )
    else:
        is_seedream = is_seedream_provider(
            provider_name, base_url or "", request.model_id
        )
        image_url, error = generate_image(
            model_id=provider_model_id,
            prompt=request.prompt,
            size=request.size,
            base_url=base_url or "",
            api_key=settings.api_key,
            references=references,
            is_seedream=is_seedream,
        )

    if error or not image_url:
        return {
            "ok": False,
            "error": error or "generation failed",
            "modelId": request.model_id,
            "prompt": request.prompt,
        }

    response = GenerateResponse(
        ok=True,
        model_id=request.model_id,
        prompt=request.prompt,
        image_url=image_url,
    )
    return response.model_dump(by_alias=True)


def generate_batch(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        request = BatchGenerateRequest.model_validate(payload)
    except ValidationError as exc:
        return {"ok": False, "error": exc.errors()}

    references = collect_reference_images(request.references)
    images: list[dict[str, Any]] = []

    provider_name_override = request.provider_name
    for model_id in request.model_ids:
        # Resolve provider with custom provider priority
        if provider_name_override:
            provider_name = provider_name_override
        else:
            provider_name, is_custom = resolve_provider_name_with_custom(model_id)

        if not provider_name:
            images.append(
                {
                    "ok": False,
                    "modelId": model_id,
                    "prompt": request.prompt,
                    "error": "provider not found for model",
                }
            )
            continue

        # Get provider settings (custom or built-in, custom takes priority)
        settings = get_provider_settings(provider_name)
        if not settings or not settings.api_key:
            images.append(
                {
                    "ok": False,
                    "modelId": model_id,
                    "prompt": request.prompt,
                    "error": "provider config not found or apiKey missing",
                }
            )
            continue

        base_url = settings.base_url or resolve_default_base_url(
            provider_name, model_id
        )
        if provider_name != "Google Gemini" and not base_url:
            images.append(
                {
                    "ok": False,
                    "modelId": model_id,
                    "prompt": request.prompt,
                    "error": "baseUrl missing for provider",
                }
            )
            continue

        provider_model_id = resolve_provider_model_id(provider_name, model_id)
        if provider_name == "Google Gemini":
            image_url, error = generate_gemini_image(
                model_id=provider_model_id,
                prompt=request.prompt,
                api_key=settings.api_key,
                references=references,
            )
        else:
            is_seedream = is_seedream_provider(
                provider_name, base_url or "", model_id
            )
            image_url, error = generate_image(
                model_id=provider_model_id,
                prompt=request.prompt,
                size=request.size,
                base_url=base_url or "",
                api_key=settings.api_key,
                references=references,
                is_seedream=is_seedream,
            )

        if error or not image_url:
            images.append(
                {
                    "ok": False,
                    "modelId": model_id,
                    "prompt": request.prompt,
                    "error": error or "generation failed",
                }
            )
            continue

        response = GenerateResponse(
            ok=True,
            model_id=model_id,
            prompt=request.prompt,
            image_url=image_url,
        )
        images.append(response.model_dump(by_alias=True))

    return {"ok": True, "images": images}
