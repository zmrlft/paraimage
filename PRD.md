这份技术文档旨在为开发基于 **PyWebView + React** 的多模型 AI 绘画代理软件（暂定名：**OmniImage Studio**）提供清晰的架构设计和实现路径。

---

# OmniImage Studio 技术落地文档

## 1. 项目概述
本软件是一款基于“自带 Key (BYOK)”模式的桌面代理工具。用户通过配置自己的 API Key，实现多模型同步生图、横向对比、图像分割、智能抠图及批量管理功能。

## 2. 技术栈架构
*   **外观/壳子**：PyWebView（将 Python 后端与 React 前端无缝集成）。
*   **前端**：React 18 + Vite + Tailwind CSS + Lucide Icons（用于构建精致的响应式分屏 UI）。
*   **后端**：Python 3.10+。
    *   **API 聚合**：`LiteLLM` (支持 OpenAI, Stability, Flux, Replicate 等 100+ 模型)。
    *   **图像处理**：`Pillow` (分割) + `Rembg` (离线抠图)。
    *   **数据库**：`SQLite` + `Peewee ORM` (本地存储配置与历史)。
    *   **异步任务**：`Asyncio` (确保多模型请求不卡顿 UI)。

---

## 3. 核心功能模块设计

### 3.1 聚合代理模块 (LiteLLM Adapter)
*   **功能**：统一各家生图 API 的入参和出参。
*   **核心逻辑**：
    *   封装一个 `GenerationManager` 类，利用 `asyncio.gather` 实现并发请求。
    *   自动处理模型特定的参数映射（如 DALL-E 3 的 `quality` 与 SD 的 `steps`）。

### 3.2 图像处理引擎 (Image Engine)
*   **分割器 (Splitter)**：
    *   输入：一张 2x2 的网格图。
    *   输出：4 张裁剪后的 PIL 对象。
*   **抠图器 (Matting)**：
    *   集成 `rembg`。首次运行自动下载 `u2net` 模型（约 170MB），后续全离线推理。
*   **下载器 (Downloader)**：
    *   功能：支持将生成图、分割图、抠图一键打包为 `.zip`。

### 3.3 数据持久化 (Local DB)
*   **配置表 (Settings)**：加密存储 `provider_name`, `api_key`, `base_url`。
*   **历史记录表 (History)**：存储 `prompt`, `local_path`, `model_name`, `timestamp`。

---

## 4. 前后端通信设计 (Bridge)
PyWebView 通过 `window.pywebview.api` 暴露 Python 方法给 React。

| 接口名称 | 参数 | 说明 |
| :--- | :--- | :--- |
| `save_config` | `provider, key, url` | 保存/更新模型配置 |
| `generate_all` | `prompt, selected_models, params` | 触发多并发生图（返回任务 ID 或实时流） |
| `process_image` | `action (split/bg_remove), img_id` | 图像后期处理 |
| `batch_download`| `img_ids[]` | 返回打包好的文件路径 |

---

## 5. UI/UX 布局规划
*   **左侧侧边栏**：
    *   **模型开关**：List 展示已配置的模型，Checkbox 勾选参与生图。
    *   **参数面板**：全局设置尺寸（1:1, 16:9）、步数、种子值。
*   **主视口 (Grid Canvas)**：
    *   **动态分屏**：根据勾选数量，自动在 `grid-cols-1` 到 `grid-cols-3` 间切换。
    *   **卡片操作**：每张图片悬浮显示：分割、抠图、全屏、保存。
*   **底部输入区**：
    *   **Prompt 框**：支持多行输入。
    *   **快捷工具**：提示词增强（优化 Prompt）、翻译（中转英）。

---

## 6. 关键代码实现思路

### Python: 异步生图示例
```python
import litellm
import asyncio

class ProApi:
    async def generate_all(self, prompt, models, api_configs):
        tasks = []
        for model in models:
            # api_configs 从 SQLite 读取
            tasks.append(self.single_gen(prompt, model, api_configs[model]))
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return results

    async def single_gen(self, prompt, model, config):
        response = await litellm.aimage_generation( # 异步调用
            model=model, 
            prompt=prompt, 
            api_key=config['key'],
            base_url=config['url']
        )
        return response.data[0].url
```

### Python: 离线抠图示例
```python
from rembg import remove
import io

def process_matting(image_bytes):
    # rembg 会在本地运行模型
    result = remove(image_bytes)
    return result # 返回带 Alpha 通道的字节流
```

---

## 7. 落地开发步骤 (Roadmap)

### 第一阶段：基础设施 (Week 1)
1.  搭建 **PyWebView + Vite + React** 项目模板。
2.  实现 **SQLite** 配置存储逻辑，编写 API Key 管理页面。
3.  前端实现基础的 **Grid 布局** 适配。

### 第二阶段：核心生图 (Week 2)
1.  集成 `LiteLLM`，实现第一个模型（如 DALL-E 3）的连通。
2.  实现 **异步并发请求逻辑**，前端展示 Loading 占位图。
3.  对接图片本地缓存机制（将 API 返回的 URL 下载到本地临时文件夹）。

### 第三阶段：图像工具链 (Week 3)
1.  开发 `Pillow` 裁剪函数，支持 MJ 风格图片四分割。
2.  集成 `rembg` 库，实现右键“一键抠图”。
3.  开发 **批量选择与 ZIP 打包** 下载功能。

### 第四阶段：优化与打包 (Week 4)
1.  **UI 精修**：加入动画效果（Framer Motion），优化暗黑模式。
2.  **打包**：使用 `PyInstaller` 将 Python 和前端资源打包为单个 `.exe` / `.app`。
3.  **安全性**：实现简单的本地 Key 加密（如 Fernet 加密）。

---

## 8. 技术难点预警
1.  **Rembg 模型下载**：国内网络环境下首次运行下载模型可能失败，需考虑内置模型或提供国内镜像下载说明。
2.  **跨域与并发**：确保异步任务不阻塞 PyWebView 的主事件循环。
3.  **内存管理**：多模型生图产生的大量高清图会占用内存，需及时清理缓存或使用缩略图显示。