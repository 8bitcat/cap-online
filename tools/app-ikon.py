"""Appikon (1024²) och startbild (2732²) för iOS-appen: CAP-loggan på mörk botten.

    python tools/app-ikon.py

Skriver app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
och de tre splash-2732x2732*.png i Splash.imageset, samt kopior i app/ikon/.
Patchar också Info.plist: bara stående läge på iPhone, svenska, ingen kryptering.
"""
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
IOS = ROOT / "app" / "ios" / "App" / "App"
BG = (0, 9, 18)


def canvas(size, glow):
    img = Image.new("RGB", (size, size), BG)
    if glow:
        # mjukt teal-sken uppe till vänster, som på webbens kort
        g = Image.new("RGB", (size, size), BG)
        d = ImageDraw.Draw(g)
        for i in range(60, 0, -1):
            r = int(size * 0.55 * i / 60)
            a = int(26 * (1 - i / 60) ** 1.5) + 0
            d.ellipse([size * 0.12 - r, size * 0.05 - r, size * 0.12 + r, size * 0.05 + r], fill=(0, 9 + a, 18 + a))
        img = g
    return img


def place_logo(img, width_ratio):
    logo = Image.open(ROOT / "assets" / "cap-logo.png").convert("RGBA")
    w = int(img.width * width_ratio)
    h = int(logo.height * w / logo.width)
    logo = logo.resize((w, h), Image.LANCZOS)
    img.paste(logo, ((img.width - w) // 2, (img.height - h) // 2), logo)
    return img


def main():
    out = ROOT / "app" / "ikon"
    out.mkdir(exist_ok=True)
    icon = place_logo(canvas(1024, glow=True), 0.78)
    icon.save(out / "AppIcon-1024.png")
    icon.save(IOS / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png")
    splash = place_logo(canvas(2732, glow=False), 0.42)
    splash.save(out / "splash-2732.png")
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        splash.save(IOS / "Assets.xcassets" / "Splash.imageset" / name)
    print("ikon och startbild skrivna")

    plist = IOS / "Info.plist"
    t = plist.read_text(encoding="utf-8")
    t = re.sub(r"<key>UISupportedInterfaceOrientations</key>\s*<array>.*?</array>",
               "<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>",
               t, count=1, flags=re.S)
    t = t.replace("<key>CFBundleDevelopmentRegion</key>\n\t<string>en</string>",
                  "<key>CFBundleDevelopmentRegion</key>\n\t<string>sv</string>\n\t<key>CFBundleLocalizations</key>\n\t<array>\n\t\t<string>sv</string>\n\t</array>")
    if "ITSAppUsesNonExemptEncryption" not in t:
        t = t.replace("\t<key>LSRequiresIPhoneOS</key>", "\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n\t<key>LSRequiresIPhoneOS</key>")
    plist.write_text(t, encoding="utf-8")
    print("Info.plist: stående läge på iPhone, sv, ITSAppUsesNonExemptEncryption=false")


if __name__ == "__main__":
    main()
