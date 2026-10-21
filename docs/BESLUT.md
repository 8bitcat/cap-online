# Beslut – CAP Online

Loggbok över vägval. Nyast överst. Antaganden som Carl eller Haris inte
bekräftat är markerade **(antagande)**.

## 2026-10-21 – appen uppdaterar sig själv, notiser

- **Appen laddar webben** (Carl: "uppdatera appen härifrån så den alltid hämtar
  det nyaste"): `server.url = https://8bitcat.github.io/cap-online/` i
  capacitor.config.json, `error.html` när nätet saknas. Valdes före Capgo-
  uppdateraren (Pixelcitys lösning) eftersom det är noll extra rörliga delar
  och prototypen ändå behöver nätet för filmerna. Nackdel: inget offline, och
  Apple kan ifrågasätta rena webbskal vid App Store-granskning. Omprövas inför
  riktigt släpp. Paketet innehåller en reservkopia utan filmer (2 MB).
- **Notiser** (Carl: "gör också så vi kan ha notiser"): två slag. Påminnelser
  om träningsdagar = lokala notiser kl 17 (dagar ur profilens frekvens: 1 →
  onsdag, 2 → tisdag/torsdag, 3+ → måndag/onsdag/fredag). Nyheter från Haris =
  push via `server/cap-push` (Cloudflare Worker, KV, Apples teamnyckel
  LSUKCX663J, domän cap-push.8bitcat.io). Servern sparar bara pushkoder.
  Push kräver aps-environment i appen (App.entitlements) och en profil skapad
  efter att Push Notifications kryssats i på App ID:t. Testknappar i appen
  (🔔): lokal testnotis om 5 s, testpush till egen telefon (högst en per minut).
- **Haris Apple-ID** för TestFlight är Haris.skenderovic@outlook.com; appen har
  Apple ID 6825529179 i App Store Connect.

## 2026-10-16 – Haris ska kunna köra den hos sig

- **GitHub Pages** på https://8bitcat.github.io/cap-online/ (repo 8bitcat/cap-online,
  publikt eftersom Pages kräver det på gratiskontot). Valdes före artefakten
  eftersom claude.ai-länken inte gick att öppna oinloggad i test. De små
  filmerna (480 px, ca 40 MB) ligger med på sidan. Pages svarar med
  Accept-Ranges, så ▶ per moment fungerar.
- **TestFlight** (Carl: "kan vi göra detta till en app han får prova via
  testflight?"): `app/` = Capacitor 8 med prototypen inbyggd, `codemagic.yaml`
  som Pixelcity. App ID **se.completeathletic.caponline** (antagande, varje led
  börjar med bokstav), appnamn "CAP Online", stående läge på iPhone, svenska,
  ITSAppUsesNonExemptEncryption=false. Byggs under Carls Apple-konto (8bitcat,
  Team GYTVJ3CTBJ) tills Haris har ett eget. Filmerna hämtas i molnbygget från
  gh-pages eftersom media/ inte ligger i git. Haris bjuds enklast in som intern
  testare (App Store Connect-användare), då krävs ingen betagranskning.

## 2026-10-16 – filmerna knutna till momenten (v0.2.1)

- **De fem filmerna är fem delar av ETT pass.** Titelskyltarna i filmerna
  säger det själva: "Uppvärmning med boll (10 min)", "Passningar (10 min)",
  "Dribblingar (15 min)", "Koordination (10 min)". Första touch saknar skylt
  och antas vara 10 min. Summa 55 min = konceptets "kompletta pass på 50–60
  minuter". Appen har därför **CAP-passet** (`program` i content.json) med
  delarna i filmernas ordning, och delarna var för sig under "Träna något
  specifikt". Antagandet om 50 min per del är borttaget.
- **Varje moment har ett klipp** (`steps[].clip`, sekunder i delens film).
  ▶-knappen hoppar dit och upprepar klippet tills man byter (🔁 går att
  stänga av). Tiderna är satta från bildrutor en gång per sekund
  (`tools/frames.py`), inte från att ha sett filmerna, så Haris bör
  finjustera sekunderna och namnen på momenten.
- Planeraren plockar moment via id (`ub1`, `ft2` …) så klippen följer med.
  Hela passet loggat ger 50 XP per del.

## 2026-10-15 kväll – v0.2.0: tre spår att välja mellan

- **Förstasidan väljer spår** (Carl: "en första sida där man väljer vilken
  prototyp man vill köra"). Tre prototyper delar innehåll och sparad data:
  1 Träna mitt barn (v0.1-biblioteket), 2 Spelarkortet (startguide, planera
  dagens pass, XP/nivåer/märken), 3 Utbildningsvägen (fem nivåer, allmänt +
  position, kunskapsquiz, nivåprov). Knappen "PROTOTYP n" uppe till höger
  byter spår.
- **Startguiden** frågar namn, ålder, position (MV/Back/Mitt/Anf/Vet inte än),
  bästa fot, erfarenhet, svårigheter, mål och frekvens. Positionen styr
  planerarens moment och utbildningsvägens specifika spår.
- **Passplaneraren** sätter ihop uppvärmning (20 %), huvuddel (65 %) och
  avslut (15 %) ur Haris befintliga moment. Fokus: automatiskt (svårigheter →
  pelare, annars lägsta betyget), en pelare, eller positionen. Varje moment
  länkar till filmen det kommer ur. **Antagande:** momenten går att plocka
  fritt mellan passen – Haris får säga om vissa alltid hör ihop.
- **Gamifiering:** XP (pass 50, avbockat moment 5, träningsmodul 40,
  kunskapsmodul 30, nivåprov 100), fem nivåer (Bollkompis 0, Touchmästare 200,
  Dribblare 500, Spelmotor 1000, Matchvinnare 2000), elva märken, svit i
  veckor med minst två pass, spelarkort med betyg BOL/TEK/KOO som börjar på
  erfarenhetsnivån (42/50/58) och växer +3 per pass och +4 per modul. Allt
  härleds ur sparad data, inget XP-saldo lagras.
- **Utbildningsvägen:** nivå n låses upp när alla moduler i nivå n−1 (allmänt +
  barnets position) är klara. Träningsmoduler med film blir klara när passet
  loggats, kunskapsmoduler via quiz (minst 2 av 3 rätt), nivåprov via
  "skicka film" + simulerat godkännande. Moduler utan film/text är
  **fejkade rutor** märkta "Film kommer från Haris" med knappen "Markera klar
  (prototyp)". Förhandsvisningsknapparna (Verklig / Nivå 1 klar / Halvvägs)
  finns bara för demon.
- **Innehållet i nivå 2–5 är mitt förslag** på kursplan, skrivet för att visa
  strukturen. Haris äger kursplanen.

## 2026-10-15 – start av prototypen

- **Webbapp först.** Carl 2026-10-15: "webbappen först, så bestämmer vi
  betalsätt senare". Ingen App Store, inget köpflöde i V0.1. Knappen
  "Lägg till i mitt bibliotek" låser upp lokalt utan betalning.
- **Vanilla HTML/CSS/JS, inget byggsteg** (antagande). Billigast att ändra:
  innehållsmodellen (`data/content.json`) och stilen (`css/app.css`) följer med
  till vilken stack som helst om vi byter senare. Samma mönster som Carls
  övriga webbprojekt.
- **Innehållet = Haris fem filmer** från Drive-mappen "CAP pass till
  prototyopen" (delad 2026-09-25): Uppvärmning + bollkontroll, Första touch,
  Passningar, Dribblingar, Koordination. Originalen (.mov, ca 1,4 GB) laddas ner
  till `media/raw/` med `tools/drive-download.py` och ligger utanför git.
- **Filmerna är korta stående klipp**, inte timmeslånga pass: 32–66 sekunder,
  2160×3840 HEVC 60 fps från telefon, med CAP-vattenstämpel. Ett barn (nr 7) och
  Haris på konstgräs. Appen visar därför filmlängden ("Film 1 min") separat
  från träningstiden. **Träningstid ca 50 min per pass är ett antagande** från
  konceptet ("kompletta pass på cirka 50–60 minuter"). Haris får bekräfta om
  klippen är hela passet eller en smakbit.
- **Video i prototypen:** lokal mp4 (720×1280, H.264, max 3,5 Mbit/s) i
  `media/` när den finns, annars Google Drive-förhandsvisning (iframe) för den
  som har tillgång till filerna. Riktig videohosting (Cloudflare Stream eller
  Vimeo) bestäms med betalsättet.
- **Grafisk profil = completeathletic.se:** mörkt tema, teal `#00d4cb`
  (hover `#09bcb4`, djup `#009992`), text `#FDFDFD`/`#969696`, DM Sans.
  Loggan (teal→cyan-gradient) och fotbollsikonen hämtade från sajten.
- **Spelarens data** (loggade pass, bibliotek, formulärsvar) sparas i
  `localStorage` i prototypen. Backend (Firebase eller .NET) väljs när
  betalsättet är valt.
- **Haris adminvy** finns inte i V0.1 – innehållet redigeras i
  `data/content.json`.
