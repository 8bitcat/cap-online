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


def stampla(out, stamp):
    """Versionsstämplar js/css-referenser (index.html och alla import-satser) så att en ny version
    aldrig blandas med cachade filer från förra släppet. GitHub Pages cachar 10 minuter."""
    import re
    idx = out / "index.html"
    t = idx.read_text(encoding="utf-8")
    t = re.sub(r'(href|src)="(css/app\.css|js/app\.js)"', rf'\1="\2?v={stamp}"', t)
    idx.write_text(t, encoding="utf-8", newline="\n")
    for js in (out / "js").glob("*.js"):
        s = js.read_text(encoding="utf-8")
        s = re.sub(r"(from\s+['\"])(\./[\w-]+\.js)(['\"])", rf"\1\2?v={stamp}\3", s)
        s = re.sub(r"(import\(\s*['\"])(\./[\w-]+\.js)(['\"])", rf"\1\2?v={stamp}\3", s)
        js.write_text(s, encoding="utf-8", newline="\n")
    data = out / "js" / "app.js"
    s = data.read_text(encoding="utf-8")
    s = s.replace("fetch('data/content.json', { cache: 'no-cache' })", f"fetch('data/content.json?v={stamp}', {{ cache: 'no-cache' }})")
    s = s.replace("fetch('data/taggar.json', { cache: 'no-cache' })", f"fetch('data/taggar.json?v={stamp}', {{ cache: 'no-cache' }})")
    data.write_text(s, encoding="utf-8", newline="\n")
    adm = out / "js" / "admin.js"
    s = adm.read_text(encoding="utf-8").replace("fetch('data/taggar.json', { cache: 'no-cache' })", f"fetch('data/taggar.json?v={stamp}', {{ cache: 'no-cache' }})")
    adm.write_text(s, encoding="utf-8", newline="\n")


def build(out, pages=False, stamp=None):
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

    if stamp:
        stampla(out, stamp)
    files = sorted(x for x in out.rglob("*") if x.is_file())
    total = sum(x.stat().st_size for x in files)
    for x in files:
        print(f"{x.stat().st_size / 1_000_000:6.1f} MB  {x.relative_to(out).as_posix()}")
    print(f"{total / 1_000_000:.1f} MB totalt, {len(files)} filer" + (f", stämpel {stamp}" if stamp else ""))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit("ange utmapp")
    build(args[0], pages="--pages" in sys.argv)


if __name__ == "__main__":
    main()
