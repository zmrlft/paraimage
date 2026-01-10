from __future__ import annotations

import os
from typing import Any, Sequence
from urllib.parse import urlparse, urlunparse

from schemas import ImageReference

DEFAULT_SEEDREAM_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"

SEEDREAM_PROVIDER_HINTS = ("seedream", "seededit", "doubao", "volc", "bytedance", "ark")
OPENAI_PROVIDER_HINTS = ("openai",)
GEMINI_PROVIDER_HINTS = ("gemini", "google")
DASHSCOPE_PROVIDER_HINTS = ("qwen", "dashscope", "aliyun", "alibaba")



def escape_xml(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def placeholder_svg(label: str, prompt: str, size: int = 512) -> str:
    palette = ["#0f172a", "#1e293b", "#1f2937", "#1e3a8a"]
    accent = ["#38bdf8", "#22c55e", "#f97316", "#f43f5e"]
    index = sum(ord(ch) for ch in label) % len(palette)
    bg = palette[index]
    fg = accent[index]
    label_text = escape_xml(label or "model")
    prompt_text = escape_xml(prompt or "mock image")
    return (
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{size}' height='{size}' "
        f"viewBox='0 0 {size} {size}'>"
        f"<rect width='100%' height='100%' fill='{bg}'/>"
        f"<rect x='24' y='24' width='{size - 48}' height='{size - 48}' rx='24' "
        f"fill='white' fill-opacity='0.08' stroke='white' stroke-opacity='0.2'/>"
        f"<text x='50%' y='46%' fill='{fg}' font-family='Arial, sans-serif' "
        f"font-size='26' text-anchor='middle'>{label_text}</text>"
        f"<text x='50%' y='56%' fill='white' font-family='Arial, sans-serif' "
        f"font-size='14' text-anchor='middle'>{prompt_text}</text>"
        "</svg>"
    )


def collect_reference_images(references: Sequence[ImageReference]) -> list[str]:
    images: list[str] = []
    for ref in references:
        data_url = (ref.data_url or "").strip()
        if data_url:
            images.append(data_url)
    return images


def resolve_size(value: str | None) -> int:
    size = 512
    if not value:
        return size
    requested_size = str(value).lower()
    if "x" in requested_size:
        try:
            size = int(requested_size.split("x")[0])
        except ValueError:
            size = 512
    else:
        try:
            size = int(requested_size)
        except ValueError:
            size = 512
    return size


def resolve_seedream_size(value: str | None) -> str:
    if not value:
        return "2048x2048"
    requested = str(value).strip()
    if not requested:
        return "2048x2048"
    lowered = requested.lower()
    if lowered in {"2k", "4k"}:
        return lowered.upper()
    if "x" in lowered:
        return lowered
    if lowered.isdigit():
        return f"{lowered}x{lowered}"
    return "2048x2048"


def resolve_gpt_image_size(value: str | None) -> str:
    if not value:
        return "1024x1024"
    requested = str(value).strip()
    if not requested:
        return "1024x1024"
    lowered = requested.lower()
    if "x" in lowered:
        return lowered
    if lowered.isdigit():
        return f"{lowered}x{lowered}"
    return "1024x1024"


def normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


def resolve_seedream_base_url(base_url: str) -> str:
    base = normalize_base_url(base_url or "")
    if not base:
        return DEFAULT_SEEDREAM_BASE_URL
    if base.endswith("/images/generations"):
        return base.rsplit("/images/generations", 1)[0]
    return base


def resolve_openai_base_url(base_url: str) -> str | None:
    base = normalize_base_url(base_url or "")
    if not base:
        return None
    if base.endswith("/images/generations"):
        return base.rsplit("/images/generations", 1)[0]
    parsed = urlparse(base)
    path = parsed.path or ""
    if not path or path == "/":
        parsed = parsed._replace(path="/v1")
        return urlunparse(parsed)
    return base


def is_seedream_provider(provider: str, base_url: str, model_id: str) -> bool:
    lowered_provider = (provider or "").lower()
    lowered_base = (base_url or "").lower()
    lowered_model = (model_id or "").lower()
    if "seedream" in lowered_model or "seededit" in lowered_model:
        return True
    if "volces.com" in lowered_base or "ark" in lowered_base:
        return True
    return any(token in lowered_provider for token in SEEDREAM_PROVIDER_HINTS)


def resolve_default_base_url(provider: str, model_id: str) -> str | None:
    lowered_provider = (provider or "").lower()
    lowered_model = (model_id or "").lower()

    if is_seedream_provider(provider, "", model_id):
        return DEFAULT_SEEDREAM_BASE_URL
    if any(token in lowered_provider for token in GEMINI_PROVIDER_HINTS) or "nano-banana" in lowered_model:
        return DEFAULT_GEMINI_BASE_URL
    if any(token in lowered_provider for token in DASHSCOPE_PROVIDER_HINTS) or "qwen" in lowered_model:
        return DEFAULT_DASHSCOPE_BASE_URL
    if any(token in lowered_provider for token in OPENAI_PROVIDER_HINTS) or lowered_model.startswith("gpt-"):
        return DEFAULT_OPENAI_BASE_URL

    return None


def resolve_provider_name(model_id: str) -> str | None:
    lowered_model = (model_id or "").lower()
    if is_seedream_provider("", "", model_id):
        return "Volcengine Ark"
    if "nano-banana" in lowered_model:
        return "Google Gemini"
    if "qwen" in lowered_model:
        return "Alibaba DashScope"
    if lowered_model.startswith("gpt-"):
        return "OpenAI"
    return None


def resolve_provider_name_with_custom(model_id: str) -> tuple[str | None, bool]:
    """
    Resolve provider name with custom provider priority.
    
    Returns:
        tuple: (provider_name, is_custom_provider)
        If custom provider is found that supports this model, is_custom_provider is True.
        If built-in provider is found, is_custom_provider is False.
        If no provider found, returns (None, False).
    """
    # Import here to avoid circular imports
    from storage import find_custom_provider_by_model

    # Check custom providers first (priority)
    custom = find_custom_provider_by_model(model_id)
    if custom:
        return custom.provider_name, True

    # Fall back to built-in provider detection
    provider = resolve_provider_name(model_id)
    return provider, False



def resolve_provider_model_id(provider_name: str, model_id: str) -> str:
    lowered_provider = (provider_name or "").lower()
    lowered_model = (model_id or "").lower()
    if "gemini" in lowered_provider:
        if lowered_model == "nano-banana":
            return "gemini-2.5-flash-image"
        if lowered_model == "nano-banana-pro":
            return "gemini-3-pro-image-preview"
    return model_id


def supports_seedream_sequence(model_id: str) -> bool:
    lowered = (model_id or "").lower()
    return "seedream-4" in lowered


def is_gpt_image_model(model_id: str) -> bool:
    return (model_id or "").lower() == "gpt-image-1"


def debug_log(message: str, payload: dict[str, Any] | None = None) -> None:
    if os.getenv("DEBUG") != "true":
        return
    if payload:
        print(f"[omniimage] {message} | {payload}")
    else:
        print(f"[omniimage] {message}")


def get_provider_settings(provider_name: str) -> Any | None:
    """
    Get provider settings (custom or built-in).
    First checks custom providers, then built-in providers.
    """
    # Import here to avoid circular imports
    from storage import get_custom_provider, get_settings

    # Check custom provider first
    custom = get_custom_provider(provider_name)
    if custom and custom.get_is_enabled():
        return custom

    # Fall back to built-in provider
    return get_settings(provider_name)



def extract_image_from_response(
    data: Any,
    *,
    mime_type: str,
) -> tuple[str | None, str | None]:
    if isinstance(data, dict) and data.get("error"):
        return None, str(data.get("error"))

    results = data.get("data") if isinstance(data, dict) else getattr(data, "data", None)
    if not results:
        return None, "no image data returned"

    first = results[0] if isinstance(results, list) else results
    if isinstance(first, dict):
        b64_json = first.get("b64_json") or first.get("b64Json")
        url = first.get("url")
    else:
        b64_json = getattr(first, "b64_json", None)
        url = getattr(first, "url", None)

    if b64_json:
        return f"data:{mime_type};base64,{b64_json}", None
    if url:
        return url, None

    return None, "unknown image response format"
