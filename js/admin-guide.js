// Guiden i appen (Carl 2026-11-27: "kan vi lägga in guiden i appen, så att man lätt hittar den och kan välja vad man
// vill göra? lägg den under mer överst"). Samma innehåll som Haris guide-artefakt «På kundens sida». Bilderna ligger i
// assets/guide/ och kommer från testkontot (Sara, Ali, Farmor Eva, Alva och Leo), inga riktiga kunder.
// Nytt ämne: lägg till ett objekt i AMNEN och bilderna i assets/guide/.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const OPPNA = (text, alt = 'Listan Klienter med Alva Lind markerad') => ({ rubrik: 'Öppna kunden', text, bild: 'h1-klienter.jpg', alt });

const AMNEN = [
  {
    id: 'staende', ikon: '🔁', titel: 'Stående tid', kort: 'Samma tid varje vecka, bokas av sig själv.',
    intro: 'Har en kund samma tid varje vecka? Lägg in den som en stående tid. Då bokas kunden in varje vecka innan veckan öppnas för andra, så du slipper boka själv och ingen annan hinner ta tiden.',
    steg: [
      OPPNA('Gå till <b>Klienter</b> och tryck på barnet som ska ha tiden <span class="guide-gul">(gul ram)</span>.'),
      { rubrik: 'Välj dag och tid', text: 'Scrolla ner till <b>Stående tider</b>. Välj <b>dag</b> och skriv när passet <b>börjar</b>, precis som tiden står under Tider. Tryck <b>Lägg till stående tid</b>.', bild: 't1-valj.jpg', alt: 'Rutan Stående tider med torsdag och 17:30 ifyllda' },
      { rubrik: 'Se vad som bokades', text: 'Tiden står i listan, till exempel <b>Varje torsdag 17:30</b>. Veckor du redan har lagt ut bokas direkt, och under <b>Bokad</b> ser du vilka. <b>Kunde inte bokas</b> betyder att veckan saknar den tiden eller att någon annan redan har bokat den.', bild: 't2-bokad.jpg', alt: 'Varje torsdag 17:30, bokad två veckor' },
      { rubrik: 'Nya veckor bokas av sig själva', text: 'När du lägger ut eller kopierar tiderna för en ny vecka bokas kunden in direkt, innan du öppnar veckan. Under <b>Tider</b> står passet som <b>Bokad … av Haris</b>.', bild: 't3-ny-vecka.jpg', alt: 'Tider: torsdag 17:30 bokad av Alva, av Haris' },
    ],
    bra: [
      '<b>Tiden måste finnas i veckan.</b> Kunden bokas bara in om veckan har ett pass som börjar just då. Har du en annan tid den veckan bokas inget.',
      '<b>Betalning:</b> som när du bokar åt kunden. Passet dras ur paketet, annars ur potten, annars betalar föräldern med Swish.',
      '<b>Föräldern får en notis</b>, «Er stående tid är bokad», för varje vecka som bokas.',
      '<b>En vecka de inte kan:</b> avboka passet som vanligt, du eller föräldern. Den veckan bokas inte om, och nästa vecka bokas som vanligt. Listan visar «Avbokad vecka …».',
      '<b>Sluta med tiden:</b> tryck <b>✕</b> och sedan <b>Ta bort?</b>. Pass som redan är bokade ligger kvar, så avboka dem under Tider om de inte ska vara kvar.',
    ],
  },
  {
    id: 'foralder', ikon: '👤', titel: 'Lägg till förälder', kort: 'Mamma och pappa på samma konto.',
    intro: 'När mamma och pappa båda vill följa barnet lägger du till det andra numret. Föräldern får en egen kod och väljer sedan ett eget lösenord. Bra för dem som inte är så tekniska.',
    steg: [
      OPPNA('Gå till <b>Klienter</b> och tryck på barnet <span class="guide-gul">(gul ram)</span>. Har familjen syskon går det bra att välja vilket av barnen som helst.'),
      { rubrik: 'Skriv namn och mobil', text: 'Scrolla ner till <b>Föräldrar på kontot</b>. Skriv förälderns <b>namn</b> och <b>mobilnummer</b> och tryck <b>Lägg till förälder</b>.', bild: 'h2-lagg-till.jpg', alt: 'Föräldrar på kontot med namn och mobil ifyllda' },
      { rubrik: 'Skicka koden', text: 'Nu står förälderns kod i rutan. Tryck <b>Skicka sms från min telefon</b>. Meddelanden öppnas med ett färdigt sms med länken till appen och koden, och du trycker skicka.', bild: 'h3-skicka.jpg', alt: 'Rutan med koden och knappen Skicka sms från min telefon' },
      { rubrik: 'Följ upp', text: 'Under <b>Föräldrar på kontot</b> ser du om föräldern har loggat in och valt lösenord. Har hen tappat bort koden trycker du <b>Ny kod</b>. Med <b>✕</b> tar du bort föräldern från kontot.', bild: 'h4-lista.jpg', alt: 'Listan över föräldrar med status, Ny kod och ta bort' },
    ],
    bra: [
      '<b>Förälderns inloggning:</b> hen skriver sitt eget mobilnummer och koden där det står Lösenord, och väljer sedan ett eget lösenord.',
      '<b>Samma konto:</b> båda ser samma barn, bokningar, betalningar och spelarkort, och båda får notiserna.',
      '<b>Ett nummer, ett konto:</b> ett mobilnummer kan bara finnas på ett konto. Appen säger till om numret redan används.',
      '<b>Föräldrarna kan göra det själva</b> under Inställningar → Föräldrar på kontot. Du får en notis när någon bjuder in.',
    ],
  },
  {
    id: 'syskon', ikon: '👧', titel: 'Lägg till syskon', kort: 'Fler barn på samma konto, till exempel tvillingar.',
    intro: 'Har föräldern fler barn som tränar hos dig, till exempel tvillingar? Lägg till syskonet på samma konto. Föräldern loggar in som vanligt och ser båda barnen, och varje barn får en egen nivå och egna resultat.',
    steg: [
      OPPNA('Gå till <b>Klienter</b> och tryck på barnet som redan finns <span class="guide-gul">(gul ram)</span>.'),
      { rubrik: 'Tryck Lägg till syskon', text: 'Scrolla ner till <b>Syskon</b> och tryck på <b>+ Lägg till syskon</b>.', bild: 's1-syskon.jpg', alt: 'Rutan Syskon med knappen Lägg till syskon' },
      { rubrik: 'Skriv namn och födelseår', text: 'Skriv syskonets <b>förnamn</b>. Efternamnet är redan ifyllt. Välj <b>födelseår</b> och tryck <b>Lägg till syskonet</b>.', bild: 's2-fyll-i.jpg', alt: 'Formuläret med förnamnet Leo ifyllt' },
      { rubrik: 'Klart', text: 'Syskonet står under <b>Syskon</b> och har en egen sida i Klienter. Föräldern behöver inte göra något, hen ser båda barnen nästa gång appen öppnas.', bild: 's3-klart.jpg', alt: 'Rutan Syskon visar nu Leo Lind' },
    ],
    bra: [
      '<b>Samma nummer:</b> skriver du in ett mobilnummer som redan finns under Ny kund föreslår appen att lägga till ett syskon i stället.',
      '<b>Gemensamt:</b> inloggning, bokningar, pris, paket och pott gäller hela familjen. Priset sätter du på det första barnets sida.',
      '<b>Ett pass, flera barn:</b> föräldern kryssar i vilka barn som kommer när hen bokar. Passet kostar samma oavsett hur många barn som kommer.',
      '<b>Föräldrarna kan göra det själva</b> under Inställningar → Barn på kontot. Du får en notis när ett syskon läggs till.',
    ],
  },
];

// Rutan överst under Mer: välj vad du vill göra
export function guidePanel() {
  return `<section class="panel guide-val">
    <div class="section-head"><h3>📖 Hur gör jag?</h3><a class="small" href="#/admin/guide">Guiden ›</a></div>
    <p class="small muted" style="margin:0 0 10px">Välj vad du vill göra, så visar guiden steg för steg med bilder.</p>
    <ul class="list">${AMNEN.map(a => `<li><a class="row guide-rad" href="#/admin/guide/${a.id}"><span class="guide-ikon" aria-hidden="true">${a.ikon}</span><span class="grow"><b>${esc(a.titel)}</b><div class="small muted">${esc(a.kort)}</div></span><span class="muted" aria-hidden="true">›</span></a></li>`).join('')}</ul>
  </section>`;
}

export function guideView(id) {
  const a = AMNEN.find(x => x.id === id);
  const flikar = `<div class="chips">${AMNEN.map(x => `<a class="chip ${a && x.id === a.id ? 'brand on' : ''}" href="#/admin/guide/${x.id}">${x.ikon} ${esc(x.titel)}</a>`).join('')}</div>`;
  const topp = `<section>
    <a class="back" href="#/admin/mer">‹ Mer</a>
    <div class="eyebrow">Guide</div><h1 style="margin:0">${a ? esc(a.titel) : 'Hur gör jag?'}</h1>
    <p class="small muted">${a ? 'Allt gör du på kundens sida under Klienter.' : 'Välj vad du vill göra.'}</p>
    ${flikar}
  </section>`;
  if (!a) return topp + guidePanel().replace('<a class="small" href="#/admin/guide">Guiden ›</a>', '');
  return `${topp}
  <p class="muted" style="margin:0 0 6px">${esc(a.intro)}</p>
  <ol class="guide-steg">${a.steg.map(s => `<li>
    <div class="guide-text"><h3>${esc(s.rubrik)}</h3><p>${s.text}</p></div>
    <img src="assets/guide/${s.bild}" alt="${esc(s.alt)}" width="390" height="664" loading="lazy">
  </li>`).join('')}</ol>
  <section class="panel"><h3>Bra att veta</h3><ul class="small guide-bra">${a.bra.map(t => `<li>${t}</li>`).join('')}</ul></section>
  <p class="small muted" style="text-align:center">Bilderna kommer från ett testkonto. Frågor om appen till Carl.</p>`;
}
