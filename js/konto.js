// Inloggning (Carl 2026-10-23/25): Haris lägger in familjen med mobilnummer och skickar en länk från admin.
// Föräldern loggar in med sitt mobilnummer och får en engångskod som sms (avsändare CapSwe). Har man väl loggat in
// förblir man inloggad. Utan sms-tjänst: länken låter föräldern välja en egen kod (4–6 siffror), sedan nummer + kod.
import { store } from './store.js?v=d14585a';
import { loggaInMedKod, loggaIn, sattLosen, glomtKod, statusNu } from './api.js?v=d14585a';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const visaTel = t => { if (!t) return ''; let s = String(t); if (s.startsWith('+46')) s = '0' + s.slice(3); const m = /^(0\d{2})(\d{3})(\d{2})(\d{2})$/.exec(s); return m ? `${m[1]}-${m[2]} ${m[3]} ${m[4]}` : s; };
let senast = { telefon: '' };
try { senast.telefon = localStorage.getItem('cap_tel') || ''; } catch { /* ok */ }

// Inloggningen (Carl 2026-11-16): "för att komma in krävs ett login, en snygg login-skärm, man ska kunna logga in
// direkt med en kod från sms:et. Användarnamnet blir ens mobilnummer … det första som ska hända när man loggar in via
// koden är att man sätter ett lösenord. Haris loggar in med sin e-postadress och får då admin-kontot."
const logga = () => `<div class="login-logga"><img src="assets/cap-logo.png" alt="CAP – Complete Athletic Performance"></div>`;
const hero = (rubrik, text) => `
  <section class="hero" style="padding-top:40px">
    <img class="hero-logo" src="assets/cap-logo.png" alt="CAP – Complete Athletic Performance">
    <div class="eyebrow">CAP</div>
    <h1>${rubrik}</h1>
    <p class="lead">${text}</p>
  </section>`;
const losenFalt = (id, namn, etikett, extra = '') => `<div class="field"><label for="${id}">${etikett}</label>
  <div class="losen-rad"><input type="password" id="${id}" name="${namn}" ${extra}><button type="button" class="visa-losen" data-visa="${id}" aria-label="Visa lösenordet">Visa</button></div></div>`;

export function loginPage({ fel = '', anv = senast.telefon, lage = '', info = '' } = {}) {
  const felRad = fel ? `<div class="note warn small" style="margin:0 0 14px">${esc(fel)}</div>` : '';
  const infoRad = info ? `<div class="note small" style="margin:0 0 14px">${esc(info)}</div>` : '';
  if (lage === 'glomt') return `
  <div class="login-skarm">
    ${logga()}
    <section class="login-kort">
      <h1>Glömt lösenordet?</h1>
      <p class="muted small">Skriv ditt mobilnummer. Haris får ett meddelande och skickar ett sms med en ny kod. Logga in med koden och välj ett nytt lösenord.</p>
      ${felRad}${infoRad}
      <form data-form="glomt">
        <div class="field"><label for="gtel">Mobilnummer</label><input type="tel" id="gtel" name="telefon" value="${esc(String(anv).includes('@') ? '' : anv)}" placeholder="070-123 45 67" autocomplete="tel" required></div>
        <button class="btn grad block stor" type="submit">Be om en ny kod</button>
      </form>
      <p class="small" style="margin:14px 0 0;text-align:center"><a href="#/login">‹ Tillbaka till inloggningen</a></p>
    </section>
  </div>`;
  return `
  <div class="login-skarm">
    ${logga()}
    <section class="login-kort">
      <h1>Logga in</h1>
      <p class="muted small" style="margin-top:-4px">Träning, bokning och utveckling hos Haris.</p>
      ${felRad}${infoRad}
      <form data-form="login" autocomplete="on">
        <div class="field"><label for="anv">Mobilnummer</label><input type="text" id="anv" name="anvandare" value="${esc(anv)}" placeholder="070-123 45 67" autocomplete="username" inputmode="tel" autocapitalize="off" autocorrect="off" spellcheck="false" required>
          <button type="button" class="anv-lage" id="anv-lage">Logga in med e-post i stället</button></div>
        ${losenFalt('losen', 'losen', 'Lösenord', 'autocomplete="current-password" required placeholder="Ditt lösenord"')}
        <p class="hint-rad small">Första gången? Skriv <b>koden från sms:et</b> från Haris som lösenord. Sedan väljer du ett eget.</p>
        <button class="btn grad block stor" type="submit">Logga in</button>
      </form>
      <p class="small" style="margin:14px 0 0;text-align:center"><a href="#/login/glomt">Glömt lösenordet?</a></p>
    </section>
    <p class="login-fot small muted">Ny hos Haris? Han lägger in ditt mobilnummer och skickar ett sms med koden.</p>
  </div>`;
}

// Visa/dölj lösenordet, och tangentbordet följer det man skriver (siffror för mobilnummer, bokstäver för e-post)
export function kontoAfterRender(view) {
  view.querySelectorAll('[data-visa]').forEach(b => b.addEventListener('click', () => {
    const f = view.querySelector('#' + b.dataset.visa); if (!f) return;
    const visa = f.type === 'password'; f.type = visa ? 'text' : 'password'; b.textContent = visa ? 'Dölj' : 'Visa';
  }));
  // Haris (2026-11-19): sifferknappsatsen gick inte att byta till bokstäver på iPhone, så han kunde inte skriva sin
  // e-post. Knappen under rutan byter mellan mobilnummer (siffror) och e-post (bokstäver och @).
  const anv = view.querySelector('#anv');
  if (anv) {
    const lab = view.querySelector('label[for=anv]'), knapp = view.querySelector('#anv-lage');
    let epost = /[a-z@]/i.test(anv.value);
    const satt = (fokus = false) => {
      anv.inputMode = epost ? 'email' : 'tel';
      anv.placeholder = epost ? 'namn@exempel.se' : '070-123 45 67';
      if (lab) lab.textContent = epost ? 'E-post' : 'Mobilnummer';
      if (knapp) knapp.textContent = epost ? 'Logga in med mobilnummer i stället' : 'Logga in med e-post i stället';
      if (fokus) { anv.blur(); setTimeout(() => anv.focus(), 30); }   // iPhone byter tangentbord först vid ny fokus
    };
    knapp?.addEventListener('click', () => { epost = !epost; anv.value = ''; satt(true); });
    anv.addEventListener('input', () => { if (!epost && /[a-z@]/i.test(anv.value)) { epost = true; satt(); } });
    satt();
  }
}
export function kontoStop() { /* inget att stoppa */ }

// Välj lösenord: direkt efter inloggning med sms-koden (måste), eller Byt lösenord under Mer
export function losenPage({ fel = '' } = {}) {
  const s = store.session, u = s?.user;
  if (!u) return null;
  const maste = !!s.nyttLosen;
  return `
  <div class="login-skarm">
    ${logga()}
    <section class="login-kort">
      <h1>${maste ? 'Välj ditt lösenord' : 'Byt lösenord'}</h1>
      <p class="muted small">${maste ? `Du loggade in med koden från sms:et. Välj nu ett eget lösenord. Nästa gång loggar du in med ditt mobilnummer <b>${esc(visaTel(u.telefon))}</b> och lösenordet.` : 'Minst sex tecken. Det gamla slutar gälla direkt.'}</p>
      ${fel ? `<div class="note warn small" style="margin:0 0 14px">${esc(fel)}</div>` : ''}
      <form data-form="losen">
        <input type="text" name="anvandare" value="${esc(visaTel(u.telefon))}" autocomplete="username" hidden>
        ${losenFalt('losen1', 'losen', 'Nytt lösenord', 'minlength="6" required autocomplete="new-password" placeholder="Minst sex tecken"')}
        ${losenFalt('losen2', 'losen2', 'Samma lösenord igen', 'minlength="6" required autocomplete="new-password"')}
        <button class="btn grad block stor" type="submit">${maste ? 'Spara och fortsätt' : 'Byt lösenord'}</button>
      </form>
      ${maste ? '' : '<p class="small" style="margin:14px 0 0;text-align:center"><a href="#/mer">Avbryt</a></p>'}
    </section>
  </div>`;
}

// Hämta appen: länken i sms:et leder hit efter inloggningen (Carl: "länken till det numret, för att ladda ner appen")
export function appPage() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const native = !!window.Capacitor?.isNativePlatform?.();
  const u = store.session?.user;
  const tel = u?.telefon ? visaTel(u.telefon) : '';
  const { appLank, sms } = statusNu();
  const loggaIn = `Logga in med ditt mobilnummer${tel ? ` <b>${esc(tel)}</b>` : ''}${sms ? ', du får en kod som sms' : ' och koden du valde'}.`;
  let kropp;
  if (native) kropp = `<div class="panel brand"><h3>Du har redan appen</h3><p class="small muted" style="margin:0">Du är inloggad och förblir det på den här telefonen.</p></div>`;
  else if (ios && appLank) kropp = `<div class="panel brand"><ol class="steg-lista"><li><a class="btn grad block" href="${esc(appLank)}">Hämta CAP till iPhone</a></li><li>Öppna appen. ${loggaIn}</li></ol></div>`;
  else if (ios) kropp = `<div class="panel brand"><h3>Lägg appen på hemskärmen</h3><ol class="steg-lista"><li>Tryck på <b>Dela</b> <span class="ikon-dela">⬆︎</span> längst ner i Safari.</li><li>Välj <b>Lägg till på hemskärmen</b> och tryck <b>Lägg till</b>.</li><li>Öppna CAP från hemskärmen. Du är redan inloggad.</li></ol></div>`;
  else if (android) kropp = `<div class="panel brand"><h3>Installera appen</h3>${window.__capInstall ? '<button class="btn grad block" data-action="app-installera">Installera CAP</button>' : '<ol class="steg-lista"><li>Tryck på <b>⋮</b> uppe till höger i Chrome.</li><li>Välj <b>Installera app</b> eller <b>Lägg till på startskärmen</b>.</li><li>Öppna CAP från startskärmen. Du är redan inloggad.</li></ol>'}</div>`;
  else kropp = `<div class="panel brand"><h3>Öppna på mobilen</h3><p class="small muted" style="margin:0">Appen är gjord för telefonen. Öppna länken i sms:et på mobilen${appLank ? ' eller hämta appen där' : ''}. Här i datorn fungerar den också i webbläsaren.</p></div>`;
  return `
  ${hero('Hämta appen', native ? '' : 'Lägg CAP på telefonen, så är den ett tryck bort.')}
  <section>${kropp}</section>
  <section class="btn-row"><a class="btn secondary block" href="#/">${native ? 'Till appen' : 'Fortsätt i webbläsaren'} ›</a></section>`;
}

// #/k/KOD – länken ur sms:et loggar in direkt (i appen eller i webbläsaren), och sedan väljer man lösenord
export async function loggaInViaLank(kod, { toast, go }) {
  const r = await loggaInMedKod(kod);
  if (!r.ok) { toast(r.fel || 'Länken fungerade inte'); return go('/login'); }
  efterInloggning(r.user, { toast, tyst: true });
  go(r.nyttLosen ? '/losen' : '/');
}

export function efterInloggning(user, { toast, tyst = false } = {}) {
  store.guest = false;
  store.proto = 'app';
  if (user?.telefon) { senast.telefon = visaTel(user.telefon); try { localStorage.setItem('cap_tel', senast.telefon); } catch { /* ok */ } }
  // registrets uppgifter förifyller startguiden (barnets namn, efternamn, födelseår, position)
  if (!store.profile) {
    const d = { ...store.draft };
    if (user?.barn && !d.name) d.name = user.barn;
    if (user?.efternamn && !d.efternamn) d.efternamn = user.efternamn;
    if (user?.fodd && !d.fodd) d.fodd = String(user.fodd);
    if (user?.position && !d.position) d.position = user.position;
    store.draft = d;
  }
  if (!tyst) toast(`Välkommen${user?.namn ? ', ' + user.namn : ''}!`);
}

export async function kontoAction() { return false; }

// Inloggningsformulären. render(html) ritar om sidan med fel eller besked.
export async function kontoSubmit(kind, f, fd, { toast, go, render }) {
  const btn = f.querySelector('button[type=submit]'); const txt = btn.textContent; btn.disabled = true; btn.textContent = kind === 'losen' ? 'Sparar…' : 'Loggar in…';
  const ater = () => { btn.disabled = false; btn.textContent = txt; };
  if (kind === 'login') {
    const anv = String(fd.get('anvandare') || '').trim();
    const r = await loggaIn(anv, fd.get('losen'));
    if (!r.ok) { ater(); render(loginPage({ anv, fel: r.fel || 'Gick inte att logga in' })); return; }
    if (r.admin) { senast.telefon = anv; try { localStorage.setItem('cap_tel', anv); } catch { /* ok */ } toast('Välkommen, Haris!'); go('/admin/idag'); return; }
    efterInloggning(r.user, { toast, tyst: !!r.nyttLosen });
    go(r.nyttLosen ? '/losen' : '/'); return;
  }
  if (kind === 'glomt') {
    const telefon = fd.get('telefon');
    const r = await glomtKod(telefon);
    ater();
    if (!r.ok) { render(loginPage({ lage: 'glomt', anv: telefon, fel: r.fel || 'Gick inte' })); return; }
    senast.telefon = telefon; try { localStorage.setItem('cap_tel', telefon); } catch { /* ok */ }
    render(loginPage({ anv: telefon, info: r.meddelande || 'En ny kod är på väg.' })); return;
  }
  if (kind === 'losen') {
    const l1 = String(fd.get('losen') || ''), l2 = String(fd.get('losen2') || '');
    if (l1.length < 6) { ater(); render(losenPage({ fel: 'Lösenordet ska vara minst sex tecken.' })); return; }
    if (l1 !== l2) { ater(); render(losenPage({ fel: 'Lösenorden är inte lika. Skriv samma två gånger.' })); return; }
    const forsta = !!store.session?.nyttLosen;
    const r = await sattLosen(l1);
    if (!r.ok) { ater(); render(losenPage({ fel: r.fel || 'Gick inte att spara lösenordet' })); return; }
    toast(forsta ? 'Lösenordet är sparat. Välkommen till CAP!' : 'Lösenordet är bytt');
    go(!store.profile ? '/start/1' : forsta && !store.notiser?.intro ? '/kom-igang' : '/'); return;
  }
  ater();
}

export function kontoRad() {
  const s = store.session;
  if (s?.user) return `<span class="small muted">Inloggad som <b>${esc(s.user.telefon ? visaTel(s.user.telefon) : s.user.email)}</b></span> · <a data-action="logga-ut" href="#/login">Logga ut</a>`;
  return '';
}
