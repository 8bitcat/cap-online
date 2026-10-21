// CAP Online API (Carl 2026-10-21: adminsida för filmer med taggar + inloggning med kod/länk).
// Cloudflare Worker med KV (DB) och, när det är påslaget, R2 (MEDIA) för filmfilerna.
//
// Konton och inloggning
//   POST /auth/kod        {kod}                     → {token, user}   koden från Haris inbjudan (eller länken #/k/KOD)
//   GET  /auth/me         Bearer <token>            → {user}
//   POST /auth/ut         Bearer <token>            → {ok}
// Innehåll (inloggad eller gäst)
//   GET  /filmer                                    → {filmer: [publicerade]}
//   GET  /media/<key>                               → filmen/omslaget ur R2 (Range-stöd)
// Admin (Bearer <admintoken> från /admin/login)
//   POST /admin/login     {losen}                   → {token}
//   GET  /admin/filmer                              → alla filmer, även utkast
//   POST /admin/film      {film}                    → {film}
//   PUT  /admin/film/<id> {film}                    → {film}
//   DELETE /admin/film/<id>
//   POST /admin/upload/start    {filmId, filnamn, typ}            → {key, uploadId}
//   PUT  /admin/upload/part?key=&uploadId=&part=N  (kroppen = delen) → {etag}
//   POST /admin/upload/complete {key, uploadId, parts}             → {url}
//   PUT  /admin/upload/poster/<filmId>  (kroppen = jpeg)           → {url}
//   POST /admin/inbjudan  {email, namn, barn}       → {kod, lank, inbjudan}
//   GET  /admin/inbjudningar                        → {inbjudningar, anvandare}
//   POST /admin/notis     {text, title?}            → vidare till cap-push /skicka
//
// KV: adm:<token> adminsession · inv:<KOD> inbjudan · user:<uid> · email:<email>=uid · sess:<token>={uid}
//     film:<id> · (filmerna listas med prefix, färre än tusen i prototypen)

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400' };
const svar = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const fel = (text, status = 400) => svar({ ok: false, fel: text }, status);
const KOD_TECKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const slump = (n, tecken = KOD_TECKEN) => { const a = crypto.getRandomValues(new Uint8Array(n)); return [...a].map(b => tecken[b % tecken.length]).join(''); };
const tokenNy = () => slump(40, 'abcdefghijklmnopqrstuvwxyz0123456789');
const ren = (v, n = 80) => String(v ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const email = v => { const e = ren(v, 120).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null; };
const nu = () => new Date().toISOString();
const DIM = ['alder', 'niva', 'position', 'omrade', 'fardighet', 'typ', 'fas', 'svarighet', 'utrustning', 'yta', 'sallskap', 'plats'];

async function lista(env, prefix) {
  const ut = []; let cursor;
  do { const s = await env.DB.list({ prefix, cursor }); ut.push(...s.keys); cursor = s.list_complete ? null : s.cursor; } while (cursor);
  return ut;
}
async function hamtaAlla(env, prefix) {
  const keys = await lista(env, prefix);
  return (await Promise.all(keys.map(k => env.DB.get(k.name, 'json')))).filter(Boolean);
}
const bearer = req => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

// Tvättar en film från adminsidan: bara kända fält, taggar ur kända dimensioner, moment med tider.
function renFilm(d, gammal = {}) {
  const tags = {};
  for (const k of DIM) {
    const v = Array.isArray(d.tags?.[k]) ? d.tags[k] : [];
    tags[k] = [...new Set(v.map(x => ren(x, 40)).filter(Boolean))].slice(0, 20);
  }
  const moment = (Array.isArray(d.moment) ? d.moment : []).slice(0, 30).map(m => ({
    namn: ren(m.namn, 60), desc: ren(m.desc, 300),
    start: Math.max(0, Math.round(+m.start || 0)), slut: Math.max(0, Math.round(+m.slut || 0)), minuter: Math.max(0, Math.min(90, Math.round(+m.minuter || 0))),
  })).filter(m => m.namn);
  const video = d.video && typeof d.video === 'object' ? {
    typ: d.video.typ === 'r2' ? 'r2' : 'url',
    url: ren(d.video.url, 400), poster: ren(d.video.poster, 400), sek: Math.max(0, Math.round(+d.video.sek || 0)),
  } : (gammal.video || { typ: 'url', url: '', poster: '', sek: 0 });
  return {
    id: gammal.id, skapad: gammal.skapad || nu(), uppdaterad: nu(),
    titel: ren(d.titel, 80) || gammal.titel || 'Namnlös film',
    beskrivning: ren(d.beskrivning, 600),
    traningMin: Math.max(0, Math.min(120, Math.round(+d.traningMin || 0))),
    status: d.status === 'publicerad' ? 'publicerad' : 'utkast',
    tags, moment, video,
  };
}

// ---------- R2: strömma ut med Range ----------
async function media(req, env, key) {
  if (!env.MEDIA) return fel('R2 är inte påslaget', 503);
  const range = req.headers.get('range');
  let obj;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const head = await env.MEDIA.head(key);
    if (!head) return new Response('finns inte', { status: 404, headers: CORS });
    const size = head.size;
    const start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
    const end = m[2] && m[1] ? Math.min(+m[2], size - 1) : size - 1;
    obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!obj) return new Response('finns inte', { status: 404, headers: CORS });
    return new Response(obj.body, { status: 206, headers: { ...CORS, 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1), 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable' } });
  }
  obj = await env.MEDIA.get(key);
  if (!obj) return new Response('finns inte', { status: 404, headers: CORS });
  return new Response(obj.body, { headers: { ...CORS, 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'content-length': String(obj.size), 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable' } });
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const p = url.pathname;
    const base = (env.PUBLIC_BASE || url.origin).replace(/\/$/, '');

    if (req.method === 'GET' && p === '/') return svar({ ok: true, app: 'CAP Online API', r2: !!env.MEDIA });
    if (req.method === 'GET' && p.startsWith('/media/')) return media(req, env, decodeURIComponent(p.slice(7)));

    const json = async () => { try { return await req.json(); } catch { return null; } };

    // ---------- inloggning ----------
    if (p === '/auth/kod' && req.method === 'POST') {
      const d = await json(); if (!d) return fel('trasig JSON');
      const kod = String(d.kod || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (kod.length < 6) return fel('koden ska vara sex tecken');
      const inv = await env.DB.get(`inv:${kod}`, 'json');
      if (!inv) return fel('koden finns inte eller har gått ut', 404);
      let uid = await env.DB.get(`email:${inv.email}`);
      let user = uid ? await env.DB.get(`user:${uid}`, 'json') : null;
      if (!user) {
        uid = slump(12, 'abcdefghijklmnopqrstuvwxyz0123456789');
        user = { uid, email: inv.email, namn: inv.namn || '', barn: inv.barn || '', skapad: nu(), senast: nu() };
        await env.DB.put(`user:${uid}`, JSON.stringify(user));
        await env.DB.put(`email:${inv.email}`, uid);
      } else {
        user.senast = nu();
        await env.DB.put(`user:${uid}`, JSON.stringify(user));
      }
      if (!inv.anvand) { inv.anvand = nu(); await env.DB.put(`inv:${kod}`, JSON.stringify(inv), { expirationTtl: 60 * 60 * 24 * 90 }); }
      const token = tokenNy();
      await env.DB.put(`sess:${token}`, JSON.stringify({ uid, skapad: nu() }), { expirationTtl: 60 * 60 * 24 * 180 });
      return svar({ ok: true, token, user });
    }
    if (p === '/auth/me' && req.method === 'GET') {
      const s = await env.DB.get(`sess:${bearer(req)}`, 'json');
      const user = s && await env.DB.get(`user:${s.uid}`, 'json');
      return user ? svar({ ok: true, user }) : fel('inte inloggad', 401);
    }
    if (p === '/auth/ut' && req.method === 'POST') { await env.DB.delete(`sess:${bearer(req)}`); return svar({ ok: true }); }

    // ---------- publika filmer ----------
    if (p === '/filmer' && req.method === 'GET') {
      const alla = await hamtaAlla(env, 'film:');
      const filmer = alla.filter(f => f.status === 'publicerad').sort((a, b) => (b.uppdaterad || '').localeCompare(a.uppdaterad || ''));
      return svar({ ok: true, filmer });
    }

    // ---------- admin ----------
    if (p === '/admin/login' && req.method === 'POST') {
      const d = await json(); if (!d) return fel('trasig JSON');
      if (!env.ADMIN_LOSEN || String(d.losen || '') !== env.ADMIN_LOSEN) return fel('fel lösenord', 403);
      const token = tokenNy();
      await env.DB.put(`adm:${token}`, JSON.stringify({ skapad: nu() }), { expirationTtl: 60 * 60 * 24 * 30 });
      return svar({ ok: true, token });
    }
    if (p.startsWith('/admin/')) {
      if (!(await env.DB.get(`adm:${bearer(req)}`))) return fel('inte inloggad som admin', 401);

      if (p === '/admin/filmer' && req.method === 'GET') {
        const filmer = (await hamtaAlla(env, 'film:')).sort((a, b) => (b.uppdaterad || '').localeCompare(a.uppdaterad || ''));
        return svar({ ok: true, filmer, r2: !!env.MEDIA });
      }
      if (p === '/admin/film' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const film = renFilm(d, { id: 'f' + Date.now().toString(36) + slump(4, 'abcdefghijklmnopqrstuvwxyz0123456789') });
        await env.DB.put(`film:${film.id}`, JSON.stringify(film));
        return svar({ ok: true, film });
      }
      const mf = /^\/admin\/film\/([a-z0-9]+)$/.exec(p);
      if (mf && (req.method === 'PUT' || req.method === 'DELETE')) {
        const gammal = await env.DB.get(`film:${mf[1]}`, 'json');
        if (!gammal) return fel('filmen finns inte', 404);
        if (req.method === 'DELETE') { await env.DB.delete(`film:${mf[1]}`); return svar({ ok: true }); }
        const d = await json(); if (!d) return fel('trasig JSON');
        const film = renFilm(d, gammal);
        await env.DB.put(`film:${film.id}`, JSON.stringify(film));
        return svar({ ok: true, film });
      }

      // uppladdning till R2 i delar (telefonfilmer är stora)
      if (p === '/admin/upload/start' && req.method === 'POST') {
        if (!env.MEDIA) return fel('R2 är inte påslaget ännu – klistra in en länk till filmen så länge', 503);
        const d = await json(); if (!d) return fel('trasig JSON');
        const ext = (ren(d.filnamn, 100).match(/\.(mp4|mov|m4v)$/i) || ['.mp4'])[0].toLowerCase();
        const key = `film/${ren(d.filmId, 40) || 'ny'}-${Date.now().toString(36)}${ext}`;
        const up = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: ext === '.mov' ? 'video/quicktime' : 'video/mp4' } });
        return svar({ ok: true, key, uploadId: up.uploadId });
      }
      if (p === '/admin/upload/part' && req.method === 'PUT') {
        if (!env.MEDIA) return fel('R2 är inte påslaget', 503);
        const key = url.searchParams.get('key'), uploadId = url.searchParams.get('uploadId'), part = +url.searchParams.get('part');
        if (!key || !uploadId || !(part >= 1)) return fel('saknar key/uploadId/part');
        const up = env.MEDIA.resumeMultipartUpload(key, uploadId);
        const r = await up.uploadPart(part, req.body);
        return svar({ ok: true, etag: r.etag, partNumber: part });
      }
      if (p === '/admin/upload/complete' && req.method === 'POST') {
        if (!env.MEDIA) return fel('R2 är inte påslaget', 503);
        const d = await json(); if (!d) return fel('trasig JSON');
        const up = env.MEDIA.resumeMultipartUpload(String(d.key), String(d.uploadId));
        await up.complete((d.parts || []).map(x => ({ partNumber: +x.partNumber, etag: String(x.etag) })));
        return svar({ ok: true, url: `${base}/media/${d.key}` });
      }
      const mp = /^\/admin\/upload\/poster\/([a-z0-9]+)$/.exec(p);
      if (mp && req.method === 'PUT') {
        if (!env.MEDIA) return fel('R2 är inte påslaget', 503);
        const key = `poster/${mp[1]}-${Date.now().toString(36)}.jpg`;
        await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: 'image/jpeg' } });
        return svar({ ok: true, url: `${base}/media/${key}` });
      }

      // inbjudningar
      if (p === '/admin/inbjudan' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const e = email(d.email); if (!e) return fel('ogiltig e-postadress');
        let kod; do { kod = slump(6); } while (await env.DB.get(`inv:${kod}`));
        const inv = { kod, email: e, namn: ren(d.namn, 60), barn: ren(d.barn, 40), skapad: nu(), anvand: null };
        await env.DB.put(`inv:${kod}`, JSON.stringify(inv), { expirationTtl: 60 * 60 * 24 * 90 });
        return svar({ ok: true, kod, lank: `${env.APP_BASE}#/k/${kod}`, inbjudan: inv });
      }
      if (p === '/admin/inbjudningar' && req.method === 'GET') {
        const inbjudningar = (await hamtaAlla(env, 'inv:')).sort((a, b) => b.skapad.localeCompare(a.skapad));
        const anvandare = (await hamtaAlla(env, 'user:')).sort((a, b) => (b.senast || '').localeCompare(a.senast || ''));
        return svar({ ok: true, inbjudningar, anvandare });
      }
      if (p === '/admin/notis' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const r = await fetch(`${env.PUSH_BASE}/skicka`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hemlig: env.PUSH_HEMLIG, text: ren(d.text, 180), title: ren(d.title, 40) || 'CAP Online' }) });
        return svar(await r.json().catch(() => ({ ok: false, fel: 'pushservern svarade konstigt' })), r.status);
      }
      return fel('okänd adminadress', 404);
    }
    return fel('okänd adress', 404);
  },
};
