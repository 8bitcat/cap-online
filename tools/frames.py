"""Kontaktkarta med en bildruta per sekund och inbränd tidskod, för att
tidsstämpla momenten i varje film (data/content.json → steps[].clip).

    python tools/frames.py              # alla filmer i media/raw/
    python tools/frames.py forsta-touch # en film

Skriver media/frames/<slug>-1fps.jpg.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "media" / "raw"
SLUGS = {
    "Uppvärmning + bollkontroll": "uppvarmning-bollkontroll",
    "Första touch": "forsta-touch",
    "Passningar": "passningar",
    "Dribblingar": "dribblingar",
    "Koordination": "koordination",
}
COLS, W = 6, 200


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    only = sys.argv[1] if len(sys.argv) > 1 else None
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 22)
    for title, slug in SLUGS.items():
        if only and slug != only:
            continue
        src = next(iter(RAW.glob(title + ".*")), None)
        if not src:
            print("saknas:", title)
            continue
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vf", f"fps=1,scale={W}:-2",
                            "-q:v", "4", f"{tmp}/f-%03d.jpg"], check=True)
            frames = sorted(Path(tmp).glob("f-*.jpg"))
            if not frames:
                continue
            fw, fh = Image.open(frames[0]).size
            rows = (len(frames) + COLS - 1) // COLS
            sheet = Image.new("RGB", (COLS * (fw + 4) + 4, rows * (fh + 4) + 4), (12, 12, 12))
            d = ImageDraw.Draw(sheet)
            for i, f in enumerate(frames):
                x, y = 4 + (i % COLS) * (fw + 4), 4 + (i // COLS) * (fh + 4)
                sheet.paste(Image.open(f), (x, y))
                t = f"{i // 60}:{i % 60:02d}"
                d.rectangle([x, y, x + 64, y + 30], fill=(0, 0, 0))
                d.text((x + 6, y + 3), t, font=font, fill=(0, 230, 220))
            out = ROOT / "media" / "frames" / f"{slug}-1fps.jpg"
            sheet.save(out, quality=82)
            print(f"{slug}: {len(frames)} rutor -> {out}")


if __name__ == "__main__":
    main()
