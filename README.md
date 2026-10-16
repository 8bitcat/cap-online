# CAP Online

Webbapp åt Complete Athletic Performance (Haris Skenderovic) där föräldrar
tränar sina barn, 7–14 år, i fotboll med Haris färdiga pass. Bygger på
konceptutkastet i `docs/CAP_Online_Konceptutkast_V0.1.pdf`.

Vanilla HTML/CSS/JS, inget byggsteg. Innehållet ligger i `data/content.json`.

Förstasidan väljer ett av tre spår som delar innehåll och sparad data:

| Spår | Visar |
|---|---|
| 1 Träna mitt barn | biblioteket med de fem passen, Hjälp mig välja, Föräldraguiden |
| 2 Spelarkortet | startguide (namn, ålder, position), Planera dagens pass, XP, nivåer, märken |
| 3 Utbildningsvägen | fem nivåer med allmänna och positionsspecifika moduler, quiz, nivåprov |

Knappen "PROTOTYP n" uppe till höger byter spår. Skärmdumpstest av hela
flödet: `tools/screenshots-v2.js`.

## Köra lokalt

```powershell
cd D:\CAPOnline
python tools\serve.py
```

Öppna <http://localhost:8808/>. Appen är mobil-först, testa gärna med
telefonläge i webbläsaren. Använd `tools\serve.py`, inte `python -m
http.server`: den vanliga servern saknar Range-stöd och då kan webbläsaren
inte spola i filmerna, så ▶-knapparna per moment slutar fungera.

## Filmerna

Haris pass ligger som filmer på Google Drive (mappen "CAP pass till
prototyopen"). De checkas inte in.

```powershell
python tools\drive-download.py   # hämtar originalen till media\raw\
python tools\transcode.py        # 720p-mp4 till media\, omslag till assets\posters\
```

Finns ingen lokal mp4 spelar appen filmen via Google Drive-förhandsvisning
i stället, vilket kräver ett Google-konto som fått filmen delad.

## Webbplats för Haris (GitHub Pages)

Prototypen ligger publikt på <https://8bitcat.github.io/cap-online/> och
fungerar utan inloggning, på mobil och dator. Publicera om efter ändringar:

```powershell
python tools\deploy-pages.py     # bygger och force-pushar branchen gh-pages
```

Repot: <https://github.com/8bitcat/cap-online> (publikt, krav för Pages på
gratiskontot). De små filmerna följer med sidan.

## iOS-app via TestFlight (Capacitor + Codemagic)

`app/` är en Capacitor-app med prototypen inbyggd, samma upplägg som
Pixelcity. `codemagic.yaml` i roten bygger och laddar upp till App Store
Connect. Lokalt: `cd app && npm install && npm run sync` (bygger `app/www`
med små filmer och DM Sans lokalt). `python tools\app-ikon.py` gör ikon och
startbild och patchar Info.plist.

Det Carl gör en gång i Apple/Codemagic innan första bygget:
1. Developer-portalen: App ID `se.completeathletic.caponline`, en App Store-
   provisioning profile för den, hämtad till Codemagic (Code signing identities).
2. App Store Connect: skapa appen "CAP Online" med det App ID:t, läs av
   Apple ID (App Information) och skriv in det i `codemagic.yaml`
   (`APP_STORE_APPLE_ID`).
3. Codemagic: lägg till repot 8bitcat/cap-online, starta workflow
   `ios-testflight`.
4. TestFlight: bjud in Haris som intern testare (App Store Connect →
   Users and Access, roll Developer eller Marketing, kryssa i TestFlight),
   eller skapa en extern grupp med publik länk (kräver Apples betagranskning).

## Artefakt på claude.ai

Prototypen finns som privat artefakt: <https://claude.ai/artifact/J5Vw28eL5q5y2MAyhCRXao>
(delas från sidans Share-meny). Den byggs av `artifact.html` plus de små
filmerna från `media/small/`:

```powershell
python tools\transcode.py --small          # 480 px-filmer under 15 MB styck
python tools\artifact-dist.py <utmapp>     # samlar allt som ska publiceras
```

Publicera sedan utmappens `index.html` med artefaktverktyget mot samma URL.

## Struktur

| Väg | Innehåll |
|---|---|
| `index.html` | skal, tabbar |
| `artifact.html` | samma skal utan dokumentram, för publicering som claude.ai-artefakt (filmer från `media/small/`) |
| `css/app.css` | profil efter completeathletic.se |
| `js/app.js` | router och vyer |
| `js/store.js` | lokal lagring (bibliotek, loggar, profil, förfrågningar) |
| `data/content.json` | pass, pelare, Föräldraguiden, Hjälp mig välja |
| `docs/BESLUT.md` | vägval och antaganden |
