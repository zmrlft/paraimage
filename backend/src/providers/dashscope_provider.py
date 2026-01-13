from __future__ import annotations

from typing import Sequence

from utils import debug_log, normalize_base_url


def _resolve_dashscope_size(size: str | None) -> str | None:
    if not size:
        return None
    value = str(size).strip().lower()
    if not value:
        return None
    if "*" in value:
        parts = value.split("*", 1)
        try:
            width = int(parts[0])
            height = int(parts[1])
        except (TypeError, ValueError):
            return None
        if width <= 0 or height <= 0:
            return None
        return f"{width}*{height}"
    if "x" in value:
        parts = value.split("x", 1)
        try:
            width = int(parts[0])
            height = int(parts[1])
        except (TypeError, ValueError):
            return None
        if width <= 0 or height <= 0:
            return None
        return f"{width}*{height}"
    if value.isdigit():
        return f"{int(value)}*{int(value)}"
    return None


def _normalize_dashscope_base_url(base_url: str) -> str:
    base = normalize_base_url(base_url or "")
    if not base:
        return base
    if "/compatible-mode" in base:
        prefix = base.split("/compatible-mode", 1)[0]
        return f"{prefix}/api/v1"
    return base


def _extract_image_from_response(response: object) -> tuple[str | None, str | None]:
    output = response.get("output") if isinstance(response, dict) else getattr(response, "output", None)
    if not output:
        return None, "no output returned"

    results = output.get("results") if isinstance(output, dict) else getattr(output, "results", None)
    if results and isinstance(results, list):
        first = results[0]
        image_url = first.get("url") if isinstance(first, dict) else getattr(first, "url", None)
        if image_url:
            return image_url, None

    choices = output.get("choices") if isinstance(output, dict) else getattr(output, "choices", None)
    if not choices:
        return None, "no choices returned"

    first = choices[0]
    message = first.get("message") if isinstance(first, dict) else getattr(first, "message", None)
    if not message:
        return None, "no message returned"

    content = message.get("content") if isinstance(message, dict) else getattr(message, "content", None)
    if not content or not isinstance(content, list):
        return None, "no content returned"

    for item in content:
        image_url = item.get("image") if isinstance(item, dict) else getattr(item, "image", None)
        if image_url:
            return image_url, None

    return None, "no image returned"


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

    input_images = [ref for ref in references if ref]
    if not str(prompt or "").strip():
        return None, "qwen image prompt is required"

    try:
        import dashscope
        from dashscope import MultiModalConversation
    except Exception as exc:
        return None, f"dashscope sdk not available: {exc}"

    if base_url:
        dashscope.base_http_api_url = _normalize_dashscope_base_url(base_url)

    lowered_model = (model_id or "").lower()
    is_edit_model = "image-edit" in lowered_model
    is_max_model = "image-max" in lowered_model

    if is_edit_model:
        if not input_images:
            return None, "qwen image edit requires at least 1 reference image"
        if len(input_images) > 3:
            return None, "qwen image edit supports at most 3 reference images"
    else:
        if input_images:
            return None, "qwen image models without edit do not accept reference images"

    content: list[dict[str, str]] = []
    if is_edit_model:
        content.extend({"image": image} for image in input_images)
    content.append({"text": prompt})

    payload: dict[str, object] = {
        "api_key": api_key,
        "model": model_id,
        "messages": [{"role": "user", "content": content}],
        "result_format": "message",
        "stream": False,
        "n": 1,
        "watermark": False,
        "prompt_extend": True,
        "negative_prompt": "",
    }

    size_value = _resolve_dashscope_size(size)
    if size_value:
        payload["size"] = size_value

    request_label = "dashscope_edit" if is_edit_model else "dashscope_max" if is_max_model else "dashscope_generate"
    debug_log(
        f"{request_label} request",
        {
            "model": model_id,
            "base_url": dashscope.base_http_api_url,
            "references": len(input_images),
            "size": payload.get("size"),
            "prompt_len": len(prompt or ""),
        },
    )

    try:
        response = MultiModalConversation.call(**payload)
    except Exception as exc:
        debug_log(
            f"{request_label} error",
            {"type": type(exc).__name__, "message": str(exc)},
        )
        return None, f"request failed: {exc}"

    status_code = response.get("status_code") if isinstance(response, dict) else getattr(response, "status_code", None)
    if status_code != 200:
        code = response.get("code") if isinstance(response, dict) else getattr(response, "code", None)
        message = response.get("message") if isinstance(response, dict) else getattr(response, "message", None)
        detail = f"{code}: {message}" if code or message else "request failed"
        return None, f"dashscope error ({status_code}): {detail}"

    return _extract_image_from_response(response)
