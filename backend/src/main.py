# src/main.py
import webview
import os
from api import ProApi

def main():
    api = ProApi()
    
    # 根据环境变量判断加载哪个地址
    # 开发环境加载 Vite 端口，生产环境加载打包后的 HTML
    entry = 'http://localhost:5173' if os.getenv('DEBUG') == 'true' else '../frontend/dist/index.html'

    window = webview.create_window(
        '灵镜 - PrismCanvas',
        entry,
        js_api=api,
        width=1000,
        height=700,
        background_color='#ffffff'
    )
    
    api.set_window(window)
    webview.start(debug=True) # debug=True 可以在窗口点右键开启审查元素

if __name__ == '__main__':
    main()