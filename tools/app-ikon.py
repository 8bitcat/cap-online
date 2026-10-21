"""Appikon (1024²) och startbild (2732²) för iOS-appen.

    python tools/app-ikon.py --preview          # ritar alla varianter i hemskärmsstorlek → app/ikon/preview.png
    python tools/app-ikon.py --val wordmark      # bygger in vald variant (standard: wordmark)
    python tools/app-ikon.py --val tile

Varianter:
  wordmark  bara bokstäverna CAP i teal på mörk botten, stora (läsbara i 60 px)
  tile      teal gradient som platta, bokstäverna i mörkt (som spelarkortet)
  white     bokstäverna i vitt på mörk botten, teal linje under
  full      hela loggan med underraden (den första varianten)

Skriver AppIcon-512@2x.png i AppIcon.appiconset och splash-2732x2732*.png i Splash.imageset,
samt kopior i app/ikon/. Patchar också Info.plist (stående läge på iPhone, sv, ingen kryptering).
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
IOS = ROOT / "app" / "ios" / "App" / "App"
OUT = ROOT / "app" / "ikon"
BG = (0, 9, 18)
INK = (0, 36, 42)


def logo_full():
    return Image.open(ROOT / "assets" / "cap-logo.png").convert("RGBA")


def logo_letters():
    """Bara bokstäverna: skär bort linjen och underraden med hjälp av alfakanalen."""
    img = logo_full()
    a = img.split()[3]
    w, h = img.size
    rows = [sum(1 for x in range(0, w, 4) if a.getpixel((x, y)) > 40) for y in range(h)]
    # första tomma raden efter bokstavsblocket (blocket börjar vid första fyllda raden)
    start = next(y for y in range(h) if rows[y])
    end = next(y for y in range(start, h) if not rows[y])
    return img.crop((0, 0, w, end)).crop(img.crop((0, 0, w, end)).getbbox())


def recolor(img, rgb):
    """Samma form, enfärgad."""
    out = Image.new("RGBA", img.size, rgb + (0,))
    out.putalpha(img.split()[3])
    return out


def gradient(size, horizontal=True):
    g = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(g)
    stops = [(0.0, (10, 158, 154)), (0.55, (0, 212, 203)), (1.0, (0, 240, 255))]
    for i in range(size):
        t = i / (size - 1)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                c = tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
                break
        if horizontal:
            d.line([(i, 0), (i, size)], fill=c)
        else:
            d.line([(0, i), (size, i)], fill=c)
    if not horizontal:
        return g
    # vrid lutningen utan svarta hörn: rita större, vrid, beskär mitten
    big = g.resize((size * 2, size * 2))
    big = big.rotate(-20, resample=Image.BICUBIC, expand=False)
    o = size // 2
    return big.crop((o, o, o + size, o + size))


def dark(size, glow=True):
    img = Image.new("RGB", (size, size), BG)
    if glow:
        layer = Image.new("RGB", (size, size), BG)
        d = ImageDraw.Draw(layer)
        r = int(size * 0.7)
        d.ellipse([-r // 2, -r // 2, r // 2, r // 2], fill=(0, 60, 62))
        layer = layer.filter(ImageFilter.GaussianBlur(size * 0.18))
        img = Image.blend(img, layer, 0.9)
    return img


def place(img, logo, width_ratio, dy=0):
    w = int(img.width * width_ratio)
    h = int(logo.height * w / logo.width)
    logo = logo.resize((w, h), Image.LANCZOS)
    img.paste(logo, ((img.width - w) // 2, (img.height - h) // 2 + dy), logo)
    return img


def variant(name, size=1024):
    if name == "full":
        return place(dark(size), logo_full(), 0.78)
    if name == "wordmark":
        return place(dark(size), logo_letters(), 0.80)
    if name == "white":
        img = place(dark(size), recolor(logo_letters(), (253, 253, 253)), 0.78, dy=-int(size * 0.03))
        d = ImageDraw.Draw(img)
        y = int(size * 0.69)
        d.rounded_rectangle([int(size * 0.14), y, int(size * 0.86), y + int(size * 0.022)], radius=int(size * 0.011), fill=(0, 212, 203))
        return img
    if name == "tile":
        g = gradient(size)
        # mjuk ljusning uppe till höger som på spelarkortet
        hl = Image.new("L", (size, size), 0)
        ImageDraw.Draw(hl).ellipse([int(size * 0.45), -int(size * 0.5), int(size * 1.5), int(size * 0.55)], fill=90)
        hl = hl.filter(ImageFilter.GaussianBlur(size * 0.12))
        g = Image.composite(Image.new("RGB", (size, size), (255, 255, 255)), g, hl.point(lambda v: int(v * 0.35)))
        return place(g, recolor(logo_letters(), INK), 0.80)
    sys.exit(f"okänd variant {name}")


def rounded(img, radius_ratio=0.2237):
    """iOS-formen för förhandsvisningen."""
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=int(img.width * radius_ratio), fill=255)
    out = Image.new("RGBA", img.size)
    out.paste(img, (0, 0), m)
    return out


def preview(names):
    from PIL import ImageFont
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 26)
    small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 20)
    cell, pad = 300, 30
    sheet = Image.new("RGB", (pad + len(names) * (cell + pad), 560), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        x = pad + i * (cell + pad)
        v = variant(n, 512)
        big = rounded(v.resize((180, 180), Image.LANCZOS))
        sheet.paste(big, (x + 60, 40), big)
        d.text((x + 150 - d.textlength(n, font=font) / 2, 236), n, font=font, fill=(240, 240, 240))
        # hemskärm: 60 px på ljus och mörk botten, 29 px i inställningar
        for j, bg in enumerate([(235, 235, 240), (10, 10, 14)]):
            d.rectangle([x, 290 + j * 130, x + cell, 290 + j * 130 + 110], fill=bg)
            ic = rounded(v.resize((60, 60), Image.LANCZOS))
            sheet.paste(ic, (x + 40, 290 + j * 130 + 20), ic)
            ic2 = rounded(v.resize((29, 29), Image.LANCZOS))
            sheet.paste(ic2, (x + 130, 290 + j * 130 + 35), ic2)
            d.text((x + 180, 290 + j * 130 + 40), "60 / 29 px", font=small, fill=(120, 120, 120) if j == 0 else (150, 150, 150))
    OUT.mkdir(exist_ok=True)
    p = OUT / "preview.png"
    sheet.save(p)
    print("förhandsvisning:", p)


def apply(name):
    OUT.mkdir(exist_ok=True)
    icon = variant(name, 1024)
    icon.save(OUT / "AppIcon-1024.png")
    icon.save(IOS / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png")
    splash = place(dark(2732, glow=False), logo_letters() if name != "full" else logo_full(), 0.40)
    splash.save(OUT / "splash-2732.png")
    for f in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        splash.save(IOS / "Assets.xcassets" / "Splash.imageset" / f)
    print(f"ikon ({name}) och startbild skrivna")

    plist = IOS / "Info.plist"
    t = plist.read_text(encoding="utf-8")
    t = re.sub(r"<key>UISupportedInterfaceOrientations</key>\s*<array>.*?</array>",
               "<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>",
               t, count=1, flags=re.S)
    if "CFBundleLocalizations" not in t:
        t = t.replace("<key>CFBundleDevelopmentRegion</key>\n\t<string>en</string>",
                      "<key>CFBundleDevelopmentRegion</key>\n\t<string>sv</string>\n\t<key>CFBundleLocalizations</key>\n\t<array>\n\t\t<string>sv</string>\n\t</array>")
    if "ITSAppUsesNonExemptEncryption" not in t:
        t = t.replace("\t<key>LSRequiresIPhoneOS</key>", "\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n\t<key>LSRequiresIPhoneOS</key>")
    plist.write_text(t, encoding="utf-8")
    print("Info.plist kontrollerad")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if "--preview" in args:
        preview(["wordmark", "tile", "white", "full"])
        return
    name = args[args.index("--val") + 1] if "--val" in args else "wordmark"
    apply(name)


if __name__ == "__main__":
    main()
