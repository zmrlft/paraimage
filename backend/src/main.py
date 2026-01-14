# src/main.py
import os
import inspect
import sys
from pathlib import Path
import webview
from api import ProApi
from startup_log import log_startup, launch_startup_terminal


def get_resource_path(*parts: str) -> Path:
    if getattr(sys, "_MEIPASS", None):
        return Path(sys._MEIPASS).joinpath(*parts)
    return Path(__file__).resolve().parent.parent.parent.joinpath(*parts)


def main():
    launch_startup_terminal()
    log_startup("main_enter")
    api = ProApi()
    log_startup("api_ready")
    
    # 根据环境变量判断加载哪个地址
    # 开发环境加载 Vite 端口，生产环境加载打包后的 HTML
    debug = os.getenv("DEBUG") == "true"
    entry = (
        "http://localhost:5173"
        if debug
        else str(get_resource_path("frontend", "dist", "index.html"))
    )

    icon_path = get_resource_path("frontend", "public", "app.png")
    window_kwargs = {
        "title": "多模生图 - ParaImage",
        "url": entry,
        "js_api": api,
        "width": 1000,
        "height": 700,
        "min_size": (1420, 890),
        "background_color": "#ffffff",
    }
    if icon_path.exists():
        try:
            if "icon" in inspect.signature(webview.create_window).parameters:
                window_kwargs["icon"] = str(icon_path)
        except (TypeError, ValueError):
            pass
    window = webview.create_window(**window_kwargs)
    log_startup("window_created")
    
    api.set_window(window)
    webview.start(func=lambda: log_startup("webview_ready"), debug=debug)

if __name__ == '__main__':
    main()
