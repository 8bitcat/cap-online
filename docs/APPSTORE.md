# CAP i App Store – version 1.0.0

Allt som ska in i App Store Connect (ASC) för första App Store-versionen. Texterna är klara att klistra in.
Fält med `[HAKPARENTES]` fylls i innan inlämningen.

- Appen i ASC: **CAP**, Apple ID 6825529179, bundle-id `se.completeathletic.caponline`
- Bygget: Codemagic → cap-online → Start new build → **ios-appstore** (ett nytt bygge som skickas till granskning direkt),
  eller välj ett befintligt TestFlight-bygge i versionen och skicka in för hand (rekommenderas första gången, se checklistan)
- Integritetspolicy: https://8bitcat.github.io/cap-online/integritet.html
- Support: https://8bitcat.github.io/cap-online/support.html
  (kontakt hello@8bitcat.io sedan v1.1.2, samma som Pixelcity. Hjälpsidan har en engelsk del för Apple.
  Organisationsnummer behövs inte för inlämningen)

---

## 1. App Information (gäller alla versioner)

| Fält | Värde |
|---|---|
| Name | `CAP` |
| Subtitle (≤ 30) | `Boka och följ fotbollsträning` (29 tecken) |
| Primary language | Swedish |
| Category, primär | **Sports** (Sport) |
| Category, sekundär | Health & Fitness (Hälsa och träning) |
| Content Rights | No, it does not contain, show, or access third-party content |
| Age Rating | se avsnitt 4 → blir **4+** |
| Made for Kids | **Nej**. Användarna är föräldrarna, inte barnen. Kids-kategorin har mycket hårdare regler. |

## 2. Pricing and Availability

- Price: **Free** (0 kr). Inga köp i appen (In-App Purchases).
- Availability: **Sverige** räcker. Fler länder går att lägga till senare.

## 3. Versionstexterna (1.0.0)

**Promotional Text (≤ 170)**

```
Boka träningspass med Haris, betala med Swish och följ ditt barns utveckling. Nya tider? Du får en notis direkt när de släpps.
```

**Description (≤ 4000)**

```
CAP är appen för familjerna som tränar fotboll med Haris på Complete Athletic Performance.

BOKA PASS
Haris öppnar nya tider vecka för vecka. Du får en notis när tiderna släpps, väljer en ledig tid och bokar med några tryck. Platsen hålls åt dig medan du bekräftar, så ingen annan hinner ta den.

BETALA ENKELT
Betala passet med Swish direkt efter bokningen – Swish öppnas med belopp och meddelande ifyllt. Har ni ett paket med pass eller en pott hos Haris dras passet därifrån i stället, och du ser hela tiden hur mycket som finns kvar.

FÖLJ UTVECKLINGEN
Se barnets nivå, tider från bedömningarna och hur de förbättras över tid. Haris kan dela filmer och anteckningar från passen med er.

TRÄNA SJÄLV
Träningsstigen och övningsbanken med Haris filmer gör det lätt att träna hemma mellan passen. Påminnelser på träningsdagarna hjälper er hålla rytmen.

ALLT PÅ ETT STÄLLE
• Dina bokningar, pass och betalningar
• Historik över pass som lagts in, använts och lämnats tillbaka
• Notiser när Haris öppnar tider eller bokar något åt er

CAP används av Complete Athletic Performances kunder. Haris lägger in er och skickar en inloggningslänk med sms.
```

**Keywords (≤ 100, kommaseparerat, utan mellanslag efter kommat)**

```
fotboll,träning,boka,pass,tränare,barn,ungdom,övningar,teknik,bollkontroll,utveckling,swish
```

| Fält | Värde |
|---|---|
| Support URL | `https://8bitcat.github.io/cap-online/support.html` |
| Marketing URL | (tomt, eller `https://completeathletic.se`) |
| Privacy Policy URL (under App Privacy) | `https://8bitcat.github.io/cap-online/integritet.html` |
| Copyright | `2026 Complete Athletic Performance` |
| Version | **`1.1`** (måste vara exakt samma som bygget: `appVersion` i app/package.json, `1.1` sedan `release.py 1.1.0`. Släpps en ny webbversion före bygget följer den med) |

**Skärmbilder:** iPhone 6,9" – **1320 × 2868** (stående), 3–10 st. Appen är bara för iPhone (TARGETED_DEVICE_FAMILY = 1
från och med nästa bygge), så inga iPad-bilder behövs. Förslag på ordning: 1) Startsidan, 2) Boka (veckan med lediga tider),
3) Betala med Swish / Mina pass, 4) Utveckling (diagrammet), 5) Träningsstigen eller övningsbanken.
Bilderna ska visa påhittade namn, aldrig riktiga barn.

## 4. Age Rating – rekommenderade svar

Alla innehållsfrågor (våld, sex, nakenhet, svordomar, droger, alkohol, tobak, skräck, spel om pengar, tävlingar,
medicinsk information, vuxet innehåll): **None / No**.

| Fråga | Svar | Varför |
|---|---|---|
| Unrestricted Web Access | **No** | Appen visar bara sina egna sidor, ingen fri surfning. |
| User-Generated Content | **No** | Inga användare publicerar något för andra. Haris filmer delas bara med familjen det gäller. |
| Messaging and Chat | **No** | |
| Advertising | **No** | |
| Parental Controls / Age Assurance | **No** | |
| Health or Wellness Topics | **No** | Fotbollsträning, inga råd om kost, vikt eller sjukdom. |
| Gambling / Contests | **No** | |

Resultat: **4+**.

## 5. App Privacy (integritetsetiketten)

**Tracking:** *No, we do not use data for tracking.* Ingen reklam, inga analysverktyg, inget delas med tredje part.

Datatyper som samlas in – alla **Linked to the user**, **inte** använda för tracking, syfte **App Functionality**:

| Kategori i ASC | Datatyp | Vad det är i CAP |
|---|---|---|
| Contact Info | Name | Förälderns namn, barnets för- och efternamn |
| Contact Info | Email Address | Förälderns e-post (frivilligt fält) |
| Contact Info | Phone Number | Förälderns mobilnummer (inloggning) |
| Health & Fitness | Fitness | Nivå, bedömningar och tider (konbanan), träningspass |
| User Content | Photos or Videos | Filmer som Haris spelar in på passen |
| User Content | Audio Data | Ljud som Haris spelar in på passen |
| User Content | Other User Content | Haris anteckningar och planerade pass |
| Purchases | Purchase History | Bokningar, paket, pott, belopp och om det är betalt |
| Identifiers | User ID | Kontots id hos CAP |
| Identifiers | Device ID | Pushkoden för notiser (bara om notiser är tillåtna) |
| Other Data | Other Data Types | Barnets födelseår, position och lag |

Samlas **inte** in: Location, Financial Info (Swish sköts helt i Swish-appen), Browsing/Search History,
Diagnostics, Usage Data för analys, Sensitive Info, Contacts.

## 6. App Review Information

**Sign-in required:** Yes

| Fält | Värde |
|---|---|
| User name | demokontots mobilnummer, se `C:\Users\palss\.secrets\cap-appreview.txt` (står inte i repot) |
| Password | demokontots kod, samma fil |
| Contact | Carl Pålsson, telefon och e-post (fylls i i ASC, inte här) |

**Notes (engelska, klistra in):**

```
CAP is the companion app for the families who train football (soccer) with coach Haris Skenderovic at Complete Athletic Performance in Sweden. The app is in Swedish.

Parents do not sign up themselves: the coach adds each family with the parent's mobile number and sends a one-time code by text message. The parent signs in with the mobile number and the code, and then chooses a password. For review we have created a demo family account that already has a password.

How to sign in:
1. Open the app. The first screen is "Logga in" (Sign in).
2. Enter the mobile number ("Mobilnummer") and password ("Lösenord") from the Sign-in Information fields and tap "Logga in".

What to try:
- "Med Haris" (With Haris, bottom bar): pick a free time slot in an open week and confirm it. The app then offers to pay with Swish, or to use a session from the family's prepaid package/balance.
- "Mer" → "Mina pass" (My sessions): remaining sessions, prepaid balance and the history of sessions added, used and returned.
- "Utveckling" (Progress): the child's level and timed assessments over time.
- Training path and exercise videos for training at home.
- Notifications: the app asks for permission and notifies parents when the coach opens new time slots or books a session for them.
- "Mer" → "Radera mitt konto" (Delete my account) deletes the account and its data.

Payments: The sessions are physical, in-person football training sessions with the coach, consumed outside the app. Payment is made with Swish (the Swedish bank payment app) by opening Swish with the amount prefilled; the app never handles card or bank details. Under guideline 3.1.3(e) (goods and services outside of the app) in-app purchase is not used. There are no digital goods or subscriptions for sale.

The coach signs in on the same screen with his e-mail address and the admin password, and then gets the coach's admin view (client register, time slots, sessions). It is only used by the coach and is not needed to review the parent features.

The app is built and published by Carl Pålsson (8bitcat) on behalf of Complete Athletic Performance, with the owner's permission (see attached letter).
```

**Attachment:** ett kort tillståndsintyg från Haris (se risk 2 nedan), som PDF eller bild.

## 7. Checklista för Carl i App Store Connect

1. **Före allt annat:** ge Claude kontaktmejl och organisationsnummer till Complete Athletic Performance, så läggs de in
   i `integritet.html` och `support.html` (rader märkta `KONTAKT:`) och släpps. Kontrollera att båda sidorna öppnas på mobilen.
2. **Nytt bygge med iPhone-only:** Codemagic → Start new build → **ios-testflight** (bygget får version 1.0).
   Prova det i TestFlight.
3. **App Information:** Subtitle, kategorier, Content Rights, Age Rating (avsnitt 1 och 4).
4. **Pricing and Availability:** Free, Sverige.
5. **App Privacy:** Privacy Policy URL + enkäten enligt avsnitt 5 → **Publish**.
6. **Version 1.1** (iOS App → "+" / Prepare for Submission): Promotional Text, Description, Keywords, Support URL,
   Copyright (avsnitt 3).
7. **Skärmbilder** 6,9" 1320 × 2868 (avsnitt 3): färdiga i `D:\CAPOnline\docs\appstore\` (1-hem … 6-trana-sjalv),
   gjorda med påhittad demodata av `tools/skarmbilder.js`.
8. **Build:** välj bygget från steg 2.
9. **App Review Information:** Sign-in med demokontot, kontaktuppgifter, Notes och tillståndsintyget (avsnitt 6).
10. **Version Release:** *Manually release this version* – då släpper du själv när den är godkänd.
11. **Add for Review → Submit for Review.** Granskningen tar oftast 1–2 dygn.
12. Under granskningen: håll **en vecka öppen med lediga tider**, så att granskaren kan boka. Lämna demokontot orört.
13. Efter godkännandet: **Release this version**. Lägg sedan App Store-länken i `APP_LANK_IOS` (cap-api) så att
    sms:et "Hämta appen" går till App Store.

Nästa gång (uppdateringar av det nativa): Codemagic-workflowet **ios-appstore** bygger och skickar in direkt
(release_type MANUAL). Vanliga webbsläpp behöver ingen ny granskning, eftersom appen laddar webben.

## 8. Risker vid granskningen

1. **4.2 Minimum Functionality (appen laddar webben).** Apple avvisar ibland appar som mest är en webbplats i en ram.
   CAP har push, kamera och mikrofon, länkschema och offlinesida, och det är ett verktyg för bokning och betalning – men
   risken finns. Får vi avslag: lyft fram de nativa delarna i ett svar, eller bygg in en kopia av webben i appen
   (`app/build.mjs` gör redan en reservkopia).
2. **5.2 / 5.1.1 – appen publiceras under Carls konto för Haris företag.** Apple kan fråga om rätten att använda namnet
   och företaget. Bifoga ett kort intyg, t.ex.:
   *"Jag, Haris Skenderovic, Complete Athletic Performance, ger Carl Pålsson (8bitcat) rätt att publicera appen CAP i
   App Store för mitt företags kunder. [Ort, datum, underskrift]."*
   På sikt kan appen flyttas till ett utvecklarkonto i företagets namn (kräver D-U-N-S-nummer, 99 USD/år).
3. **3.2 – appen är bara för ett företags kunder.** Apple kan hänvisa till *Unlisted App Distribution* (appen finns i
   App Store men hittas bara via direktlänk). Det passar CAP bra – ansök då via Apples formulär och använd länken i sms:et.
4. **2.1 – granskaren kommer inte vidare.** Demokontot måste fungera och en vecka med lediga tider måste vara öppen.
   Om Apple vill se tränarvyn: ge inte Haris riktiga lösenord, säg att adminvyn bara är för tränaren (eller skapa ett
   separat granskningslösenord först).
5. **5.1.1(v) – radering av konto.** Knappen *Mer → Radera mitt konto* måste finnas i bygget som granskas
   (den byggs i webben, så den följer med när webben är släppt).
6. **Testknappar och utvecklartext** på notissidan ("Testnotis om 5 sekunder", "python tools\notis.py …", "Du kör
   prototypen …") bör bort eller döljas för föräldrar före inlämningen.
