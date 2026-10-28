"""Släpprutin för CAP: en version, ett kommando.

    python tools/release.py 0.3.0            # webben + förbereder appen
    python tools/release.py 0.3.0 --no-pages # bara version, commit, tagg, push

Gör i ordning:
  1. js/version.js  → VERSION = '0.3.0'   (syns längst ner i appen)
  2. app/package.json appVersion → '0.3'  (MARKETING_VERSION i App Store/TestFlight)
  3. git commit "chore(release): v0.3.0" + tagg v0.3.0 + push main och taggen
  4. python tools/deploy-pages.py           (webbplatsen för Haris)
Därefter: Codemagic → cap-online → Start new build → ios-testflight (manuellt,
så att byggminuterna inte går åt i onödan).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sh(*cmd):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit(f"fel: {' '.join(cmd)}\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args or not re.fullmatch(r"\d+\.\d+\.\d+", args[0]):
        sys.exit("ange version som X.Y.Z, t.ex. 0.3.0")
    v = args[0]
    short = ".".join(v.split(".")[:2])
    if sh("git", "status", "--porcelain"):
        sys.exit("arbetsmappen har ändringar – committa eller stasha dem först")
    if sh("git", "branch", "--show-current") != "main":
        sys.exit("släpp från branchen main")

    vj = ROOT / "js" / "version.js"
    vj.write_text(f"export const VERSION = '{v}';\n", encoding="utf-8", newline="\n")
    pj = ROOT / "app" / "package.json"
    pkg = json.loads(pj.read_text(encoding="utf-8"))
    pkg["appVersion"] = short
    pj.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

    sh("git", "add", "js/version.js", "app/package.json")
    sh("git", "-c", "user.name=Carl Palsson", "-c", "user.email=palsson.carl@gmail.com",
       "commit", "-q", "-m", f"chore(release): v{v}")
    sh("git", "tag", "-a", f"v{v}", "-m", f"CAP v{v}")
    sh("git", "push", "-q", "origin", "main", f"v{v}")
    print(f"v{v} committad, taggad och pushad (app {short})")

    if "--no-pages" not in sys.argv:
        subprocess.run([sys.executable, str(ROOT / "tools" / "deploy-pages.py")], check=True)
    print("Nästa steg: Codemagic → cap-online → Start new build → ios-testflight")


if __name__ == "__main__":
    main()
