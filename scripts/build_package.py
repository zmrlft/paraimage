from __future__ import annotations

import argparse
import os
from pathlib import Path

import PyInstaller.__main__


def build(onefile: bool) -> None:
    root_dir = Path(__file__).resolve().parent.parent
    frontend_dist = root_dir / "frontend" / "dist"
    if not frontend_dist.exists():
        raise SystemExit("frontend/dist not found. Run npm run build first.")

    data_sep = ";" if os.name == "nt" else ":"

    def add_data(src: Path, dest: str) -> str:
        return f"{src}{data_sep}{dest}"

    args = [
        "--noconfirm",
        "--clean",
        "--windowed",
        "--name",
        "ParaImage",
        "--distpath",
        str(root_dir / "dist"),
        "--workpath",
        str(root_dir / "build"),
        "--paths",
        str(root_dir / "backend" / "src"),
        "--add-data",
        add_data(frontend_dist, "frontend/dist"),
        "--add-data",
        add_data(
            root_dir / "frontend" / "public" / "app.png",
            "frontend/public/app.png",
        ),
        "--collect-all",
        "webview",
        "--collect-submodules",
        "webview",
    ]

    prompt_library = root_dir / "prompt-library.json"
    if prompt_library.exists():
        args.extend(
            [
                "--add-data",
                add_data(prompt_library, "prompt-library.json"),
            ]
        )

    if onefile:
        args.append("--onefile")

    args.append(str(root_dir / "backend" / "src" / "main.py"))
    PyInstaller.__main__.run(args)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onefile", action="store_true", help="Build onefile")
    options = parser.parse_args()
    build(options.onefile)


if __name__ == "__main__":
    main()
