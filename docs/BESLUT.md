# Beslut – CAP Online

Loggbok över vägval. Nyast överst. Antaganden som Carl eller Haris inte
bekräftat är markerade **(antagande)**.

## 2026-10-23 – kundregister, mobilnummer, bedömningar över tid

- **Inloggning med mobilnummer** (Carl: "vi börjar med att man loggar in med
  telefonnummer … sms med länken … glömt lösenord skickar man bara till
  telefonnumret"). Ny kund läggs in av Haris med mobilnummer; länken `#/k/KOD`
  loggar in och leder till "välj en kod" (4–6 siffror, PBKDF2 i KV). Sedan
  nummer + kod. Glömt → ny länk. Svenska nummer normaliseras till +46.
- **Sms via 46elks är förberett men inte påslaget (antagande, ny kostnad):**
  utan hemligheterna SMS_USER/SMS_PASS öppnar appen Meddelanden på Haris
  telefon med texten ifylld (`sms:`-länk), och "Glömt koden" blir en ⚠-flagga
  i registret i stället för ett automatiskt sms. 46elks valdes för att det är
  svenskt, enkelt (basic auth, ett anrop) och tillåter avsändaren "CAP".
- **Klientregistret** ersätter e-postinbjudningarna som admins startflik:
  barn, född år, position, lag, nivå 1–5 (namnen lånas från appens XP-nivåer:
  Bollkompis … Matchvinnare), förälder, nummer, e-post, anteckning, status.
  Haris bokar åt befintliga kunder både från klientsidan och från Tider-fliken;
  bokade tider är röda i kalendern för alla. Raderad klient släpper sina tider.
- **Bedömningar** = blocktypen "Bedömning med tid" i passet: flera försök med
  stoppuret, medeltiden sparas på spelaren (`bed:<klientId>`) med datum, och
  jämförs direkt med förra gången av samma typ ("4,4 s bättre 🎉"). Typen
  slug:as av namnet så "Konbana" hamnar i samma kurva varje gång. Diagrammet
  är ren SVG utan bibliotek. Går också att lägga in manuellt på klientsidan.
- **Kamera och mikrofon i kör-läget** på varje block. Filer sparas först i
  telefonens IndexedDB, laddas upp till R2 (`klient/<id>/…`) när det är på och
  registreras på klienten (`med:<klientId>`), annars väntar de och laddas upp
  från klientsidan senare. Föräldern ser dem under Utveckling och i passet.
  iOS-appen behöver NSCamera/NSMicrophoneUsageDescription (Info.plist, bygge 3).
- **Antaganden att stämma av med Haris:** nivåskalan 1–5 och dess namn, tre
  försök per bedömning som standard, att filmer från pass delas med föräldern
  så fort passet är delat, att gamla e-postkonton får leva kvar.

## 2026-10-22 kväll – appen får sitt riktiga flöde

- **Första sidan: Förälder eller Admin** (Carl). Förälder → kod (eller gäst) →
  startguiden → startsidan med två val: **Träna själv** (= Träningsstigen,
  prototyp 4) och **Träna med Haris** (kalender). De fyra prototyperna finns
  kvar under Mer → Prototyperna. Standardläget heter `app` i store.proto.
- **Kalendern:** veckovy från denna vecka och framåt, aldrig bakåt. Bara veckor
  Haris öppnat syns. Bokning som på bio: tryck håller platsen i 60 s (servern
  sätter `hall.tills`), bekräfta inom tiden, annars släpps den. Passerade
  dagar är avstängda. Föräldern ser aldrig andras namn, bara "Upptagen".
- **Admin har egen meny längst ner:** Tider (autosätt timmespass per dag och
  tidsspann, justera, öppna/stäng vecka, duplicera till nästa vecka, avboka),
  Pass (ett pass per spelare med block: samtal på film före/efter, filma
  momentet, tidtagning med låst resultat, övning, anteckning; kör-läge med
  stora knappar; dela med föräldern; film → utkast i biblioteket), Filmer,
  Stigen (drömspelare och stegen per etapp, sparas på servern), Mer
  (inbjudningar, nyhet, logga ut).
- **Stigen fylls av biblioteket:** ett tomt block med en färdighetstagg blir
  ett filmsteg när en publicerad film har samma tagg och passar positionen.
  Det är så Haris filmer "används för träna själv".
- **Antaganden att stämma av:** 60 s hållning (kan ändras), passlängd 60 min
  som standard, samtal-före/efter som fasta block i mallen, att filmer från
  pass sparas som utkast tills Haris taggat dem.

## 2026-10-22 – admin, taggar, inloggning, prototyp 4

- **Inloggning med kod** (Carl: "en inloggning på första sidan … länk … kod"):
  Haris skapar en inbjudan i admin, föräldern får en 6-teckenskod (och en länk
  `#/k/KOD`). Koden skapar kontot på mejladressen och ger en enhetssession
  (180 dagar). Ingen extra PIN: telefonens egen låsning räcker, som i andra
  appar. Ingen mejlutskickning än, Haris skickar koden själv (sms/WhatsApp).
  "Prova utan konto" finns kvar för demon och kan tas bort.
- **Taggar** (`data/taggar.json`): ålder (7–8/9–10/11–12/13–14), nivå, position,
  område, färdighet (14 st), typ, fas i passet, svårighet (= nivåerna),
  utrustning, yta, sällskap, plats. Flera per dimension, "Alla" på ålder, nivå,
  position, svårighet och plats. Träningstid är ett tal, filmlängd läses ur
  filen. Filmer filtreras på barnets ålder, position och nivå i appen.
- **Backend = Cloudflare Worker + KV** (`server/cap-api`), samma konto som
  pushservern. R2 för filmfiler är inte påslaget på kontot (kräver aktivering
  i dashboarden + R2-rättighet på token). Koden är redo: uppladdning i delar,
  omslag ur filmen i webbläsaren. Cloudflare Stream (transkodning, HLS) är
  nästa steg om telefonfilmerna blir för tunga; det är en ny kostnad och tas
  med Carl.
- **Prototyp 4 Träningsstigen** (Carl: "gamifierad … följer en träningsstig …
  nivåer, stopp och gränser, assessments … frågetecken … ta tid … skicka film
  till Haris"): `stig` i content.json, 5 etapper, 35 steg (filtrerade på
  position). Stegtyper: film (klar när passet loggats), frågetecken (text eller
  quiz), tid (stoppur, låst resultat med tidsstämpel, bästa tid, mål ger ⭐),
  block (film kommer, markeras klar i prototypen), grind (film till Haris
  öppnar nästa etapp direkt, Haris godkänner i efterhand). Drömspelare väljs i
  startguiden. Allt låses upp i ordning. XP: fråga 30, tid 50 (+20 vid mål),
  block 20, film-till-Haris 60, grind 100.

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
