from __future__ import annotations

import base64
import mimetypes
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from schemas import SaveImagesRequest
from storage import DATA_DIR, get_app_setting, set_app_setting

_MIME_EXTENSION_MAP = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}


def _decode_data_url(data_url: str) -> tuple[bytes | None, str | None]:
    header, _, payload = data_url.partition(",")
    if not payload:
        return None, None
    mime = None
    if header.startswith("data:"):
        mime = header[5:].split(";", 1)[0] or None
    is_base64 = ";base64" in header
    try:
        if is_base64:
            return base64.b64decode(payload), mime
        return urllib.parse.unquote_to_bytes(payload), mime
    except (ValueError, OSError):
        return None, mime


def _load_image_bytes(image_url: str) -> tuple[bytes | None, str | None]:
    if not image_url:
        return None, None
    if image_url.startswith("data:"):
        return _decode_data_url(image_url)
    parsed = urllib.parse.urlparse(image_url)
    if parsed.scheme in {"http", "https"}:
        try:
            with urllib.request.urlopen(image_url) as response:
                content_type = None
                if hasattr(response.headers, "get_content_type"):
                    content_type = response.headers.get_content_type()
                else:
                    content_type = response.headers.get("Content-Type")
                if content_type:
                    content_type = content_type.split(";", 1)[0]
                return response.read(), content_type
        except (OSError, ValueError):
            return None, None
    if parsed.scheme == "file":
        file_path = urllib.request.url2pathname(parsed.path)
        if os.path.exists(file_path):
            with open(file_path, "rb") as handle:
                mime = mimetypes.guess_type(file_path)[0]
                return handle.read(), mime
        return None, None
    if os.path.exists(image_url):
        with open(image_url, "rb") as handle:
            mime = mimetypes.guess_type(image_url)[0]
            return handle.read(), mime
    return None, None


def _extension_for(image_url: str, mime: str | None) -> str:
    if mime:
        extension = _MIME_EXTENSION_MAP.get(mime) or mimetypes.guess_extension(mime)
        if extension:
            return extension
    parsed = urllib.parse.urlparse(image_url)
    suffix = Path(parsed.path).suffix
    return suffix if suffix else ".png"


def _sanitize_filename(name: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return sanitized or "image"


def _pick_directory(window: Any | None) -> Path | None:
    if not window:
        return None
    try:
        import webview  # type: ignore

        result = window.create_file_dialog(webview.FOLDER_DIALOG)
        if not result:
            return None
        if isinstance(result, (list, tuple)):
            result = result[0] if result else None
        return Path(result) if result else None
    except Exception:
        return None


def choose_save_directory(window: Any | None = None) -> dict[str, Any]:
    directory = _pick_directory(window)
    if not directory:
        return {"ok": False, "error": "no directory selected"}
    return {"ok": True, "directory": str(directory)}


def save_images(payload: dict[str, Any], window: Any | None = None) -> dict[str, Any]:
    try:
        request = SaveImagesRequest.model_validate(payload)
    except ValidationError as exc:
        return {"ok": False, "error": exc.errors(), "results": []}

    if not request.images:
        return {"ok": False, "error": "no images provided", "results": []}

    target_dir = Path(request.directory) if request.directory else None
    if not target_dir:
        saved = get_app_setting("default_save_dir")
        if saved and saved.value:
            target_dir = Path(saved.value)

    if not target_dir:
        picked = _pick_directory(window)
        if picked:
            target_dir = picked
            set_app_setting("default_save_dir", str(target_dir))

    if not target_dir:
        target_dir = DATA_DIR / "exports"
    target_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    for index, item in enumerate(request.images, start=1):
        image_bytes, mime = _load_image_bytes(item.image_url)
        if not image_bytes:
            results.append({"id": item.id, "error": "image not found"})
            continue

        extension = _extension_for(item.image_url, mime)
        base_name = item.filename or item.id or f"image_{index}"
        filename = _sanitize_filename(base_name)
        if not filename.lower().endswith(extension):
            filename = f"{filename}{extension}"
        file_path = target_dir / filename
        counter = 1
        while file_path.exists():
            stem = _sanitize_filename(base_name)
            file_path = target_dir / f"{stem}-{counter}{extension}"
            counter += 1

        try:
            with open(file_path, "wb") as handle:
                handle.write(image_bytes)
            results.append({"id": item.id, "path": str(file_path)})
        except OSError as exc:
            results.append({"id": item.id, "error": str(exc)})

    return {"ok": True, "directory": str(target_dir), "results": results}
