// Inloggning (Carl 2026-10-23/25): Haris lägger in familjen med mobilnummer och skickar en länk från admin.
// Föräldern loggar in med sitt mobilnummer och får en engångskod som sms (avsändare CapSwe). Har man väl loggat in
// förblir man inloggad. Utan sms-tjänst: länken låter föräldern välja en egen kod (4–6 siffror), sedan nummer + kod.
import { store } from './store.js';
import { loggaInMedKod, loggaInMedTelefon, sattPin, glomtKod, smsBeKod, smsVerifiera, statusNu } from './api.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const visaTel = t => { if (!t) return ''; let s = String(t); if (s.startsWith('+46')) s = '0' + s.slice(3); const m = /^(0\d{2})(\d{3})(\d{2})(\d{2})$/.exec(s); return m ? `${m[1]}-${m[2]} ${m[3]} ${m[4]}` : s; };
let senast = { telefon: '' };
try { senast.telefon = localStorage.getItem('cap_tel') || ''; } catch { /* ok */ }
let smsSteg = null; // { telefon, skickad, vanta } medan föräldern väntar på koden
let tick = null;

const hero = (rubrik, text) => `
  <section class="hero" style="padding-top:40px">
    <img class="hero-logo" src="assets/cap-logo.png" alt="CAP – Complete Athletic Performance">
    <div class="eyebrow">CAP Online</div>
    <h1>${rubrik}</h1>
    <p class="lead">${text}</p>
  </section>`;
const nyHos = () => `
  <section class="panel">
    <h3>Ny hos Haris?</h3>
    <p class="small muted" style="margin:0">Haris lägger in ert mobilnummer och skickar en länk. Sedan loggar du in med numret. <a href="#/login/kod">Har du en kod med bokstäver?</a> · <a data-action="gast" href="#/">Prova utan konto</a></p>
  </section>
  <p class="small muted" style="text-align:center;margin-top:24px"><a href="#/admin">Admin</a> · för Haris och Carl</p>`;
const kodFalt = (namn, etikett, extra = '') => `<div class="field"><label for="${namn}">${etikett}</label><input type="password" id="${namn}" name="${namn === 'pin2' ? 'pin2' : 'pin'}" inputmode="numeric" pattern="[0-9]*" maxlength="6" ${extra} style="font-size:22px;letter-spacing:.3em;text-align:center;font-weight:700"></div>`;

export function loginPage({ fel = '', telefon = senast.telefon, lage = '', kod = '', info = '' } = {}) {
  const felRad = fel ? `<div class="note warn small" style="margin:0 0 12px">${esc(fel)}</div>` : '';
  const infoRad = info ? `<div class="note small" style="margin:0 0 12px">${esc(info)}</div>` : '';
  const sms = statusNu().sms;
  if (lage === 'glomt') return `
  ${hero('Glömt koden?', 'Skriv ditt mobilnummer så får du en ny länk där du väljer en ny kod.')}
  <section class="panel">
    ${felRad}${infoRad}
    <form data-form="glomt">
      <div class="field"><label for="gtel">Mobilnummer</label><input type="tel" id="gtel" name="telefon" value="${esc(telefon)}" placeholder="070-123 45 67" autocomplete="tel" required></div>
      <button class="btn grad block" type="submit">Skicka ny länk</button>
    </form>
    <p class="small muted" style="margin:12px 0 0"><a href="#/login">‹ Tillbaka till inloggningen</a></p>
  </section>`;
  if (lage === 'kod') return `
  ${hero('Kod från Haris', 'Har du fått en kod med sex tecken? Skriv in den här. Har du fått en länk räcker det att öppna den.')}
  <section class="panel">
    ${felRad}
    <form data-form="kod">
      <div class="field">
        <label for="kod">Din kod</label>
        <input type="text" id="kod" name="kod" value="${esc(kod)}" placeholder="T.ex. ABC-234" autocapitalize="characters" spellcheck="false" maxlength="8" style="font-size:22px;letter-spacing:.2em;text-align:center;font-weight:700">
      </div>
      <button class="btn grad block" type="submit">Fortsätt</button>
    </form>
    <p class="small muted" style="margin:12px 0 0"><a href="#/login">‹ Logga in med mobilnummer i stället</a></p>
  </section>`;

  // Sms-inloggning: steg 2, skriv koden
  if (sms && lage !== 'pin' && smsSteg) return `
  ${hero('Skriv koden', `Vi skickade en kod med sex siffror till <b>${esc(visaTel(smsSteg.telefon) || smsSteg.telefon)}</b>. Den kommer från CapSwe.`)}
  <section class="panel">
    ${felRad}${infoRad}
    <form data-form="sms-kod">
      <div class="field"><label for="smskod">Kod från sms:et</label><input type="text" id="smskod" name="kod" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" required placeholder="••••••" style="font-size:26px;letter-spacing:.4em;text-align:center;font-weight:800"></div>
      <button class="btn grad block" type="submit">Logga in</button>
    </form>
    <div class="btn-row two" style="margin-bottom:0">
      <button class="btn secondary" data-action="sms-ny" id="smsNy" disabled>Skicka ny kod <span id="smsVanta"></span></button>
      <button class="btn secondary" data-action="sms-andra">Ändra nummer</button>
    </div>
  </section>`;
  // Sms-inloggning: steg 1, mobilnumret
  if (sms && lage !== 'pin') return `
  ${hero('Välkommen', 'Logga in med ditt mobilnummer. Du får en kod som sms, och sedan är du inloggad på den här telefonen.')}
  <section class="panel">
    ${felRad}${infoRad}
    <form data-form="sms-skicka">
      <div class="field"><label for="stel">Mobilnummer</label><input type="tel" id="stel" name="telefon" value="${esc(telefon)}" placeholder="070-123 45 67" autocomplete="tel" required></div>
      <button class="btn grad block" type="submit">Skicka kod</button>
    </form>
    <p class="small muted" style="margin:12px 0 0;text-align:center"><a href="#/login/pin">Har du valt en egen kod? Logga in med den</a></p>
  </section>
  ${nyHos()}`;
  // Utan sms: mobilnummer + egen kod
  return `
  ${hero('Välkommen', 'Logga in med ditt mobilnummer och koden du valde. Första gången: öppna länken du fått av Haris.')}
  <section class="panel">
    ${felRad}${infoRad}
    <form data-form="login-tel">
      <div class="field"><label for="ltel">Mobilnummer</label><input type="tel" id="ltel" name="telefon" value="${esc(telefon)}" placeholder="070-123 45 67" autocomplete="tel" required></div>
      ${kodFalt('lpin', 'Din kod', 'placeholder="4–6 siffror" autocomplete="current-password" required')}
      <button class="btn grad block" type="submit">Logga in</button>
    </form>
    <p class="small" style="margin:12px 0 0;text-align:center">${sms ? '<a href="#/login">‹ Logga in med sms-kod</a> · ' : ''}<a href="#/login/glomt">Glömt koden?</a></p>
  </section>
  ${nyHos()}`;
}

// Väntetiden innan "Skicka ny kod" går att trycka, och att koden skickas så fort sex siffror skrivits (autofyll)
export function kontoAfterRender(view, submit) {
  clearInterval(tick);
  const knapp = view.querySelector('#smsNy');
  if (knapp && smsSteg) {
    const draw = () => {
      const kvar = Math.max(0, Math.ceil((smsSteg.skickad + (smsSteg.vanta || 45) * 1000 - Date.now()) / 1000));
      const s = view.querySelector('#smsVanta'); if (s) s.textContent = kvar ? `(${kvar})` : '';
      knapp.disabled = kvar > 0;
      if (!kvar) clearInterval(tick);
    };
    draw(); tick = setInterval(draw, 500);
  }
  const falt = view.querySelector('#smskod');
  if (falt) {
    setTimeout(() => falt.focus(), 50);
    falt.addEventListener('input', () => { const v = falt.value.replace(/\D/g, ''); if (v !== falt.value) falt.value = v; if (v.length === 6) falt.form.requestSubmit(); });
  }
}
export function kontoStop() { clearInterval(tick); }

// Välj (ny) egen kod efter länken, eller byt kod under Mer (bara när sms är av)
export function pinPage({ fel = '' } = {}) {
  const u = store.session?.user;
  if (!u) return null;
  const forsta = !u.harPin;
  return `
  ${hero(forsta ? `Hej${u.namn ? ' ' + esc(u.namn) : ''}!` : 'Välj en ny kod', forsta ? `Välj en kod med fyra till sex siffror. Sedan loggar du in med <b>${esc(visaTel(u.telefon))}</b> och koden.` : 'Fyra till sex siffror. Den gamla slutar gälla direkt.')}
  <section class="panel">
    ${fel ? `<div class="note warn small" style="margin:0 0 12px">${esc(fel)}</div>` : ''}
    <form data-form="pin">
      ${kodFalt('pin1', 'Kod', 'minlength="4" required autocomplete="new-password"')}
      ${kodFalt('pin2', 'Samma kod igen', 'minlength="4" required autocomplete="new-password"')}
      <button class="btn grad block" type="submit">${forsta ? 'Spara koden och börja' : 'Byt kod'}</button>
    </form>
    ${forsta ? '' : '<p class="small muted" style="margin:12px 0 0;text-align:center"><a href="#/mer">Avbryt</a></p>'}
  </section>`;
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
  else if (ios && appLank) kropp = `<div class="panel brand"><ol class="steg-lista"><li><a class="btn grad block" href="${esc(appLank)}">Hämta CAP Online till iPhone</a></li><li>Öppna appen. ${loggaIn}</li></ol></div>`;
  else if (ios) kropp = `<div class="panel brand"><h3>Lägg appen på hemskärmen</h3><ol class="steg-lista"><li>Tryck på <b>Dela</b> <span class="ikon-dela">⬆︎</span> längst ner i Safari.</li><li>Välj <b>Lägg till på hemskärmen</b> och tryck <b>Lägg till</b>.</li><li>Öppna CAP Online från hemskärmen. Du är redan inloggad.</li></ol></div>`;
  else if (android) kropp = `<div class="panel brand"><h3>Installera appen</h3>${window.__capInstall ? '<button class="btn grad block" data-action="app-installera">Installera CAP Online</button>' : '<ol class="steg-lista"><li>Tryck på <b>⋮</b> uppe till höger i Chrome.</li><li>Välj <b>Installera app</b> eller <b>Lägg till på startskärmen</b>.</li><li>Öppna CAP Online från startskärmen. Du är redan inloggad.</li></ol>'}</div>`;
  else kropp = `<div class="panel brand"><h3>Öppna på mobilen</h3><p class="small muted" style="margin:0">Appen är gjord för telefonen. Öppna länken i sms:et på mobilen${appLank ? ' eller hämta appen där' : ''}. Här i datorn fungerar den också i webbläsaren.</p></div>`;
  return `
  ${hero('Hämta appen', native ? '' : 'Lägg CAP Online på telefonen, så är den ett tryck bort.')}
  <section>${kropp}</section>
  <section class="btn-row"><a class="btn secondary block" href="#/">${native ? 'Till appen' : 'Fortsätt i webbläsaren'} ›</a></section>`;
}

// #/k/KOD – länken ur sms:et loggar in direkt; utan sms väljer man egen kod, annars visas Hämta appen
export async function loggaInViaLank(kod, { toast, go }) {
  const r = await loggaInMedKod(kod);
  if (!r.ok) { toast(r.fel || 'Länken fungerade inte'); return go('/login'); }
  efterInloggning(r.user, { toast, tyst: !!r.valjPin });
  const native = !!window.Capacitor?.isNativePlatform?.();
  go(r.valjPin ? '/pin' : native ? '/' : '/app');
}

export function efterInloggning(user, { toast, tyst = false } = {}) {
  store.guest = false;
  store.proto = 'app';
  smsSteg = null;
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

// Inloggningens knappar som inte är formulär
export async function kontoAction(action, el, { toast, render }) {
  if (action === 'sms-andra') { smsSteg = null; render(loginPage()); return true; }
  if (action === 'sms-ny') {
    if (!smsSteg) return true;
    el.disabled = true;
    const r = await smsBeKod(smsSteg.telefon);
    if (!r.ok) { render(loginPage({ fel: r.fel || 'Gick inte att skicka' })); return true; }
    smsSteg = { ...smsSteg, skickad: Date.now(), vanta: r.vantaSek || 45 };
    render(loginPage({ info: 'En ny kod är skickad.' })); return true;
  }
  return false;
}

// Inloggningsformulären. render(html) ritar om sidan med fel eller besked.
export async function kontoSubmit(kind, f, fd, { toast, go, render }) {
  const btn = f.querySelector('button[type=submit]'); const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Kontrollerar…';
  const ater = () => { btn.disabled = false; btn.textContent = txt; };
  if (kind === 'sms-skicka') {
    const telefon = fd.get('telefon');
    const r = await smsBeKod(telefon);
    if (!r.ok) { ater(); render(loginPage({ telefon, fel: r.fel || 'Gick inte att skicka koden' })); return; }
    senast.telefon = telefon; try { localStorage.setItem('cap_tel', telefon); } catch { /* ok */ }
    smsSteg = { telefon, skickad: Date.now(), vanta: r.vantaSek || 45 };
    render(loginPage()); return;
  }
  if (kind === 'sms-kod') {
    const r = await smsVerifiera(smsSteg?.telefon || senast.telefon, fd.get('kod'));
    if (!r.ok) { ater(); render(loginPage({ fel: r.fel || 'Fel kod' })); return; }
    efterInloggning(r.user, { toast }); go('/'); return;
  }
  if (kind === 'login-tel') {
    const telefon = fd.get('telefon');
    const r = await loggaInMedTelefon(telefon, fd.get('pin'));
    if (!r.ok) { ater(); render(loginPage({ lage: 'pin', telefon, fel: r.fel || 'Gick inte att logga in' })); return; }
    efterInloggning(r.user, { toast }); go(r.user.harPin || statusNu().sms ? '/' : '/pin'); return;
  }
  if (kind === 'glomt') {
    const telefon = fd.get('telefon');
    const r = await glomtKod(telefon);
    ater();
    if (!r.ok) { render(loginPage({ lage: 'glomt', telefon, fel: r.fel || 'Gick inte' })); return; }
    senast.telefon = telefon; try { localStorage.setItem('cap_tel', telefon); } catch { /* ok */ }
    render(loginPage({ lage: 'pin', telefon, info: r.meddelande || 'En ny länk är på väg.' })); return;
  }
  if (kind === 'kod') {
    const r = await loggaInMedKod(fd.get('kod'));
    if (!r.ok) { ater(); render(loginPage({ lage: 'kod', kod: fd.get('kod'), fel: r.fel || 'Koden fungerade inte' })); return; }
    efterInloggning(r.user, { toast, tyst: !!r.valjPin }); go(r.valjPin ? '/pin' : '/'); return;
  }
  if (kind === 'pin') {
    const pin = String(fd.get('pin') || ''), pin2 = String(fd.get('pin2') || '');
    if (!/^\d{4,6}$/.test(pin)) { ater(); render(pinPage({ fel: 'Koden ska vara fyra till sex siffror.' })); return; }
    if (pin !== pin2) { ater(); render(pinPage({ fel: 'Koderna är inte lika, skriv samma kod två gånger.' })); return; }
    const r = await sattPin(pin);
    if (!r.ok) { ater(); render(pinPage({ fel: r.fel || 'Gick inte att spara koden' })); return; }
    toast('Koden är sparad. Logga in med mobilnumret och koden nästa gång.');
    go(store.profile ? '/' : '/start/1'); return;
  }
  ater();
}

export function kontoRad() {
  const s = store.session;
  if (s?.user) return `<span class="small muted">Inloggad som <b>${esc(s.user.telefon ? visaTel(s.user.telefon) : s.user.email)}</b></span> · <a data-action="logga-ut" href="#/login">Logga ut</a>`;
  if (store.guest) return `<span class="small muted">Du provar utan konto.</span> · <a href="#/login">Logga in</a>`;
  return '';
}
