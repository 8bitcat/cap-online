"""Samlar filerna som publiceras i en utmapp.

    python tools/artifact-dist.py <utmapp>           # claude.ai-artefakt (index.html = artifact.html)
    python tools/artifact-dist.py <utmapp> --pages   # vanlig webbplats (index.html, manifest, sw)

Utmappen får: index.html, css/, js/, data/, assets/ (logga, ikon, omslag) och
media/<slug>.mp4 från media/small/ (under 15 MB styck).
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build(out, pages=False):
    out = Path(out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    if pages:
        for name in ("index.html", "manifest.json", "sw.js"):
            shutil.copy(ROOT / name, out / name)
        (out / ".nojekyll").write_text("")
    else:
        shutil.copy(ROOT / "artifact.html", out / "index.html")
    for d in ("css", "js", "data"):
        shutil.copytree(ROOT / d, out / d)
    (out / "assets" / "posters").mkdir(parents=True)
    for name in ("cap-logo.png", "cap-ball-270.png", "hero-gym.jpg"):
        shutil.copy(ROOT / "assets" / name, out / "assets" / name)
    for p in (ROOT / "assets" / "posters").glob("*.jpg"):
        shutil.copy(p, out / "assets" / "posters" / p.name)
    (out / "media").mkdir()
    for p in (ROOT / "media" / "small").glob("*.mp4"):
        shutil.copy(p, out / "media" / p.name)

    files = sorted(x for x in out.rglob("*") if x.is_file())
    total = sum(x.stat().st_size for x in files)
    for x in files:
        print(f"{x.stat().st_size / 1_000_000:6.1f} MB  {x.relative_to(out).as_posix()}")
    print(f"{total / 1_000_000:.1f} MB totalt, {len(files)} filer")
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit("ange utmapp")
    build(args[0], pages="--pages" in sys.argv)


if __name__ == "__main__":
    main()
