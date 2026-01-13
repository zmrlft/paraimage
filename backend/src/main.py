# src/main.py
import os
import inspect
from pathlib import Path
import webview
from api import ProApi

def main():
    api = ProApi()
    
    # 根据环境变量判断加载哪个地址
    # 开发环境加载 Vite 端口，生产环境加载打包后的 HTML
    entry = 'http://localhost:5173' if os.getenv('DEBUG') == 'true' else '../frontend/dist/index.html'

    icon_path = (
        Path(__file__).resolve().parent.parent / "frontend" / "public" / "app.png"
    )
    window_kwargs = {
        "title": "多模生图 - ParaImage",
        "url": entry,
        "js_api": api,
        "width": 1000,
        "height": 700,
        "background_color": "#ffffff",
    }
    if icon_path.exists():
        try:
            if "icon" in inspect.signature(webview.create_window).parameters:
                window_kwargs["icon"] = str(icon_path)
        except (TypeError, ValueError):
            pass
    window = webview.create_window(**window_kwargs)
    
    api.set_window(window)
    webview.start(debug=True) # debug=True 可以在窗口点右键开启审查元素

if __name__ == '__main__':
    main()
