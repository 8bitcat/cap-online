// CAP Online API. Cloudflare Worker med KV (DB) och, när det är påslaget, R2 (MEDIA) för filmer och ljud.
//
// Konton och inloggning (Carl 2026-10-23: "logga in med telefonnummer … sms med länken … glömt lösenord")
//   POST /auth/kod        {kod}                     → {token, user}   länken #/k/KOD ur sms:et (eller en gammal e-postkod)
//   POST /auth/login      {telefon, pin}            → {token, user}   mobilnummer + den kod föräldern valt
//   POST /auth/pin        {pin}  Bearer             → {ok}            välj (ny) kod; länkens engångskod förbrukas
//   POST /auth/glomt      {telefon}                 → {ok, skickat}   ny länk via sms, annars får Haris en flagga i registret
//   GET  /auth/me         Bearer <token>            → {user}
//   POST /auth/ut         Bearer <token>            → {ok}
// Innehåll (inloggad eller gäst)
//   GET  /filmer                                    → {filmer: [publicerade]}
//   GET  /media/<key>                               → filmen/omslaget/ljudet ur R2 (Range-stöd)
// Tider och bokning (förälder)
//   GET  /veckor          Bearer                    → {nu, veckor: [{v, slots}]} öppna veckor från och med denna
//   POST /boka/hall · /boka/bekrafta · /boka/avboka {v, slot}
//   GET  /mina            Bearer                    → {klient, bokningar, planer, bedomningar, media}
// Admin (Bearer <admintoken> från /admin/login)
//   POST /admin/login     {losen}                   → {token}
//   Klientregistret: GET /admin/klienter · POST /admin/klient · GET/PUT/DELETE /admin/klient/<id>
//     POST /admin/klient/<id>/lank      {skicka}         → ny länk (+ sms om det är påslaget)
//     POST /admin/klient/<id>/niva      {niva, kommentar}
//     POST /admin/klient/<id>/bedomning {namn, varv, kommentar, mediaId, planId, blockId} · DELETE …/bedomning/<bid>
//     POST /admin/klient/<id>/media     {typ, url, key, namn, titel, planId, blockId} · DELETE …/media/<mid>
//     POST /admin/klient/<id>/boka      {v, slot} · POST …/avboka {v, slot}   Haris bokar åt en befintlig kund
//   Filmer: GET /admin/filmer · POST /admin/film · PUT/DELETE /admin/film/<id>
//   Uppladdning i delar till R2: POST /admin/upload/start {filmId|klientId, filnamn, typ} · PUT /admin/upload/part · POST /admin/upload/complete · PUT /admin/upload/poster/<id>
//   Tider: GET /admin/veckor · PUT /admin/vecka/<v> · POST /admin/vecka/<v>/auto · POST /admin/vecka/<v>/duplicera
//   Stigen: GET /config/stig · PUT /admin/config/stig
//   Pass: GET /admin/planer · POST /admin/plan · GET/PUT/DELETE /admin/plan/<id>
//   Övrigt: POST /admin/notis (push) · POST /admin/inbjudan + GET /admin/inbjudningar (gamla e-postkoder, kvar för bakåtkompatibilitet)
//
// KV: adm:<token> · klient:<id> · klienter (index) · tel:<telefon>=id · kod:<KOD>={klientId} · sess:<token>={uid}
//     bed:<klientId> (bedömningar) · med:<klientId> (filmer/ljud) · lim:<telefon> (inloggningsförsök)
//     film:<id> · vecka:<YYYY-Www> · config:stig · plan:<id> · inv:<KOD>, user:<uid>, email:<email> (gamla konton)
// SMS: 46elks när hemligheterna SMS_USER och SMS_PASS finns (SMS_FROM = avsändare, standard "CAP"). Annars skickar
//      Haris länken själv från sin telefon (appen öppnar Meddelanden med texten ifylld).

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400' };
const svar = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const fel = (text, status = 400) => svar({ ok: false, fel: text }, status);
const KOD_TECKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SMA = 'abcdefghijklmnopqrstuvwxyz0123456789';
const slump = (n, tecken = KOD_TECKEN) => { const a = crypto.getRandomValues(new Uint8Array(n)); return [...a].map(b => tecken[b % tecken.length]).join(''); };
const tokenNy = () => slump(40, SMA);
const nyttId = (p = '') => p + Date.now().toString(36) + slump(4, SMA);
const ren = (v, n = 80) => String(v ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const email = v => { const e = ren(v, 120).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null; };
const nu = () => new Date().toISOString();
const idag = () => nu().slice(0, 10);
const DIM = ['alder', 'niva', 'position', 'omrade', 'fardighet', 'typ', 'fas', 'svarighet', 'utrustning', 'yta', 'sallskap', 'plats'];
const POSITIONER = ['mv', 'back', 'mitt', 'anf', 'okand'];
const slug = s => ren(s, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

// ---------- telefonnummer, pin, sms ----------
// Svenska nummer skrivs om till +46…; andra länder funkar om de skrivs med +.
function telefonNorm(v) {
  let t = String(v || '').replace(/[\s\-()./]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (/^0\d{6,12}$/.test(t)) t = '+46' + t.slice(1);
  if (/^46\d{8,10}$/.test(t)) t = '+' + t;
  return /^\+\d{8,15}$/.test(t) ? t : null;
}
const pinOk = p => /^\d{4,6}$/.test(String(p || ''));
async function pinHash(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 3000 }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const smsPa = env => !!(env.SMS_USER && env.SMS_PASS);
async function skickaSms(env, till, text) {
  if (!smsPa(env)) return { ok: false, skickat: false, fel: 'sms är inte påslaget', av: true };
  try {
    const r = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: { authorization: 'Basic ' + btoa(`${env.SMS_USER}:${env.SMS_PASS}`), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ from: env.SMS_FROM || 'CAP', to: till, message: text }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, skickat: false, fel: j.message || j.error || `${r.status}` };
    return { ok: true, skickat: true, id: j.id };
  } catch (e) { return { ok: false, skickat: false, fel: String(e?.message || e) }; }
}
const lank = (env, kod) => `${env.APP_BASE}#/k/${kod}`;
function smsText(k, l) {
  return `Hej${k.foralder ? ' ' + k.foralder : ''}! Här är din länk till CAP Online, träningsappen för ${k.barn || 'ditt barn'}: ${l}\n\nÖppna länken och välj en kod med fyra siffror. Sedan loggar du in med ditt mobilnummer och koden.\n\n/Haris, Complete Athletic Performance`;
}

// ---------- klienter ----------
function renKlient(d, gammal = {}) {
  const niva = Math.min(5, Math.max(1, Math.round(+d.niva || gammal.niva || 1)));
  const hist = (gammal.nivaHistorik || []).slice(0, 200);
  if (!hist.length || hist.at(-1).niva !== niva) hist.push({ niva, t: nu(), kommentar: hist.length ? ren(d.nivaKommentar, 200) : 'Start' });
  return {
    id: gammal.id, skapad: gammal.skapad || nu(), uppdaterad: nu(), senast: gammal.senast || null,
    telefon: telefonNorm(d.telefon) || gammal.telefon || null,
    foralder: ren(d.foralder, 60), email: email(d.email) || '',
    barn: ren(d.barn, 40), fodd: /^\d{4}$/.test(String(d.fodd || '')) ? +d.fodd : (gammal.fodd || null),
    position: POSITIONER.includes(d.position) ? d.position : (gammal.position || 'okand'), lag: ren(d.lag, 60),
    niva, nivaHistorik: hist, anteckning: ren(d.anteckning, 2000),
    status: ['ny', 'aktiv', 'paus'].includes(d.status) ? d.status : (gammal.status || 'ny'),
    pin: gammal.pin || null, kod: gammal.kod || null, vilLank: gammal.vilLank || null,
  };
}
// Det föräldern och adminlistan får se (aldrig pin-hashen)
const publikKlient = k => { const { pin, ...rest } = k; return { ...rest, harPin: !!pin }; };
const userAvKlient = k => ({ uid: k.id, klientId: k.id, typ: 'klient', namn: k.foralder, barn: k.barn, telefon: k.telefon, email: k.email, fodd: k.fodd, position: k.position, niva: k.niva, harPin: !!k.pin });
async function klientIndex(env) { return (await env.DB.get('klienter', 'json')) || []; }
async function hamtaKlient(env, id) { return /^[a-z0-9]{4,20}$/.test(String(id || '')) ? env.DB.get(`klient:${id}`, 'json') : null; }
async function sparaKlient(env, k) { await env.DB.put(`klient:${k.id}`, JSON.stringify(k)); }
async function hamtaKlienter(env) {
  const ids = await klientIndex(env);
  return (await Promise.all(ids.map(id => env.DB.get(`klient:${id}`, 'json')))).filter(Boolean);
}
// Ny engångslänk: koden pekar på klienten i 90 dagar och förbrukas när pin valts
async function nyKod(env, k) {
  if (k.kod?.kod) await env.DB.delete(`kod:${k.kod.kod}`);
  let kod; do { kod = slump(6); } while (await env.DB.get(`kod:${kod}`));
  await env.DB.put(`kod:${kod}`, JSON.stringify({ klientId: k.id, skapad: nu() }), { expirationTtl: 60 * 60 * 24 * 90 });
  k.kod = { kod, skapad: nu(), anvand: null };
  return kod;
}
async function nySession(env, uid) {
  const token = tokenNy();
  await env.DB.put(`sess:${token}`, JSON.stringify({ uid, skapad: nu() }), { expirationTtl: 60 * 60 * 24 * 180 });
  return token;
}
const renBedomning = (d, gammal = {}) => {
  const varv = (Array.isArray(d.varv) ? d.varv : []).map(x => Math.round((+x || 0) * 10) / 10).filter(x => x > 0).slice(0, 20);
  const namn = ren(d.namn, 60) || gammal.namn || 'Bedömning';
  return {
    id: gammal.id || nyttId('b'), typ: slug(namn) || 'bedomning', namn,
    datum: /^\d{4}-\d{2}-\d{2}$/.test(String(d.datum || '')) ? d.datum : (gammal.datum || idag()), t: gammal.t || nu(),
    varv, medel: varv.length ? Math.round(varv.reduce((a, b) => a + b, 0) / varv.length * 10) / 10 : 0, bast: varv.length ? Math.min(...varv) : 0,
    kommentar: ren(d.kommentar, 600), mediaId: ren(d.mediaId, 40), planId: ren(d.planId, 40), blockId: ren(d.blockId, 20),
  };
};
const renMedia = (d, klientId) => ({
  id: /^[a-z0-9]{4,24}$/.test(String(d.id || '')) ? d.id : nyttId('m'), klientId,
  typ: d.typ === 'audio' ? 'audio' : 'video', url: ren(d.url, 400), key: ren(d.key, 200), poster: ren(d.poster, 400),
  namn: ren(d.namn, 80), titel: ren(d.titel, 120), t: /^\d{4}-\d{2}-\d{2}T/.test(String(d.t || '')) ? d.t : nu(),
  planId: ren(d.planId, 40), blockId: ren(d.blockId, 20), bedId: ren(d.bedId, 40), delad: d.delad !== false,
});

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
const datumFor = (v, dag) => new Date(mandag(v).getTime() + (dag - 1) * 864e5).toISOString().slice(0, 10);
const tidOk = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
function renSlot(s, gammal = null) {
  const id = /^[a-z0-9]{4,12}$/.test(String(s.id || '')) ? s.id : slump(6, SMA);
  const dag = Math.min(7, Math.max(1, Math.round(+s.dag || 1)));
  return { id, dag, start: tidOk(s.start) ? s.start : '17:00', slut: tidOk(s.slut) ? s.slut : '18:00', plats: ren(s.plats, 60),
    bokad: gammal?.bokad || null, hall: gammal?.hall || null };
}
async function hamtaVecka(env, v) {
  return (await env.DB.get(`vecka:${v}`, 'json')) || { v, oppen: false, slots: [] };
}
// Sorterar tiderna, kastar dubbletter och överlapp på samma dag (bokade tider vinner), och
// rättar tider där slutet ligger före starten. Returnerar hur många som kastades.
const minuter = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function stadaSlots(slots) {
  const sorterade = slots.map(s => (minuter(s.slut) <= minuter(s.start) ? { ...s, slut: `${String(Math.min(23, Math.floor((minuter(s.start) + 60) / 60))).padStart(2, '0')}:${String((minuter(s.start) + 60) % 60).padStart(2, '0')}` } : s))
    .sort((a, b) => a.dag - b.dag || minuter(a.start) - minuter(b.start) || (b.bokad ? 1 : 0) - (a.bokad ? 1 : 0));
  const ut = [];
  let kastade = 0;
  for (const s of sorterade) {
    const f = ut[ut.length - 1];
    if (f && f.dag === s.dag && minuter(s.start) < minuter(f.slut)) {
      if (s.bokad && !f.bokad) ut[ut.length - 1] = s; // den bokade vinner
      kastade++;
      continue;
    }
    ut.push(s);
  }
  return { slots: ut, kastade };
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
// Bokade tider för ett konto, ur alla veckor
function bokningarFor(veckor, uid) {
  const ut = [];
  for (const w of veckor) for (const s of w.slots) if (s.bokad?.uid === uid) ut.push({ v: w.v, id: s.id, dag: s.dag, start: s.start, slut: s.slut, plats: s.plats, barn: s.bokad.barn, datum: datumFor(w.v, s.dag), mandag: mandag(w.v).toISOString().slice(0, 10), av: s.bokad.av || 'foralder' });
  return ut.sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start));
}
async function sessionUser(env, req) {
  const s = await env.DB.get(`sess:${bearer(req)}`, 'json');
  if (!s) return null;
  const k = await env.DB.get(`klient:${s.uid}`, 'json');
  if (k) return userAvKlient(k);
  return env.DB.get(`user:${s.uid}`, 'json');
}
function renBlock(b) {
  const typ = ['ovning', 'film', 'tid', 'samtal', 'text', 'bedomning'].includes(b.typ) ? b.typ : 'ovning';
  const ut = {
    id: /^[a-z0-9]{4,12}$/.test(String(b.id || '')) ? b.id : slump(6, SMA),
    typ, titel: ren(b.titel, 80), desc: ren(b.desc, 400), minuter: Math.max(0, Math.min(120, Math.round(+b.minuter || 0))),
    fardighet: ren(b.fardighet, 40), mal: Math.max(0, Math.round(+b.mal || 0)),
    tider: (Array.isArray(b.tider) ? b.tider : []).slice(0, 20).map(t => ({ sek: Math.max(0, Math.round((+t.sek || 0) * 10) / 10), t: ren(t.t, 30) })),
    film: b.film && typeof b.film === 'object' ? { namn: ren(b.film.namn, 60), url: ren(b.film.url, 400), poster: ren(b.film.poster, 400), t: ren(b.film.t, 30), filmId: ren(b.film.filmId, 40) } : null,
    media: (Array.isArray(b.media) ? b.media : []).slice(0, 12).map(m => ({ id: ren(m.id, 24), typ: m.typ === 'audio' ? 'audio' : 'video', url: ren(m.url, 400), poster: ren(m.poster, 400), namn: ren(m.namn, 80), t: ren(m.t, 30), lokal: !!m.lokal })),
    kommentar: ren(b.kommentar, 600), klar: !!b.klar,
  };
  if (typ === 'bedomning') {
    ut.varv = Math.max(1, Math.min(10, Math.round(+b.varv || 3)));
    ut.resultat = b.resultat && typeof b.resultat === 'object' ? {
      varv: (Array.isArray(b.resultat.varv) ? b.resultat.varv : []).slice(0, 20).map(x => Math.round((+x || 0) * 10) / 10),
      medel: Math.round((+b.resultat.medel || 0) * 10) / 10, bast: Math.round((+b.resultat.bast || 0) * 10) / 10, bedId: ren(b.resultat.bedId, 40), t: ren(b.resultat.t, 30),
    } : null;
  }
  return ut;
}
function renPlan(d, gammal = {}) {
  return {
    id: gammal.id, skapad: gammal.skapad || nu(), uppdaterad: nu(),
    uid: ren(d.uid, 40) || gammal.uid || '', barn: ren(d.barn, 40), titel: ren(d.titel, 80) || 'Pass med Haris',
    datum: /^\d{4}-\d{2}-\d{2}$/.test(String(d.datum || '')) ? d.datum : (gammal.datum || idag()),
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
      const ut = { id: ren(n.id, 30).replace(/[^A-Za-z0-9-]/g, '') || `n${slump(6, SMA)}`, typ, titel: ren(n.titel, 80), desc: ren(n.desc, 400) };
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
const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
function filEnd(filnamn, typ) {
  const m = /\.(mp4|mov|m4v|webm|m4a|aac|ogg|mp3|wav)$/i.exec(ren(filnamn, 120));
  if (m) return '.' + m[1].toLowerCase();
  const t = String(typ || '').toLowerCase();
  if (t.startsWith('audio/mp4') || t.includes('aac')) return '.m4a';
  if (t.startsWith('audio/webm')) return '.webm';
  if (t.startsWith('audio/ogg')) return '.ogg';
  if (t.startsWith('audio/mpeg')) return '.mp3';
  if (t.startsWith('audio/wav')) return '.wav';
  if (t.startsWith('video/webm')) return '.webm';
  if (t.startsWith('video/quicktime')) return '.mov';
  return '.mp4';
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const p = url.pathname;
    const base = (env.PUBLIC_BASE || url.origin).replace(/\/$/, '');

    if (req.method === 'GET' && p === '/') return svar({ ok: true, app: 'CAP Online API', r2: !!env.MEDIA, sms: smsPa(env) });
    if (req.method === 'GET' && p.startsWith('/media/')) return media(req, env, decodeURIComponent(p.slice(7)));

    const json = async () => { try { return await req.json(); } catch { return null; } };

    // ---------- inloggning ----------
    if (p === '/auth/kod' && req.method === 'POST') {
      const d = await json(); if (!d) return fel('trasig JSON');
      const kod = String(d.kod || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (kod.length < 6) return fel('koden ska vara sex tecken');
      // ny klientlänk
      const kl = await env.DB.get(`kod:${kod}`, 'json');
      if (kl) {
        const k = await hamtaKlient(env, kl.klientId);
        if (!k) return fel('kontot finns inte längre', 404);
        k.senast = nu(); if (k.kod?.kod === kod && !k.kod.anvand) k.kod.anvand = nu(); if (k.status === 'ny') k.status = 'aktiv'; k.vilLank = null;
        await sparaKlient(env, k);
        return svar({ ok: true, token: await nySession(env, k.id), user: userAvKlient(k), valjPin: true });
      }
      // gammal e-postkod
      const inv = await env.DB.get(`inv:${kod}`, 'json');
      if (!inv) return fel('koden finns inte eller har gått ut', 404);
      let uid = await env.DB.get(`email:${inv.email}`);
      let user = uid ? await env.DB.get(`user:${uid}`, 'json') : null;
      if (!user) {
        uid = slump(12, SMA);
        user = { uid, email: inv.email, namn: inv.namn || '', barn: inv.barn || '', skapad: nu(), senast: nu() };
        await env.DB.put(`user:${uid}`, JSON.stringify(user));
        await env.DB.put(`email:${inv.email}`, uid);
      } else {
        user.senast = nu();
        await env.DB.put(`user:${uid}`, JSON.stringify(user));
      }
      if (!inv.anvand) { inv.anvand = nu(); await env.DB.put(`inv:${kod}`, JSON.stringify(inv), { expirationTtl: 60 * 60 * 24 * 90 }); }
      return svar({ ok: true, token: await nySession(env, uid), user });
    }
    if (p === '/auth/login' && req.method === 'POST') {
      const d = await json(); if (!d) return fel('trasig JSON');
      const tel = telefonNorm(d.telefon);
      if (!tel) return fel('skriv mobilnumret, t.ex. 070-123 45 67');
      if (!pinOk(d.pin)) return fel('koden är fyra till sex siffror');
      const limKey = `lim:${tel}`;
      const forsok = +(await env.DB.get(limKey)) || 0;
      if (forsok >= 10) return fel('för många försök, vänta en kvart och prova igen', 429);
      const id = await env.DB.get(`tel:${tel}`);
      const k = id ? await hamtaKlient(env, id) : null;
      if (!k) return fel('numret finns inte hos Haris än', 404);
      if (!k.pin) return fel('du har ingen kod än, öppna länken du fick av Haris först', 409);
      if ((await pinHash(d.pin, k.pin.salt)) !== k.pin.hash) { await env.DB.put(limKey, String(forsok + 1), { expirationTtl: 900 }); return fel(`fel kod${forsok >= 6 ? `, ${10 - forsok - 1} försök kvar` : ''}`, 403); }
      await env.DB.delete(limKey);
      k.senast = nu(); if (k.status === 'ny') k.status = 'aktiv';
      await sparaKlient(env, k);
      return svar({ ok: true, token: await nySession(env, k.id), user: userAvKlient(k) });
    }
    if (p === '/auth/pin' && req.method === 'POST') {
      const d = await json(); if (!d) return fel('trasig JSON');
      if (!pinOk(d.pin)) return fel('koden är fyra till sex siffror');
      const s = await env.DB.get(`sess:${bearer(req)}`, 'json');
      const k = s && await hamtaKlient(env, s.uid);
      if (!k) return fel('inte inloggad', 401);
      const salt = slump(16, SMA);
      k.pin = { salt, hash: await pinHash(d.pin, salt), t: nu() };
      if (k.kod?.kod) { await env.DB.delete(`kod:${k.kod.kod}`); k.kod = { ...k.kod, anvand: k.kod.anvand || nu(), forbrukad: nu() }; }
      k.vilLank = null; k.status = 'aktiv';
      await sparaKlient(env, k);
      return svar({ ok: true, user: userAvKlient(k) });
    }
    if (p === '/auth/glomt' && req.method === 'POST') {
      const d = await json(); if (!d) return fel('trasig JSON');
      const tel = telefonNorm(d.telefon);
      if (!tel) return fel('skriv mobilnumret, t.ex. 070-123 45 67');
      const id = await env.DB.get(`tel:${tel}`);
      const k = id ? await hamtaKlient(env, id) : null;
      if (!k) return fel('numret finns inte hos Haris än', 404);
      const kod = await nyKod(env, k);
      const sms = await skickaSms(env, k.telefon, smsText(k, lank(env, kod)));
      if (!sms.skickat) k.vilLank = nu();
      await sparaKlient(env, k);
      return svar({ ok: true, skickat: sms.skickat, meddelande: sms.skickat ? 'En ny länk är skickad som sms till ditt nummer.' : 'Haris får ett meddelande och skickar en ny länk till dig.' });
    }
    if (p === '/auth/me' && req.method === 'GET') {
      const user = await sessionUser(env, req);
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
      if (!s || (!vecka.oppen && p !== '/boka/avboka')) return fel('tiden finns inte', 404);
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
        s.bokad = { uid: user.uid, namn: user.namn || '', barn: ren(d.barn, 40) || user.barn || '', email: user.email || '', telefon: user.telefon || '', t: nu(), av: 'foralder' };
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
      const bokningar = bokningarFor(veckor, user.uid);
      const planer = (await hamtaAlla(env, 'plan:')).filter(x => x.uid === user.uid && x.delad).sort((a, b) => b.datum.localeCompare(a.datum));
      const klient = user.klientId ? publikKlient(await hamtaKlient(env, user.klientId)) : null;
      const bedomningar = user.klientId ? ((await env.DB.get(`bed:${user.klientId}`, 'json')) || []) : [];
      const media = user.klientId ? ((await env.DB.get(`med:${user.klientId}`, 'json')) || []).filter(m => m.delad) : [];
      return svar({ ok: true, bokningar, planer, klient, bedomningar, media });
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

      // ----- klientregistret -----
      if (p === '/admin/klienter' && req.method === 'GET') {
        const [klienter, veckor, planer] = await Promise.all([hamtaKlienter(env), hamtaAlla(env, 'vecka:'), hamtaAlla(env, 'plan:')]);
        const nuV = veckaAv();
        const beds = await Promise.all(klienter.map(k => env.DB.get(`bed:${k.id}`, 'json')));
        const ut = klienter.map((k, i) => {
          const b = bokningarFor(veckor.filter(w => w.v >= nuV), k.id).filter(x => x.datum >= idag());
          const bed = (beds[i] || []).slice().sort((x, y) => (y.datum + y.t).localeCompare(x.datum + x.t));
          return { ...publikKlient(k), nastaTid: b[0] || null, antalPass: planer.filter(x => x.uid === k.id).length, antalBed: bed.length, senasteBed: bed[0] ? { namn: bed[0].namn, medel: bed[0].medel, datum: bed[0].datum } : null, lank: k.kod?.kod && !k.kod.forbrukad ? lank(env, k.kod.kod) : null };
        }).sort((a, b) => (a.barn || a.foralder || '').localeCompare(b.barn || b.foralder || '', 'sv'));
        return svar({ ok: true, klienter: ut, sms: smsPa(env), r2: !!env.MEDIA });
      }
      if (p === '/admin/klient' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const tel = telefonNorm(d.telefon);
        if (!tel) return fel('mobilnumret ser fel ut, skriv t.ex. 070-123 45 67');
        if (await env.DB.get(`tel:${tel}`)) return fel('det numret finns redan i registret', 409);
        if (!ren(d.barn, 40)) return fel('barnets namn saknas');
        const k = renKlient(d, { id: nyttId('k') });
        const kod = await nyKod(env, k);
        const l = lank(env, kod);
        const sms = d.skicka ? await skickaSms(env, tel, smsText(k, l)) : { ok: false, skickat: false, av: !smsPa(env) };
        await sparaKlient(env, k);
        await env.DB.put(`tel:${tel}`, k.id);
        const ids = await klientIndex(env); if (!ids.includes(k.id)) { ids.push(k.id); await env.DB.put('klienter', JSON.stringify(ids)); }
        return svar({ ok: true, klient: publikKlient(k), lank: l, kod, sms, smsText: smsText(k, l) });
      }
      const mk = /^\/admin\/klient\/([a-z0-9]+)(?:\/(lank|niva|bedomning|media|boka|avboka)(?:\/([a-z0-9]+))?)?$/.exec(p);
      if (mk) {
        const k = await hamtaKlient(env, mk[1]);
        if (!k) return fel('klienten finns inte', 404);
        const del = mk[2], sub = mk[3];
        if (!del && req.method === 'GET') {
          const [veckor, planer, bedomningar, media] = await Promise.all([hamtaAlla(env, 'vecka:'), hamtaAlla(env, 'plan:'), env.DB.get(`bed:${k.id}`, 'json'), env.DB.get(`med:${k.id}`, 'json')]);
          const l = k.kod?.kod && !k.kod.forbrukad ? lank(env, k.kod.kod) : null;
          return svar({ ok: true, klient: publikKlient(k), bokningar: bokningarFor(veckor, k.id), planer: planer.filter(x => x.uid === k.id).sort((a, b) => (b.datum + b.uppdaterad).localeCompare(a.datum + a.uppdaterad)),
            bedomningar: bedomningar || [], media: media || [], lank: l, smsText: l ? smsText(k, l) : '', sms: smsPa(env), r2: !!env.MEDIA });
        }
        if (!del && req.method === 'PUT') {
          const d = await json(); if (!d) return fel('trasig JSON');
          const tel = telefonNorm(d.telefon);
          if (!tel) return fel('mobilnumret ser fel ut');
          if (tel !== k.telefon) { const annan = await env.DB.get(`tel:${tel}`); if (annan && annan !== k.id) return fel('det numret finns redan på en annan klient', 409); }
          const ny = renKlient(d, k);
          if (tel !== k.telefon) { await env.DB.delete(`tel:${k.telefon}`); await env.DB.put(`tel:${tel}`, k.id); ny.telefon = tel; }
          await sparaKlient(env, ny);
          return svar({ ok: true, klient: publikKlient(ny) });
        }
        if (!del && req.method === 'DELETE') {
          await Promise.all([env.DB.delete(`klient:${k.id}`), env.DB.delete(`tel:${k.telefon}`), env.DB.delete(`bed:${k.id}`), env.DB.delete(`med:${k.id}`), k.kod?.kod ? env.DB.delete(`kod:${k.kod.kod}`) : null]);
          const ids = (await klientIndex(env)).filter(x => x !== k.id); await env.DB.put('klienter', JSON.stringify(ids));
          // släpp klientens kommande tider
          const nuV = veckaAv();
          for (const w of (await hamtaAlla(env, 'vecka:')).filter(x => x.v >= nuV)) {
            let andrad = false;
            for (const s of w.slots) if (s.bokad?.uid === k.id) { s.bokad = null; andrad = true; }
            if (andrad) await env.DB.put(`vecka:${w.v}`, JSON.stringify(w));
          }
          return svar({ ok: true });
        }
        const d = (await json()) || {};
        if (del === 'lank' && req.method === 'POST') {
          const kod = await nyKod(env, k);
          const l = lank(env, kod);
          const sms = d.skicka ? await skickaSms(env, k.telefon, smsText(k, l)) : { ok: false, skickat: false, av: !smsPa(env) };
          if (sms.skickat) k.vilLank = null;
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k), lank: l, kod, sms, smsText: smsText(k, l) });
        }
        if (del === 'niva' && req.method === 'POST') {
          const niva = Math.min(5, Math.max(1, Math.round(+d.niva || k.niva)));
          k.niva = niva; (k.nivaHistorik = k.nivaHistorik || []).push({ niva, t: nu(), kommentar: ren(d.kommentar, 200) }); k.uppdaterad = nu();
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k) });
        }
        if (del === 'bedomning') {
          const alla = (await env.DB.get(`bed:${k.id}`, 'json')) || [];
          if (req.method === 'DELETE' && sub) { const kvar = alla.filter(b => b.id !== sub); await env.DB.put(`bed:${k.id}`, JSON.stringify(kvar)); return svar({ ok: true, bedomningar: kvar }); }
          if (req.method === 'POST') {
            const b = renBedomning(d, sub ? alla.find(x => x.id === sub) || {} : {});
            if (!b.varv.length) return fel('minst en tid behövs');
            const i = alla.findIndex(x => x.id === b.id); if (i >= 0) alla[i] = b; else alla.push(b);
            alla.sort((x, y) => (x.datum + x.t).localeCompare(y.datum + y.t));
            await env.DB.put(`bed:${k.id}`, JSON.stringify(alla.slice(-500)));
            const tidigare = alla.filter(x => x.typ === b.typ && x.id !== b.id && (x.datum + x.t) < (b.datum + b.t)).at(-1) || null;
            return svar({ ok: true, bedomning: b, bedomningar: alla, tidigare });
          }
        }
        if (del === 'media') {
          const alla = (await env.DB.get(`med:${k.id}`, 'json')) || [];
          if (req.method === 'DELETE' && sub) {
            const m = alla.find(x => x.id === sub);
            if (m?.key && env.MEDIA) await env.MEDIA.delete(m.key).catch(() => {});
            const kvar = alla.filter(x => x.id !== sub); await env.DB.put(`med:${k.id}`, JSON.stringify(kvar)); return svar({ ok: true, media: kvar });
          }
          if (req.method === 'POST') {
            const m = renMedia(d, k.id);
            const i = alla.findIndex(x => x.id === m.id); if (i >= 0) alla[i] = { ...alla[i], ...m }; else alla.push(m);
            await env.DB.put(`med:${k.id}`, JSON.stringify(alla.slice(-500)));
            return svar({ ok: true, media: alla, inlagd: m });
          }
        }
        if ((del === 'boka' || del === 'avboka') && req.method === 'POST') {
          const v = String(d.v || '');
          if (!VECKA_RE.test(v)) return fel('ogiltig vecka');
          const vecka = stadaHall(await hamtaVecka(env, v));
          const s = vecka.slots.find(x => x.id === String(d.slot || ''));
          if (!s) return fel('tiden finns inte', 404);
          if (del === 'boka') {
            if (s.bokad) return fel(s.bokad.uid === k.id ? 'klienten har redan den tiden' : `tiden är redan bokad av ${s.bokad.barn || s.bokad.namn || 'någon annan'}`, 409);
            if (s.hall && s.hall.tills > Date.now()) return fel('någon håller platsen just nu, prova om en minut', 409);
            s.bokad = { uid: k.id, namn: k.foralder, barn: k.barn, telefon: k.telefon, email: k.email, t: nu(), av: 'haris' };
            s.hall = null;
          } else if (s.bokad?.uid === k.id) s.bokad = null;
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka, bokningar: bokningarFor([vecka, ...(await hamtaAlla(env, 'vecka:')).filter(w => w.v !== v)], k.id) });
        }
        return fel('okänd klientadress', 404);
      }

      if (p === '/admin/filmer' && req.method === 'GET') {
        const filmer = (await hamtaAlla(env, 'film:')).sort((a, b) => (b.uppdaterad || '').localeCompare(a.uppdaterad || ''));
        return svar({ ok: true, filmer, r2: !!env.MEDIA, sms: smsPa(env) });
      }
      if (p === '/admin/film' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const film = renFilm(d, { id: nyttId('f') });
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
          const st = stadaSlots((Array.isArray(d.slots) ? d.slots : []).slice(0, 80).map(s => renSlot(s, gamla[s.id])));
          vecka.slots = st.slots;
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka, kastade: st.kastade });
        }
        if (mv[2] === '/auto' && req.method === 'POST') {
          const dagar = (Array.isArray(d.dagar) ? d.dagar : [1, 2, 3, 4, 5]).map(Number).filter(x => x >= 1 && x <= 7);
          const start = tidOk(d.start) ? d.start : '16:00', slut = tidOk(d.slut) ? d.slut : '20:00';
          const langd = Math.max(15, Math.min(240, Math.round(+d.langd || 60)));
          const [sh, sm] = start.split(':').map(Number), [eh, em] = slut.split(':').map(Number);
          const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          let nya = 0;
          for (const dag of dagar) for (let m = sh * 60 + sm; m + langd <= eh * 60 + em; m += langd) {
            // hoppa över tider som krockar med något som redan finns den dagen
            if (vecka.slots.some(s => s.dag === dag && m < minuter(s.slut) && m + langd > minuter(s.start))) continue;
            vecka.slots.push(renSlot({ dag, start: fmt(m), slut: fmt(m + langd), plats: d.plats }));
            nya++;
          }
          vecka.slots = stadaSlots(vecka.slots).slots;
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka, nya });
        }
        if (mv[2] === '/duplicera' && req.method === 'POST') {
          const till = VECKA_RE.test(String(d.till || '')) ? d.till : veckaPlus(v, 1);
          const ny = stadaHall(await hamtaVecka(env, till));
          for (const s of vecka.slots) if (!ny.slots.some(x => x.dag === s.dag && minuter(s.start) < minuter(x.slut) && minuter(s.slut) > minuter(x.start))) ny.slots.push(renSlot({ dag: s.dag, start: s.start, slut: s.slut, plats: s.plats }));
          ny.slots = stadaSlots(ny.slots).slots;
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
        const [planer, anvandare, klienter] = await Promise.all([hamtaAlla(env, 'plan:'), hamtaAlla(env, 'user:'), hamtaKlienter(env)]);
        planer.sort((a, b) => (b.datum + b.uppdaterad).localeCompare(a.datum + a.uppdaterad));
        return svar({ ok: true, planer, anvandare: anvandare.map(u => ({ uid: u.uid, email: u.email, namn: u.namn, barn: u.barn })),
          klienter: klienter.map(k => ({ id: k.id, barn: k.barn, foralder: k.foralder, telefon: k.telefon, niva: k.niva, position: k.position })).sort((a, b) => (a.barn || '').localeCompare(b.barn || '', 'sv')) });
      }
      if (p === '/admin/plan' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const plan = renPlan(d, { id: nyttId('p') });
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

      // uppladdning till R2 i delar (telefonfilmer är stora); klientId ger nyckeln klient/<id>/…
      if (p === '/admin/upload/start' && req.method === 'POST') {
        if (!env.MEDIA) return fel('R2 är inte påslaget ännu – filen sparas på telefonen så länge', 503);
        const d = await json(); if (!d) return fel('trasig JSON');
        const ext = filEnd(d.filnamn, d.typ);
        const key = d.klientId ? `klient/${ren(d.klientId, 24)}/${Date.now().toString(36)}${slump(3, SMA)}${ext}` : `film/${ren(d.filmId, 40) || 'ny'}-${Date.now().toString(36)}${ext}`;
        const up = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: MIME[ext] || 'application/octet-stream' } });
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
        return svar({ ok: true, url: `${base}/media/${d.key}`, key: d.key });
      }
      const mp = /^\/admin\/upload\/poster\/([a-z0-9]+)$/.exec(p);
      if (mp && req.method === 'PUT') {
        if (!env.MEDIA) return fel('R2 är inte påslaget', 503);
        const key = `poster/${mp[1]}-${Date.now().toString(36)}.jpg`;
        await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: 'image/jpeg' } });
        return svar({ ok: true, url: `${base}/media/${key}` });
      }

      // gamla e-postinbjudningar (kvar så att gamla koder fungerar)
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
