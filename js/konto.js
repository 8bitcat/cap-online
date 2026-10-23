// Inloggning (Carl 2026-10-23: "logga in med telefonnummer … sms med länken … glömt lösenord skickar man bara
// till telefonnumret"). Haris lägger in familjen i registret och skickar en länk. Länken loggar in och låter
// föräldern välja en kod (4–6 siffror). Sedan: mobilnummer + kod. Glömt koden → ny länk till numret.
import { store } from './store.js?v=baa7cf7';
import { loggaInMedKod, loggaInMedTelefon, sattPin, glomtKod } from './api.js?v=baa7cf7';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const visaTel = t => { if (!t) return ''; let s = String(t); if (s.startsWith('+46')) s = '0' + s.slice(3); const m = /^(0\d{2})(\d{3})(\d{2})(\d{2})$/.exec(s); return m ? `${m[1]}-${m[2]} ${m[3]} ${m[4]}` : s; };
let senast = { telefon: '' };
try { senast.telefon = localStorage.getItem('cap_tel') || ''; } catch { /* ok */ }

export function loginPage({ fel = '', telefon = senast.telefon, lage = 'tel', kod = '', info = '' } = {}) {
  const hero = (rubrik, text) => `
  <section class="hero" style="padding-top:40px">
    <img class="hero-logo" src="assets/cap-logo.png" alt="CAP – Complete Athletic Performance">
    <div class="eyebrow">CAP Online</div>
    <h1>${rubrik}</h1>
    <p class="lead">${text}</p>
  </section>`;
  const felRad = fel ? `<div class="note warn small" style="margin:0 0 12px">${esc(fel)}</div>` : '';
  const infoRad = info ? `<div class="note small" style="margin:0 0 12px">${esc(info)}</div>` : '';
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
        <input type="text" id="kod" name="kod" value="${esc(kod)}" placeholder="T.ex. ABC-234" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="8" style="font-size:22px;letter-spacing:.2em;text-align:center;font-weight:700">
      </div>
      <button class="btn grad block" type="submit">Fortsätt</button>
    </form>
    <p class="small muted" style="margin:12px 0 0"><a href="#/login">‹ Logga in med mobilnummer i stället</a></p>
  </section>`;
  return `
  ${hero('Välkommen', 'Logga in med ditt mobilnummer och koden du valde. Första gången: öppna länken du fått av Haris.')}
  <section class="panel">
    ${felRad}${infoRad}
    <form data-form="login-tel">
      <div class="field"><label for="ltel">Mobilnummer</label><input type="tel" id="ltel" name="telefon" value="${esc(telefon)}" placeholder="070-123 45 67" autocomplete="tel" required></div>
      <div class="field"><label for="lpin">Din kod</label><input type="password" id="lpin" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="4–6 siffror" autocomplete="current-password" required style="font-size:22px;letter-spacing:.3em;text-align:center;font-weight:700"></div>
      <button class="btn grad block" type="submit">Logga in</button>
    </form>
    <p class="small" style="margin:12px 0 0;text-align:center"><a href="#/login/glomt">Glömt koden?</a></p>
  </section>
  <section class="panel">
    <h3>Ny hos Haris?</h3>
    <p class="small muted" style="margin:0">Haris lägger in er och skickar en länk som sms. Öppna länken, välj en kod, klart. <a href="#/login/kod">Har du en kod med bokstäver?</a> · <a data-action="gast" href="#/">Prova utan konto</a></p>
  </section>
  <p class="small muted" style="text-align:center;margin-top:24px"><a href="#/admin">Admin</a> · för Haris och Carl</p>`;
}

// Välj (ny) kod efter länken, eller byt kod under Mer
export function pinPage({ fel = '' } = {}) {
  const u = store.session?.user;
  if (!u) return null;
  const forsta = !u.harPin;
  return `
  <section class="hero" style="padding-top:40px">
    <img class="hero-logo" src="assets/cap-logo.png" alt="">
    <div class="eyebrow">${forsta ? 'Nästan klart' : 'Byt kod'}</div>
    <h1>${forsta ? `Hej${u.namn ? ' ' + esc(u.namn) : ''}!` : 'Välj en ny kod'}</h1>
    <p class="lead">${forsta ? `Välj en kod med fyra till sex siffror. Sedan loggar du in med <b>${esc(visaTel(u.telefon))}</b> och koden.` : 'Fyra till sex siffror. Den gamla slutar gälla direkt.'}</p>
  </section>
  <section class="panel">
    ${fel ? `<div class="note warn small" style="margin:0 0 12px">${esc(fel)}</div>` : ''}
    <form data-form="pin">
      <div class="field"><label for="pin1">Kod</label><input type="password" id="pin1" name="pin" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" required autocomplete="new-password" style="font-size:22px;letter-spacing:.3em;text-align:center;font-weight:700"></div>
      <div class="field"><label for="pin2">Samma kod igen</label><input type="password" id="pin2" name="pin2" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="6" required autocomplete="new-password" style="font-size:22px;letter-spacing:.3em;text-align:center;font-weight:700"></div>
      <button class="btn grad block" type="submit">${forsta ? 'Spara koden och börja' : 'Byt kod'}</button>
    </form>
    ${forsta ? '' : '<p class="small muted" style="margin:12px 0 0;text-align:center"><a href="#/mer">Avbryt</a></p>'}
  </section>`;
}

// #/k/KOD – länken ur sms:et loggar in direkt och leder till kodvalet
export async function loggaInViaLank(kod, { toast, go }) {
  const r = await loggaInMedKod(kod);
  if (!r.ok) { toast(r.fel || 'Länken fungerade inte'); return go('/login'); }
  efterInloggning(r.user, { toast, tyst: !!r.valjPin });
  go(r.valjPin ? '/pin' : '/');
}

export function efterInloggning(user, { toast, tyst = false } = {}) {
  store.guest = false;
  store.proto = 'app';
  if (user?.telefon) { senast.telefon = visaTel(user.telefon); try { localStorage.setItem('cap_tel', senast.telefon); } catch { /* ok */ } }
  // registrets uppgifter förifyller startguiden
  if (!store.profile) {
    const d = { ...store.draft };
    if (user?.barn && !d.name) d.name = user.barn;
    if (user?.fodd && !d.age) d.age = String(Math.max(7, Math.min(14, new Date().getFullYear() - user.fodd)));
    if (user?.position && !d.position) d.position = user.position;
    store.draft = d;
  }
  if (!tyst) toast(`Välkommen${user?.namn ? ', ' + user.namn : ''}!`);
}

// Inloggningsformulären. render(html) ritar om sidan med fel eller besked.
export async function kontoSubmit(kind, f, fd, { toast, go, render }) {
  const btn = f.querySelector('button[type=submit]'); const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Kontrollerar…';
  const ater = () => { btn.disabled = false; btn.textContent = txt; };
  if (kind === 'login-tel') {
    const telefon = fd.get('telefon');
    const r = await loggaInMedTelefon(telefon, fd.get('pin'));
    if (!r.ok) { ater(); render(loginPage({ telefon, fel: r.fel || 'Gick inte att logga in' })); return; }
    efterInloggning(r.user, { toast }); go(r.user.harPin ? '/' : '/pin'); return;
  }
  if (kind === 'glomt') {
    const telefon = fd.get('telefon');
    const r = await glomtKod(telefon);
    ater();
    if (!r.ok) { render(loginPage({ lage: 'glomt', telefon, fel: r.fel || 'Gick inte' })); return; }
    senast.telefon = telefon; try { localStorage.setItem('cap_tel', telefon); } catch { /* ok */ }
    render(loginPage({ telefon, info: r.meddelande || 'En ny länk är på väg.' })); return;
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
