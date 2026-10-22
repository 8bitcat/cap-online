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
// Tider och bokning (Carl 2026-10-22: "kalender för veckan … som på bio, 60 sekunder på sig")
//   GET  /veckor          Bearer                    → {nu: "2026-W43", veckor: [{v, slots}]} öppna veckor från och med denna
//   POST /boka/hall       {v, slot, barn}           → {ok, tills}   håller platsen i 60 s
//   POST /boka/bekrafta   {v, slot, barn}           → {ok}
//   POST /boka/avboka     {v, slot}                 → {ok}
//   GET  /mina            Bearer                    → {bokningar, planer}  mina bokade tider + pass Haris delat
//   GET  /admin/veckor                              → {nu, veckor}  alla veckor från och med denna
//   PUT  /admin/vecka/<v> {oppen, slots}            → {vecka}
//   POST /admin/vecka/<v>/auto {dagar, start, slut, langd, plats} → {vecka}  autosätter lediga tider
//   POST /admin/vecka/<v>/duplicera {till}          → {vecka}  kopierar tiderna (obokade) till en annan vecka
// Stigen (listorna i prototyp 4 går att ändra i admin)
//   GET  /config/stig                               → {drommar, etapper} eller {} om inget sparats
//   PUT  /admin/config/stig {drommar, etapper}
// Haris pass för en spelare (block med film, tidtagning och samtal, delas med föräldern)
//   GET  /admin/planer · POST /admin/plan · PUT /admin/plan/<id> · DELETE /admin/plan/<id>
//
// KV: adm:<token> adminsession · inv:<KOD> inbjudan · user:<uid> · email:<email>=uid · sess:<token>={uid}
//     film:<id> · vecka:<YYYY-Www> · config:stig · plan:<id> (listas med prefix, färre än tusen i prototypen)

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

// ---------- veckor ----------
// ISO-vecka som "2026-W43" och måndagens datum, räknat i svensk tid (UTC+1/+2 spelar ingen roll för veckonumret i praktiken)
function veckaAv(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dag = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dag + 3);
  const forsta = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const v = 1 + Math.round(((x - forsta) / 864e5 - 3 + ((forsta.getUTCDay() + 6) % 7)) / 7);
  return `${x.getUTCFullYear()}-W${String(v).padStart(2, '0')}`;
}
const VECKA_RE = /^\d{4}-W\d{2}$/;
function mandag(v) {
  const [ar, w] = v.split('-W').map(Number);
  const j4 = new Date(Date.UTC(ar, 0, 4));
  const m = new Date(j4); m.setUTCDate(j4.getUTCDate() - ((j4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return m;
}
const veckaPlus = (v, n) => veckaAv(new Date(mandag(v).getTime() + n * 7 * 864e5));
const tidOk = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
function renSlot(s, gammal = null) {
  const id = /^[a-z0-9]{4,12}$/.test(String(s.id || '')) ? s.id : slump(6, 'abcdefghijklmnopqrstuvwxyz0123456789');
  const dag = Math.min(7, Math.max(1, Math.round(+s.dag || 1)));
  return { id, dag, start: tidOk(s.start) ? s.start : '17:00', slut: tidOk(s.slut) ? s.slut : '18:00', plats: ren(s.plats, 60),
    bokad: gammal?.bokad || null, hall: gammal?.hall || null };
}
async function hamtaVecka(env, v) {
  return (await env.DB.get(`vecka:${v}`, 'json')) || { v, oppen: false, slots: [] };
}
function stadaHall(vecka) {
  const nu = Date.now();
  for (const s of vecka.slots) if (s.hall && s.hall.tills < nu) s.hall = null;
  return vecka;
}
// För föräldrar: bara det som behövs, och aldrig andras namn
function publikVecka(vecka, uid) {
  return { v: vecka.v, oppen: vecka.oppen, slots: vecka.slots.map(s => ({
    id: s.id, dag: s.dag, start: s.start, slut: s.slut, plats: s.plats,
    status: s.bokad ? (s.bokad.uid === uid ? 'min' : 'upptagen') : s.hall ? (s.hall.uid === uid ? 'haller' : 'hall') : 'ledig',
    tills: s.hall?.uid === uid ? s.hall.tills : undefined,
  })) };
}
async function sessionUser(env, req) {
  const s = await env.DB.get(`sess:${bearer(req)}`, 'json');
  return s ? await env.DB.get(`user:${s.uid}`, 'json') : null;
}
function renBlock(b) {
  const typ = ['ovning', 'film', 'tid', 'samtal', 'text'].includes(b.typ) ? b.typ : 'ovning';
  return {
    id: /^[a-z0-9]{4,12}$/.test(String(b.id || '')) ? b.id : slump(6, 'abcdefghijklmnopqrstuvwxyz0123456789'),
    typ, titel: ren(b.titel, 80), desc: ren(b.desc, 400), minuter: Math.max(0, Math.min(120, Math.round(+b.minuter || 0))),
    fardighet: ren(b.fardighet, 40), mal: Math.max(0, Math.round(+b.mal || 0)),
    tider: (Array.isArray(b.tider) ? b.tider : []).slice(0, 20).map(t => ({ sek: Math.max(0, Math.round((+t.sek || 0) * 10) / 10), t: ren(t.t, 30) })),
    film: b.film && typeof b.film === 'object' ? { namn: ren(b.film.namn, 60), url: ren(b.film.url, 400), poster: ren(b.film.poster, 400), t: ren(b.film.t, 30), filmId: ren(b.film.filmId, 40) } : null,
    kommentar: ren(b.kommentar, 600), klar: !!b.klar,
  };
}
function renPlan(d, gammal = {}) {
  return {
    id: gammal.id, skapad: gammal.skapad || nu(), uppdaterad: nu(),
    uid: ren(d.uid, 40) || gammal.uid || '', barn: ren(d.barn, 40), titel: ren(d.titel, 80) || 'Pass med Haris',
    datum: /^\d{4}-\d{2}-\d{2}$/.test(String(d.datum || '')) ? d.datum : (gammal.datum || nu().slice(0, 10)),
    bokning: d.bokning && typeof d.bokning === 'object' ? { v: ren(d.bokning.v, 10), slot: ren(d.bokning.slot, 12) } : (gammal.bokning || null),
    block: (Array.isArray(d.block) ? d.block : []).slice(0, 40).map(renBlock),
    delad: !!d.delad, anteckning: ren(d.anteckning, 1000),
  };
}
// Stigens listor från admin: bara kända fält
function renStigConfig(d) {
  const drommar = (Array.isArray(d.drommar) ? d.drommar : []).slice(0, 20).map(x => ({ id: ren(x.id, 20).toLowerCase().replace(/[^a-z0-9]/g, '') || slump(6, 'abcdefghijklmnopqrstuvwxyz'), namn: ren(x.namn, 40), ikon: ren(x.ikon, 4), desc: ren(x.desc, 120) })).filter(x => x.namn);
  const etapper = (Array.isArray(d.etapper) ? d.etapper : []).slice(0, 10).map((e, i) => ({
    n: i + 1,
    noder: (Array.isArray(e.noder) ? e.noder : []).slice(0, 40).map(n => {
      const typ = ['film', 'block', 'fraga', 'tid', 'video', 'grind'].includes(n.typ) ? n.typ : 'block';
      const ut = { id: ren(n.id, 30).replace(/[^A-Za-z0-9-]/g, '') || `n${slump(6, 'abcdefghijklmnopqrstuvwxyz0123456789')}`, typ, titel: ren(n.titel, 80), desc: ren(n.desc, 400) };
      if (n.session) ut.session = ren(n.session, 60);
      if (n.filmId) ut.filmId = ren(n.filmId, 40);
      if (n.modul) ut.modul = ren(n.modul, 40);
      if (Array.isArray(n.text)) ut.text = n.text.slice(0, 10).map(t => ren(t, 600));
      if (Array.isArray(n.position) && n.position.length) ut.position = n.position.map(p => ren(p, 10)).filter(Boolean);
      if (n.mal) ut.mal = Math.max(0, Math.round(+n.mal));
      if (n.krav) ut.krav = n.krav === 'tid' ? 'tid' : 'video';
      if (n.fardighet) ut.fardighet = ren(n.fardighet, 40);
      return ut;
    }).filter(n => n.titel),
  }));
  return { drommar, etapper, uppdaterad: nu() };
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

    // ---------- stigens listor ----------
    if (p === '/config/stig' && req.method === 'GET') return svar({ ok: true, config: (await env.DB.get('config:stig', 'json')) || null });

    // ---------- veckor och bokning (förälder) ----------
    if (p === '/veckor' && req.method === 'GET') {
      const user = await sessionUser(env, req);
      if (!user) return fel('inte inloggad', 401);
      const nuV = veckaAv();
      const alla = (await hamtaAlla(env, 'vecka:')).filter(w => w.oppen && w.v >= nuV).sort((a, b) => a.v.localeCompare(b.v));
      return svar({ ok: true, nu: nuV, veckor: alla.map(w => publikVecka(stadaHall(w), user.uid)) });
    }
    if (p.startsWith('/boka/') && req.method === 'POST') {
      const user = await sessionUser(env, req);
      if (!user) return fel('inte inloggad', 401);
      const d = await json(); if (!d) return fel('trasig JSON');
      const v = String(d.v || '');
      if (!VECKA_RE.test(v)) return fel('ogiltig vecka');
      const vecka = stadaHall(await hamtaVecka(env, v));
      const s = vecka.slots.find(x => x.id === String(d.slot || ''));
      if (!s || !vecka.oppen) return fel('tiden finns inte', 404);
      const now = Date.now();
      if (p === '/boka/hall') {
        if (s.bokad) return fel(s.bokad.uid === user.uid ? 'du har redan bokat den här tiden' : 'tiden är redan bokad', 409);
        if (s.hall && s.hall.uid !== user.uid && s.hall.tills > now) return fel(`någon annan håller platsen i ${Math.ceil((s.hall.tills - now) / 1000)} s`, 409);
        s.hall = { uid: user.uid, tills: now + 60000 };
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        return svar({ ok: true, tills: s.hall.tills });
      }
      if (p === '/boka/bekrafta') {
        if (s.bokad) return fel('tiden hann bli bokad', 409);
        if (!s.hall || s.hall.uid !== user.uid || s.hall.tills < now) return fel('dina 60 sekunder gick ut, håll platsen igen', 410);
        s.bokad = { uid: user.uid, namn: user.namn || '', barn: ren(d.barn, 40) || user.barn || '', email: user.email, t: nu() };
        s.hall = null;
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        return svar({ ok: true, slot: publikVecka(vecka, user.uid).slots.find(x => x.id === s.id) });
      }
      if (p === '/boka/avboka') {
        if (s.bokad?.uid === user.uid) s.bokad = null;
        if (s.hall?.uid === user.uid) s.hall = null;
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        return svar({ ok: true });
      }
    }
    if (p === '/mina' && req.method === 'GET') {
      const user = await sessionUser(env, req);
      if (!user) return fel('inte inloggad', 401);
      const veckor = await hamtaAlla(env, 'vecka:');
      const bokningar = [];
      for (const w of veckor) for (const s of w.slots) if (s.bokad?.uid === user.uid) bokningar.push({ v: w.v, id: s.id, dag: s.dag, start: s.start, slut: s.slut, plats: s.plats, barn: s.bokad.barn, mandag: mandag(w.v).toISOString().slice(0, 10) });
      bokningar.sort((a, b) => (a.v + a.dag + a.start).localeCompare(b.v + b.dag + b.start));
      const planer = (await hamtaAlla(env, 'plan:')).filter(x => x.uid === user.uid && x.delad).sort((a, b) => b.datum.localeCompare(a.datum));
      return svar({ ok: true, bokningar, planer });
    }

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

      // veckor och tider
      if (p === '/admin/veckor' && req.method === 'GET') {
        const nuV = veckaAv();
        const veckor = (await hamtaAlla(env, 'vecka:')).filter(w => w.v >= veckaPlus(nuV, -1)).sort((a, b) => a.v.localeCompare(b.v)).map(stadaHall);
        return svar({ ok: true, nu: nuV, veckor, mandag: Object.fromEntries(veckor.map(w => [w.v, mandag(w.v).toISOString().slice(0, 10)])) });
      }
      const mv = /^\/admin\/vecka\/(\d{4}-W\d{2})(\/auto|\/duplicera)?$/.exec(p);
      if (mv) {
        const v = mv[1];
        const d = await json(); if (!d) return fel('trasig JSON');
        const vecka = stadaHall(await hamtaVecka(env, v));
        if (!mv[2] && req.method === 'PUT') {
          const gamla = Object.fromEntries(vecka.slots.map(s => [s.id, s]));
          vecka.oppen = !!d.oppen;
          vecka.slots = (Array.isArray(d.slots) ? d.slots : []).slice(0, 60).map(s => renSlot(s, gamla[s.id])).sort((a, b) => a.dag - b.dag || a.start.localeCompare(b.start));
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka });
        }
        if (mv[2] === '/auto' && req.method === 'POST') {
          const dagar = (Array.isArray(d.dagar) ? d.dagar : [1, 2, 3, 4, 5]).map(Number).filter(x => x >= 1 && x <= 7);
          const start = tidOk(d.start) ? d.start : '16:00', slut = tidOk(d.slut) ? d.slut : '20:00';
          const langd = Math.max(15, Math.min(240, Math.round(+d.langd || 60)));
          const [sh, sm] = start.split(':').map(Number), [eh, em] = slut.split(':').map(Number);
          const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          for (const dag of dagar) for (let m = sh * 60 + sm; m + langd <= eh * 60 + em; m += langd) {
            if (vecka.slots.some(s => s.dag === dag && s.start === fmt(m))) continue;
            vecka.slots.push(renSlot({ dag, start: fmt(m), slut: fmt(m + langd), plats: d.plats }));
          }
          vecka.slots.sort((a, b) => a.dag - b.dag || a.start.localeCompare(b.start));
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka });
        }
        if (mv[2] === '/duplicera' && req.method === 'POST') {
          const till = VECKA_RE.test(String(d.till || '')) ? d.till : veckaPlus(v, 1);
          const ny = stadaHall(await hamtaVecka(env, till));
          for (const s of vecka.slots) if (!ny.slots.some(x => x.dag === s.dag && x.start === s.start)) ny.slots.push(renSlot({ dag: s.dag, start: s.start, slut: s.slut, plats: s.plats }));
          ny.slots.sort((a, b) => a.dag - b.dag || a.start.localeCompare(b.start));
          await env.DB.put(`vecka:${till}`, JSON.stringify(ny));
          return svar({ ok: true, vecka: ny });
        }
      }

      // stigens listor
      if (p === '/admin/config/stig' && req.method === 'PUT') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const cfg = renStigConfig(d);
        await env.DB.put('config:stig', JSON.stringify(cfg));
        return svar({ ok: true, config: cfg });
      }

      // Haris pass per spelare
      if (p === '/admin/planer' && req.method === 'GET') {
        const planer = (await hamtaAlla(env, 'plan:')).sort((a, b) => (b.datum + b.uppdaterad).localeCompare(a.datum + a.uppdaterad));
        const anvandare = (await hamtaAlla(env, 'user:')).map(u => ({ uid: u.uid, email: u.email, namn: u.namn, barn: u.barn }));
        return svar({ ok: true, planer, anvandare });
      }
      if (p === '/admin/plan' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const plan = renPlan(d, { id: 'p' + Date.now().toString(36) + slump(4, 'abcdefghijklmnopqrstuvwxyz0123456789') });
        await env.DB.put(`plan:${plan.id}`, JSON.stringify(plan));
        return svar({ ok: true, plan });
      }
      const mpl = /^\/admin\/plan\/([a-z0-9]+)$/.exec(p);
      if (mpl && (req.method === 'PUT' || req.method === 'DELETE' || req.method === 'GET')) {
        const gammal = await env.DB.get(`plan:${mpl[1]}`, 'json');
        if (!gammal) return fel('passet finns inte', 404);
        if (req.method === 'GET') return svar({ ok: true, plan: gammal });
        if (req.method === 'DELETE') { await env.DB.delete(`plan:${mpl[1]}`); return svar({ ok: true }); }
        const d = await json(); if (!d) return fel('trasig JSON');
        const plan = renPlan(d, gammal);
        await env.DB.put(`plan:${plan.id}`, JSON.stringify(plan));
        return svar({ ok: true, plan });
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
