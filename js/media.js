// Inspelningar från passen (Carl 2026-10-23: "ljudinspelning eller kameran rakt från appen … filmen sparas på
// spelaren"). Filen laddas upp till R2 via API:t när lagringen är på. Är den inte det ligger filen kvar i
// telefonens IndexedDB, och "Ladda upp väntande" skickar upp den senare. Metadata hamnar på klienten (med:<id>).
import { api, laddaUppFil, API } from './api.js';
import { store } from './store.js';

const DBN = 'cap-media', STORE = 'blobs';
let r2 = false;
export const sattR2 = v => { r2 = !!v; };
export const r2Pa = () => r2;

function idb() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('ingen lokal lagring'));
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const q = fn(t.objectStore(STORE));
    t.oncomplete = () => { res(q?.result); db.close(); };
    t.onerror = () => { rej(t.error); db.close(); };
  });
}
const lokalSpara = post => tx('readwrite', s => s.put(post));
const lokalHamta = id => tx('readonly', s => s.get(id));
const lokalAlla = () => tx('readonly', s => s.getAll());
const lokalBort = id => tx('readwrite', s => s.delete(id));

const ext = mime => /audio\/mp4|aac/.test(mime) ? 'm4a' : /audio\/webm/.test(mime) ? 'webm' : /audio\/ogg/.test(mime) ? 'ogg' : /audio\/mpeg/.test(mime) ? 'mp3' : /audio/.test(mime) ? 'm4a' : /quicktime/.test(mime) ? 'mov' : /video\/webm/.test(mime) ? 'webm' : 'mp4';
const nyttId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Sparar en inspelning: lokalt först (så inget går förlorat), sedan uppladdning om R2 är på.
// meta: { klientId, typ: 'video'|'audio', namn?, titel?, planId?, blockId?, bedId? }
export async function sparaInspelning(blob, meta, onProgress) {
  const id = nyttId();
  const post = { id, blob, t: Date.now(), meta: { ...meta, t: new Date().toISOString(), mime: blob.type || (meta.typ === 'audio' ? 'audio/mp4' : 'video/mp4'), filnamn: meta.namn || `${meta.typ}-${id}.${ext(blob.type || '')}` } };
  let lokalt = true;
  try { await lokalSpara(post); } catch { lokalt = false; }
  const r = await laddaUpp(post, onProgress);
  return { id, typ: meta.typ, namn: post.meta.filnamn, t: post.meta.t, url: r.ok ? r.url : '', lokal: !r.ok, sparadLokalt: lokalt, fel: r.ok ? null : r.fel };
}
// ---------- komprimerade filmer (app 1.4, tillägget CapFilm i CapKalender.swift) ----------
// Carl 2026-11-24: "vi ska komprimera filmerna, så att vi inte går över 10 gb". Appen filmar, gör om filmen till 720p
// (~14 MB/min i stället för ~50) och laddar upp den själv. Här ligger bara metadata; själva filen ligger i appen tills
// den är uppladdad.
const capFilm = () => { try { const C = window.Capacitor; return C?.isNativePlatform?.() && C.isPluginAvailable?.('CapFilm') ? C.Plugins.CapFilm : null; } catch { return null; } };
export const kanKomprimera = () => !!capFilm();
// kalla: 'kamera' | 'bibliotek'. onProgress({steg: 'komprimerar'|'laddar', andel})
export async function filmaKomprimerat(kalla, meta, onProgress = () => {}) {
  const P = capFilm(); if (!P) return { ok: false, fel: 'appen kan inte komprimera' };
  const id = nyttId();
  let h = null;
  try { h = await P.addListener('filmFramsteg', e => onProgress(e)); } catch { /* ok */ }
  try {
    const r = await P.filma({ id, kalla, maxSek: 900 });
    if (r?.avbrutet) return { avbrutet: true };
    const filnamn = meta.namn || `film-${id}.mp4`;
    const post = { id, nativ: true, t: Date.now(), meta: { ...meta, typ: 'video', t: new Date().toISOString(), mime: 'video/mp4', filnamn, storlek: r.efter, fore: r.fore, sek: r.sek } };
    try { await lokalSpara(post); } catch { /* ok */ }
    const u = await laddaUpp(post);
    return { ok: true, id, typ: 'video', namn: filnamn, t: post.meta.t, url: u.ok ? u.url : '', lokal: !u.ok, fel: u.ok ? null : u.fel, fore: r.fore, efter: r.efter, sek: r.sek };
  } catch (e) { return { ok: false, fel: String(e?.message || e || 'gick inte') }; }
  finally { try { h?.remove?.(); } catch { /* ok */ } }
}
export const mb = b => `${(b / 1048576).toLocaleString('sv-SE', { maximumFractionDigits: b < 10485760 ? 1 : 0 })} MB`;

async function laddaUpp(post, onProgress = () => {}) {
  if (!r2) return { ok: false, fel: 'fillagringen är inte på' };
  const m = post.meta;
  const r = post.nativ
    ? await capFilm()?.laddaUpp({ id: post.id, api: API, token: store.admin || '', klientId: m.klientId, filnamn: m.filnamn }) || { ok: false, fel: 'filmen ligger i appen, öppna appen för att ladda upp den' }
    : await laddaUppFil({ klientId: m.klientId, filnamn: m.filnamn, typ: m.mime }, post.blob, onProgress);
  if (!r.ok) return r;
  const reg = await api.admin.post(`/admin/klient/${m.klientId}/media`, { id: post.id, typ: m.typ, url: r.url, key: r.key, namn: m.filnamn, titel: m.titel || '', planId: m.planId || '', blockId: m.blockId || '', bedId: m.bedId || '', t: m.t, storlek: r.storlek || post.blob?.size || m.storlek || 0, sek: m.sek || 0 });
  if (!reg.ok) return { ok: false, fel: reg.fel || 'kunde inte registrera filen' };
  await lokalBort(post.id).catch(() => {});
  return { ok: true, url: r.url, key: r.key };
}
// Allt som ligger lokalt och väntar (valfritt bara för en klient)
export async function vantande(klientId) {
  try { const alla = await lokalAlla(); return (alla || []).filter(x => !klientId || x.meta.klientId === klientId).map(x => ({ id: x.id, ...x.meta, nativ: !!x.nativ, storlek: x.blob?.size || x.meta.storlek || 0 })); } catch { return []; }
}
// Laddar upp allt som väntar. onEach(id, {ok, url, fel}) efter varje fil.
export async function laddaUppVantande(klientId, onEach = () => {}) {
  if (!r2) return { ok: false, fel: 'fillagringen är inte på', klara: 0, antal: 0 };
  let alla = []; try { alla = await lokalAlla(); } catch { return { ok: false, fel: 'ingen lokal lagring', klara: 0, antal: 0 }; }
  alla = alla.filter(x => !klientId || x.meta.klientId === klientId);
  let klara = 0; const fel = [];
  for (const post of alla) {
    const r = await laddaUpp(post);
    if (r.ok) klara++; else fel.push(r.fel);
    onEach(post.id, r);
  }
  return { ok: true, klara, antal: alla.length, fel };
}
// Spela upp en lokal inspelning
export async function lokalUrl(id) {
  try { const post = await lokalHamta(id); return post?.blob ? URL.createObjectURL(post.blob) : ''; } catch { return ''; }
}
export const taBortLokal = id => { try { capFilm()?.taBort({ id })?.catch?.(() => {}); } catch { /* ok */ } return lokalBort(id).catch(() => {}); };

// Ljudinspelning med mikrofonen (MediaRecorder). iOS ger audio/mp4, Chrome audio/webm.
export const kanSpelaInLjud = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
export async function startaLjud() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const delar = [];
  rec.ondataavailable = e => { if (e.data?.size) delar.push(e.data); };
  const start = Date.now();
  rec.start(1000);
  return {
    start, mime: rec.mimeType || mime || 'audio/mp4',
    stop: () => new Promise(res => {
      rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(new Blob(delar, { type: rec.mimeType || mime || 'audio/mp4' })); };
      if (rec.state !== 'inactive') rec.stop(); else rec.onstop();
    }),
  };
}
