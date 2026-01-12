from __future__ import annotations

import base64
import io
import os
import urllib.parse
import urllib.request
from typing import Any

from PIL import Image
from pydantic import ValidationError
from rembg import remove

from schemas import ProcessImagesRequest


def _decode_data_url(data_url: str) -> bytes | None:
    header, _, payload = data_url.partition(",")
    if not payload:
        return None
    is_base64 = ";base64" in header
    try:
        if is_base64:
            return base64.b64decode(payload)
        return urllib.parse.unquote_to_bytes(payload)
    except (ValueError, OSError):
        return None


def _load_image_bytes(image_url: str) -> bytes | None:
    if not image_url:
        return None
    if image_url.startswith("data:"):
        return _decode_data_url(image_url)
    parsed = urllib.parse.urlparse(image_url)
    if parsed.scheme in {"http", "https"}:
        try:
            with urllib.request.urlopen(image_url) as response:
                return response.read()
        except (OSError, ValueError):
            return None
    if parsed.scheme == "file":
        file_path = urllib.request.url2pathname(parsed.path)
        if os.path.exists(file_path):
            with open(file_path, "rb") as handle:
                return handle.read()
        return None
    if os.path.exists(image_url):
        with open(image_url, "rb") as handle:
            return handle.read()
    return None


def _to_png_data_url(image_bytes: bytes) -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _split_image(image_bytes: bytes, rows: int, cols: int) -> list[bytes]:
    with Image.open(io.BytesIO(image_bytes)) as image:
        image = image.convert("RGBA")
        width, height = image.size
        if rows <= 0 or cols <= 0:
            return []
        cell_width = width / cols
        cell_height = height / rows
        boxes = []
        for row in range(rows):
            for col in range(cols):
                left = int(round(col * cell_width))
                upper = int(round(row * cell_height))
                right = int(round((col + 1) * cell_width))
                lower = int(round((row + 1) * cell_height))
                boxes.append((left, upper, right, lower))
        results: list[bytes] = []
        for box in boxes:
            cropped = image.crop(box)
            buffer = io.BytesIO()
            cropped.save(buffer, format="PNG")
            results.append(buffer.getvalue())
        return results


def process_images(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        request = ProcessImagesRequest.model_validate(payload)
    except ValidationError as exc:
        return {"ok": False, "error": exc.errors(), "results": []}

    action = request.action
    results: list[dict[str, Any]] = []

    if action not in {"remove_bg", "split"}:
        return {"ok": False, "error": "unsupported action", "results": []}

    rows = max(1, request.rows)
    cols = max(1, request.cols)

    for item in request.images:
        image_bytes = _load_image_bytes(item.image_url)
        if not image_bytes:
            results.append({"id": item.id, "error": "image not found"})
            continue
        try:
            if action == "remove_bg":
                processed = remove(image_bytes)
                data_url = _to_png_data_url(processed)
                results.append({"id": item.id, "images": [data_url]})
            else:
                pieces = _split_image(image_bytes, rows, cols)
                data_urls = [_to_png_data_url(piece) for piece in pieces]
                results.append({"id": item.id, "images": data_urls})
        except (OSError, ValueError, RuntimeError) as exc:
            results.append({"id": item.id, "error": str(exc)})

    return {"ok": True, "action": action, "results": results}
