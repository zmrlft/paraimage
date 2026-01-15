from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
import urllib.error
import urllib.parse
import urllib.request
import re
from pathlib import Path
from threading import Lock
from typing import Any

from app_info import APP_REPO, APP_REPO_URL, APP_VERSION
from storage import DATA_DIR

_GITHUB_API_BASE = "https://api.github.com"
_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")

_DOWNLOAD_PROGRESS_LOCK = Lock()
_DOWNLOAD_PROGRESS: dict[str, Any] = {
    "active": False,
    "done": False,
    "downloaded": 0,
    "total": None,
    "percent": None,
    "error": None,
}


def _parse_version(value: str) -> tuple[int, int, int]:
    cleaned = value.strip()
    if cleaned.startswith(("v", "V")):
        cleaned = cleaned[1:]
    cleaned = cleaned.split("+", 1)[0].split("-", 1)[0]
    parts = cleaned.split(".")
    numbers: list[int] = []
    for part in parts:
        try:
            numbers.append(int(part))
        except ValueError:
            numbers.append(0)
    while len(numbers) < 3:
        numbers.append(0)
    return tuple(numbers[:3])


def _is_newer(latest: str, current: str) -> bool:
    return _parse_version(latest) > _parse_version(current)


def _platform_key() -> str:
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


_PLATFORM_ASSET_EXTENSIONS: dict[str, dict[str, tuple[str, ...]]] = {
    "windows": {
        "archive": (".zip",),
        "installer": (".exe", ".msi"),
    },
    "macos": {
        "archive": (".zip",),
        "installer": (".dmg", ".pkg"),
    },
    "linux": {
        "archive": (".tar.gz", ".tgz", ".tar"),
        "installer": (".appimage",),
    },
}


def _platform_asset_kind(name: str) -> str | None:
    lowered = name.lower()
    platform_key = _platform_key()
    candidates = _PLATFORM_ASSET_EXTENSIONS.get(platform_key, {})
    for kind, suffixes in candidates.items():
        if lowered.endswith(suffixes):
            return kind
    return None


def _asset_tokens(name: str) -> list[str]:
    return _TOKEN_PATTERN.findall(name.lower())


def _matches_platform(tokens: list[str], platform_key: str) -> bool:
    if platform_key == "windows":
        return any(token == "windows" or token.startswith("win") for token in tokens)
    if platform_key == "macos":
        return any(
            token in ("macos", "osx", "darwin")
            or token.startswith("mac")
            for token in tokens
        )
    return any(
        token.startswith("linux")
        or token in ("ubuntu", "debian", "fedora", "appimage")
        for token in tokens
    )


def _asset_platforms(name: str) -> set[str]:
    tokens = _asset_tokens(name)
    platforms = set()
    for platform_key in ("windows", "macos", "linux"):
        if _matches_platform(tokens, platform_key):
            platforms.add(platform_key)
    return platforms


def _is_update_archive(name: str) -> bool:
    return _platform_asset_kind(name) == "archive"


def _pick_asset(
    assets: list[dict[str, Any]], preferred_kind: str | None = None
) -> dict[str, Any] | None:
    if not assets:
        return None
    platform_key = _platform_key()
    candidates: list[dict[str, Any]] = []
    generic: list[dict[str, Any]] = []
    for asset in assets:
        name = str(asset.get("name") or "")
        if not name:
            continue
        platforms = _asset_platforms(name)
        if platform_key in platforms:
            candidates.append(asset)
            continue
        if not platforms:
            generic.append(asset)
    if not candidates:
        candidates = generic
    if not candidates:
        return None
    supported = []
    for asset in candidates:
        name = str(asset.get("name") or "")
        if _platform_asset_kind(name):
            supported.append(asset)
    if supported:
        candidates = supported
    if preferred_kind:
        for asset in candidates:
            name = str(asset.get("name") or "")
            if _platform_asset_kind(name) == preferred_kind:
                return asset
    for asset in candidates:
        name = str(asset.get("name") or "")
        if _is_update_archive(name):
            return asset
    for asset in candidates:
        name = str(asset.get("name") or "")
        if _platform_asset_kind(name) == "installer":
            return asset
    return candidates[0]


def check_for_updates() -> dict[str, Any]:
    url = f"{_GITHUB_API_BASE}/repos/{APP_REPO}/releases/latest"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": f"ParaImage/{APP_VERSION}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, urllib.error.URLError) as exc:
        return {"ok": False, "error": str(exc)}

    if not isinstance(payload, dict):
        return {"ok": False, "error": "unexpected response"}

    tag = str(payload.get("tag_name") or "").strip()
    if not tag:
        return {"ok": False, "error": "missing release tag"}

    assets_raw = payload.get("assets")
    assets = assets_raw if isinstance(assets_raw, list) else []
    preferred_kind = None
    install_dir_writable = True
    if sys.platform.startswith("win"):
        preferred_kind = "installer"
        target_dir, _ = _resolve_install_paths()
        install_dir_writable = _can_write_to_dir(target_dir)
    asset = _pick_asset(assets, preferred_kind=preferred_kind)
    download_url = asset.get("browser_download_url") if isinstance(asset, dict) else None
    asset_payload = None
    if isinstance(asset, dict):
        name = str(asset.get("name") or "")
        asset_kind = _platform_asset_kind(name)
        installable = _is_update_archive(name)
        if sys.platform.startswith("win") and asset_kind == "installer":
            installable = True
        if sys.platform.startswith("win") and not install_dir_writable:
            installable = asset_kind == "installer"
        asset_payload = {
            "name": asset.get("name"),
            "size": asset.get("size"),
            "url": download_url,
            "installable": installable,
        }

    latest_version = tag.lstrip("vV")
    current_version = APP_VERSION
    return {
        "ok": True,
        "repoUrl": APP_REPO_URL,
        "currentVersion": current_version,
        "latestVersion": latest_version,
        "updateAvailable": _is_newer(latest_version, current_version),
        "releaseUrl": payload.get("html_url"),
        "publishedAt": payload.get("published_at"),
        "notes": payload.get("body") or "",
        "asset": asset_payload,
    }


def download_update(asset_url: str) -> dict[str, Any]:
    if not asset_url or not isinstance(asset_url, str):
        return {"ok": False, "error": "missing asset url"}
    if not asset_url.startswith("https://"):
        return {"ok": False, "error": "invalid asset url"}
    if f"/{APP_REPO}/releases/download/" not in asset_url:
        return {"ok": False, "error": "asset url not from release"}

    filename = Path(urllib.parse.urlparse(asset_url).path).name
    if not filename:
        return {"ok": False, "error": "invalid asset url"}

    updates_dir = DATA_DIR / "updates"
    updates_dir.mkdir(parents=True, exist_ok=True)
    target_path = updates_dir / filename

    try:
        with _DOWNLOAD_PROGRESS_LOCK:
            _DOWNLOAD_PROGRESS.update(
                {
                    "active": True,
                    "done": False,
                    "downloaded": 0,
                    "total": None,
                    "percent": 0,
                    "error": None,
                }
            )
        with urllib.request.urlopen(asset_url, timeout=30) as response:
            total_header = (response.headers.get("Content-Length") or "").strip()
            total_size = int(total_header) if total_header.isdigit() else None
            if total_size:
                with _DOWNLOAD_PROGRESS_LOCK:
                    _DOWNLOAD_PROGRESS.update({"total": total_size})
            with open(target_path, "wb") as handle:
                downloaded = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
                    downloaded += len(chunk)
                    percent = (
                        min(100, int(downloaded * 100 / total_size))
                        if total_size
                        else None
                    )
                    with _DOWNLOAD_PROGRESS_LOCK:
                        _DOWNLOAD_PROGRESS.update(
                            {
                                "downloaded": downloaded,
                                "percent": percent,
                            }
                        )
    except (OSError, urllib.error.URLError) as exc:
        with _DOWNLOAD_PROGRESS_LOCK:
            _DOWNLOAD_PROGRESS.update(
                {
                    "active": False,
                    "done": True,
                    "error": str(exc),
                }
            )
        return {"ok": False, "error": str(exc)}

    with _DOWNLOAD_PROGRESS_LOCK:
        _DOWNLOAD_PROGRESS.update(
            {
                "active": False,
                "done": True,
                "percent": 100 if _DOWNLOAD_PROGRESS.get("total") else _DOWNLOAD_PROGRESS.get("percent"),
                "error": None,
            }
        )
    return {"ok": True, "path": str(target_path)}


def get_download_progress() -> dict[str, Any]:
    with _DOWNLOAD_PROGRESS_LOCK:
        return {"ok": True, **_DOWNLOAD_PROGRESS}


def open_updates_directory() -> dict[str, Any]:
    updates_dir = _updates_dir()
    try:
        if sys.platform.startswith("win"):
            os.startfile(str(updates_dir))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(updates_dir)])
        else:
            subprocess.Popen(["xdg-open", str(updates_dir)])
    except (OSError, ValueError) as exc:
        return {"ok": False, "error": str(exc), "path": str(updates_dir)}
    return {"ok": True, "path": str(updates_dir)}


def _resolve_app_bundle(executable: Path) -> Path | None:
    for parent in executable.parents:
        if parent.suffix.lower() == ".app":
            return parent
    return None


def _resolve_install_paths() -> tuple[Path, Path]:
    executable = Path(sys.executable).resolve()
    if sys.platform == "darwin":
        app_bundle = _resolve_app_bundle(executable)
        if app_bundle:
            return app_bundle, app_bundle
        return executable.parent, executable
    target_dir = executable.parent
    return target_dir, target_dir / executable.name


def _can_write_to_dir(path: Path) -> bool:
    if not path.exists():
        return False
    marker = path / f".update-write-{os.getpid()}"
    try:
        with open(marker, "w", encoding="utf-8") as handle:
            handle.write("ok")
        marker.unlink(missing_ok=True)
        return True
    except OSError:
        try:
            marker.unlink(missing_ok=True)
        except OSError:
            pass
        return False


def _updates_dir() -> Path:
    updates_dir = DATA_DIR / "updates"
    updates_dir.mkdir(parents=True, exist_ok=True)
    return updates_dir


def _normalize_update_path(asset_path: str) -> Path | None:
    if not asset_path or not isinstance(asset_path, str):
        return None
    path = Path(asset_path).expanduser()
    try:
        resolved = path.resolve()
    except OSError:
        return None
    updates_dir = _updates_dir().resolve()
    try:
        resolved.relative_to(updates_dir)
    except ValueError:
        return None
    return resolved


def _validate_archive(path: Path) -> str | None:
    name = path.name.lower()
    if sys.platform.startswith("win"):
        return "zip" if name.endswith(".zip") else None
    if sys.platform == "darwin":
        return "zip" if name.endswith(".zip") else None
    if name.endswith(".tar.gz") or name.endswith(".tgz"):
        return "tar.gz"
    if name.endswith(".tar"):
        return "tar"
    return None


def _is_windows_installer(path: Path) -> bool:
    if not sys.platform.startswith("win"):
        return False
    name = path.name.lower()
    return name.endswith(".exe") or name.endswith(".msi")


def _write_script(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    if not sys.platform.startswith("win"):
        try:
            path.chmod(path.stat().st_mode | 0o111)
        except OSError:
            pass


def _windows_update_script() -> str:
    return textwrap.dedent(
        """
        param(
          [int]$ProcessId,
          [string]$ArchivePath,
          [string]$TargetDir,
          [string]$LaunchPath,
          [string]$StagingDir
        )
        $ErrorActionPreference = "Stop"
        $deadline = (Get-Date).AddSeconds(20)
        while (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
          if ((Get-Date) -ge $deadline) {
            Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
            break
          }
          Start-Sleep -Milliseconds 400
        }
        if (Test-Path $StagingDir) { Remove-Item -Recurse -Force $StagingDir }
        New-Item -ItemType Directory -Path $StagingDir | Out-Null
        Expand-Archive -Path $ArchivePath -DestinationPath $StagingDir -Force
        $items = Get-ChildItem -Path $StagingDir
        if ($items.Count -eq 1 -and $items[0].PSIsContainer) {
          $source = $items[0].FullName
        } else {
          $source = $StagingDir
        }
        if (Test-Path $TargetDir) { Remove-Item -Recurse -Force $TargetDir }
        Move-Item -Path $source -Destination $TargetDir
        Start-Process -FilePath $LaunchPath
        """
    ).strip()


def _windows_installer_script() -> str:
    return textwrap.dedent(
        """
        param(
          [int]$ProcessId,
          [string]$InstallerPath,
          [string]$LaunchPath
        )
        $ErrorActionPreference = "Stop"
        $deadline = (Get-Date).AddSeconds(20)
        while (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
          if ((Get-Date) -ge $deadline) {
            Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
            break
          }
          Start-Sleep -Milliseconds 400
        }
        if ($InstallerPath.ToLower().EndsWith(".msi")) {
          Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", "`"$InstallerPath`"" -Wait
        } else {
          Start-Process -FilePath $InstallerPath -Wait
        }
        if (Test-Path $LaunchPath) {
          Start-Process -FilePath $LaunchPath
        }
        """
    ).strip()


def _unix_update_script() -> str:
    return textwrap.dedent(
        """
        #!/bin/sh
        set -eu
        pid="$1"
        archive="$2"
        target="$3"
        launch="$4"
        staging="$5"

        timeout=70
        while kill -0 "$pid" 2>/dev/null; do
          if [ "$timeout" -le 0 ]; then
            kill -9 "$pid" 2>/dev/null || true
            break
          fi
          timeout=$((timeout - 1))
          sleep 0.3
        done

        rm -rf "$staging"
        mkdir -p "$staging"

        case "$archive" in
          *.tar.gz|*.tgz) tar -xzf "$archive" -C "$staging" ;;
          *.tar) tar -xf "$archive" -C "$staging" ;;
          *.zip)
            if command -v ditto >/dev/null 2>&1; then
              ditto -x -k "$archive" "$staging"
            else
              unzip -q "$archive" -d "$staging"
            fi
            ;;
          *) echo "Unsupported archive" >&2; exit 1 ;;
        esac

        source="$staging"
        if [ "$(ls -1 "$staging" | wc -l | tr -d ' ')" -eq 1 ]; then
          first="$(ls -1 "$staging" | head -n 1)"
          if [ -d "$staging/$first" ]; then
            source="$staging/$first"
          fi
        fi

        rm -rf "$target"
        mv "$source" "$target"

        case "$launch" in
          *.app) open "$launch" ;;
          *) "$launch" >/dev/null 2>&1 & ;;
        esac
        """
    ).strip()


def install_update(asset_path: str) -> dict[str, Any]:
    if not getattr(sys, "frozen", False):
        return {"ok": False, "error": "update install only supported in packaged app"}

    resolved_path = _normalize_update_path(asset_path)
    if not resolved_path or not resolved_path.exists():
        return {"ok": False, "error": "update asset not found"}

    target_dir, launch_path = _resolve_install_paths()
    if not target_dir:
        return {"ok": False, "error": "unable to resolve install path"}

    updates_dir = _updates_dir()
    staging_dir = updates_dir / f"staging-{os.getpid()}"

    if sys.platform.startswith("win") and _is_windows_installer(resolved_path):
        script_path = updates_dir / f"run-installer-{os.getpid()}.ps1"
        _write_script(script_path, _windows_installer_script())
        cmd = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
            str(os.getpid()),
            str(resolved_path),
            str(launch_path),
        ]
    else:
        archive_kind = _validate_archive(resolved_path)
        if not archive_kind:
            return {"ok": False, "error": "unsupported update asset"}
        if sys.platform.startswith("win") and not _can_write_to_dir(target_dir):
            return {
                "ok": False,
                "error": "install path not writable; use installer instead",
            }
        if sys.platform.startswith("win"):
            script_path = updates_dir / f"apply-update-{os.getpid()}.ps1"
            _write_script(script_path, _windows_update_script())
            cmd = [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script_path),
                str(os.getpid()),
                str(resolved_path),
                str(target_dir),
                str(launch_path),
                str(staging_dir),
            ]
        else:
            script_path = updates_dir / f"apply-update-{os.getpid()}.sh"
            _write_script(script_path, _unix_update_script())
            cmd = [
                "/bin/sh",
                str(script_path),
                str(os.getpid()),
                str(resolved_path),
                str(target_dir),
                str(launch_path),
                str(staging_dir),
            ]

    try:
        creationflags = 0
        if sys.platform.startswith("win"):
            creationflags = (
                subprocess.CREATE_NEW_PROCESS_GROUP
                | subprocess.DETACHED_PROCESS
                | subprocess.CREATE_NO_WINDOW
            )
        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

    return {"ok": True}
