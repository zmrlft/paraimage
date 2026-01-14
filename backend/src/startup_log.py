from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from app_info import APP_NAME

DATA_DIR_ENV = "PARAIMAGE_DATA_DIR"
STARTUP_TERMINAL_ENV = "PARAIMAGE_STARTUP_TERMINAL"
LOG_FILENAME = "startup.log"

_START_TIME = time.perf_counter()
_TERMINAL_OPENED = False


def _default_user_data_dir() -> Path:
    if sys.platform.startswith("win"):
        base = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA")
        if base:
            return Path(base) / APP_NAME
        return Path.home() / "AppData" / "Roaming" / APP_NAME
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    base = os.environ.get("XDG_DATA_HOME")
    if base:
        return Path(base) / APP_NAME
    return Path.home() / ".local" / "share" / APP_NAME


def _resolve_data_dir() -> Path:
    override = os.environ.get(DATA_DIR_ENV)
    if override:
        return Path(override)
    return _default_user_data_dir()


def _log_path() -> Path:
    return _resolve_data_dir() / LOG_FILENAME


def _startup_terminal_enabled() -> bool:
    value = os.environ.get(STARTUP_TERMINAL_ENV)
    if value is None:
        return True
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _open_terminal_tail(path: Path) -> None:
    if sys.platform.startswith("win"):
        ps_path = str(path).replace("'", "''")
        command = f"Get-Content -Path '{ps_path}' -Wait"
        subprocess.Popen(
            ["powershell", "-NoLogo", "-NoExit", "-Command", command],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        return
    if sys.platform == "darwin":
        quoted = shlex.quote(str(path))
        script = f'tell application "Terminal" to do script "tail -f {quoted}"'
        subprocess.Popen(["osascript", "-e", script])
        return
    quoted = shlex.quote(str(path))
    tail_command = f"tail -f {quoted}"
    candidates = [
        ("x-terminal-emulator", ["-e", "sh", "-c", tail_command]),
        ("gnome-terminal", ["--", "sh", "-c", tail_command]),
        ("konsole", ["-e", "sh", "-c", tail_command]),
        ("xfce4-terminal", ["--command", f"sh -c {tail_command}"]),
        ("xterm", ["-e", "sh", "-c", tail_command]),
    ]
    for executable, args in candidates:
        if shutil.which(executable):
            subprocess.Popen([executable, *args])
            return


def launch_startup_terminal() -> None:
    global _TERMINAL_OPENED
    if _TERMINAL_OPENED or not _startup_terminal_enabled():
        return
    _TERMINAL_OPENED = True
    try:
        path = _log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch(exist_ok=True)
        _open_terminal_tail(path)
    except Exception:
        pass


def log_startup(label: str) -> None:
    elapsed_ms = (time.perf_counter() - _START_TIME) * 1000
    timestamp = datetime.now(timezone.utc).isoformat()
    line = f"{timestamp} {elapsed_ms:.1f}ms {label}\n"
    try:
        path = _log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line)
    except Exception:
        pass
