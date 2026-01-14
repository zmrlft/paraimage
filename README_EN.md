# ParaImage - Multi-Model Image Generation (AI Gacha Machine)

<div align="center">

<img width="256" src="docs\logo.png">

*ParaImage：1 Prompt，4 Models，4 Luckies！*

**[中文](README.md) | English**


<b>An AI image generation application that combines Banana Pro🍌 and numerous excellent Chinese image generation models (Qwen, Doubao). Generated images have no AI watermarks and support background removal, suitable for generating 2D assets.<br></b>
<b>Supports up to four models working simultaneously</b>

<b>🎯 Break free from the "luck-based" limitations of single-model image generation — 1 prompt = 4 top-tier AI models working in parallel, generating 4 stylistically diverse high-quality images at once. Like a gacha machine combining "certainty and efficiency" with "randomness and surprise": no need to repeatedly tweak prompts through trial and error. Pick the best results from multiple models or discover unexpected "hidden" versions that perfectly match your needs. Transform AI creation from "single-point gambling" to "batch mode cheating".</b>

<br>

*If this project is helpful to you, please give it a star🌟 & fork🍴*

<br>

</div>

## Screenshot

![Screenshot](docs/1.png)

## Key Features
- Parallel multi-model image generation with unified configuration
- Prompt library (built-in default templates, supports import/export)
- Reference image support: drag & drop / paste / upload images
- Image post-processing: background removal, grid slicing
- History and image management
- Update checking and automatic installation (GitHub Release)

## Supported Models & Providers
- [Volcengine Ark](https://www.volcengine.com/activity/ark)
- OpenAI
- Google Gemini
- [Alibaba DashScope](https://bailian.console.aliyun.com/cn-beijing/?spm=5176.29597918.J_SEsSjsNv72yRuRFS2VknO.2.55ba7b08ULdjxL&tab=home#/home)
- [AIHubMix](https://aihubmix.com/)

New users on Volcengine and Alibaba Cloud get free credits!

## Tech Stack
- Frontend: React + Vite + Tailwind CSS + Ant Design + Lucide
- Backend: Python + PyWebView + Peewee + SQLite + Pillow + rembg + Pydantic

## Local Development

### Requirements
- Node.js 20+
- Python 3.12+
- uv (Python package manager)

### Start Frontend
```bash
cd frontend
npm ci
npm run dev
```

### Start Desktop App (Development Mode)
```bash
cd backend
uv venv .venv
uv sync --frozen
DEBUG=true uv run python src/main.py
```

## Build & Release
```bash
cd frontend
npm ci
npm run build

cd ..
uv run --project backend python scripts/build_package.py
```

Build artifacts are output to `dist/` by default.

## Project Structure
- `frontend/` - Frontend code
- `backend/` - Backend code
- `scripts/` - Build scripts
- `prompt-library.json` - Default prompt library

## License

MIT © [zmrlft](https://github.com/zmrlft)
