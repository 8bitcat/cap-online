// Inställningar (Carl 2026-11-22: "en inställningssida … där man ska kunna justera alla tillåtelser"). Samlar
// telefonens tillåtelser (notiser, kalendern, kamera, mikrofon, bilder), påminnelserna och kontot på ett ställe.
// En nekad tillåtelse kan bara ändras i iPhonens Inställningar; knappen Öppna Inställningar går dit (app-settings:).
import { store } from './store.js';
import { api, API } from './api.js';
import { notisStod, pushSatt, paminnSatt, paminnDagar } from './notiser.js';
import { kalStod, kalLage, kalSynk, kalAv, kalStatus, kalFragat, kalRestid, sattRestid } from './kalender.js';
import { minaNu, hamtaMina } from './boka.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ios = () => !!window.Capacitor?.isNativePlatform?.();
const visaTel = t => { const d = String(t || '').replace(/^\+46/, '0').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}` : t || ''; };
let ui = null;
let tillstand = null, hamtat = 0, hamtar = false;
export function installningarInit(deps) {
  ui = deps;
  // tillbaka från iPhonens Inställningar: läs tillåtelserna igen
  document.addEventListener('visibilitychange', () => { if (!document.hidden && location.hash === '#/installningar') { hamtat = 0; ui.route(); } });
}

async function lasTillstand() {
  const P = window.Capacitor?.Plugins || {};
  const t = {};
  try { t.notiser = (await P.PushNotifications?.checkPermissions())?.receive || null; } catch { /* ok */ }
  t.kalender = await kalStatus();
  Object.assign(t, await mediaLage());
  return t;
}

// Kameran och mikrofonen (Carl 2026-11-23: "allt annat som appen kräver"): föräldrarna filmar stegen i stigen och
// skickar till Haris, och en film med ljud kräver båda. App 1.3 frågar via CapKalender (AVFoundation), äldre appar
// via webbläsarens getUserMedia, som iOS också visar som appens fråga.
const kalP = () => { try { const C = window.Capacitor; return C?.isNativePlatform?.() && C.isPluginAvailable?.('CapKalender') ? C.Plugins.CapKalender : null; } catch { return null; } };
async function mediaLage() {
  try { const r = await kalP()?.media(); if (r?.kamera) return { kamera: r.kamera, mikrofon: r.mikrofon }; } catch { /* äldre app */ }
  const ut = {};
  for (const [n, k] of [['camera', 'kamera'], ['microphone', 'mikrofon']]) {
    try { const st = (await navigator.permissions?.query({ name: n }))?.state; ut[k] = st === 'granted' ? 'ja' : st === 'denied' ? 'nej' : st === 'prompt' ? 'fraga' : null; } catch { ut[k] = null; }
  }
  return ut;
}
async function mediaFraga() {
  try { const P = kalP(); const a = await P.mediaFraga({ typ: 'kamera' }); const b = await P.mediaFraga({ typ: 'mikrofon' }); return !!(a?.ok && b?.ok); } catch { /* äldre app */ }
  try { const st = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); st.getTracks().forEach(x => x.stop()); return true; } catch { return false; }
}
const mediaPa = t => t.kamera === 'ja' && t.mikrofon === 'ja';
const mediaNej = t => t.kamera === 'nej' || t.mikrofon === 'nej';
// något som går att slå på härifrån (det nekade måste ändras i iPhonens Inställningar)
function nagotAv(t) {
  const n = store.notiser;
  return (!(n.push || t.notiser === 'granted') && t.notiser !== 'denied') || (kalStod() && kalLage() !== 'pa' && t.kalender !== 'nej' && t.kalender !== 'skriv') || (!mediaPa(t) && !mediaNej(t)) || (notisStod() && !n.paminn);
}
const appVersion = async () => { try { return (await window.Capacitor?.Plugins?.App?.getInfo())?.version || ''; } catch { return ''; } };

// De som redan har appen (Carl 2026-11-23: "för de som redan har appen ska de gå till inställningssidan för att få
// allting"): första gången appen startar i en ny version skickas föräldern till Inställningar, en gång, om något
// går att slå på. Nya konton får sidan Sista steget i stället.
let nyVersion = false;
// Barnen på kontot, och Lägg till syskon (Haris 2026-11-24: "En förälder kunde inte koppla ett syskon")
function barnPanel() {
  const m = minaNu(), fam = m.familj?.length ? m.familj.map(x => x.klient) : m.klient ? [m.klient] : [];
  const ar = new Date().getFullYear();
  return `<section class="panel inst-panel" id="barnen">
    <h3>Barn på kontot</h3>
    <ul class="list small" style="margin:0 0 10px">${fam.map(x => `<li>⚽ <b>${esc(x.barn || 'Barnet')}</b>${x.fodd ? ` · född ${esc(x.fodd)}` : ''}</li>`).join('')}</ul>
    <details${barnOppen ? ' open' : ''}><summary class="small"><b>➕ Lägg till syskon</b></summary>
      <form data-form="inst-syskon" style="margin-top:8px">
        <div class="field"><label for="syskonBarn">Förnamn</label><input type="text" id="syskonBarn" name="barn" autocomplete="off" required maxlength="40"></div>
        <div class="field"><label for="syskonFodd">Födelseår</label><select id="syskonFodd" name="fodd"><option value="">Välj</option>${Array.from({ length: 16 }, (_, i) => ar - 4 - i).map(y => `<option>${y}</option>`).join('')}</select></div>
        <p class="small muted" style="margin:0 0 8px">Syskonet får en egen nivå och egna resultat hos Haris, och ni bokar, betalar och loggar in som förut.</p>
        <button class="btn grad block" type="submit">Lägg till</button>
      </form>
    </details>
  </section>`;
}
let barnOppen = false;
// Föräldrarna på kontot, och Bjud in en förälder (Haris 2026-11-25: "om mamma och pappa vill ha tillgång till barnets
// spelarkort"). Den inbjudna loggar in med sitt eget nummer och en kod, och väljer sedan ett eget lösenord.
let inbjuden = null;
const smsLank = (tel, text) => `sms:${tel}?&body=${encodeURIComponent(text)}`;
function foraldrarPanel() {
  const m = minaNu(), lista = m.foraldrar || [];
  const tel = t => String(t || '').replace(/^\+46/, '0').replace(/^(0\d{2})(\d{3})(\d{2})(\d{2})$/, '$1-$2 $3 $4');
  return `<section class="panel inst-panel" id="foraldrar">
    <h3>Föräldrar på kontot</h3>
    <ul class="list small" style="margin:0 0 10px">${lista.map(f => `<li class="row"><span class="grow">👤 <b>${esc(f.namn || 'Förälder')}</b>${f.du ? ' (du)' : ''} · ${esc(tel(f.telefon))}${!f.huvud && !f.harPin ? '<div class="muted">Har inte loggat in än</div>' : ''}</span>${!f.huvud && !f.du ? `<button class="film" data-action="inst-for-bort" data-fid="${esc(f.id)}">✕</button>` : ''}</li>`).join('')}</ul>
    ${inbjuden ? `<div class="note" style="margin:0 0 10px"><b>${esc(inbjuden.namn)}</b> är inbjuden. ${inbjuden.skickat ? 'Ett sms med koden är skickat.' : 'Skicka inbjudan, så får hen koden och länken till appen.'}
      ${inbjuden.skickat ? '' : `<a class="btn grad block" style="margin-top:8px" href="${esc(smsLank(inbjuden.telefon, inbjuden.text))}">💬 Skicka inbjudan</a>`}</div>` : ''}
    <details${foraldrarOppen ? ' open' : ''}><summary class="small"><b>➕ Bjud in en förälder</b></summary>
      <form data-form="inst-foralder" style="margin-top:8px">
        <div class="field"><label for="forNamn">Namn</label><input type="text" id="forNamn" name="namn" autocomplete="off" required maxlength="60" placeholder="T.ex. Ali"></div>
        <div class="field"><label for="forTel">Mobilnummer</label><input type="tel" id="forTel" name="telefon" autocomplete="off" required placeholder="070-123 45 67"></div>
        <p class="small muted" style="margin:0 0 8px">Hen loggar in med sitt eget nummer och väljer ett eget lösenord, och ser samma barn, bokningar och spelarkort som du.</p>
        <button class="btn grad block" type="submit">Bjud in</button>
      </form>
    </details>
  </section>`;
}
let foraldrarOppen = false;
export async function installningarSubmit(kind, f, fd) {
  if (kind === 'inst-foralder') {
    const knapp = f.querySelector('button[type=submit]'); if (knapp) knapp.disabled = true;
    const r = await api.post('/mina/foralder', { namn: fd.get('namn'), telefon: fd.get('telefon') }, store.session?.token);
    if (knapp) knapp.disabled = false;
    if (!r.ok) { ui.toast(`Gick inte: ${r.fel}`); return true; }
    inbjuden = { namn: r.foralder.namn, telefon: r.telefon, text: r.text, skickat: r.skickat };
    await hamtaMina(true);
    ui.toast(r.skickat ? `${r.foralder.namn} har fått ett sms med koden` : `Tryck Skicka inbjudan, så får ${r.foralder.namn} koden`); ui.route(); return true;
  }
  if (kind !== 'inst-syskon') return false;
  const knapp = f.querySelector('button[type=submit]'); if (knapp) knapp.disabled = true;
  const r = await api.post('/mina/syskon', { barn: fd.get('barn'), fodd: fd.get('fodd') }, store.session?.token);
  if (knapp) knapp.disabled = false;
  if (!r.ok) { ui.toast(`Gick inte: ${r.fel}`); return true; }
  barnOppen = false;
  await hamtaMina(true);
  ui.toast(`${r.klient.barn} är tillagd. Haris har fått veta det.`); ui.route(); return true;
}

export async function kollaNyaTillatelser() {
  if (!ios() || !store.session?.token || !store.profile) return;
  if (/^#\/(losen|start|kom-igang|k\/|installningar|login)/.test(location.hash)) return;
  const ver = await appVersion();
  if (!ver || store.notiser.introVer === ver) return;
  const t = await lasTillstand();
  store.notiser = { ...store.notiser, introVer: ver, intro: true };
  if (!nagotAv(t)) return;
  tillstand = t; hamtat = Date.now(); nyVersion = true;
  ui.go('/installningar');
}

// granted/ja = tillåtet, denied/nej = nekat, prompt/fraga = inte frågat än
const LAGE = { granted: ['ja', 'Tillåtet'], ja: ['ja', 'Tillåtet'], denied: ['nej', 'Nekat'], nej: ['nej', 'Nekat'], skriv: ['halv', 'Bara lägga till'], prompt: ['fraga', 'Inte frågat än'], 'prompt-with-rationale': ['fraga', 'Inte frågat än'], fraga: ['fraga', 'Inte frågat än'] };
const chip = v => { const [k, t] = LAGE[v] || ['fraga', 'Frågas när det behövs']; return `<span class="inst-chip ${k}">${t}</span>`; };
const OPPNA = '<a class="film" href="app-settings:">Öppna Inställningar</a>';

function rad(ikon, namn, text, status, knapp) {
  return `<div class="inst-rad"><span class="inst-ikon" aria-hidden="true">${ikon}</span><div class="inst-mitt"><b>${namn}</b><small>${text}</small></div><div class="inst-hoger">${status}${knapp ? `<div>${knapp}</div>` : ''}</div></div>`;
}

export function installningarPage() {
  const inloggad = !!store.session?.token, m = minaNu(), k = m.klient;
  if (inloggad && !m.hamtat) hamtaMina().then(ui.kvar());
  if (ios() && !hamtar && Date.now() - hamtat > 3000) { hamtar = true; const om = ui.kvar(); lasTillstand().then(t => { tillstand = t; hamtat = Date.now(); hamtar = false; om(); }); }
  const t = tillstand || {}, n = store.notiser, p = store.profile;

  // notiser
  let notisRad;
  if (!ios()) notisRad = rad('🔔', 'Notiser', 'Notiserna kommer i iPhone-appen CAP.', '', '');
  else if (t.notiser === 'denied') notisRad = rad('🔔', 'Notiser', 'Påminnelser före passen, nya tider och besked från Haris. Nekat på telefonen: slå på under Inställningar → CAP → Notiser.', chip('denied'), OPPNA);
  else notisRad = rad('🔔', 'Notiser', n.push ? 'Telefonen får påminnelser före passen, nya tider och besked från Haris.' : 'Av. Slå på för att få påminnelser före passen och nya tider.', chip(t.notiser),
    `<button class="film" data-action="inst-push" data-pa="${n.push ? '0' : '1'}">${n.push ? 'Stäng av' : 'Slå på'}</button>`);

  // kalendern
  const lage = kalLage();
  const feed = m.kalFeed ? `<a class="film" href="${esc((API + m.kalFeed).replace(/^https?:\/\//, 'webcal://'))}">Prenumerera</a>` : '';
  let kalRad;
  if (kalStod()) {
    if (t.kalender === 'nej' || t.kalender === 'skriv') kalRad = rad('📅', 'Kalendern', 'Appen lägger passen i kalendern CAP. Den behöver full åtkomst: Inställningar → CAP → Kalendrar → Full åtkomst.', chip(t.kalender), OPPNA);
    else kalRad = rad('📅', 'Kalendern', lage === 'pa' ? 'Passen läggs i kalendern CAP med plats och en påminnelse en timme före. Avbokade tas bort.' : 'Av. Slå på så läggs passen i en egen kalender, CAP, av sig själva.', chip(t.kalender),
      lage === 'pa' ? '<button class="film" data-action="inst-kal" data-pa="0">Stäng av</button>' : '<button class="film" data-action="inst-kal" data-pa="1">Slå på</button>');
  } else if (ios()) kalRad = rad('📅', 'Kalendern', 'Med nya versionen av appen läggs passen i kalendern av sig själva. Tills dess: prenumerera, och stäng av «Ta bort varningar».', '', `<a class="film" href="https://apps.apple.com/se/app/cap/id6825529179">Uppdatera appen</a>${feed ? ` ${feed}` : ''}`);
  else kalRad = rad('📅', 'Kalendern', 'Prenumerera på era pass. Tryck Prenumerera och stäng av «Ta bort varningar».', '', feed);

  // kamera, mikrofon, bilder (används när Haris filmar och spelar in under passen)
  const media = ios() ? [
    rad('📷', 'Kamera', 'När ni filmar stegen i stigen och skickar till Haris.', chip(t.kamera), t.kamera === 'nej' ? OPPNA : t.kamera === 'ja' ? '' : '<button class="film" data-action="inst-media">Slå på</button>'),
    rad('🎙', 'Mikrofon', 'Ljudet i filmerna ni skickar till Haris.', chip(t.mikrofon), t.mikrofon === 'nej' ? OPPNA : t.mikrofon === 'ja' ? '' : '<button class="film" data-action="inst-media">Slå på</button>'),
    rad('🖼', 'Bilder', 'När man väljer en film från bildbiblioteket.', chip(null), ''),
  ].join('') : '';

  const paminn = k?.installningar?.paminnelse !== false;
  return `
  <a class="back" href="#/mer">‹ Mer</a>
  <section><div class="eyebrow">Inställningar</div><h1>Inställningar</h1></section>
  <section class="panel inst-panel">
    ${nyVersion ? '<div class="note" style="margin:0 0 10px"><b>Nytt i appen.</b> Slå på det som är av, så får ni påminnelserna, passen i kalendern och kan filma till Haris.</div>' : ''}
    <h3>Tillåtelser på telefonen</h3>
    ${ios() && tillstand && nagotAv(t) ? '<button class="btn grad block" data-action="inst-allt" style="margin-bottom:6px">Slå på allt</button>' : ''}
    ${notisRad}${kalRad}${media}
    ${ios() ? `<a class="btn secondary block" href="app-settings:" style="margin-top:12px">⚙️ Öppna iPhonens inställningar för CAP</a>
    <p class="small muted" style="margin:6px 0 0">Där slår du på eller av notiser, kalendrar, kamera, mikrofon och bilder. Kommer du tillbaka hit visas det nya läget.</p>` : ''}
  </section>
  ${inloggad && k ? `<section class="panel inst-panel">
    <h3>Påminnelser</h3>
    <label class="toggle"><input type="checkbox" data-action="inst-paminn" ${paminn ? 'checked' : ''}><span><b>Inför passet</b><small>24 timmar före, och när det är dags att åka.${kalLage() === 'pa' ? ' Larmen ligger i kalendern CAP.' : ''}</small></span></label>
    <div class="field" style="margin:8px 0 0"><label for="instRestid">Restid till träningen</label>
      <select id="instRestid" data-action-change="inst-restid">${[15, 20, 30, 45, 60, 75, 90].map(m => `<option value="${m}" ${m === (k.installningar?.restid || kalRestid()) ? 'selected' : ''}>${m} minuter</option>`).join('')}</select>
      <small class="hint">«Dags att åka» kommer så här länge innan passet börjar.</small></div>
    ${notisStod() ? `<label class="toggle"><input type="checkbox" data-action="notis-paminn" ${n.paminn ? 'checked' : ''}><span><b>Träna själv</b><small>${esc(paminnDagar(p?.freq).join(', '))} kl 17, utifrån ${esc(p?.freq || '2')} pass i veckan.</small></span></label>` : ''}
    <p class="small" style="margin:8px 0 0"><a href="#/notiser">Notiserna från Haris ›</a></p>
  </section>` : ''}
  ${inloggad && k ? barnPanel() + foraldrarPanel() : ''}
  <section class="panel inst-panel">
    <h3>Konto</h3>
    ${inloggad ? `<p class="small" style="margin:0 0 10px">Inloggad som ${esc(store.session.user?.namn || 'förälder')}${store.session.user?.telefon ? ` · ${esc(visaTel(store.session.user.telefon))}` : ''}${k?.barn ? ` · ${esc(k.barn)}` : ''}</p>
    <div class="btn-row two" style="margin:0"><a class="btn secondary" href="#/losen">🔑 Byt lösenord</a><button class="btn secondary" data-action="logga-ut">Logga ut</button></div>
    <p class="small" style="margin:12px 0 0"><a href="#/radera">Radera mitt konto</a></p>`
    : '<a class="btn grad block" href="#/login">Logga in</a>'}
  </section>`;
}

// Sista steget när kontot skapas (Carl 2026-11-23: "så att alla frågor kommer i början när man skapar ett konto, borde
// vara en sida med allting"). Kommer efter barnets namn och födelseår. Telefonen frågar om lov här, en sak i taget, och
// sedan frågar appen inte mer av sig själv. Allt går att ändra under Mer → Inställningar.
export const INTRO = '/kom-igang';
export function introPage() {
  const inloggad = !!store.session?.token, m = minaNu(), n = store.notiser, p = store.profile;
  if (inloggad && !m.hamtat) hamtaMina().then(ui.kvar());
  if (ios() && !hamtar && Date.now() - hamtat > 3000) { hamtar = true; const om = ui.kvar(); lasTillstand().then(t => { tillstand = t; hamtat = Date.now(); hamtar = false; om(); }); }
  const t = tillstand || {};
  const pa = '<span class="inst-chip ja">På</span>';
  const knapp = (action, text = 'Slå på') => `<button class="film" data-action="${action}" data-pa="1">${text}</button>`;
  const rader = [];
  if (ios()) {
    const notisPa = n.push || t.notiser === 'granted';
    rader.push(rad('🔔', 'Notiser', 'Påminnelse kvällen före varje pass, när Haris öppnar nya tider och besked från Haris.',
      t.notiser === 'denied' ? chip('denied') : notisPa ? pa : '', t.notiser === 'denied' ? OPPNA : notisPa ? '' : knapp('inst-push')));
  }
  const feed = m.kalFeed ? `<a class="film" href="${esc((API + m.kalFeed).replace(/^https?:\/\//, 'webcal://'))}">Prenumerera</a>` : '';
  if (kalStod()) {
    const nej = t.kalender === 'nej' || t.kalender === 'skriv';
    rader.push(rad('📅', 'Kalendern', 'Passen läggs i en egen kalender, CAP, med plats och en påminnelse en timme före: dags att åka. Avbokade tas bort.',
      nej ? chip(t.kalender) : kalLage() === 'pa' ? pa : '', nej ? OPPNA : kalLage() === 'pa' ? '' : knapp('inst-kal')));
  } else rader.push(rad('📅', 'Kalendern', 'Prenumerera på era pass, så hamnar de i telefonens kalender. Tryck Prenumerera och stäng av «Ta bort varningar».', '', feed));
  if (ios()) rader.push(rad('🎥', 'Kamera och mikrofon', 'När ni filmar stegen i stigen och skickar filmen till Haris.',
    mediaNej(t) ? chip('nej') : mediaPa(t) ? pa : '', mediaNej(t) ? OPPNA : mediaPa(t) ? '' : knapp('inst-media')));
  if (notisStod()) rader.push(rad('⚽', 'Träna hemma', `En påminnelse kl 17 på ${esc(paminnDagar(p?.freq).join(' och '))}, dagarna att träna själva.`,
    n.paminn ? pa : '', n.paminn ? '' : knapp('inst-trana')));
  const allt = ios() && nagotAv(t);
  return `
  <section class="wiz">
    <img class="hero-logo" src="assets/cap-logo.png" alt="">
    <div class="eyebrow">Sista steget</div>
    <h1>Missa inget pass</h1>
    <p class="muted">${ios() ? 'Telefonen frågar om lov för varje sak. Tryck Tillåt när den frågar.' : 'Notiserna kommer i iPhone-appen CAP. Här kan du lägga passen i kalendern.'} Du kan ändra allt senare under Mer → Inställningar.</p>
  </section>
  <section class="panel inst-panel">
    ${allt ? '<button class="btn grad block" data-action="inst-allt" style="margin-bottom:6px">Slå på allt</button>' : ''}
    ${rader.join('')}
    ${ios() ? '' : '<p class="small" style="margin:10px 0 0"><a href="#/app">Hämta appen till telefonen ›</a></p>'}
  </section>
  <section class="btn-row"><button class="btn ${allt ? 'secondary' : 'grad'} block" data-action="inst-klar">${allt ? 'Hoppa över' : 'Klart'} ›</button></section>`;
}

export async function installningarAction(action, el) {
  const { toast } = ui;
  const om = () => { hamtat = 0; ui.route(); };
  if (action === 'inst-allt') {
    el.disabled = true; el.textContent = 'Telefonen frågar…';
    const n = store.notiser;
    if (!n.push) await pushSatt(true);
    if (kalStod() && kalLage() !== 'pa') { const m = minaNu().hamtat ? minaNu() : await hamtaMina(true); await kalSynk(m.bokningar, { tvinga: true }); }
    const t0 = tillstand || await lasTillstand();
    if (!mediaPa(t0) && !mediaNej(t0)) await mediaFraga();
    if (notisStod() && !store.notiser.paminn) await paminnSatt(true);
    nyVersion = false;
    toast('Klart. Ändra när du vill under Mer → Inställningar');
    setTimeout(om, 1200); return true;
  }
  if (action === 'inst-media') {
    const ok = await mediaFraga();
    toast(ok ? 'Kameran och mikrofonen är på' : 'Nekat på telefonen. Tryck Öppna Inställningar.');
    om(); return true;
  }
  if (action === 'inst-trana') {
    const r = await paminnSatt(true);
    toast(r.ok ? `Påminnelse kl 17 på ${r.dagar.join(' och ')}` : r.fel === 'nekad' ? 'Nekat på telefonen. Slå på notiser först.' : `Gick inte: ${r.fel}`);
    om(); return true;
  }
  if (action === 'inst-klar') {
    // frågat färdigt: appen ber inte om lov på egen hand efter det här
    store.notiser = { ...store.notiser, fragat: true, intro: true };
    appVersion().then(v => { if (v) store.notiser = { ...store.notiser, introVer: v }; });
    kalFragat();
    ui.go('/'); return true;
  }
  if (action === 'inst-push') {
    const r = await pushSatt(el.dataset.pa === '1');
    toast(r.ok ? (el.dataset.pa === '1' ? 'Notiserna slås på…' : 'Notiserna är av') : r.fel === 'nekad' ? 'Nekat på telefonen. Tryck Öppna Inställningar.' : `Gick inte: ${r.fel}`);
    setTimeout(om, 1500); return true;
  }
  if (action === 'inst-kal') {
    if (el.dataset.pa === '1') {
      const m = minaNu().hamtat ? minaNu() : await hamtaMina(true);
      const r = await kalSynk(m.bokningar, { tvinga: true });
      toast(r?.ok ? 'Passen läggs nu i kalendern CAP' : r?.behorighet === 'nej' || r?.behorighet === 'skriv' ? 'Nekat på telefonen. Tryck Öppna Inställningar.' : `Gick inte: ${r?.fel || 'okänt fel'}`);
    } else { await kalAv(); toast('Kalendern CAP är borttagen från telefonen'); }
    om(); return true;
  }
  if (action === 'inst-for-bort') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Ta bort?'; setTimeout(() => { delete el.dataset.armed; el.textContent = '✕'; }, 4000); return true; }
    const r = await api.del(`/mina/foralder/${el.dataset.fid}`, store.session?.token);
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    inbjuden = null; await hamtaMina(true); toast('Föräldern är borttagen från kontot'); ui.route(); return true;
  }
  if (action === 'inst-restid') {
    const restid = +el.value;
    const r = await api.put('/mina/installningar', { restid }, store.session?.token);
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    const m = minaNu(); if (m.klient) m.klient.installningar = r.installningar;
    sattRestid(restid);
    if (kalLage() === 'pa') await kalSynk(m.bokningar, { tvinga: true });
    toast(`«Dags att åka» kommer ${restid} minuter före passet`); return true;
  }
  if (action === 'inst-paminn') {
    const r = await api.put('/mina/installningar', { paminnelse: el.checked }, store.session?.token);
    if (r.ok) { const m = minaNu(); if (m.klient) m.klient.installningar = r.installningar; toast(el.checked ? 'Du får påminnelser 24 timmar före och när det är dags att åka' : 'Påminnelserna inför passen är av'); }
    else { el.checked = !el.checked; toast(`Gick inte: ${r.fel}`); }
    return true;
  }
  return false;
}
