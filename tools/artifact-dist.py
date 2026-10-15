"""Samlar filerna som publiceras som claude.ai-artefakt i en utmapp.

    python tools/artifact-dist.py <utmapp>

Utmappen får: index.html (= artifact.html), css/, js/, data/, assets/ (logga,
ikon, omslag) och media/<slug>.mp4 från media/small/ (under 15 MB styck).
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    if len(sys.argv) < 2:
        sys.exit("ange utmapp")
    out = Path(sys.argv[1])
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

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


if __name__ == "__main__":
    main()
