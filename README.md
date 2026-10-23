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

| 4 Träningsstigen | gamifierad stig nedåt: drömspelare, etapper, frågetecken, tidtagning som låses, film till Haris, grindar |

Knappen "PROTOTYP n" uppe till höger byter spår. Skärmdumpstest av hela
flödet: `tools/screenshots-v2.js`, `tools/screenshots-v3.js`, `tools/admin-test.js`.

## Appens flöde (2026-10-23)

Första sidan: **Förälder** eller **Admin**. Föräldern loggar in med
mobilnummer och en kod hen själv valt, registrerar barnet i startguiden
(förifylld från registret) och kommer till startsidan med **Träna själv**
(Träningsstigen), **Träna med Haris** (bokningskalender, bokade tider är röda)
och **Utveckling** (nivån Haris satt, bedömningar som diagram, filmer och
ljud från passen). Admin har en egen meny: Klienter, Tider, Filmer, Stigen,
Mer. Flödestester: `tools/app-test.js`, `tools/klient-test.js` (hela
kundflödet från ny kund till diagram, kräver Chrome och den lokala servern).

## Konto, admin och API

- **API:** `server/cap-api/` är en Cloudflare Worker på <https://cap-api.8bitcat.io>
  (KV). Driftsätt med `bash tools/api-deploy.sh` (`--secrets` första gången,
  `--r2` när R2 är påslaget, `--sms` när 46elks-kontot finns).
  Adminlösenordet ligger i `.secrets/cap-admin-losen.txt`.
- **Ny kund:** Haris lägger in spelaren i admin → Klienter → Ny kund (barn,
  född år, position, lag, nivå, förälder, mobilnummer). Appen visar en
  sms-text med länken `#/k/KOD`; knappen "Skicka sms från telefonen" öppnar
  Meddelanden med texten ifylld. Med 46elks påslaget skickar servern sms:et.
- **Inloggning:** länken loggar in och leder till "välj en kod" (4–6 siffror).
  Sedan mobilnummer + kod (`/auth/login`, tio försök per kvart). "Glömt
  koden?" skickar en ny länk till numret, eller flaggar klienten i registret
  (⚠ Ny länk) så Haris skickar den själv. Gamla e-postkoder fungerar under
  `#/login/kod`. "Prova utan konto" finns för demo.
- **Klientsidan (admin):** nivå 1–5 med historik (höj/sänk), tider (boka åt
  kunden, även i stängda veckor), pass (Planera nytt pass förifyllt med
  spelaren), bedömningar per typ med diagram, filmer och ljud, anteckning.
  Samma sida på datorn (två spalter) och i appen.
- **Pass:** blocktyper samtal, bedömning med tid (flera försök med stoppur,
  medeltiden sparas på spelaren och jämförs med förra gången), filma
  momentet, tidtagning, övning, anteckning. I kör-läget kan varje block filmas
  (kameran) eller spelas in som ljud (mikrofonen). Inspelningar laddas upp
  till R2 när det är på, annars ligger de i telefonens IndexedDB tills "Ladda
  upp väntande" körs från klientsidan. Delat pass syns hos föräldern.
- **Filmer:** titel, beskrivning, träningstid, länk eller uppladdning (R2),
  omslag ur filmen, taggar i tolv dimensioner (`data/taggar.json`), moment
  med start/slut som ger ▶-knappar, utkast/publicerad. Nyhet som push.
- **R2 (fillagring) är inte påslaget** på Cloudflare-kontot än. Slå på R2 i
  dashboarden, ge API-token rättigheten "Workers R2 Storage: Edit" och kör
  `bash tools/api-deploy.sh --r2`. Kameran och mikrofonen i iOS-appen kräver
  texterna i `app/ios/App/App/Info.plist` (med sedan bygge 3).

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

`app/` är en Capacitor-app, samma upplägg som Pixelcity. Appen **laddar
prototypen från GitHub Pages** (`server.url` i `app/capacitor.config.json`),
så `tools\deploy-pages.py` uppdaterar appen utan nytt bygge. `codemagic.yaml`
i roten bygger och laddar upp till App Store Connect. Lokalt: `cd app && npm
install && npm run sync`. `python tools\app-ikon.py` gör ikon och startbild
och patchar Info.plist. Nytt bygge behövs bara när det nativa ändras.

## Notiser

- **I appen:** 🔔 uppe till höger → sidan Notiser. Påminnelser om träning
  (lokala notiser kl 17 på träningsdagarna, `@capacitor/local-notifications`)
  och Nyheter från Haris (push, `@capacitor/push-notifications`). Testknappar
  för båda. Kräver Push Notifications på App ID:t och en profil skapad efter det.
- **Server:** `server/cap-push/` är en Cloudflare Worker på
  <https://cap-push.8bitcat.io> (KV + Apples teamnyckel). Driftsätt med
  `bash tools/push-deploy.sh` (`--secrets` första gången).
- **Skicka en nyhet till alla:** `python tools\notis.py "Nytt pass ute!"`
  (lösen i `.secrets/cap-push-admin.txt`). `--antal` visar registrerade telefoner.

Det Carl gör en gång i Apple/Codemagic innan första bygget:
1. Developer-portalen: App ID `se.completeathletic.caponline`, en App Store-
   provisioning profile för den, hämtad till Codemagic (Code signing identities).
2. App Store Connect: skapa appen "CAP Online" med det App ID:t, läs av
   Apple ID (App Information) och skriv in det i `codemagic.yaml`
   (`APP_STORE_APPLE_ID`).
3. Codemagic: lägg till repot 8bitcat/cap-online, starta workflow
   `ios-testflight`.
4. TestFlight: bjud in Haris som intern testare (App Store Connect →
   Users and Access, roll Developer, bara appen CAP Online) med hans
   **Apple-ID Haris.skenderovic@outlook.com** (inte jobbadressen), lägg honom
   i en intern grupp med automatisk distribution. Alternativt en extern grupp
   med publik länk (kräver Apples betagranskning).

Hela guiden med bockar: `docs/SLAPPGUIDE.html` (även som artefakt).

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
