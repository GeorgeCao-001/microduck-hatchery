"""Rebuild the two portable prototype HTML files from the split source."""

import base64
import json
from pathlib import Path
import re


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROTOTYPE = PROJECT_ROOT / "web" / "prototype"


def data_url(path):
    mime = {".jpg": "image/jpeg", ".woff": "font/woff"}[path.suffix]
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def inline_css(match):
    source = (PROTOTYPE / match.group(1)).read_text(encoding="utf-8-sig")

    def inline_asset(asset):
        path = (PROTOTYPE / asset.group(1)).resolve()
        if not path.is_relative_to(PROTOTYPE.resolve()):
            raise ValueError("CSS asset must stay inside the prototype")
        return f"url('{data_url(path)}')"

    source = re.sub(r"url\(['\"]?(assets/[^)'\"]+)['\"]?\)", inline_asset, source)
    return f"<style>\n{source}\n</style>"


def inline_script(match):
    source = (PROTOTYPE / match.group(1)).read_text(encoding="utf-8-sig")
    if match.group(1) == "joint-viewer.js":
        model_dir = PROTOTYPE / "assets" / "microduck-reference"
        engine = PROTOTYPE / "vendor" / "three-0.160.0.min.js"
        viewer = {
            "model": json.loads((model_dir / "model.json").read_text(encoding="utf-8")),
            "meshesBase64": base64.b64encode((model_dir / "meshes.bin").read_bytes()).decode("ascii"),
            "engineURL": "data:text/javascript;base64," + base64.b64encode(engine.read_bytes()).decode("ascii"),
        }
        source = "window.HatcheryStandaloneViewer=" + json.dumps(viewer, ensure_ascii=True) + ";\n" + source
    if match.group(1) == "app.js":
        photos = {name: data_url(PROTOTYPE / "assets" / f"{name}.jpg") for name in ("product", "assembly")}
        source = source.replace("'use strict';", "'use strict';\nconst standalonePhotos=" + json.dumps(photos) + ";", 1)
        marker = 'src="assets/${name}.jpg"'
        if source.count(marker) != 1:
            raise ValueError("Expected the prototype photo helper")
        source = source.replace(marker, 'src="${standalonePhotos[name]}"')
    source = source.replace("</script", "<\\/script")
    return f"<script>\n{source}\n</script>"


def main():
    html = (PROTOTYPE / "index.html").read_text(encoding="utf-8-sig")
    html = re.sub(r'<link rel="stylesheet" href="([^\"]+)">', inline_css, html)
    html = re.sub(r'<script src="([^\"]+)"></script>', inline_script, html)
    for path in (PROJECT_ROOT / "Microduck-Hatchery-Visual-Prototype.html", PROJECT_ROOT / "web" / "Microduck-Hatchery-Visual-Prototype.html"):
        path.write_text(html, encoding="utf-8", newline="\n")
        print(f"Updated {path.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
