from __future__ import annotations

from typing import Sequence

from openai import OpenAI

from utils import (
    debug_log,
    extract_image_from_response,
    is_gpt_image_model,
    resolve_gpt_image_size,
    resolve_openai_base_url,
    resolve_seedream_base_url,
    resolve_seedream_size,
    resolve_size,
    supports_seedream_sequence,
)


def generate_image(
    *,
    model_id: str,
    prompt: str,
    size: str | None,
    base_url: str,
    api_key: str,
    references: Sequence[str],
    is_seedream: bool,
) -> tuple[str | None, str | None]:
    if not api_key:
        return None, "api key is required"

    is_gpt_image = is_gpt_image_model(model_id)
    api_base = (
        resolve_seedream_base_url(base_url)
        if is_seedream
        else resolve_openai_base_url(base_url)
    )
    client_kwargs: dict[str, str] = {"api_key": api_key}
    if api_base:
        client_kwargs["base_url"] = api_base
    client = OpenAI(**client_kwargs)

    payload: dict[str, object] = {
        "model": model_id,
        "prompt": prompt,
    }

    if is_seedream:
        payload["response_format"] = "b64_json"
        payload["size"] = resolve_seedream_size(size)
    elif is_gpt_image:
        payload["n"] = 1
        payload["quality"] = "medium"
        payload["size"] = resolve_gpt_image_size(size)
    else:
        payload["response_format"] = "b64_json"
        size_value = resolve_size(size)
        payload["size"] = f"{size_value}x{size_value}"

    extra_body: dict[str, object] = {}
    if is_seedream:
        if references:
            extra_body["image"] = (
                references[0] if len(references) == 1 else list(references)
            )
        extra_body["watermark"] = False
        if supports_seedream_sequence(model_id):
            extra_body["sequential_image_generation"] = "disabled"

    debug_log(
        "image_generation request",
        {
            "model": model_id,
            "api_base": api_base,
            "is_seedream": is_seedream,
            "is_gpt_image": is_gpt_image,
            "size": payload.get("size"),
            "response_format": payload.get("response_format"),
            "quality": payload.get("quality"),
            "n": payload.get("n"),
            "references": len(references),
            "extra_body_keys": list(extra_body.keys()),
            "prompt_len": len(prompt or ""),
        },
    )

    try:
        if extra_body:
            response = client.images.generate(**payload, extra_body=extra_body)
        else:
            response = client.images.generate(**payload)
    except Exception as exc:
        debug_log(
            "image_generation error",
            {"type": type(exc).__name__, "message": str(exc)},
        )
        return None, f"request failed: {exc}"

    debug_log(
        "image_generation response",
        {
            "type": type(response).__name__,
            "has_data": bool(getattr(response, "data", None)),
            "dict_keys": list(response.keys()) if isinstance(response, dict) else [],
        },
    )

    mime_type = "image/jpeg" if is_seedream else "image/png"
    return extract_image_from_response(response, mime_type=mime_type)
