from __future__ import annotations

import base64
import io
import os
import urllib.parse
import urllib.request
from typing import Any

from PIL import Image, ImageDraw
from pydantic import ValidationError
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


def _normalize_positions(values: list[float], limit: int) -> list[int]:
    if limit <= 0:
        return []
    positions: list[int] = []
    for value in values:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        if numeric <= 0 or numeric >= 1:
            continue
        pixel = int(round(numeric * limit))
        if pixel <= 0 or pixel >= limit:
            continue
        positions.append(pixel)
    unique = sorted(set(positions))
    return unique


def _split_image_by_lines(
    image_bytes: bytes, split_x: list[float], split_y: list[float]
) -> list[bytes]:
    with Image.open(io.BytesIO(image_bytes)) as image:
        image = image.convert("RGBA")
        width, height = image.size
        if width <= 0 or height <= 0:
            return []
        xs = [0, *(_normalize_positions(split_x, width)), width]
        ys = [0, *(_normalize_positions(split_y, height)), height]
        if len(xs) <= 2 and len(ys) <= 2:
            return []
        results: list[bytes] = []
        for top_index in range(len(ys) - 1):
            for left_index in range(len(xs) - 1):
                left = xs[left_index]
                right = xs[left_index + 1]
                upper = ys[top_index]
                lower = ys[top_index + 1]
                if right - left <= 1 or lower - upper <= 1:
                    continue
                cropped = image.crop((left, upper, right, lower))
                buffer = io.BytesIO()
                cropped.save(buffer, format="PNG")
                results.append(buffer.getvalue())
        return results


def _free_cut_image(image_bytes: bytes, path: list[tuple[float, float]]) -> list[bytes]:
    if len(path) < 3:
        return []
    with Image.open(io.BytesIO(image_bytes)) as image:
        image = image.convert("RGBA")
        width, height = image.size
        if width <= 0 or height <= 0:
            return []
        points: list[tuple[int, int]] = []
        for x, y in path:
            if x < 0 or x > 1 or y < 0 or y > 1:
                continue
            points.append((int(round(x * width)), int(round(y * height))))
        if len(points) < 3:
            return []
        mask = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(mask)
        draw.polygon(points, fill=255)
        bbox = mask.getbbox()
        if not bbox:
            return []
        result = image.copy()
        result.putalpha(mask)
        cropped = result.crop(bbox)
        buffer = io.BytesIO()
        cropped.save(buffer, format="PNG")
        return [buffer.getvalue()]


def process_images(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        request = ProcessImagesRequest.model_validate(payload)
    except ValidationError as exc:
        return {"ok": False, "error": exc.errors(), "results": []}

    action = request.action
    results: list[dict[str, Any]] = []

    if action not in {"remove_bg", "split", "split_lines", "split_free"}:
        return {"ok": False, "error": "unsupported action", "results": []}

    rows = max(1, request.rows)
    cols = max(1, request.cols)
    split_x = request.split_x
    split_y = request.split_y
    free_path = [(point.x, point.y) for point in request.free_path]

    for item in request.images:
        image_bytes = _load_image_bytes(item.image_url)
        if not image_bytes:
            results.append({"id": item.id, "error": "image not found"})
            continue
        try:
            if action == "remove_bg":
                from rembg import remove

                processed = remove(image_bytes)
                data_url = _to_png_data_url(processed)
                results.append({"id": item.id, "images": [data_url]})
            elif action == "split":
                pieces = _split_image(image_bytes, rows, cols)
                data_urls = [_to_png_data_url(piece) for piece in pieces]
                results.append({"id": item.id, "images": data_urls})
            elif action == "split_lines":
                pieces = _split_image_by_lines(image_bytes, split_x, split_y)
                data_urls = [_to_png_data_url(piece) for piece in pieces]
                results.append({"id": item.id, "images": data_urls})
            else:
                pieces = _free_cut_image(image_bytes, free_path)
                data_urls = [_to_png_data_url(piece) for piece in pieces]
                results.append({"id": item.id, "images": data_urls})
        except (OSError, ValueError, RuntimeError) as exc:
            results.append({"id": item.id, "error": str(exc)})

    return {"ok": True, "action": action, "results": results}
