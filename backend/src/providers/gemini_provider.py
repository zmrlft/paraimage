from __future__ import annotations

import base64
from typing import Sequence

from google import genai
from google.genai import types

from utils import debug_log


def _parse_data_url(data_url: str) -> tuple[bytes, str] | None:
    if not data_url.startswith("data:"):
        return None
    header, _, payload = data_url.partition(",")
    if not payload:
        return None
    mime = header[5:]
    if ";" in mime:
        mime = mime.split(";", 1)[0]
    if not mime:
        mime = "application/octet-stream"
    try:
        data = base64.b64decode(payload)
    except Exception:
        return None
    return data, mime


def generate_image(
    *,
    model_id: str,
    prompt: str,
    api_key: str,
    references: Sequence[str],
) -> tuple[str | None, str | None]:
    if not api_key:
        return None, "api key is required"

    client = genai.Client(api_key=api_key)
    parts: list[types.Part] = [types.Part(text=prompt)]
    for ref in references:
        parsed = _parse_data_url(ref)
        if not parsed:
            return None, "unsupported reference image format"
        data, mime = parsed
        parts.append(types.Part(inline_data=types.Blob(data=data, mime_type=mime)))

    debug_log(
        "gemini_generate request",
        {
            "model": model_id,
            "prompt_len": len(prompt or ""),
            "references": len(references),
        },
    )

    try:
        response = client.models.generate_content(
            model=model_id,
            contents=parts,
        )
    except Exception as exc:
        debug_log(
            "gemini_generate error",
            {"type": type(exc).__name__, "message": str(exc)},
        )
        return None, f"request failed: {exc}"

    parts = response.parts or []
    for part in parts:
        if part.inline_data and part.inline_data.data:
            mime_type = part.inline_data.mime_type or "image/png"
            encoded = base64.b64encode(part.inline_data.data).decode("ascii")
            return f"data:{mime_type};base64,{encoded}", None

    return None, "no image data returned"
