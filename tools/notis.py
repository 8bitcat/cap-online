"""Skicka en pushnotis till alla telefoner med CAP-appen.

    python tools/notis.py "Nytt pass ute: Koordination 2!"
    python tools/notis.py "Haris har svarat på ditt Nästa steg" --title "Från Haris"
    python tools/notis.py --antal            # hur många telefoner är registrerade

Lösenordet läses från C:/Users/palss/.secrets/cap-push-admin.txt (sätts av tools/push-deploy.sh --secrets).
"""
import sys
from pathlib import Path

import requests

SERVER = "https://cap-push.8bitcat.io"
HEMLIG = Path("C:/Users/palss/.secrets/cap-push-admin.txt")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if not args or args == ["--antal"]:
        r = requests.get(SERVER + "/", timeout=20).json()
        print(f"{r.get('telefoner', 0)} telefoner registrerade")
        if not args:
            print(__doc__)
        return
    title = "CAP"
    if "--title" in args:
        i = args.index("--title"); title = args[i + 1]; del args[i:i + 2]
    text = " ".join(args).strip()
    r = requests.post(SERVER + "/skicka", json={"hemlig": HEMLIG.read_text(encoding="utf-8").strip(), "text": text, "title": title, "vanta": True}, timeout=60).json()
    if not r.get("ok"):
        sys.exit(f"fel: {r.get('fel')}")
    ok = sum(1 for s in r.get("svar", []) if s.get("status") == 200)
    print(f"skickat till {r['skickade']} telefoner, {ok} lyckades" + (f", fel: {[s for s in r['svar'] if s.get('status') != 200]}" if ok < r["skickade"] else ""))


if __name__ == "__main__":
    main()
