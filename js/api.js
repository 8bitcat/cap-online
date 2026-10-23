// Klient mot CAP Online API (server/cap-api): konton med kod, filmer med taggar, admin.
import { store } from './store.js';

export const API = 'https://cap-api.8bitcat.io';

async function call(method, path, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const r = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({ ok: false, fel: `${r.status}` }));
    if (r.status === 401 && token && token === store.admin) store.admin = null;
    return j;
  } catch { return { ok: false, fel: 'ingen kontakt med servern', offline: true }; }
}
export const api = {
  get: (p, token) => call('GET', p, undefined, token),
  post: (p, b, token) => call('POST', p, b, token),
  put: (p, b, token) => call('PUT', p, b, token),
  del: (p, token) => call('DELETE', p, undefined, token),
  admin: {
    get: p => call('GET', p, undefined, store.admin),
    post: (p, b) => call('POST', p, b, store.admin),
    put: (p, b) => call('PUT', p, b, store.admin),
    del: p => call('DELETE', p, undefined, store.admin),
  },
};

// Logga in med kod (länken #/k/KOD ur sms:et, eller en gammal e-postkod)
export async function loggaInMedKod(kod) {
  const r = await api.post('/auth/kod', { kod });
  if (r.ok) store.session = { token: r.token, user: r.user, t: Date.now() };
  return r;
}
// Logga in med mobilnummer och den kod föräldern valt
export async function loggaInMedTelefon(telefon, pin) {
  const r = await api.post('/auth/login', { telefon, pin });
  if (r.ok) store.session = { token: r.token, user: r.user, t: Date.now() };
  return r;
}
export async function sattPin(pin) {
  const r = await api.post('/auth/pin', { pin }, store.session?.token);
  if (r.ok) store.session = { ...store.session, user: r.user };
  return r;
}
export const glomtKod = telefon => api.post('/auth/glomt', { telefon });
export async function loggaUt() {
  const s = store.session;
  if (s?.token) api.post('/auth/ut', {}, s.token);
  store.session = null;
}

// Publicerade filmer från servern, med en kopia i localStorage så att de syns offline.
let filmCache = null;
export async function hamtaFilmer({ tvinga = false } = {}) {
  if (filmCache && !tvinga) return filmCache;
  const r = await api.get('/filmer');
  if (r.ok) { filmCache = r.filmer; store.filmer = r.filmer; return filmCache; }
  return store.filmer || [];
}
export const filmerNu = () => filmCache || store.filmer || [];

// Ladda upp en fil i delar till R2 via API:t (admin). onProgress(0..1).
export const laddaUppFilm = (filmId, file, onProgress) => laddaUppFil({ filmId, filnamn: file.name, typ: file.type }, file, onProgress);
// meta: { filmId } (biblioteksfilm) eller { klientId } (inspelning från ett pass), plus filnamn och typ
export async function laddaUppFil(meta, file, onProgress = () => {}) {
  const start = await api.admin.post('/admin/upload/start', meta);
  if (!start.ok) return start;
  const DEL = 8 * 1024 * 1024;
  const parts = [];
  const antal = Math.ceil(file.size / DEL);
  for (let i = 0; i < antal; i++) {
    const blob = file.slice(i * DEL, Math.min(file.size, (i + 1) * DEL));
    const r = await fetch(`${API}/admin/upload/part?key=${encodeURIComponent(start.key)}&uploadId=${encodeURIComponent(start.uploadId)}&part=${i + 1}`,
      { method: 'PUT', headers: { authorization: `Bearer ${store.admin}` }, body: blob });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) return { ok: false, fel: `del ${i + 1} av ${antal}: ${j.fel || r.status}` };
    parts.push({ partNumber: i + 1, etag: j.etag });
    onProgress((i + 1) / antal);
  }
  return api.admin.post('/admin/upload/complete', { key: start.key, uploadId: start.uploadId, parts });
}
export async function laddaUppPoster(filmId, blob) {
  const r = await fetch(`${API}/admin/upload/poster/${filmId}`, { method: 'PUT', headers: { authorization: `Bearer ${store.admin}`, 'content-type': 'image/jpeg' }, body: blob });
  return r.json().catch(() => ({ ok: false }));
}
