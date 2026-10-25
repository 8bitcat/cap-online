var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS", "access-control-allow-headers": "content-type, authorization", "access-control-max-age": "86400" };
var svar = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...CORS } }), "svar");
var fel = /* @__PURE__ */ __name((text, status = 400) => svar({ ok: false, fel: text }, status), "fel");
var KOD_TECKEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var SMA = "abcdefghijklmnopqrstuvwxyz0123456789";
var slump = /* @__PURE__ */ __name((n, tecken = KOD_TECKEN) => {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return [...a].map((b) => tecken[b % tecken.length]).join("");
}, "slump");
var tokenNy = /* @__PURE__ */ __name(() => slump(40, SMA), "tokenNy");
var nyttId = /* @__PURE__ */ __name((p = "") => p + Date.now().toString(36) + slump(4, SMA), "nyttId");
var ren = /* @__PURE__ */ __name((v, n = 80) => String(v ?? "").normalize("NFC").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, n), "ren");
var email = /* @__PURE__ */ __name((v) => {
  const e = ren(v, 120).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}, "email");
var nu = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "nu");
var idag = /* @__PURE__ */ __name(() => nu().slice(0, 10), "idag");
var DIM = ["alder", "niva", "position", "omrade", "fardighet", "typ", "fas", "svarighet", "utrustning", "yta", "sallskap", "plats"];
var POSITIONER = ["mv", "back", "mitt", "anf", "okand"];
var slug = /* @__PURE__ */ __name((s) => ren(s, 60).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "slug");
async function lista(env, prefix) {
  const ut = [];
  let cursor;
  do {
    const s = await env.DB.list({ prefix, cursor });
    ut.push(...s.keys);
    cursor = s.list_complete ? null : s.cursor;
  } while (cursor);
  return ut;
}
__name(lista, "lista");
async function hamtaAlla(env, prefix) {
  const keys = await lista(env, prefix);
  return (await Promise.all(keys.map((k) => env.DB.get(k.name, "json")))).filter(Boolean);
}
__name(hamtaAlla, "hamtaAlla");
var bearer = /* @__PURE__ */ __name((req) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim(), "bearer");
function telefonNorm(v) {
  let t = String(v || "").replace(/[\s\-()./]/g, "");
  if (t.startsWith("00")) t = "+" + t.slice(2);
  if (/^0\d{6,12}$/.test(t)) t = "+46" + t.slice(1);
  if (/^46\d{8,10}$/.test(t)) t = "+" + t;
  return /^\+\d{8,15}$/.test(t) ? t : null;
}
__name(telefonNorm, "telefonNorm");
var pinOk = /* @__PURE__ */ __name((p) => /^\d{4,6}$/.test(String(p || "")), "pinOk");
async function pinHash(pin, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 3e3 }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(pinHash, "pinHash");
var smsPa = /* @__PURE__ */ __name((env) => !!(env.SMS_TEST || env.SMS_USER && env.SMS_PASS), "smsPa");
var SESS_TTL = 60 * 60 * 24 * 400;
var dagNu = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }), "dagNu");
var smsTak = /* @__PURE__ */ __name((env) => Math.max(0, Math.round(+(env.SMS_MAX_DAG ?? 25))), "smsTak");
async function smsDag(env) {
  return { smsIdag: +await env.DB.get(`smsdag:${dagNu()}`) || 0, smsTak: smsTak(env), smsFran: env.SMS_FROM || "CapSwe" };
}
__name(smsDag, "smsDag");
async function skickaSms(env, till, text, { hook } = {}) {
  const dagKey = `smsdag:${dagNu()}`;
  const idag2 = +await env.DB.get(dagKey) || 0;
  if (smsPa(env) && idag2 >= smsTak(env)) return { ok: false, skickat: false, tak: true, fel: `dagens tak p\xE5 ${smsTak(env)} sms \xE4r n\xE5tt` };
  const r = await skickaSmsNu(env, till, text, { hook });
  if (r.skickat) await env.DB.put(dagKey, String(idag2 + 1), { expirationTtl: 60 * 60 * 48 });
  return r;
}
__name(skickaSms, "skickaSms");
async function skickaSmsNu(env, till, text, { hook } = {}) {
  if (env.SMS_TEST) {
    const ut = await env.DB.get("smsut", "json") || [];
    const id = "test" + slump(8, SMA);
    ut.push({ id, till, text, t: nu() });
    await env.DB.put("smsut", JSON.stringify(ut.slice(-50)));
    return { ok: true, skickat: true, id, test: true };
  }
  if (!smsPa(env)) return { ok: false, skickat: false, fel: "sms \xE4r inte p\xE5slaget", av: true };
  try {
    const r = await fetch("https://api.46elks.com/a1/sms", {
      method: "POST",
      headers: { authorization: "Basic " + btoa(`${env.SMS_USER}:${env.SMS_PASS}`), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ from: env.SMS_FROM || "CapSwe", to: till, message: text, ...hook ? { whendelivered: hook } : {} })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, skickat: false, fel: j.message || j.error || `${r.status}` };
    return { ok: true, skickat: true, id: j.id };
  } catch (e) {
    return { ok: false, skickat: false, fel: String(e?.message || e) };
  }
}
__name(skickaSmsNu, "skickaSmsNu");
async function skickaTillKlient(env, k, typ, text, base) {
  const e = { id: slump(8, SMA), t: nu(), typ, status: "skickas", tok: slump(16, SMA) };
  const r = await skickaSms(env, k.telefon, text, { hook: `${base}/sms/status?k=${k.id}&e=${e.id}&t=${e.tok}` });
  e.status = r.skickat ? r.test ? "levererat" : "skickat" : "misslyckat";
  if (!r.skickat) e.fel = ren(r.fel, 120);
  k.smsLogg = [...k.smsLogg || [], e].slice(-12);
  return r;
}
__name(skickaTillKlient, "skickaTillKlient");
var lank = /* @__PURE__ */ __name((env, kod) => `${env.APP_BASE}#/k/${kod}`, "lank");
function smsText(env, k, l) {
  const hej = `Hej${k.foralder ? " " + k.foralder : ""}! Haris har lagt in ${k.barn || "ditt barn"} i CAP Online.`;
  const app = env.APP_LANK_IOS ? `
H\xE4mta appen: ${env.APP_LANK_IOS}
Eller \xF6ppna i webbl\xE4saren: ${l}` : `
\xD6ppna appen: ${l}`;
  const login = smsPa(env) ? "Logga in med ditt mobilnummer, du f\xE5r en kod som sms." : "V\xE4lj en kod med fyra siffror, sedan loggar du in med mobilnummer och kod.";
  return `${hej}${app}
${login}
/Haris`;
}
__name(smsText, "smsText");
function renKlient(d, gammal = {}) {
  const niva = Math.min(5, Math.max(1, Math.round(+d.niva || gammal.niva || 1)));
  const hist = (gammal.nivaHistorik || []).slice(0, 200);
  if (!hist.length || hist.at(-1).niva !== niva) hist.push({ niva, t: nu(), kommentar: hist.length ? ren(d.nivaKommentar, 200) : "Start" });
  return {
    id: gammal.id,
    skapad: gammal.skapad || nu(),
    uppdaterad: nu(),
    senast: gammal.senast || null,
    telefon: telefonNorm(d.telefon) || gammal.telefon || null,
    foralder: ren(d.foralder, 60),
    email: email(d.email) || "",
    barn: ren(d.barn, 40),
    efternamn: ren(d.efternamn, 40),
    fodd: /^\d{4}$/.test(String(d.fodd || "")) ? +d.fodd : gammal.fodd || null,
    position: POSITIONER.includes(d.position) ? d.position : gammal.position || "okand",
    lag: ren(d.lag, 60),
    niva,
    nivaHistorik: hist,
    anteckning: ren(d.anteckning, 2e3),
    status: ["ny", "aktiv", "paus"].includes(d.status) ? d.status : gammal.status || "ny",
    pin: gammal.pin || null,
    kod: gammal.kod || null,
    vilLank: gammal.vilLank || null,
    smsLogg: gammal.smsLogg || []
  };
}
__name(renKlient, "renKlient");
var publikKlient = /* @__PURE__ */ __name((k) => {
  const { pin, ...rest } = k;
  return { ...rest, harPin: !!pin, smsLogg: (k.smsLogg || []).map(({ tok, ...e }) => e) };
}, "publikKlient");
var userAvKlient = /* @__PURE__ */ __name((k) => ({ uid: k.id, klientId: k.id, typ: "klient", namn: k.foralder, barn: k.barn, efternamn: k.efternamn || "", telefon: k.telefon, email: k.email, fodd: k.fodd, position: k.position, niva: k.niva, harPin: !!k.pin }), "userAvKlient");
async function klientIndex(env) {
  return await env.DB.get("klienter", "json") || [];
}
__name(klientIndex, "klientIndex");
async function hamtaKlient(env, id) {
  return /^[a-z0-9]{4,20}$/.test(String(id || "")) ? env.DB.get(`klient:${id}`, "json") : null;
}
__name(hamtaKlient, "hamtaKlient");
async function sparaKlient(env, k) {
  await env.DB.put(`klient:${k.id}`, JSON.stringify(k));
}
__name(sparaKlient, "sparaKlient");
async function hamtaKlienter(env) {
  const ids = await klientIndex(env);
  return (await Promise.all(ids.map((id) => env.DB.get(`klient:${id}`, "json")))).filter(Boolean);
}
__name(hamtaKlienter, "hamtaKlienter");
async function nyKod(env, k) {
  if (k.kod?.kod) await env.DB.delete(`kod:${k.kod.kod}`);
  let kod;
  do {
    kod = slump(6);
  } while (await env.DB.get(`kod:${kod}`));
  await env.DB.put(`kod:${kod}`, JSON.stringify({ klientId: k.id, skapad: nu() }), { expirationTtl: 60 * 60 * 24 * 90 });
  k.kod = { kod, skapad: nu(), anvand: null };
  return kod;
}
__name(nyKod, "nyKod");
async function nySession(env, uid) {
  const token = tokenNy();
  await env.DB.put(`sess:${token}`, JSON.stringify({ uid, skapad: nu(), forlangd: Date.now() }), { expirationTtl: SESS_TTL });
  return token;
}
__name(nySession, "nySession");
var renBedomning = /* @__PURE__ */ __name((d, gammal = {}) => {
  const varv = (Array.isArray(d.varv) ? d.varv : []).map((x) => Math.round((+x || 0) * 10) / 10).filter((x) => x > 0).slice(0, 20);
  const namn = ren(d.namn, 60) || gammal.namn || "Bed\xF6mning";
  return {
    id: gammal.id || nyttId("b"),
    typ: slug(namn) || "bedomning",
    namn,
    datum: /^\d{4}-\d{2}-\d{2}$/.test(String(d.datum || "")) ? d.datum : gammal.datum || idag(),
    t: gammal.t || nu(),
    varv,
    medel: varv.length ? Math.round(varv.reduce((a, b) => a + b, 0) / varv.length * 10) / 10 : 0,
    bast: varv.length ? Math.min(...varv) : 0,
    kommentar: ren(d.kommentar, 600),
    mediaId: ren(d.mediaId, 40),
    planId: ren(d.planId, 40),
    blockId: ren(d.blockId, 20)
  };
}, "renBedomning");
var renMedia = /* @__PURE__ */ __name((d, klientId) => ({
  id: /^[a-z0-9]{4,24}$/.test(String(d.id || "")) ? d.id : nyttId("m"),
  klientId,
  typ: d.typ === "audio" ? "audio" : "video",
  url: ren(d.url, 400),
  key: ren(d.key, 200),
  poster: ren(d.poster, 400),
  namn: ren(d.namn, 80),
  titel: ren(d.titel, 120),
  t: /^\d{4}-\d{2}-\d{2}T/.test(String(d.t || "")) ? d.t : nu(),
  planId: ren(d.planId, 40),
  blockId: ren(d.blockId, 20),
  bedId: ren(d.bedId, 40),
  delad: d.delad !== false
}), "renMedia");
function renFilm(d, gammal = {}) {
  const tags = {};
  for (const k of DIM) {
    const v = Array.isArray(d.tags?.[k]) ? d.tags[k] : [];
    tags[k] = [...new Set(v.map((x) => ren(x, 40)).filter(Boolean))].slice(0, 20);
  }
  const moment = (Array.isArray(d.moment) ? d.moment : []).slice(0, 30).map((m) => ({
    namn: ren(m.namn, 60),
    desc: ren(m.desc, 300),
    start: Math.max(0, Math.round(+m.start || 0)),
    slut: Math.max(0, Math.round(+m.slut || 0)),
    minuter: Math.max(0, Math.min(90, Math.round(+m.minuter || 0)))
  })).filter((m) => m.namn);
  const video = d.video && typeof d.video === "object" ? {
    typ: d.video.typ === "r2" ? "r2" : "url",
    url: ren(d.video.url, 400),
    poster: ren(d.video.poster, 400),
    sek: Math.max(0, Math.round(+d.video.sek || 0))
  } : gammal.video || { typ: "url", url: "", poster: "", sek: 0 };
  return {
    id: gammal.id,
    skapad: gammal.skapad || nu(),
    uppdaterad: nu(),
    titel: ren(d.titel, 80) || gammal.titel || "Namnl\xF6s film",
    beskrivning: ren(d.beskrivning, 600),
    traningMin: Math.max(0, Math.min(120, Math.round(+d.traningMin || 0))),
    status: d.status === "publicerad" ? "publicerad" : "utkast",
    tags,
    moment,
    video
  };
}
__name(renFilm, "renFilm");
function veckaAv(d = /* @__PURE__ */ new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dag = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dag + 3);
  const forsta = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const v = 1 + Math.round(((x - forsta) / 864e5 - 3 + (forsta.getUTCDay() + 6) % 7) / 7);
  return `${x.getUTCFullYear()}-W${String(v).padStart(2, "0")}`;
}
__name(veckaAv, "veckaAv");
var VECKA_RE = /^\d{4}-W\d{2}$/;
function mandag(v) {
  const [ar, w] = v.split("-W").map(Number);
  const j4 = new Date(Date.UTC(ar, 0, 4));
  const m = new Date(j4);
  m.setUTCDate(j4.getUTCDate() - (j4.getUTCDay() + 6) % 7 + (w - 1) * 7);
  return m;
}
__name(mandag, "mandag");
var veckaPlus = /* @__PURE__ */ __name((v, n) => veckaAv(new Date(mandag(v).getTime() + n * 7 * 864e5)), "veckaPlus");
var datumFor = /* @__PURE__ */ __name((v, dag) => new Date(mandag(v).getTime() + (dag - 1) * 864e5).toISOString().slice(0, 10), "datumFor");
var tidOk = /* @__PURE__ */ __name((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || "")), "tidOk");
function renSlot(s, gammal = null) {
  const id = /^[a-z0-9]{4,12}$/.test(String(s.id || "")) ? s.id : slump(6, SMA);
  const dag = Math.min(7, Math.max(1, Math.round(+s.dag || 1)));
  return {
    id,
    dag,
    start: tidOk(s.start) ? s.start : "17:00",
    slut: tidOk(s.slut) ? s.slut : "18:00",
    plats: ren(s.plats, 60),
    bokad: gammal?.bokad || null,
    hall: gammal?.hall || null
  };
}
__name(renSlot, "renSlot");
async function hamtaVecka(env, v) {
  return await env.DB.get(`vecka:${v}`, "json") || { v, oppen: false, slots: [] };
}
__name(hamtaVecka, "hamtaVecka");
var minuter = /* @__PURE__ */ __name((t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}, "minuter");
function stadaSlots(slots) {
  const sorterade = slots.map((s) => minuter(s.slut) <= minuter(s.start) ? { ...s, slut: `${String(Math.min(23, Math.floor((minuter(s.start) + 60) / 60))).padStart(2, "0")}:${String((minuter(s.start) + 60) % 60).padStart(2, "0")}` } : s).sort((a, b) => a.dag - b.dag || minuter(a.start) - minuter(b.start) || (b.bokad ? 1 : 0) - (a.bokad ? 1 : 0));
  const ut = [];
  let kastade = 0;
  for (const s of sorterade) {
    const f = ut[ut.length - 1];
    if (f && f.dag === s.dag && minuter(s.start) < minuter(f.slut)) {
      if (s.bokad && !f.bokad) ut[ut.length - 1] = s;
      kastade++;
      continue;
    }
    ut.push(s);
  }
  return { slots: ut, kastade };
}
__name(stadaSlots, "stadaSlots");
function stadaHall(vecka) {
  const nu2 = Date.now();
  for (const s of vecka.slots) if (s.hall && s.hall.tills < nu2) s.hall = null;
  return vecka;
}
__name(stadaHall, "stadaHall");
function publikVecka(vecka, uid) {
  return { v: vecka.v, oppen: vecka.oppen, slots: vecka.slots.map((s) => ({
    id: s.id,
    dag: s.dag,
    start: s.start,
    slut: s.slut,
    plats: s.plats,
    status: s.bokad ? s.bokad.uid === uid ? "min" : "upptagen" : s.hall ? s.hall.uid === uid ? "haller" : "hall" : "ledig",
    tills: s.hall?.uid === uid ? s.hall.tills : void 0
  })) };
}
__name(publikVecka, "publikVecka");
function bokningarFor(veckor, uid) {
  const ut = [];
  for (const w of veckor) for (const s of w.slots) if (s.bokad?.uid === uid) ut.push({ v: w.v, id: s.id, dag: s.dag, start: s.start, slut: s.slut, plats: s.plats, barn: s.bokad.barn, datum: datumFor(w.v, s.dag), mandag: mandag(w.v).toISOString().slice(0, 10), av: s.bokad.av || "foralder" });
  return ut.sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start));
}
__name(bokningarFor, "bokningarFor");
async function sessionUser(env, req) {
  const t = bearer(req);
  const s = t && await env.DB.get(`sess:${t}`, "json");
  if (!s) return null;
  if (!s.forlangd || Date.now() - s.forlangd > 7 * 864e5) {
    s.forlangd = Date.now();
    await env.DB.put(`sess:${t}`, JSON.stringify(s), { expirationTtl: SESS_TTL });
  }
  const k = await env.DB.get(`klient:${s.uid}`, "json");
  if (k) return userAvKlient(k);
  return env.DB.get(`user:${s.uid}`, "json");
}
__name(sessionUser, "sessionUser");
function renBlock(b) {
  const typ = ["ovning", "film", "tid", "samtal", "text", "bedomning"].includes(b.typ) ? b.typ : "ovning";
  const ut = {
    id: /^[a-z0-9]{4,12}$/.test(String(b.id || "")) ? b.id : slump(6, SMA),
    typ,
    titel: ren(b.titel, 80),
    desc: ren(b.desc, 400),
    minuter: Math.max(0, Math.min(120, Math.round(+b.minuter || 0))),
    fardighet: ren(b.fardighet, 40),
    mal: Math.max(0, Math.round(+b.mal || 0)),
    tider: (Array.isArray(b.tider) ? b.tider : []).slice(0, 20).map((t) => ({ sek: Math.max(0, Math.round((+t.sek || 0) * 10) / 10), t: ren(t.t, 30) })),
    film: b.film && typeof b.film === "object" ? { namn: ren(b.film.namn, 60), url: ren(b.film.url, 400), poster: ren(b.film.poster, 400), t: ren(b.film.t, 30), filmId: ren(b.film.filmId, 40) } : null,
    media: (Array.isArray(b.media) ? b.media : []).slice(0, 12).map((m) => ({ id: ren(m.id, 24), typ: m.typ === "audio" ? "audio" : "video", url: ren(m.url, 400), poster: ren(m.poster, 400), namn: ren(m.namn, 80), t: ren(m.t, 30), lokal: !!m.lokal })),
    kommentar: ren(b.kommentar, 600),
    klar: !!b.klar
  };
  if (typ === "bedomning") {
    ut.varv = Math.max(1, Math.min(10, Math.round(+b.varv || 3)));
    ut.resultat = b.resultat && typeof b.resultat === "object" ? {
      varv: (Array.isArray(b.resultat.varv) ? b.resultat.varv : []).slice(0, 20).map((x) => Math.round((+x || 0) * 10) / 10),
      medel: Math.round((+b.resultat.medel || 0) * 10) / 10,
      bast: Math.round((+b.resultat.bast || 0) * 10) / 10,
      bedId: ren(b.resultat.bedId, 40),
      t: ren(b.resultat.t, 30)
    } : null;
  }
  return ut;
}
__name(renBlock, "renBlock");
function renPlan(d, gammal = {}) {
  return {
    id: gammal.id,
    skapad: gammal.skapad || nu(),
    uppdaterad: nu(),
    uid: ren(d.uid, 40) || gammal.uid || "",
    barn: ren(d.barn, 40),
    titel: ren(d.titel, 80) || "Pass med Haris",
    datum: /^\d{4}-\d{2}-\d{2}$/.test(String(d.datum || "")) ? d.datum : gammal.datum || idag(),
    bokning: d.bokning && typeof d.bokning === "object" ? { v: ren(d.bokning.v, 10), slot: ren(d.bokning.slot, 12) } : gammal.bokning || null,
    block: (Array.isArray(d.block) ? d.block : []).slice(0, 40).map(renBlock),
    delad: !!d.delad,
    anteckning: ren(d.anteckning, 1e3)
  };
}
__name(renPlan, "renPlan");
function renStigConfig(d) {
  const drommar = (Array.isArray(d.drommar) ? d.drommar : []).slice(0, 20).map((x) => ({ id: ren(x.id, 20).toLowerCase().replace(/[^a-z0-9]/g, "") || slump(6, "abcdefghijklmnopqrstuvwxyz"), namn: ren(x.namn, 40), ikon: ren(x.ikon, 4), desc: ren(x.desc, 120) })).filter((x) => x.namn);
  const etapper = (Array.isArray(d.etapper) ? d.etapper : []).slice(0, 10).map((e, i) => ({
    n: i + 1,
    noder: (Array.isArray(e.noder) ? e.noder : []).slice(0, 40).map((n) => {
      const typ = ["film", "block", "fraga", "tid", "video", "grind"].includes(n.typ) ? n.typ : "block";
      const ut = { id: ren(n.id, 30).replace(/[^A-Za-z0-9-]/g, "") || `n${slump(6, SMA)}`, typ, titel: ren(n.titel, 80), desc: ren(n.desc, 400) };
      if (n.session) ut.session = ren(n.session, 60);
      if (n.filmId) ut.filmId = ren(n.filmId, 40);
      if (n.modul) ut.modul = ren(n.modul, 40);
      if (Array.isArray(n.text)) ut.text = n.text.slice(0, 10).map((t) => ren(t, 600));
      if (Array.isArray(n.position) && n.position.length) ut.position = n.position.map((p) => ren(p, 10)).filter(Boolean);
      if (n.mal) ut.mal = Math.max(0, Math.round(+n.mal));
      if (n.krav) ut.krav = n.krav === "tid" ? "tid" : "video";
      if (n.fardighet) ut.fardighet = ren(n.fardighet, 40);
      return ut;
    }).filter((n) => n.titel)
  }));
  return { drommar, etapper, uppdaterad: nu() };
}
__name(renStigConfig, "renStigConfig");
async function media(req, env, key) {
  if (!env.MEDIA) return fel("R2 \xE4r inte p\xE5slaget", 503);
  const range = req.headers.get("range");
  let obj;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const head = await env.MEDIA.head(key);
    if (!head) return new Response("finns inte", { status: 404, headers: CORS });
    const size = head.size;
    const start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
    const end = m[2] && m[1] ? Math.min(+m[2], size - 1) : size - 1;
    obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!obj) return new Response("finns inte", { status: 404, headers: CORS });
    return new Response(obj.body, { status: 206, headers: { ...CORS, "content-type": obj.httpMetadata?.contentType || "application/octet-stream", "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1), "accept-ranges": "bytes", "cache-control": "public, max-age=31536000, immutable" } });
  }
  obj = await env.MEDIA.get(key);
  if (!obj) return new Response("finns inte", { status: 404, headers: CORS });
  return new Response(obj.body, { headers: { ...CORS, "content-type": obj.httpMetadata?.contentType || "application/octet-stream", "content-length": String(obj.size), "accept-ranges": "bytes", "cache-control": "public, max-age=31536000, immutable" } });
}
__name(media, "media");
var MIME = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
function filEnd(filnamn, typ) {
  const m = /\.(mp4|mov|m4v|webm|m4a|aac|ogg|mp3|wav)$/i.exec(ren(filnamn, 120));
  if (m) return "." + m[1].toLowerCase();
  const t = String(typ || "").toLowerCase();
  if (t.startsWith("audio/mp4") || t.includes("aac")) return ".m4a";
  if (t.startsWith("audio/webm")) return ".webm";
  if (t.startsWith("audio/ogg")) return ".ogg";
  if (t.startsWith("audio/mpeg")) return ".mp3";
  if (t.startsWith("audio/wav")) return ".wav";
  if (t.startsWith("video/webm")) return ".webm";
  if (t.startsWith("video/quicktime")) return ".mov";
  return ".mp4";
}
__name(filEnd, "filEnd");
var src_default = {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const p = url.pathname;
    const base = (env.PUBLIC_BASE || url.origin).replace(/\/$/, "");
    if (req.method === "GET" && p === "/") return svar({ ok: true, app: "CAP Online API", r2: !!env.MEDIA, sms: smsPa(env), appLank: env.APP_LANK_IOS || "" });
    if (req.method === "GET" && p.startsWith("/media/")) return media(req, env, decodeURIComponent(p.slice(7)));
    const json = /* @__PURE__ */ __name(async () => {
      try {
        return await req.json();
      } catch {
        return null;
      }
    }, "json");
    if (p === "/sms/status" && req.method === "POST") {
      const k = await hamtaKlient(env, url.searchParams.get("k"));
      const e = k?.smsLogg?.find((x) => x.id === url.searchParams.get("e"));
      if (e && e.tok === url.searchParams.get("t")) {
        const f = await req.formData().catch(() => null);
        const s = String(f?.get("status") || "");
        if (s === "delivered") {
          e.status = "levererat";
          e.levererat = nu();
        } else if (s === "failed") e.status = "misslyckat";
        else if (s === "sent") e.status = "skickat";
        await sparaKlient(env, k);
      }
      return new Response("ok", { headers: CORS });
    }
    if (p === "/auth/sms" && req.method === "POST") {
      if (!smsPa(env)) return fel("sms-inloggningen \xE4r inte p\xE5slagen \xE4n, logga in med din egen kod", 503);
      const d = await json();
      if (!d) return fel("trasig JSON");
      const tel = telefonNorm(d.telefon);
      if (!tel) return fel("skriv mobilnumret, t.ex. 070-123 45 67");
      const ip = req.headers.get("cf-connecting-ip") || "okand";
      const ipN = +await env.DB.get(`smsip:${ip}`) || 0;
      if (ipN >= 20) return fel("f\xF6r m\xE5nga f\xF6rs\xF6k h\xE4rifr\xE5n, v\xE4nta en stund", 429);
      const lim = await env.DB.get(`smsl:${tel}`, "json") || { n: 0, senast: 0 };
      const vanta = Math.ceil((lim.senast + 45e3 - Date.now()) / 1e3);
      if (vanta > 0) return fel(`v\xE4nta ${vanta} sekunder innan du ber om en ny kod`, 429);
      if (lim.n >= 5) return fel("f\xF6r m\xE5nga koder den senaste timmen, v\xE4nta en stund eller h\xF6r av dig till Haris", 429);
      await env.DB.put(`smsip:${ip}`, String(ipN + 1), { expirationTtl: 3600 });
      const id = await env.DB.get(`tel:${tel}`);
      const k = id ? await hamtaKlient(env, id) : null;
      if (!k) return fel("numret finns inte hos Haris \xE4n. Be honom l\xE4gga in er.", 404);
      const kod = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, "0");
      const salt = slump(16, SMA);
      await env.DB.put(`otp:${tel}`, JSON.stringify({ salt, hash: await pinHash(kod, salt), forsok: 0, t: Date.now() }), { expirationTtl: 600 });
      await env.DB.put(`smsl:${tel}`, JSON.stringify({ n: lim.n + 1, senast: Date.now() }), { expirationTtl: 3600 });
      const r = await skickaTillKlient(env, k, "kod", `${kod} \xE4r din kod till CAP Online. Den g\xE4ller i 10 minuter.`, base);
      await sparaKlient(env, k);
      if (!r.skickat) return fel(r.tak ? "Dagens sms \xE4r slut. F\xF6rs\xF6k i morgon, eller be Haris skicka en ny l\xE4nk." : `sms:et gick inte iv\xE4g (${r.fel}). Prova igen om en stund eller h\xF6r av dig till Haris.`, r.tak ? 503 : 502);
      return svar({ ok: true, giltigSek: 600, vantaSek: 45 });
    }
    if (p === "/auth/sms/verifiera" && req.method === "POST") {
      const d = await json();
      if (!d) return fel("trasig JSON");
      const tel = telefonNorm(d.telefon);
      const kod = String(d.kod || "").replace(/\D/g, "");
      if (!tel || kod.length !== 6) return fel("skriv de sex siffrorna fr\xE5n sms:et");
      const o = await env.DB.get(`otp:${tel}`, "json");
      if (!o) return fel("koden har g\xE5tt ut, tryck Skicka ny kod", 410);
      if (o.forsok >= 5) {
        await env.DB.delete(`otp:${tel}`);
        return fel("f\xF6r m\xE5nga fel, tryck Skicka ny kod", 429);
      }
      if (await pinHash(kod, o.salt) !== o.hash) {
        o.forsok++;
        await env.DB.put(`otp:${tel}`, JSON.stringify(o), { expirationTtl: Math.max(60, 600 - Math.floor((Date.now() - o.t) / 1e3)) });
        return fel(`fel kod${o.forsok >= 3 ? `, ${5 - o.forsok} f\xF6rs\xF6k kvar` : ""}`, 403);
      }
      await env.DB.delete(`otp:${tel}`);
      const k = await hamtaKlient(env, await env.DB.get(`tel:${tel}`));
      if (!k) return fel("numret finns inte hos Haris l\xE4ngre", 404);
      k.senast = nu();
      if (k.status === "ny") k.status = "aktiv";
      k.vilLank = null;
      await sparaKlient(env, k);
      return svar({ ok: true, token: await nySession(env, k.id), user: userAvKlient(k) });
    }
    if (p === "/auth/kod" && req.method === "POST") {
      const d = await json();
      if (!d) return fel("trasig JSON");
      const kod = String(d.kod || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (kod.length < 6) return fel("koden ska vara sex tecken");
      const kl = await env.DB.get(`kod:${kod}`, "json");
      if (kl) {
        const k = await hamtaKlient(env, kl.klientId);
        if (!k) return fel("kontot finns inte l\xE4ngre", 404);
        k.senast = nu();
        if (k.kod?.kod === kod && !k.kod.anvand) k.kod.anvand = nu();
        if (k.status === "ny") k.status = "aktiv";
        k.vilLank = null;
        const valjPin = !smsPa(env) && !k.pin;
        if (smsPa(env) && k.kod?.kod === kod) {
          await env.DB.delete(`kod:${kod}`);
          k.kod = { ...k.kod, forbrukad: nu() };
        }
        await sparaKlient(env, k);
        return svar({ ok: true, token: await nySession(env, k.id), user: userAvKlient(k), valjPin });
      }
      const inv = await env.DB.get(`inv:${kod}`, "json");
      if (!inv) return fel("koden finns inte eller har g\xE5tt ut", 404);
      let uid = await env.DB.get(`email:${inv.email}`);
      let user = uid ? await env.DB.get(`user:${uid}`, "json") : null;
      if (!user) {
        uid = slump(12, SMA);
        user = { uid, email: inv.email, namn: inv.namn || "", barn: inv.barn || "", skapad: nu(), senast: nu() };
        await env.DB.put(`user:${uid}`, JSON.stringify(user));
        await env.DB.put(`email:${inv.email}`, uid);
      } else {
        user.senast = nu();
        await env.DB.put(`user:${uid}`, JSON.stringify(user));
      }
      if (!inv.anvand) {
        inv.anvand = nu();
        await env.DB.put(`inv:${kod}`, JSON.stringify(inv), { expirationTtl: 60 * 60 * 24 * 90 });
      }
      return svar({ ok: true, token: await nySession(env, uid), user });
    }
    if (p === "/auth/login" && req.method === "POST") {
      const d = await json();
      if (!d) return fel("trasig JSON");
      const tel = telefonNorm(d.telefon);
      if (!tel) return fel("skriv mobilnumret, t.ex. 070-123 45 67");
      if (!pinOk(d.pin)) return fel("koden \xE4r fyra till sex siffror");
      const limKey = `lim:${tel}`;
      const forsok = +await env.DB.get(limKey) || 0;
      if (forsok >= 10) return fel("f\xF6r m\xE5nga f\xF6rs\xF6k, v\xE4nta en kvart och prova igen", 429);
      const id = await env.DB.get(`tel:${tel}`);
      const k = id ? await hamtaKlient(env, id) : null;
      if (!k) return fel("numret finns inte hos Haris \xE4n", 404);
      if (!k.pin) return fel("du har ingen kod \xE4n, \xF6ppna l\xE4nken du fick av Haris f\xF6rst", 409);
      if (await pinHash(d.pin, k.pin.salt) !== k.pin.hash) {
        await env.DB.put(limKey, String(forsok + 1), { expirationTtl: 900 });
        return fel(`fel kod${forsok >= 6 ? `, ${10 - forsok - 1} f\xF6rs\xF6k kvar` : ""}`, 403);
      }
      await env.DB.delete(limKey);
      k.senast = nu();
      if (k.status === "ny") k.status = "aktiv";
      await sparaKlient(env, k);
      return svar({ ok: true, token: await nySession(env, k.id), user: userAvKlient(k) });
    }
    if (p === "/auth/pin" && req.method === "POST") {
      const d = await json();
      if (!d) return fel("trasig JSON");
      if (!pinOk(d.pin)) return fel("koden \xE4r fyra till sex siffror");
      const s = await env.DB.get(`sess:${bearer(req)}`, "json");
      const k = s && await hamtaKlient(env, s.uid);
      if (!k) return fel("inte inloggad", 401);
      const salt = slump(16, SMA);
      k.pin = { salt, hash: await pinHash(d.pin, salt), t: nu() };
      if (k.kod?.kod) {
        await env.DB.delete(`kod:${k.kod.kod}`);
        k.kod = { ...k.kod, anvand: k.kod.anvand || nu(), forbrukad: nu() };
      }
      k.vilLank = null;
      k.status = "aktiv";
      await sparaKlient(env, k);
      return svar({ ok: true, user: userAvKlient(k) });
    }
    if (p === "/auth/glomt" && req.method === "POST") {
      const d = await json();
      if (!d) return fel("trasig JSON");
      const tel = telefonNorm(d.telefon);
      if (!tel) return fel("skriv mobilnumret, t.ex. 070-123 45 67");
      const id = await env.DB.get(`tel:${tel}`);
      const k = id ? await hamtaKlient(env, id) : null;
      if (!k) return fel("numret finns inte hos Haris \xE4n", 404);
      const kod = await nyKod(env, k);
      const sms = await skickaTillKlient(env, k, "lank", smsText(env, k, lank(env, kod)), base);
      if (!sms.skickat) k.vilLank = nu();
      await sparaKlient(env, k);
      return svar({ ok: true, skickat: sms.skickat, meddelande: sms.skickat ? "En ny l\xE4nk \xE4r skickad som sms till ditt nummer." : "Haris f\xE5r ett meddelande och skickar en ny l\xE4nk till dig." });
    }
    if (p === "/auth/me" && req.method === "GET") {
      const user = await sessionUser(env, req);
      return user ? svar({ ok: true, user }) : fel("inte inloggad", 401);
    }
    if (p === "/auth/ut" && req.method === "POST") {
      await env.DB.delete(`sess:${bearer(req)}`);
      return svar({ ok: true });
    }
    if (p === "/config/stig" && req.method === "GET") return svar({ ok: true, config: await env.DB.get("config:stig", "json") || null });
    if (p === "/veckor" && req.method === "GET") {
      const user = await sessionUser(env, req);
      if (!user) return fel("inte inloggad", 401);
      const nuV = veckaAv();
      const alla = (await hamtaAlla(env, "vecka:")).filter((w) => w.oppen && w.v >= nuV).sort((a, b) => a.v.localeCompare(b.v));
      return svar({ ok: true, nu: nuV, veckor: alla.map((w) => publikVecka(stadaHall(w), user.uid)) });
    }
    if (p.startsWith("/boka/") && req.method === "POST") {
      const user = await sessionUser(env, req);
      if (!user) return fel("inte inloggad", 401);
      const d = await json();
      if (!d) return fel("trasig JSON");
      const v = String(d.v || "");
      if (!VECKA_RE.test(v)) return fel("ogiltig vecka");
      const vecka = stadaHall(await hamtaVecka(env, v));
      const s = vecka.slots.find((x) => x.id === String(d.slot || ""));
      if (!s || !vecka.oppen && p !== "/boka/avboka") return fel("tiden finns inte", 404);
      const now = Date.now();
      if (p === "/boka/hall") {
        if (s.bokad) return fel(s.bokad.uid === user.uid ? "du har redan bokat den h\xE4r tiden" : "tiden \xE4r redan bokad", 409);
        if (s.hall && s.hall.uid !== user.uid && s.hall.tills > now) return fel(`n\xE5gon annan h\xE5ller platsen i ${Math.ceil((s.hall.tills - now) / 1e3)} s`, 409);
        s.hall = { uid: user.uid, tills: now + 6e4 };
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        return svar({ ok: true, tills: s.hall.tills });
      }
      if (p === "/boka/bekrafta") {
        if (s.bokad) return fel("tiden hann bli bokad", 409);
        if (!s.hall || s.hall.uid !== user.uid || s.hall.tills < now) return fel("dina 60 sekunder gick ut, h\xE5ll platsen igen", 410);
        s.bokad = { uid: user.uid, namn: user.namn || "", barn: ren(d.barn, 40) || user.barn || "", email: user.email || "", telefon: user.telefon || "", t: nu(), av: "foralder" };
        s.hall = null;
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        return svar({ ok: true, slot: publikVecka(vecka, user.uid).slots.find((x) => x.id === s.id) });
      }
      if (p === "/boka/avboka") {
        if (s.bokad?.uid === user.uid) s.bokad = null;
        if (s.hall?.uid === user.uid) s.hall = null;
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        return svar({ ok: true });
      }
    }
    if (p === "/mina" && req.method === "GET") {
      const user = await sessionUser(env, req);
      if (!user) return fel("inte inloggad", 401);
      const veckor = await hamtaAlla(env, "vecka:");
      const bokningar = bokningarFor(veckor, user.uid);
      const planer = (await hamtaAlla(env, "plan:")).filter((x) => x.uid === user.uid && x.delad).sort((a, b) => b.datum.localeCompare(a.datum));
      const klient = user.klientId ? publikKlient(await hamtaKlient(env, user.klientId)) : null;
      const bedomningar = user.klientId ? await env.DB.get(`bed:${user.klientId}`, "json") || [] : [];
      const media2 = user.klientId ? (await env.DB.get(`med:${user.klientId}`, "json") || []).filter((m) => m.delad) : [];
      return svar({ ok: true, bokningar, planer, klient, bedomningar, media: media2 });
    }
    if (p === "/mina/barn" && req.method === "PUT") {
      const se = await env.DB.get(`sess:${bearer(req)}`, "json");
      const k = se && await hamtaKlient(env, se.uid);
      if (!k) return fel("inte inloggad", 401);
      const d = await json();
      if (!d) return fel("trasig JSON");
      const barn = ren(d.barn, 40);
      if (!barn) return fel("f\xF6rnamnet saknas");
      k.barn = barn;
      k.efternamn = ren(d.efternamn, 40);
      if (/^\d{4}$/.test(String(d.fodd || ""))) k.fodd = +d.fodd;
      if (POSITIONER.includes(d.position)) k.position = d.position;
      k.uppdaterad = nu();
      await sparaKlient(env, k);
      return svar({ ok: true, user: userAvKlient(k) });
    }
    if (p === "/filmer" && req.method === "GET") {
      const alla = await hamtaAlla(env, "film:");
      const filmer = alla.filter((f) => f.status === "publicerad").sort((a, b) => (b.uppdaterad || "").localeCompare(a.uppdaterad || ""));
      return svar({ ok: true, filmer });
    }
    if (p === "/admin/login" && req.method === "POST") {
      const d = await json();
      if (!d) return fel("trasig JSON");
      if (!env.ADMIN_LOSEN || String(d.losen || "") !== env.ADMIN_LOSEN) return fel("fel l\xF6senord", 403);
      const token = tokenNy();
      await env.DB.put(`adm:${token}`, JSON.stringify({ skapad: nu() }), { expirationTtl: 60 * 60 * 24 * 30 });
      return svar({ ok: true, token });
    }
    if (p.startsWith("/admin/")) {
      if (!await env.DB.get(`adm:${bearer(req)}`)) return fel("inte inloggad som admin", 401);
      if (p === "/admin/klienter" && req.method === "GET") {
        const [klienter, veckor, planer] = await Promise.all([hamtaKlienter(env), hamtaAlla(env, "vecka:"), hamtaAlla(env, "plan:")]);
        const nuV = veckaAv();
        const beds = await Promise.all(klienter.map((k) => env.DB.get(`bed:${k.id}`, "json")));
        const ut = klienter.map((k, i) => {
          const b = bokningarFor(veckor.filter((w) => w.v >= nuV), k.id).filter((x) => x.datum >= idag());
          const bed = (beds[i] || []).slice().sort((x, y) => (y.datum + y.t).localeCompare(x.datum + x.t));
          return { ...publikKlient(k), nastaTid: b[0] || null, antalPass: planer.filter((x) => x.uid === k.id).length, antalBed: bed.length, senasteBed: bed[0] ? { namn: bed[0].namn, medel: bed[0].medel, datum: bed[0].datum } : null, lank: k.kod?.kod && !k.kod.forbrukad ? lank(env, k.kod.kod) : null };
        }).sort((a, b) => (a.barn || a.foralder || "").localeCompare(b.barn || b.foralder || "", "sv"));
        return svar({ ok: true, klienter: ut, sms: smsPa(env), r2: !!env.MEDIA, ...await smsDag(env) });
      }
      if (p === "/admin/klient" && req.method === "POST") {
        const d = await json();
        if (!d) return fel("trasig JSON");
        const tel = telefonNorm(d.telefon);
        if (!tel) return fel("mobilnumret ser fel ut, skriv t.ex. 070-123 45 67");
        if (await env.DB.get(`tel:${tel}`)) return fel("det numret finns redan i registret", 409);
        const k = renKlient(d, { id: nyttId("k") });
        const kod = await nyKod(env, k);
        const l = lank(env, kod);
        const sms = d.skicka ? await skickaTillKlient(env, k, "lank", smsText(env, k, l), base) : { ok: false, skickat: false, av: !smsPa(env) };
        await sparaKlient(env, k);
        await env.DB.put(`tel:${tel}`, k.id);
        const ids = await klientIndex(env);
        if (!ids.includes(k.id)) {
          ids.push(k.id);
          await env.DB.put("klienter", JSON.stringify(ids));
        }
        return svar({ ok: true, klient: publikKlient(k), lank: l, kod, sms, smsText: smsText(env, k, l), ...await smsDag(env) });
      }
      const mk = /^\/admin\/klient\/([a-z0-9]+)(?:\/(lank|niva|bedomning|media|boka|avboka)(?:\/([a-z0-9]+))?)?$/.exec(p);
      if (mk) {
        const k = await hamtaKlient(env, mk[1]);
        if (!k) return fel("klienten finns inte", 404);
        const del = mk[2], sub = mk[3];
        if (!del && req.method === "GET") {
          const [veckor, planer, bedomningar, media2] = await Promise.all([hamtaAlla(env, "vecka:"), hamtaAlla(env, "plan:"), env.DB.get(`bed:${k.id}`, "json"), env.DB.get(`med:${k.id}`, "json")]);
          const l = k.kod?.kod && !k.kod.forbrukad ? lank(env, k.kod.kod) : null;
          return svar({
            ok: true,
            klient: publikKlient(k),
            bokningar: bokningarFor(veckor, k.id),
            planer: planer.filter((x) => x.uid === k.id).sort((a, b) => (b.datum + b.uppdaterad).localeCompare(a.datum + a.uppdaterad)),
            bedomningar: bedomningar || [],
            media: media2 || [],
            lank: l,
            smsText: l ? smsText(env, k, l) : "",
            sms: smsPa(env),
            r2: !!env.MEDIA,
            ...await smsDag(env)
          });
        }
        if (!del && req.method === "PUT") {
          const d2 = await json();
          if (!d2) return fel("trasig JSON");
          const tel = telefonNorm(d2.telefon);
          if (!tel) return fel("mobilnumret ser fel ut");
          if (tel !== k.telefon) {
            const annan = await env.DB.get(`tel:${tel}`);
            if (annan && annan !== k.id) return fel("det numret finns redan p\xE5 en annan klient", 409);
          }
          const ny = renKlient(d2, k);
          if (tel !== k.telefon) {
            await env.DB.delete(`tel:${k.telefon}`);
            await env.DB.put(`tel:${tel}`, k.id);
            ny.telefon = tel;
          }
          await sparaKlient(env, ny);
          return svar({ ok: true, klient: publikKlient(ny) });
        }
        if (!del && req.method === "DELETE") {
          await Promise.all([env.DB.delete(`klient:${k.id}`), env.DB.delete(`tel:${k.telefon}`), env.DB.delete(`bed:${k.id}`), env.DB.delete(`med:${k.id}`), k.kod?.kod ? env.DB.delete(`kod:${k.kod.kod}`) : null]);
          const ids = (await klientIndex(env)).filter((x) => x !== k.id);
          await env.DB.put("klienter", JSON.stringify(ids));
          const nuV = veckaAv();
          for (const w of (await hamtaAlla(env, "vecka:")).filter((x) => x.v >= nuV)) {
            let andrad = false;
            for (const s of w.slots) if (s.bokad?.uid === k.id) {
              s.bokad = null;
              andrad = true;
            }
            if (andrad) await env.DB.put(`vecka:${w.v}`, JSON.stringify(w));
          }
          return svar({ ok: true });
        }
        const d = await json() || {};
        if (del === "lank" && req.method === "POST") {
          const kod = await nyKod(env, k);
          const l = lank(env, kod);
          const sms = d.skicka ? await skickaTillKlient(env, k, "lank", smsText(env, k, l), base) : { ok: false, skickat: false, av: !smsPa(env) };
          if (sms.skickat) k.vilLank = null;
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k), lank: l, kod, sms, smsText: smsText(env, k, l), ...await smsDag(env) });
        }
        if (del === "niva" && req.method === "POST") {
          const niva = Math.min(5, Math.max(1, Math.round(+d.niva || k.niva)));
          k.niva = niva;
          (k.nivaHistorik = k.nivaHistorik || []).push({ niva, t: nu(), kommentar: ren(d.kommentar, 200) });
          k.uppdaterad = nu();
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k) });
        }
        if (del === "bedomning") {
          const alla = await env.DB.get(`bed:${k.id}`, "json") || [];
          if (req.method === "DELETE" && sub) {
            const kvar = alla.filter((b) => b.id !== sub);
            await env.DB.put(`bed:${k.id}`, JSON.stringify(kvar));
            return svar({ ok: true, bedomningar: kvar });
          }
          if (req.method === "POST") {
            const b = renBedomning(d, sub ? alla.find((x) => x.id === sub) || {} : {});
            if (!b.varv.length) return fel("minst en tid beh\xF6vs");
            const i = alla.findIndex((x) => x.id === b.id);
            if (i >= 0) alla[i] = b;
            else alla.push(b);
            alla.sort((x, y) => (x.datum + x.t).localeCompare(y.datum + y.t));
            await env.DB.put(`bed:${k.id}`, JSON.stringify(alla.slice(-500)));
            const tidigare = alla.filter((x) => x.typ === b.typ && x.id !== b.id && x.datum + x.t < b.datum + b.t).at(-1) || null;
            return svar({ ok: true, bedomning: b, bedomningar: alla, tidigare });
          }
        }
        if (del === "media") {
          const alla = await env.DB.get(`med:${k.id}`, "json") || [];
          if (req.method === "DELETE" && sub) {
            const m = alla.find((x) => x.id === sub);
            if (m?.key && env.MEDIA) await env.MEDIA.delete(m.key).catch(() => {
            });
            const kvar = alla.filter((x) => x.id !== sub);
            await env.DB.put(`med:${k.id}`, JSON.stringify(kvar));
            return svar({ ok: true, media: kvar });
          }
          if (req.method === "POST") {
            const m = renMedia(d, k.id);
            const i = alla.findIndex((x) => x.id === m.id);
            if (i >= 0) alla[i] = { ...alla[i], ...m };
            else alla.push(m);
            await env.DB.put(`med:${k.id}`, JSON.stringify(alla.slice(-500)));
            return svar({ ok: true, media: alla, inlagd: m });
          }
        }
        if ((del === "boka" || del === "avboka") && req.method === "POST") {
          const v = String(d.v || "");
          if (!VECKA_RE.test(v)) return fel("ogiltig vecka");
          const vecka = stadaHall(await hamtaVecka(env, v));
          const s = vecka.slots.find((x) => x.id === String(d.slot || ""));
          if (!s) return fel("tiden finns inte", 404);
          if (del === "boka") {
            if (s.bokad) return fel(s.bokad.uid === k.id ? "klienten har redan den tiden" : `tiden \xE4r redan bokad av ${s.bokad.barn || s.bokad.namn || "n\xE5gon annan"}`, 409);
            if (s.hall && s.hall.tills > Date.now()) return fel("n\xE5gon h\xE5ller platsen just nu, prova om en minut", 409);
            s.bokad = { uid: k.id, namn: k.foralder, barn: k.barn, telefon: k.telefon, email: k.email, t: nu(), av: "haris" };
            s.hall = null;
          } else if (s.bokad?.uid === k.id) s.bokad = null;
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka, bokningar: bokningarFor([vecka, ...(await hamtaAlla(env, "vecka:")).filter((w) => w.v !== v)], k.id) });
        }
        return fel("ok\xE4nd klientadress", 404);
      }
      if (p === "/admin/smstest" && req.method === "POST") {
        const d = await json();
        if (!d) return fel("trasig JSON");
        const tel = telefonNorm(d.telefon);
        if (!tel) return fel("mobilnumret ser fel ut");
        const r = await skickaSms(env, tel, "Test fr\xE5n CAP Online. Sms-utskicken fungerar. /CapSwe");
        return svar({ ok: r.skickat, fel: r.fel, sms: r, ...await smsDag(env) }, r.skickat ? 200 : 502);
      }
      if (p === "/admin/smsut" && req.method === "GET") {
        if (!env.SMS_TEST) return fel("bara i testl\xE4ge", 404);
        return svar({ ok: true, ut: await env.DB.get("smsut", "json") || [] });
      }
      if (p === "/admin/filmer" && req.method === "GET") {
        const filmer = (await hamtaAlla(env, "film:")).sort((a, b) => (b.uppdaterad || "").localeCompare(a.uppdaterad || ""));
        return svar({ ok: true, filmer, r2: !!env.MEDIA, sms: smsPa(env), ...await smsDag(env) });
      }
      if (p === "/admin/film" && req.method === "POST") {
        const d = await json();
        if (!d) return fel("trasig JSON");
        const film = renFilm(d, { id: nyttId("f") });
        await env.DB.put(`film:${film.id}`, JSON.stringify(film));
        return svar({ ok: true, film });
      }
      const mf = /^\/admin\/film\/([a-z0-9]+)$/.exec(p);
      if (mf && (req.method === "PUT" || req.method === "DELETE")) {
        const gammal = await env.DB.get(`film:${mf[1]}`, "json");
        if (!gammal) return fel("filmen finns inte", 404);
        if (req.method === "DELETE") {
          await env.DB.delete(`film:${mf[1]}`);
          return svar({ ok: true });
        }
        const d = await json();
        if (!d) return fel("trasig JSON");
        const film = renFilm(d, gammal);
        await env.DB.put(`film:${film.id}`, JSON.stringify(film));
        return svar({ ok: true, film });
      }
      if (p === "/admin/veckor" && req.method === "GET") {
        const nuV = veckaAv();
        const veckor = (await hamtaAlla(env, "vecka:")).filter((w) => w.v >= veckaPlus(nuV, -1)).sort((a, b) => a.v.localeCompare(b.v)).map(stadaHall);
        return svar({ ok: true, nu: nuV, veckor, mandag: Object.fromEntries(veckor.map((w) => [w.v, mandag(w.v).toISOString().slice(0, 10)])) });
      }
      const mv = /^\/admin\/vecka\/(\d{4}-W\d{2})(\/auto|\/duplicera)?$/.exec(p);
      if (mv) {
        const v = mv[1];
        const d = await json();
        if (!d) return fel("trasig JSON");
        const vecka = stadaHall(await hamtaVecka(env, v));
        if (!mv[2] && req.method === "PUT") {
          const gamla = Object.fromEntries(vecka.slots.map((s) => [s.id, s]));
          vecka.oppen = !!d.oppen;
          const st = stadaSlots((Array.isArray(d.slots) ? d.slots : []).slice(0, 80).map((s) => renSlot(s, gamla[s.id])));
          vecka.slots = st.slots;
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka, kastade: st.kastade });
        }
        if (mv[2] === "/auto" && req.method === "POST") {
          const dagar = (Array.isArray(d.dagar) ? d.dagar : [1, 2, 3, 4, 5]).map(Number).filter((x) => x >= 1 && x <= 7);
          const start = tidOk(d.start) ? d.start : "16:00", slut = tidOk(d.slut) ? d.slut : "20:00";
          const langd = Math.max(15, Math.min(240, Math.round(+d.langd || 60)));
          const [sh, sm] = start.split(":").map(Number), [eh, em] = slut.split(":").map(Number);
          const fmt = /* @__PURE__ */ __name((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, "fmt");
          let nya = 0;
          for (const dag of dagar) for (let m = sh * 60 + sm; m + langd <= eh * 60 + em; m += langd) {
            if (vecka.slots.some((s) => s.dag === dag && m < minuter(s.slut) && m + langd > minuter(s.start))) continue;
            vecka.slots.push(renSlot({ dag, start: fmt(m), slut: fmt(m + langd), plats: d.plats }));
            nya++;
          }
          vecka.slots = stadaSlots(vecka.slots).slots;
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka, nya });
        }
        if (mv[2] === "/duplicera" && req.method === "POST") {
          const till = VECKA_RE.test(String(d.till || "")) ? d.till : veckaPlus(v, 1);
          const ny = stadaHall(await hamtaVecka(env, till));
          for (const s of vecka.slots) if (!ny.slots.some((x) => x.dag === s.dag && minuter(s.start) < minuter(x.slut) && minuter(s.slut) > minuter(x.start))) ny.slots.push(renSlot({ dag: s.dag, start: s.start, slut: s.slut, plats: s.plats }));
          ny.slots = stadaSlots(ny.slots).slots;
          await env.DB.put(`vecka:${till}`, JSON.stringify(ny));
          return svar({ ok: true, vecka: ny });
        }
      }
      if (p === "/admin/config/stig" && req.method === "PUT") {
        const d = await json();
        if (!d) return fel("trasig JSON");
        const cfg = renStigConfig(d);
        await env.DB.put("config:stig", JSON.stringify(cfg));
        return svar({ ok: true, config: cfg });
      }
      if (p === "/admin/planer" && req.method === "GET") {
        const [planer, anvandare, klienter] = await Promise.all([hamtaAlla(env, "plan:"), hamtaAlla(env, "user:"), hamtaKlienter(env)]);
        planer.sort((a, b) => (b.datum + b.uppdaterad).localeCompare(a.datum + a.uppdaterad));
        return svar({
          ok: true,
          planer,
          anvandare: anvandare.map((u) => ({ uid: u.uid, email: u.email, namn: u.namn, barn: u.barn })),
          klienter: klienter.map((k) => ({ id: k.id, barn: k.barn, foralder: k.foralder, telefon: k.telefon, niva: k.niva, position: k.position })).sort((a, b) => (a.barn || "").localeCompare(b.barn || "", "sv"))
        });
      }
      if (p === "/admin/plan" && req.method === "POST") {
        const d = await json();
        if (!d) return fel("trasig JSON");
        const plan = renPlan(d, { id: nyttId("p") });
        await env.DB.put(`plan:${plan.id}`, JSON.stringify(plan));
        return svar({ ok: true, plan });
      }
      const mpl = /^\/admin\/plan\/([a-z0-9]+)$/.exec(p);
      if (mpl && (req.method === "PUT" || req.method === "DELETE" || req.method === "GET")) {
        const gammal = await env.DB.get(`plan:${mpl[1]}`, "json");
        if (!gammal) return fel("passet finns inte", 404);
        if (req.method === "GET") return svar({ ok: true, plan: gammal });
        if (req.method === "DELETE") {
          await env.DB.delete(`plan:${mpl[1]}`);
          return svar({ ok: true });
        }
        const d = await json();
        if (!d) return fel("trasig JSON");
        const plan = renPlan(d, gammal);
        await env.DB.put(`plan:${plan.id}`, JSON.stringify(plan));
        return svar({ ok: true, plan });
      }
      if (p === "/admin/upload/start" && req.method === "POST") {
        if (!env.MEDIA) return fel("R2 \xE4r inte p\xE5slaget \xE4nnu \u2013 filen sparas p\xE5 telefonen s\xE5 l\xE4nge", 503);
        const d = await json();
        if (!d) return fel("trasig JSON");
        const ext = filEnd(d.filnamn, d.typ);
        const key = d.klientId ? `klient/${ren(d.klientId, 24)}/${Date.now().toString(36)}${slump(3, SMA)}${ext}` : `film/${ren(d.filmId, 40) || "ny"}-${Date.now().toString(36)}${ext}`;
        const up = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: MIME[ext] || "application/octet-stream" } });
        return svar({ ok: true, key, uploadId: up.uploadId });
      }
      if (p === "/admin/upload/part" && req.method === "PUT") {
        if (!env.MEDIA) return fel("R2 \xE4r inte p\xE5slaget", 503);
        const key = url.searchParams.get("key"), uploadId = url.searchParams.get("uploadId"), part = +url.searchParams.get("part");
        if (!key || !uploadId || !(part >= 1)) return fel("saknar key/uploadId/part");
        const up = env.MEDIA.resumeMultipartUpload(key, uploadId);
        const r = await up.uploadPart(part, req.body);
        return svar({ ok: true, etag: r.etag, partNumber: part });
      }
      if (p === "/admin/upload/complete" && req.method === "POST") {
        if (!env.MEDIA) return fel("R2 \xE4r inte p\xE5slaget", 503);
        const d = await json();
        if (!d) return fel("trasig JSON");
        const up = env.MEDIA.resumeMultipartUpload(String(d.key), String(d.uploadId));
        await up.complete((d.parts || []).map((x) => ({ partNumber: +x.partNumber, etag: String(x.etag) })));
        return svar({ ok: true, url: `${base}/media/${d.key}`, key: d.key });
      }
      const mp = /^\/admin\/upload\/poster\/([a-z0-9]+)$/.exec(p);
      if (mp && req.method === "PUT") {
        if (!env.MEDIA) return fel("R2 \xE4r inte p\xE5slaget", 503);
        const key = `poster/${mp[1]}-${Date.now().toString(36)}.jpg`;
        await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: "image/jpeg" } });
        return svar({ ok: true, url: `${base}/media/${key}` });
      }
      if (p === "/admin/inbjudan" && req.method === "POST") {
        const d = await json();
        if (!d) return fel("trasig JSON");
        const e = email(d.email);
        if (!e) return fel("ogiltig e-postadress");
        let kod;
        do {
          kod = slump(6);
        } while (await env.DB.get(`inv:${kod}`));
        const inv = { kod, email: e, namn: ren(d.namn, 60), barn: ren(d.barn, 40), skapad: nu(), anvand: null };
        await env.DB.put(`inv:${kod}`, JSON.stringify(inv), { expirationTtl: 60 * 60 * 24 * 90 });
        return svar({ ok: true, kod, lank: `${env.APP_BASE}#/k/${kod}`, inbjudan: inv });
      }
      if (p === "/admin/inbjudningar" && req.method === "GET") {
        const inbjudningar = (await hamtaAlla(env, "inv:")).sort((a, b) => b.skapad.localeCompare(a.skapad));
        const anvandare = (await hamtaAlla(env, "user:")).sort((a, b) => (b.senast || "").localeCompare(a.senast || ""));
        return svar({ ok: true, inbjudningar, anvandare });
      }
      if (p === "/admin/notis" && req.method === "POST") {
        const d = await json();
        if (!d) return fel("trasig JSON");
        const r = await fetch(`${env.PUSH_BASE}/skicka`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hemlig: env.PUSH_HEMLIG, text: ren(d.text, 180), title: ren(d.title, 40) || "CAP Online" }) });
        return svar(await r.json().catch(() => ({ ok: false, fel: "pushservern svarade konstigt" })), r.status);
      }
      return fel("ok\xE4nd adminadress", 404);
    }
    return fel("ok\xE4nd adress", 404);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-gIIxF9/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-gIIxF9/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
