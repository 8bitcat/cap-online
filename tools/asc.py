"""App Store Connect API för CAP: de steg som går att göra utan att klicka.

Nyckeln läses från C:/Users/palss/.secrets/asc-8bitcat.json:
    {"key_id": "94H7H2CY53", "issuer_id": "xxxxxxxx-....", "p8": "C:/Users/palss/.secrets/AuthKey_94H7H2CY53.p8"}
Skriv aldrig ut nyckeln eller token.

    python tools/asc.py check                 # fungerar nyckeln? listar appar och roll
    python tools/asc.py bundle-id             # registrerar se.completeathletic.caponline (om det saknas)
    python tools/asc.py profile               # App Store-profil med befintligt distributionscertifikat → app/signing/
    python tools/asc.py app                   # hittar appen CAP (måste skapas i webben först) och skriver Apple ID i codemagic.yaml
    python tools/asc.py invite                # bjuder in Haris (Developer, bara CAP)
    python tools/asc.py group                 # intern TestFlight-grupp "CAP-teamet" + lägger till Haris
    python tools/asc.py builds                # senaste byggen i TestFlight
"""
import base64
import json
import re
import sys
import time
from pathlib import Path

import jwt
import requests

ROOT = Path(__file__).resolve().parent.parent
SECRET = Path("C:/Users/palss/.secrets/asc-8bitcat.json")
API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE_ID = "se.completeathletic.caponline"
APP_NAME = "CAP"
HARIS = {"email": "Haris.skenderovic@outlook.com", "firstName": "Haris", "lastName": "Skenderovic"}
GROUP = "CAP-teamet"


def token():
    cfg = json.loads(SECRET.read_text(encoding="utf-8"))
    key = Path(cfg["p8"]).read_text(encoding="utf-8")
    now = int(time.time())
    return jwt.encode({"iss": cfg["issuer_id"], "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
                      key, algorithm="ES256", headers={"kid": cfg["key_id"]})


def call(method, path, **kw):
    r = requests.request(method, API + path if path.startswith("/") else path,
                         headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
                         timeout=60, **kw)
    if r.status_code >= 400:
        try:
            errs = r.json().get("errors", [])
            msg = "; ".join(f"{e.get('code')}: {e.get('detail') or e.get('title')}" for e in errs)
        except Exception:
            msg = r.text[:400]
        sys.exit(f"{method} {path} → {r.status_code}: {msg}")
    return r.json() if r.text else {}


def find_app():
    for a in call("GET", f"/apps?filter[bundleId]={BUNDLE_ID}").get("data", []):
        return a
    return None


def cmd_check():
    apps = call("GET", "/apps?limit=50").get("data", [])
    print(f"nyckeln fungerar, {len(apps)} appar på kontot:")
    for a in apps:
        print(f"  {a['attributes']['name']}  {a['attributes']['bundleId']}  Apple ID {a['id']}")
    me = call("GET", "/users?limit=50").get("data", [])
    print(f"{len(me)} användare i teamet")


def cmd_bundle_id():
    hit = call("GET", f"/bundleIds?filter[identifier]={BUNDLE_ID}").get("data", [])
    if hit:
        print(f"App ID finns redan: {BUNDLE_ID} ({hit[0]['id']})")
        return hit[0]["id"]
    d = call("POST", "/bundleIds", json={"data": {"type": "bundleIds", "attributes": {
        "identifier": BUNDLE_ID, "name": APP_NAME, "platform": "IOS"}}})["data"]
    print(f"App ID registrerat: {BUNDLE_ID} ({d['id']})")
    return d["id"]


def cmd_profile():
    bid = cmd_bundle_id()
    certs = [c for c in call("GET", "/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=50").get("data", [])]
    if not certs:
        sys.exit("inget distributionscertifikat på kontot – skapa i Codemagic (Code signing identities) eller i Xcode")
    cert = max(certs, key=lambda c: c["attributes"].get("expirationDate", ""))
    print(f"certifikat: {cert['attributes']['name']} (utgår {cert['attributes'].get('expirationDate', '')[:10]})")
    name = f"{APP_NAME} App Store"
    for p in call("GET", f"/profiles?filter[name]={requests.utils.quote(name)}").get("data", []):
        print(f"profil finns redan: {name} ({p['attributes']['profileState']})")
        return save_profile(p)
    p = call("POST", "/profiles", json={"data": {"type": "profiles",
        "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
        "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bid}},
                          "certificates": {"data": [{"type": "certificates", "id": cert["id"]}]}}}})["data"]
    print(f"profil skapad: {name} (utgår {p['attributes']['expirationDate'][:10]})")
    return save_profile(p)


def save_profile(p):
    out = ROOT / "app" / "signing"
    out.mkdir(exist_ok=True)
    f = out / "CAP_Online_App_Store.mobileprovision"
    f.write_bytes(base64.b64decode(p["attributes"]["profileContent"]))
    print(f"sparad: {f}  → ladda upp i Codemagic: Code signing identities → iOS provisioning profiles")
    return f


def cmd_app():
    a = find_app()
    if not a:
        sys.exit(f"appen {APP_NAME} ({BUNDLE_ID}) finns inte i App Store Connect ännu. "
                 "Skapa den i webben: My Apps → + → New App (API:et kan inte skapa appar).")
    yml = ROOT / "codemagic.yaml"
    t = yml.read_text(encoding="utf-8")
    t2 = re.sub(r"APP_STORE_APPLE_ID: \S+", f"APP_STORE_APPLE_ID: {a['id']}", t)
    if t2 != t:
        yml.write_text(t2, encoding="utf-8", newline="\n")
        print(f"codemagic.yaml: APP_STORE_APPLE_ID = {a['id']} (committa och pusha)")
    else:
        print(f"Apple ID {a['id']} står redan i codemagic.yaml")
    return a


def cmd_invite():
    a = find_app()
    if not a:
        sys.exit("skapa appen i App Store Connect först (python tools/asc.py app förklarar)")
    users = call("GET", "/users?limit=100").get("data", [])
    if any(u["attributes"]["username"].lower() == HARIS["email"].lower() for u in users):
        print("Haris är redan användare i teamet")
        return
    pending = call("GET", "/userInvitations?limit=100").get("data", [])
    if any(i["attributes"]["email"].lower() == HARIS["email"].lower() for i in pending):
        print("inbjudan till Haris är redan skickad och väntar på svar")
        return
    call("POST", "/userInvitations", json={"data": {"type": "userInvitations",
        "attributes": {**HARIS, "roles": ["DEVELOPER"], "allAppsVisible": False, "provisioningAllowed": False},
        "relationships": {"visibleApps": {"data": [{"type": "apps", "id": a["id"]}]}}}})
    print(f"inbjudan skickad till {HARIS['email']} (roll Developer, bara {APP_NAME}). Han accepterar i mejlet från Apple.")


def cmd_group():
    a = find_app()
    if not a:
        sys.exit("skapa appen i App Store Connect först")
    groups = call("GET", f"/betaGroups?filter[app]={a['id']}&filter[name]={GROUP}").get("data", [])
    if groups:
        g = groups[0]
        print(f"gruppen {GROUP} finns ({'intern' if g['attributes']['isInternalGroup'] else 'extern'})")
    else:
        g = call("POST", "/betaGroups", json={"data": {"type": "betaGroups",
            "attributes": {"name": GROUP, "isInternalGroup": True, "hasAccessToAllBuilds": True, "feedbackEnabled": True},
            "relationships": {"app": {"data": {"type": "apps", "id": a["id"]}}}}})["data"]
        print(f"intern grupp skapad: {GROUP} (får alla byggen automatiskt)")
    testers = call("GET", f"/betaTesters?filter[email]={HARIS['email']}").get("data", [])
    if testers:
        call("POST", f"/betaGroups/{g['id']}/relationships/betaTesters",
             json={"data": [{"type": "betaTesters", "id": testers[0]["id"]}]})
    else:
        call("POST", "/betaTesters", json={"data": {"type": "betaTesters", "attributes": HARIS,
            "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": g["id"]}]}}}})
    print(f"Haris ligger i {GROUP}. Interna testare måste ha accepterat inbjudan till teamet (python tools/asc.py invite).")


def cmd_builds():
    a = find_app()
    if not a:
        sys.exit("appen finns inte ännu")
    for b in call("GET", f"/builds?filter[app]={a['id']}&sort=-uploadedDate&limit=10").get("data", []):
        at = b["attributes"]
        print(f"bygge {at['version']}  {at['processingState']}  {at['uploadedDate'][:16]}  utgår {at.get('expirationDate', '')[:10]}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not SECRET.exists():
        sys.exit(f"saknar {SECRET} med key_id, issuer_id och p8-sökväg")
    cmds = {"check": cmd_check, "bundle-id": cmd_bundle_id, "profile": cmd_profile, "app": cmd_app,
            "invite": cmd_invite, "group": cmd_group, "builds": cmd_builds}
    fn = cmds.get(sys.argv[1] if len(sys.argv) > 1 else "")
    if not fn:
        sys.exit(__doc__)
    fn()


if __name__ == "__main__":
    main()
