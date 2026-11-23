// Notiser (Carl 2026-10-21): påminnelser om träningsdagar (lokala notiser) och nyheter från Haris
// (push via server/cap-push). Fungerar bara i iOS-appen, där Capacitor finns; på webben visas det inte.
import { store } from './store.js';
import { api } from './api.js';

const SERVER = 'https://cap-push.8bitcat.io';
const cap = () => { try { const C = window.Capacitor; return C?.isNativePlatform?.() ? C : null; } catch { return null; } };
const pushP = () => cap()?.Plugins?.PushNotifications || null;
const localP = () => cap()?.Plugins?.LocalNotifications || null;
export const notisStod = () => !!(pushP() && localP());

// Capacitor räknar veckodagar med 1 = söndag … 7 = lördag
const DAGAR = { '1': [4], '2': [3, 5], '3+': [2, 4, 6] };
const NAMN = { 2: 'måndag', 3: 'tisdag', 4: 'onsdag', 5: 'torsdag', 6: 'fredag' };
export const paminnDagar = freq => (DAGAR[freq] || DAGAR['2']).map(d => NAMN[d]);

async function post(path, data) {
  try {
    const r = await fetch(SERVER + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    return await r.json();
  } catch { return null; }
}

// Påminnelser på träningsdagarna kl 17, utifrån hur ofta familjen sagt att de kan träna.
export async function paminnSatt(on) {
  const L = localP();
  if (!L) return { ok: false, fel: 'bara i appen' };
  try {
    const vantande = await L.getPending();
    if (vantande.notifications?.length) await L.cancel(vantande);
    if (!on) { store.notiser = { ...store.notiser, paminn: false }; return { ok: true }; }
    let perm = await L.checkPermissions();
    if (perm.display !== 'granted') perm = await L.requestPermissions();
    if (perm.display !== 'granted') return { ok: false, fel: 'nekad' };
    const p = store.profile || {};
    const dagar = DAGAR[p.freq] || DAGAR['2'];
    await L.schedule({ notifications: dagar.map((weekday, i) => ({
      id: 101 + i, title: 'CAP', body: `Dags för dagens pass med ${p.name || 'barnet'} ⚽ Boll och koner räcker.`,
      schedule: { on: { weekday, hour: 17, minute: 0 }, repeats: true, allowWhileIdle: true },
    })) });
    store.notiser = { ...store.notiser, paminn: true };
    return { ok: true, dagar: dagar.map(d => NAMN[d]) };
  } catch (e) { return { ok: false, fel: String(e?.message || e) }; }
}

// Notiser från Haris: telefonens pushkod registreras hos servern och kopplas till kontot som är inloggat
// (Carl 2026-11-13: "vi har olika login på telefonerna"). Då kan notisen om en bokning, pass eller betalning gå till
// rätt förälder. Är Haris adminvy inloggad på telefonen kopplas den också till Haris (nya bokningar, swishar).
const kontoNyckel = () => `${store.session?.user?.uid || ''}|${store.admin ? 'h' : ''}`;
async function registrera(value) {
  const tok = store.session?.token;
  let r = tok ? await api.post('/mina/push', { token: value }, tok) : null;
  if (!r?.ok) r = await post('/registrera', { token: value, namn: store.profile?.name || '' });
  if (store.admin) await api.post('/admin/push', { token: value }, store.admin);
  store.notiser = { ...store.notiser, push: !!r?.ok, token: r?.ok ? value : null, kopplad: r?.ok ? kontoNyckel() : null, regT: Date.now() };
  document.dispatchEvent(new CustomEvent('cap:notiser', { detail: { ok: !!r?.ok } }));
}
let lyssnar = false;
async function lyssna(P) {
  if (lyssnar) return;
  lyssnar = true;
  await P.addListener('registration', ({ value } = {}) => { if (value) registrera(value); });
  await P.addListener('registrationError', () => {
    store.notiser = { ...store.notiser, push: false, token: null };
    document.dispatchEvent(new CustomEvent('cap:notiser', { detail: { ok: false } }));
  });
  await P.addListener('pushNotificationReceived', n => document.dispatchEvent(new CustomEvent('cap:push', { detail: n })));
}
export async function pushSatt(on) {
  const P = pushP();
  if (!P) return { ok: false, fel: 'bara i appen' };
  try {
    if (!on) {
      const t = store.notiser.token;
      if (t) { if (store.session?.token) await api.post('/mina/push', { token: t, av: true }, store.session.token); else await post('/avregistrera', { token: t }); }
      store.notiser = { ...store.notiser, push: false, token: null, kopplad: null, av: true };
      return { ok: true };
    }
    store.notiser = { ...store.notiser, av: false };
    let perm = await P.checkPermissions();
    if (perm.receive !== 'granted' && perm.receive !== 'denied') perm = await P.requestPermissions();
    if (perm.receive !== 'granted') return { ok: false, fel: 'nekad' };
    await lyssna(P);
    await P.register();
    return { ok: true, vantar: true };
  } catch (e) { return { ok: false, fel: String(e?.message || e) }; }
}
// Körs vid varje sidbyte: när någon loggat in (förälder eller Haris) frågar appen en gång om notiser, och kopplar
// telefonen till kontot. Byter man konto på telefonen kopplas den om. En gång per dygn registreras den på nytt,
// ifall servern har tappat pushkoden.
let pagar = false;
export async function pushAuto() {
  const P = pushP();
  if (!P || pagar || store.notiser.av) return;
  if (!store.session?.token && !store.admin) return; // fråga inte på välkomstsidan
  // inte heller medan kontot skapas: frågorna kommer samlade på sidan Sista steget (installningar.js)
  if (/^#\/(losen|start|kom-igang|k\/)/.test(location.hash)) return;
  const n = store.notiser;
  if (n.push && n.token && n.kopplad === kontoNyckel() && Date.now() - (n.regT || 0) < 864e5) return;
  pagar = true;
  try {
    let perm = await P.checkPermissions();
    if (perm.receive !== 'granted') {
      if (perm.receive === 'denied' || n.fragat) return;
      store.notiser = { ...store.notiser, fragat: true };
      perm = await P.requestPermissions();
      if (perm.receive !== 'granted') return;
    }
    await lyssna(P);
    await P.register();
  } catch { /* ok */ } finally { pagar = false; }
}
// Haris loggar ut ur adminvyn: telefonen ska inte längre få notiser om föräldrarnas bokningar
export async function pushAdminAv() {
  const t = store.notiser.token;
  if (t && store.admin) await api.post('/admin/push', { token: t, av: true }, store.admin);
  if (store.notiser.kopplad) store.notiser = { ...store.notiser, kopplad: null };
}

// Tryck på en notis: appen öppnar sidan notisen pekar på, t.ex. #/boka/2026-W45 när Haris öppnat en vecka
// (Carl 2026-10-28). Lyssnaren kopplas vid start, så att det fungerar även när notisen startar appen.
export async function pushLyssna() {
  const P = pushP(); if (!P) return;
  try {
    await P.addListener('pushNotificationActionPerformed', a => {
      const h = a?.notification?.data?.hash;
      if (typeof h === 'string' && /^\/[\w/-]{1,60}$/.test(h)) location.hash = h;
    });
  } catch { /* ok */ }
}

// Återställ påminnelserna när profilen ändrats (annan frekvens eller annat namn).
export async function paminnUppdatera() {
  if (store.notiser.paminn && localP()) await paminnSatt(true);
}

// Testknappar. Lokal testnotis om 5 sekunder: i appen via LocalNotifications, på webben via webbläsarens Notification.
export async function testaLokal() {
  const L = localP();
  const text = 'Testnotis från CAP 👋 Så här ser en påminnelse ut.';
  if (L) {
    try {
      let perm = await L.checkPermissions();
      if (perm.display !== 'granted') perm = await L.requestPermissions();
      if (perm.display !== 'granted') return { ok: false, fel: 'nekad' };
      await L.schedule({ notifications: [{ id: 999, title: 'CAP', body: text, schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] });
      return { ok: true, sekunder: 5 };
    } catch (e) { return { ok: false, fel: String(e?.message || e) }; }
  }
  if (!('Notification' in window)) return { ok: false, fel: 'webbläsaren saknar notiser' };
  try {
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (perm !== 'granted') return { ok: false, fel: 'nekad' };
    setTimeout(() => { try { new Notification('CAP', { body: text, icon: 'assets/cap-ball-270.png' }); } catch { /* ok */ } }, 5000);
    return { ok: true, sekunder: 5 };
  } catch (e) { return { ok: false, fel: String(e?.message || e) }; }
}
// Testpush via servern till den här telefonen (kräver att "Nyheter från Haris" är på).
export async function testaPush() {
  const t = store.notiser.token;
  if (!t) return { ok: false, fel: 'slå på Nyheter från Haris först' };
  const r = await post('/test', { token: t });
  if (!r) return { ok: false, fel: 'ingen kontakt med servern' };
  return r.ok ? { ok: true } : { ok: false, fel: r.fel || `${r.status} ${r.reason}` };
}
export const notisServer = SERVER;
