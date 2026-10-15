# Beslut – CAP Online

Loggbok över vägval. Nyast överst. Antaganden som Carl eller Haris inte
bekräftat är markerade **(antagande)**.

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
- **Hakis adminvy** finns inte i V0.1 – innehållet redigeras i
  `data/content.json`.
