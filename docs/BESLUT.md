# Beslut – CAP Online

Loggbok över vägval. Nyast överst. Antaganden som Carl eller Haris inte
bekräftat är markerade **(antagande)**.

## 2026-10-28 – ⇄ förälder/Haris, inga prototyper, övningsbanken i admin

- **⇄ uppe vid klockan** (Carl: "en pil som betyder växla … menyn där nere ska
  ändras till Haris meny"). Knappen syns för den som är inloggad som Haris på
  telefonen, och alltid i admin. Den byter till Haris vy (adminmenyn längst ner)
  eller tillbaka till föräldravyn, och varje sida minns var man var. En förälder
  utan admin ser ingen växling. Första gången: Mer → Admin (för Haris).
- **Prototyperna är borta** (Carl: "det som är nu är så det ska vara, det sätter
  vi nu som föräldravyn"). Valet av spår, PROTOTYP-märket och "byt prototyp" är
  borttagna; gamla `#/prototyper` går till Mer. De gamla startsidorna är
  raderade, sidorna som appen fortfarande länkar till (bibliotek, guide,
  spelarkort) är kvar.
- **Övningsbanken i admin** (Carl: "så att Haris kan se den i appen och planera
  upp ett pass"). Ny flik Övningar: samma 59 övningar som Excel-filen
  (`python tools/ovningsbank.py --json` → `data/ovningsbank.json`), sök,
  filter (fas, typ, nivå, med film) och filmklippet ur Haris film. Haris väljer
  övningar → Planera pass åt en klient → passet får samtal före, övningarna och
  samtal efter. Från ett pass: "+ Ur övningsbanken" lägger till i det passet.
  Blocket minns övningen (`ovningId`) och kör-läget visar filmklippet.
  **(antagande)** Tidtagningar blir tidtagningsblock och konbanan
  bedömningsblock. Egna övningar i appen finns inte än, de läggs i Excel-filen.
- **Bakgrundshämtningar ritar bara om sidan man är kvar på** (`kvar()` i
  app.js). Annars kunde ett svar som kom efter ⇄ tömma förälderns formulär.

## 2026-10-28 – appen heter CAP

- **Bara "CAP"** (Haris via Carl: "det ska bara stå CAP i stället för CAP
  Online"). Bytt i allt föräldrar och Haris ser: titel, hemskärmsnamn
  (manifest, apple-mobile-web-app-title, iOS CFBundleDisplayName och
  Capacitor appName), texter i appen, sms:en, inloggningssidan bakom länken
  och notisernas rubrik.
- **Kvar som förut**: adresser och tekniska namn (8bitcat.github.io/cap-online,
  bundle-id se.completeathletic.caponline, länkschemat caponline://,
  lagringsnycklarna caponline.v3). Appen i App Store Connect heter fortfarande
  "CAP Online" (tools/asc.py letar efter det namnet). Namnet där byts i
  App Store Connect inför App Store-släppet, och "CAP" kan vara upptaget där.
- **Hemskärmsnamnet i iPhone-appen** byts först med nästa bygge i Codemagic
  (bygge 3). Webben och texterna i appen byts direkt.

## 2026-10-27 – betala med Swish (förifylld länk)

- **Swish Företag med förifylld länk** (Carl: "här är hans swish går det att
  göra en länk så att allt är förifyllt? priset för passet och numret").
  Haris har Swish Företag 123 285 27 62. Det finns inget API för Swish
  Företag, så appen kan inte se vem som betalat. Swish Handel (automatisk
  bekräftelse) kostar bankavgifter och certifikat och väntar tills Haris vill.
- **Länkformatet är Swish eget** (developer.swish.nu → Guides → Generate QR
  codes): `https://app.swish.nu/1/p/sw/?sw=<nr>&amt=<belopp>&msg=<text>`.
  Beloppet har decimalpunkt, meddelandet är URL-kodat med %20 och får bara
  innehålla a–ö, A–Ö, 0–9, mellanslag och `!?(),.-:;` (högst 50 tecken).
  Ingen `cur`, inget `edit`, så belopp och meddelande är låsta. app.swish.nu
  är en universell länk som öppnar Swish-appen direkt. `js/swish.js`.
- **Meddelandet är bokningen**: "CAP Alva Lind 2 nov kl 16.00". Haris ser
  det i sin Swish och vet vilket pass betalningen gäller.
- **Nummer och pris i Admin → Mer → Betalning med Swish** (KV
  `config:betalning`). Swish-knappen visas för föräldrarna först när båda
  finns. Priset låses på bokningen när den görs. **Priset är inte satt**:
  Carl eller Haris skriver det i admin.
- **Föräldern**: priset står på bokningssidan och när platsen hålls. Efter
  bokningen kommer panelen "Tiden är bokad" med **Betala 300 kr med Swish**,
  och samma knapp finns under Mina bokningar. "Jag har swishat" sätter
  `swishad` så att Haris vet att han ska titta.
- **Haris** bockar av med **Markera betald** under Tider eller på klientens
  sida (`betald`), och kan ångra. Föräldern ser då Betald ✓ i stället för
  knappen. Obetalda tidigare pass listas på klientens sida.
- Test: `tools/swish-test.js` mot wrangler dev (24 kontroller).
- **Inte provat på en riktig telefon** att Swish öppnas med beloppet ifyllt.
  Formatet är Swish dokumenterade, och "Prova länken på mobilen" i admin
  gör det enkelt att kolla.

## 2026-10-26 – Övningsbanken (Excel till Haris)

- **En Excel-fil med alla övningar i appen** (Carl: "skapa en excelfil som vi
  kallar övningsbanken … haris ska få filen så han kan fylla på … kolumner så
  vi kan tagga alla videos … planera pass … så läser vi in den sen").
  `docs/Övningsbanken.xlsx` byggs av `tools/ovningsbank.py` ur content.json,
  taggar.json och passmallen i admin. Kolumnnycklarna i `KOLUMNER` är kontraktet
  för den kommande importen: matcha på ID, rader utan ID är nya övningar.
- **Rullistor i stället för fritext** för Typ, Fas, Område, Nivå, Yta, Film och
  Finns film; kryss (x) för utrustning och sällskap; Färdighet, Erfarenhet,
  Position och Plats får flera värden med kommatecken (rullista utan spärr).
  Listorna ligger på fliken Taggar så Haris kan utöka dem.
- **Nivå 1–5 = klientregistrets nivåer** (Bollkompis … Matchvinnare), lägsta
  nivå övningen passar. Befintliga raders färdighet, nivå, sällskap och yta är
  **(antagande)** – Carls/Claudes tolkning av filmerna, Haris granskar.
- Fliken Planera pass räknar ihop tiden mot ett riktmärke (55 min) med
  INDEX/MATCH mot Övningar; formlerna räknas av Excel vid öppning (ingen
  LibreOffice lokalt för förräkning).

## 2026-10-27 – kortare start, resten på spelarkortet

- **Efter inloggningen bara barnets förnamn, efternamn och födelseår** (Carl:
  "sen kan man gå vidare. vill man fylla i mer får man gå till
  spelarkortet"). Knappen heter "Kom igång" och leder till startsidan.
  Position, fot, erfarenhet, drömspelare, svårigheter, mål och frekvens fylls
  i under Spelarkortet → "Fyll i mer" (två steg). Tills dess används
  standardvärden (position "Vet inte än", erfarenhet "Spelat 1–2 år", två
  pass i veckan) och startsidan visar "Fyll i mer om X på spelarkortet".
  `profile.mer` håller reda på om det är gjort.

## 2026-10-26 – två sms: hämta appen, logga in i appen

- **Ingen 46elks** (Carl: "jag vill inte använda 46elks"). Sms:en skickas
  från Haris telefon via "Skicka från min telefon" (Meddelanden öppnas
  ifyllt). Det kostar inget och kräver inget konto. Serverns sms-kod finns
  kvar men är avstängd. Gratisvägen för automatiska sms är en Android-telefon
  med SMS Gateway for Android (avsändaren blir då telefonens nummer); den är
  inte byggd, Carl får välja.
- **Två sms** (Carl: "ingen förälder kommer ha appen, så vi behöver skapa
  ett sms för att hämta appen och ett som man sedan trycker på för att logga
  in när appen är inne i telefonen"). Sms 1: `cap.8bitcat.io/app`. Sms 2:
  `cap.8bitcat.io/k/KOD` och koden i klartext. Båda skickas samtidigt;
  föräldern installerar appen och trycker sedan på länken i sms 2.
- **Länken till appen = eget länkschema** `caponline://` i stället för
  Universal Links, eftersom Associated Domains kräver en ändring på App ID:t
  hos Apple och en ny profil; utan dem skulle bygget fallera. Safari-sidan
  bakom länken har knappen "Öppna CAP Online". Associated Domains är
  förberett på servern och tar bort Safari-sidan när Carl slår på det.
- **Länken fungerar flera gånger** (tidigare engångs med sms): föräldern kan
  råka trycka innan appen är installerad, och ska ändå kunna logga in i
  appen efteråt. Ny länk från Haris gör den gamla ogiltig.
- **Ingen tvingad egen kod** efter länken. Det första föräldern gör är
  barnets namn och födelseår. Egen kod är valfri under Mer.
- **Haris ser var föräldern loggat in** (`inloggad.app`/`inloggad.webb` på
  klienten): "I appen ✓" i listan, annars "Inte i appen än".
- **Hämta appen-länken** pekar på `APP_LANK_IOS` för iPhone. Den är tom tills
  Carl skapar en publik TestFlight-länk (extern testgrupp, Apples
  betagranskning) eller appen finns i App Store. Tills dess visas webbappens
  instruktion för hemskärmen.

## 2026-10-25 – sms-inloggning, CapSwe, barnets namn först

- **Inloggning med mobilnummer och sms-kod** (Carl: "sms-inloggning via
  telefonnummer … skriver man sitt mobilnummer för att logga in och får en
  kod"). Sex siffror, gäller 10 minuter, fem försök, ny kod tidigast efter
  45 s och högst fem i timmen per nummer, 20 per timme per IP. Kod skickas
  bara till nummer som finns i Haris register. När sms-tjänsten är av gäller
  den egna koden (4–6 siffror) som förut, så inget slutar fungera.
- **Haris skickar länken från admin** (Carl: "viktigt är att haris kan skicka
  länken via admin"): Ny kund → "Skicka länken som sms direkt" (ikryssad),
  och på klientsidan "Skicka länken igen". Länken används en gång när sms är
  på; sedan loggar man in med nummer + sms-kod. "Från min telefon" finns kvar
  som gratis reserv. Leveransstatus från 46elks visas per kund.
- **Avsändare CapSwe, tak 25 sms per dygn** (Carl). Taket räknas i svensk tid
  och gäller alla sms (länkar, koder, test). När det är nått får föräldern
  beskedet att försöka i morgon eller be Haris skicka en länk från sin
  telefon.
- **Ingen gratis sms-tjänst kan skicka som "CapSwe"** till svenska nummer
  (sökt 2026-10-25). Gratisalternativen (Textbelt, textbee/Android-gateway)
  skickar från ett vanligt nummer eller bara till USA. **46elks** valdes:
  svenskt, 52 öre per sms-del, ingen månadsavgift, egen avsändartext.
  Välkomst-sms:et hålls till två delar. Ny kostnad → Carl öppnar kontot.
- **Länken leder till "Hämta appen"**: instruktion för hemskärmen i Safari
  och Chrome tills det finns en publik TestFlight-länk eller App Store-länk.
  Den läggs i `APP_LANK_IOS` (wrangler.toml) och kommer då med i sms:et.
- **Man förblir inloggad:** sessionen gäller 400 dagar och förlängs vid varje
  användning. Kallstart med en sparad session går direkt till startsidan i
  stället för "Vem är du?". iOS-appen rensar bara cachen vid start, aldrig
  inloggningen.
- **Det första föräldern gör** (Carl): barnets förnamn, efternamn och
  födelseår (steg 1 i startguiden). Åldern räknas ut ur året. Uppgifterna
  sparas på klienten hos Haris (`PUT /mina/barn`), så Haris kan lägga in en
  kund med bara förälder och nummer.

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
