from __future__ import annotations

import base64
import math
from typing import Sequence

from openai import OpenAI

from utils import debug_log, resolve_openai_base_url

SUPPORTED_ASPECT_RATIOS = {
    "1:1": 1.0,
    "2:3": 2 / 3,
    "3:2": 3 / 2,
    "3:4": 3 / 4,
    "4:3": 4 / 3,
    "4:5": 4 / 5,
    "5:4": 5 / 4,
    "9:16": 9 / 16,
    "16:9": 16 / 9,
    "21:9": 21 / 9,
}


def _resolve_aspect_ratio(size: str | None) -> str | None:
    if not size:
        return None
    value = str(size).strip().lower()
    if not value:
        return None
    if ":" in value:
        normalized = value.replace(" ", "")
        return normalized if normalized in SUPPORTED_ASPECT_RATIOS else None
    if "x" in value:
        parts = value.split("x", 1)
        try:
            width = int(parts[0])
            height = int(parts[1])
        except (ValueError, TypeError):
            return None
        if width <= 0 or height <= 0:
            return None
        ratio = f"{width // math.gcd(width, height)}:{height // math.gcd(width, height)}"
        if ratio in SUPPORTED_ASPECT_RATIOS:
            return ratio
        ratio_value = width / height
        closest = min(
            SUPPORTED_ASPECT_RATIOS.items(),
            key=lambda item: abs(item[1] - ratio_value),
        )
        return closest[0]
    if value.isdigit():
        return "1:1"
    return None


def _extract_image_from_response(response: object) -> tuple[str | None, str | None]:
    choices = None
    if isinstance(response, dict):
        choices = response.get("choices")
    else:
        choices = getattr(response, "choices", None)
    if not choices:
        return None, "no choices returned"

    first = choices[0]
    message = first.get("message") if isinstance(first, dict) else getattr(first, "message", None)
    if not message:
        return None, "no message returned"

    parts = None
    if isinstance(message, dict):
        parts = message.get("multi_mod_content") or message.get("content")
    else:
        parts = getattr(message, "multi_mod_content", None)
        if parts is None:
            parts = getattr(message, "content", None)

    if not parts or not isinstance(parts, list):
        return None, "no multimodal content returned"

    for part in parts:
        inline = part.get("inline_data") if isinstance(part, dict) else getattr(part, "inline_data", None)
        if not inline:
            continue
        if isinstance(inline, dict):
            data = inline.get("data")
            mime_type = inline.get("mime_type") or "image/png"
        else:
            data = getattr(inline, "data", None)
            mime_type = getattr(inline, "mime_type", None) or "image/png"
        if not data:
            continue
        encoded = (
            base64.b64encode(data).decode("ascii")
            if isinstance(data, (bytes, bytearray))
            else str(data)
        )
        return f"data:{mime_type};base64,{encoded}", None

    return None, "no image data returned"


def generate_image(
    *,
    model_id: str,
    prompt: str,
    size: str | None,
    base_url: str,
    api_key: str,
    references: Sequence[str],
) -> tuple[str | None, str | None]:
    if not api_key:
        return None, "api key is required"

    api_base = resolve_openai_base_url(base_url) or base_url
    client = OpenAI(api_key=api_key, base_url=api_base)

    aspect_ratio = _resolve_aspect_ratio(size) or "1:1"
    user_content: list[dict[str, object]] = [{"type": "text", "text": prompt}]
    for ref in references:
        if ref:
            user_content.append({"type": "image_url", "image_url": {"url": ref}})

    payload: dict[str, object] = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": f"aspect_ratio={aspect_ratio}"},
            {"role": "user", "content": user_content},
        ],
        "modalities": ["text", "image"],
    }

    debug_log(
        "aihubmix_generate request",
        {
            "model": model_id,
            "api_base": api_base,
            "aspect_ratio": aspect_ratio,
            "references": len(references),
            "prompt_len": len(prompt or ""),
        },
    )

    try:
        response = client.chat.completions.create(**payload)
    except Exception as exc:
        debug_log(
            "aihubmix_generate error",
            {"type": type(exc).__name__, "message": str(exc)},
        )
        return None, f"request failed: {exc}"

    return _extract_image_from_response(response)
