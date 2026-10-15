"""Laddar ner Haris delade pass-filmer från Google Drive till media/raw/.

Återanvänder OAuth-token från /check-drive (Credential Manager, service
"claude-check-drive", scope drive.readonly). Hoppar över filer som redan
finns med rätt storlek, så skriptet går att köra om.

    python tools/drive-download.py                 # mappen "CAP pass till prototyopen"
    python tools/drive-download.py --file <id>     # en enskild fil
"""
import argparse
import io
import json
import sys
import time
from pathlib import Path

import keyring
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

FOLDER_ID = "1FQcsyo84kLlMgNMpCKQ6CyK1QGuMDrq1"  # "CAP pass till prototyopen"
KEYRING_SERVICE = "claude-check-drive"
KEYRING_USER = "google-oauth-token"
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
OUT = Path(__file__).resolve().parent.parent / "media" / "raw"


def creds():
    token_json = keyring.get_password(KEYRING_SERVICE, KEYRING_USER)
    if not token_json:
        sys.exit("Ingen Drive-token i Credential Manager – kör /check-drive en gång först.")
    c = Credentials.from_authorized_user_info(json.loads(token_json), SCOPES)
    if not c.valid:
        c.refresh(Request())
        keyring.set_password(KEYRING_SERVICE, KEYRING_USER, c.to_json())
    return c


def safe_name(title):
    return "".join(ch if ch not in '\\/:*?"<>|' else "_" for ch in title).strip()


def download(service, f):
    OUT.mkdir(parents=True, exist_ok=True)
    ext = {"video/quicktime": ".mov", "video/mp4": ".mp4"}.get(f["mimeType"], "")
    target = OUT / (safe_name(f["name"]) + ext)
    size = int(f.get("size", 0))
    if target.exists() and target.stat().st_size == size:
        print(f"finns redan: {target.name} ({size // 1_000_000} MB)")
        return
    print(f"laddar ner: {f['name']} ({size // 1_000_000} MB) -> {target}")
    req = service.files().get_media(fileId=f["id"])
    t0 = time.time()
    with open(target, "wb") as fh:
        dl = MediaIoBaseDownload(fh, req, chunksize=16 * 1024 * 1024)
        done = False
        while not done:
            status, done = dl.next_chunk()
            if status:
                print(f"  {int(status.progress() * 100):3d}%  {int(time.time() - t0)} s", flush=True)
    print(f"klar: {target.name} ({target.stat().st_size // 1_000_000} MB)")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser()
    p.add_argument("--file", help="Ladda ner en enskild fil (id) i stället för mappen")
    args = p.parse_args()

    service = build("drive", "v3", credentials=creds(), cache_discovery=False)
    fields = "id, name, mimeType, size, modifiedTime"
    if args.file:
        files = [service.files().get(fileId=args.file, fields=fields).execute()]
    else:
        res = service.files().list(q=f"'{FOLDER_ID}' in parents and trashed = false",
                                   fields=f"files({fields})", pageSize=100).execute()
        files = sorted(res.get("files", []), key=lambda f: f["name"])
    print(f"{len(files)} filer")
    for f in files:
        download(service, f)
    print("ALLT KLART")


if __name__ == "__main__":
    main()
