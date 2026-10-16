"""Publicerar prototypen på GitHub Pages (branchen gh-pages i origin).

    python tools/deploy-pages.py

Bygger utmappen med artifact-dist.py --pages (index.html, manifest, sw, små
filmer), gör den till en egen git-historia med ett enda commit och
force-pushar till gh-pages. Sidan: https://8bitcat.github.io/cap-online/
"""
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("artifact_dist", Path(__file__).resolve().parent / "artifact-dist.py")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
build = _mod.build


def sh(*cmd, cwd=None):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit(f"fel: {' '.join(cmd)}\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    origin = sh("git", "remote", "get-url", "origin", cwd=ROOT)
    version = re.search(r"'([\d.]+)'", (ROOT / "js" / "version.js").read_text(encoding="utf-8")).group(1)
    commit = sh("git", "rev-parse", "--short", "HEAD", cwd=ROOT)
    with tempfile.TemporaryDirectory() as tmp:
        out = build(Path(tmp) / "site", pages=True)
        (out / "version.json").write_text(json.dumps({"version": version, "commit": commit}), encoding="utf-8")
        sh("git", "init", "-q", "-b", "gh-pages", cwd=out)
        sh("git", "-c", "user.name=Carl Palsson", "-c", "user.email=palsson.carl@gmail.com", "add", "-A", cwd=out)
        sh("git", "-c", "user.name=Carl Palsson", "-c", "user.email=palsson.carl@gmail.com",
           "commit", "-q", "-m", f"pages: v{version} ({commit})", cwd=out)
        sh("git", "push", "-f", origin, "gh-pages:gh-pages", cwd=out)
    print(f"pushat gh-pages: v{version} ({commit}) -> {origin}")


if __name__ == "__main__":
    main()
