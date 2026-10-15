# CAP Online

Webbapp åt Complete Athletic Performance (Haris Skenderovic) där föräldrar
tränar sina barn, 7–14 år, i fotboll med Haris färdiga pass. Bygger på
konceptutkastet i `docs/CAP_Online_Konceptutkast_V0.1.pdf`.

Vanilla HTML/CSS/JS, inget byggsteg. Innehållet ligger i `data/content.json`.

## Köra lokalt

```powershell
cd D:\CAPOnline
python -m http.server 8808
```

Öppna <http://localhost:8808/>. Appen är mobil-först, testa gärna med
telefonläge i webbläsaren.

## Filmerna

Haris pass ligger som filmer på Google Drive (mappen "CAP pass till
prototyopen"). De checkas inte in.

```powershell
python tools\drive-download.py   # hämtar originalen till media\raw\
python tools\transcode.py        # 720p-mp4 till media\, omslag till assets\posters\
```

Finns ingen lokal mp4 spelar appen filmen via Google Drive-förhandsvisning
i stället, vilket kräver ett Google-konto som fått filmen delad.

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
