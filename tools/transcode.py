"""Gör webbklara filmer av Haris original i media/raw/.

Originalen är stående 4K HEVC 60 fps från telefon (2160×3840), 30–70 s styck.

För varje film:
  media/<slug>.mp4           720 px bred (720×1280) H.264 30 fps + AAC, spelas i appen
  assets/posters/<slug>.jpg  stillbild som omslag (checkas in)
  media/frames/<slug>.jpg    kontaktkarta med en ruta var 5:e sekund, för att beskriva passet
  media/info.json            längd i sekunder per slug (förs in i data/content.json)

    python tools/transcode.py            # allt som saknas
    python tools/transcode.py --force    # gör om allt
    python tools/transcode.py --small    # bara media/small/<slug>.mp4, 480 px bred, för artefakten
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "media" / "raw"
SLUGS = {
    "Uppvärmning + bollkontroll": "uppvarmning-bollkontroll",
    "Första touch": "forsta-touch",
    "Passningar": "passningar",
    "Dribblingar": "dribblingar",
    "Koordination": "koordination",
}


def run(*cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit(f"fel ({r.returncode}): {' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r.stdout


def duration(src):
    out = run("ffprobe", "-v", "error", "-show_entries", "format=duration",
              "-of", "default=noprint_wrappers=1:nokey=1", str(src))
    return float(out.strip())


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser()
    p.add_argument("--force", action="store_true")
    p.add_argument("--small", action="store_true", help="bara små filmer till media/small/ (under 15 MB styck)")
    args = p.parse_args()

    info = {}
    for title, slug in SLUGS.items():
        src = next(iter(RAW.glob(title + ".*")), None)
        if not src:
            print(f"saknas i media/raw: {title}")
            continue
        secs = duration(src)
        info[slug] = round(secs)
        print(f"{title}: {secs / 60:.1f} min")

        if args.small:
            small = ROOT / "media" / "small" / f"{slug}.mp4"
            small.parent.mkdir(parents=True, exist_ok=True)
            if args.force or not small.exists():
                print(f"  liten -> {small}", flush=True)
                run("ffmpeg", "-y", "-v", "error", "-i", str(src),
                    "-vf", "scale=w='if(gt(a,1),-2,480)':h='if(gt(a,1),480,-2)'", "-r", "30",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "28",
                    "-maxrate", "1200k", "-bufsize", "2400k",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    "-c:a", "aac", "-b:a", "96k", str(small))
                print(f"  {small.stat().st_size // 1_000_000} MB")
            continue

        # Kortsidan blir 720 px oavsett om filmen är stående eller liggande.
        fit = "scale=w='if(gt(a,1),-2,720)':h='if(gt(a,1),720,-2)'"

        mp4 = ROOT / "media" / f"{slug}.mp4"
        if args.force or not mp4.exists():
            print(f"  transkoderar -> {mp4.name}", flush=True)
            # Gräset gör bilden svårkomprimerad; utan tak hamnade crf 23 på 16 Mbit/s.
            run("ffmpeg", "-y", "-v", "error", "-i", str(src),
                "-vf", fit, "-r", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "27",
                "-maxrate", "3500k", "-bufsize", "7000k",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-c:a", "aac", "-b:a", "128k", str(mp4))

        poster = ROOT / "assets" / "posters" / f"{slug}.jpg"
        poster.parent.mkdir(parents=True, exist_ok=True)
        if args.force or not poster.exists():
            t = min(5.0, secs / 2)
            run("ffmpeg", "-y", "-v", "error", "-ss", f"{t:.1f}", "-i", str(src),
                "-frames:v", "1", "-vf", fit, "-q:v", "4", str(poster))

        sheet = ROOT / "media" / "frames" / f"{slug}.jpg"
        sheet.parent.mkdir(parents=True, exist_ok=True)
        if args.force or not sheet.exists():
            n = max(1, int(secs // 5) + 1)
            cols = 4
            rows = (n + cols - 1) // cols
            run("ffmpeg", "-y", "-v", "error", "-i", str(src),
                "-vf", f"fps=1/5,scale=240:-2,tile={cols}x{rows}:padding=4:margin=4",
                "-frames:v", "1", "-q:v", "4", str(sheet))
            print(f"  kontaktkarta {cols}x{rows} -> {sheet.name}")

    if not args.small:
        (ROOT / "media" / "info.json").write_text(json.dumps(info, indent=2, ensure_ascii=False), encoding="utf-8")
        print("info.json:", info)


if __name__ == "__main__":
    main()
