// CAP API. Cloudflare Worker med KV (DB) och, när det är påslaget, R2 (MEDIA) för filmer och ljud.
//
// Konton och inloggning (Carl 2026-10-23: "logga in med telefonnummer … sms med länken … glömt lösenord";
// 2026-10-25: "sms-inloggning via telefonnummer … länken till det numret för att ladda ner appen")
//   POST /auth/sms        {telefon}                 → {ok}            engångskod (6 siffror, 10 min) som sms till registrerat nummer
//   POST /auth/sms/verifiera {telefon, kod}         → {token, user}
//   POST /auth/kod        {kod}                     → {token, user}   länken #/k/KOD ur sms:et (eller en gammal e-postkod)
//   POST /auth/login      {telefon, pin}            → {token, user}   mobilnummer + den kod föräldern valt (när sms är av)
//   POST /auth/pin        {pin}  Bearer             → {ok}            välj (ny) kod; länkens engångskod förbrukas
//   POST /auth/glomt      {telefon}                 → {ok, skickat}   ny länk via sms, annars får Haris en flagga i registret
//   GET  /auth/me         Bearer <token>            → {user}
//   POST /auth/ut         Bearer <token>            → {ok}
// Innehåll (inloggad eller gäst)
//   GET  /filmer                                    → {filmer: [publicerade]}
//   GET  /media/<key>                               → filmen/omslaget/ljudet ur R2 (Range-stöd)
// Tider och bokning (förälder)
//   GET  /veckor          Bearer                    → {nu, veckor: [{v, slots}]} öppna veckor från och med denna
//   POST /boka/hall · /boka/bekrafta {v, slot, betalning: 'paket'|'swish'} · /boka/avboka {v, slot}
//   POST /boka/swishad    {v, slot, angra}          → föräldern säger att hen swishat (Haris bekräftar)
//   GET  /mina            Bearer                    → {klient, bokningar, planer, bedomningar, media, betalning, paket}
//   POST /mina/paket {mall} · /mina/paket/swishad {id, angra} · /mina/paket/angra {id}   paket på barnet (klippkort)
// Betalning (Carl 2026-10-27): Swish Företag har inget API. Appen öppnar Swish med Haris nummer, priset och ett
//   meddelande ifyllt, och Haris bockar av betalningen. /veckor och /mina skickar med betalning {swish, pris}.
// Admin (Bearer <admintoken> från /admin/login)
//   POST /admin/login     {losen}                   → {token}
//   Klientregistret: GET /admin/klienter · POST /admin/klient · GET/PUT/DELETE /admin/klient/<id>
//     POST /admin/klient/<id>/lank      {skicka}         → ny länk (+ sms om det är påslaget)
//     POST /admin/klient/<id>/niva      {niva, kommentar}
//     POST /admin/klient/<id>/bedomning {namn, varv, kommentar, mediaId, planId, blockId} · DELETE …/bedomning/<bid>
//     POST /admin/klient/<id>/media     {typ, url, key, namn, titel, planId, blockId} · DELETE …/media/<mid>
//     POST /admin/klient/<id>/boka      {v, slot} · POST …/avboka {v, slot}   Haris bokar åt en befintlig kund
//     POST /admin/klient/<id>/paket {mall | namn, antal, pris; betald} · PUT …/paket/<pid> {betald} · DELETE …/paket/<pid>
//     POST /admin/klient/<id>/tidpaket {v, slot, paket}   en bokad tid in i paketet (true) eller styckvis (false)
//     PUT  /admin/klient/<id>/pris {pris}   eget pris per pass · PUT …/utanfor {antal, tidigare}   pass betalda utanför appen
//     Klienten har passLogg: inlagda/borttagna pass, bokningar och avbokningar (föräldern ser den under Mina pass)
//   Filmer: GET /admin/filmer · POST /admin/film · PUT/DELETE /admin/film/<id>
//   Uppladdning i delar till R2: POST /admin/upload/start {filmId|klientId, filnamn, typ} · PUT /admin/upload/part · POST /admin/upload/complete · PUT /admin/upload/poster/<id>
//   Tider: GET /admin/veckor · PUT /admin/vecka/<v> {oppen, slots, notis} · POST /admin/vecka/<v>/auto · POST /admin/vecka/<v>/duplicera
//     En vecka går inte att öppna utan Swish-nummer och pris per pass (409).
//     När en vecka öppnas går en pushnotis till alla föräldrar med notiser på (en gång per vecka, notis: false hoppar över)
//     POST /admin/vecka/<v>/betald {slot, betald}   Haris bockar av (eller ångrar) en betalning
//   Stigen: GET /config/stig · PUT /admin/config/stig
//   Swish: GET/PUT /admin/config/betalning {swish, pris, paket: [{id, namn, antal, pris}]}
//   Pass: GET /admin/planer · POST /admin/plan · GET/PUT/DELETE /admin/plan/<id>
//   Övrigt: POST /admin/notis (push) · POST /admin/inbjudan + GET /admin/inbjudningar (gamla e-postkoder, kvar för bakåtkompatibilitet)
//
// KV: adm:<token> · klient:<id> · klienter (index) · tel:<telefon>=id · kod:<KOD>={klientId} · sess:<token>={uid}
//     bed:<klientId> (bedömningar) · med:<klientId> (filmer/ljud) · lim:<telefon> (inloggningsförsök)
//     film:<id> · vecka:<YYYY-Www> · config:stig · config:betalning · plan:<id> · inv:<KOD>, user:<uid>, email:<email> (gamla konton)
//     En bokning (slot.bokad) har pris (låst vid bokningen), swishad (föräldern) och betald (Haris), tidsstämplar eller null.
// SMS: 46elks när hemligheterna SMS_USER och SMS_PASS finns (SMS_FROM = avsändare, standard "CAP", eller ett eget
//      nummer hos 46elks om föräldrarna ska kunna svara). Annars skickar Haris länken själv från sin telefon (appen
//      öppnar Meddelanden med texten ifylld) och föräldrarna loggar in med en egen kod. SMS_TEST=1 (bara lokalt i
//      wrangler dev) lägger sms:en i en utkorg i KV i stället: GET /admin/smsut. Leveransstatus kommer tillbaka från
//      46elks till POST /sms/status och syns på klienten (smsLogg). APP_LANK_IOS = länken till appen (TestFlight/App Store).

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
const smsPa = env => !!(env.SMS_TEST || (env.SMS_USER && env.SMS_PASS));
const SESS_TTL = 60 * 60 * 24 * 400;
// Tak för antal sms per dygn (svensk tid), Carl 2026-10-25: högst 25 om dagen
const dagNu = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const smsTak = env => Math.max(0, Math.round(+(env.SMS_MAX_DAG ?? 25)));
async function smsDag(env) { return { smsIdag: +(await env.DB.get(`smsdag:${dagNu()}`)) || 0, smsTak: smsTak(env), smsFran: env.SMS_FROM || 'CapSwe' }; }
async function skickaSms(env, till, text, { hook } = {}) {
  const dagKey = `smsdag:${dagNu()}`;
  const idag = +(await env.DB.get(dagKey)) || 0;
  if (smsPa(env) && idag >= smsTak(env)) return { ok: false, skickat: false, tak: true, fel: `dagens tak på ${smsTak(env)} sms är nått` };
  const r = await skickaSmsNu(env, till, text, { hook });
  if (r.skickat) await env.DB.put(dagKey, String(idag + 1), { expirationTtl: 60 * 60 * 48 });
  return r;
}
async function skickaSmsNu(env, till, text, { hook } = {}) {
  if (env.SMS_TEST) {
    const ut = (await env.DB.get('smsut', 'json')) || [];
    const id = 'test' + slump(8, SMA);
    ut.push({ id, till, text, t: nu() });
    await env.DB.put('smsut', JSON.stringify(ut.slice(-50)));
    return { ok: true, skickat: true, id, test: true };
  }
  if (!smsPa(env)) return { ok: false, skickat: false, fel: 'sms är inte påslaget', av: true };
  try {
    const r = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: { authorization: 'Basic ' + btoa(`${env.SMS_USER}:${env.SMS_PASS}`), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ from: env.SMS_FROM || 'CapSwe', to: till, message: text, ...(hook ? { whendelivered: hook } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, skickat: false, fel: j.message || j.error || `${r.status}` };
    return { ok: true, skickat: true, id: j.id };
  } catch (e) { return { ok: false, skickat: false, fel: String(e?.message || e) }; }
}
// Sms till en klient, med en rad i klientens smsLogg som 46elks uppdaterar med leveransstatus. Spara klienten efteråt.
async function skickaTillKlient(env, k, typ, text, base) {
  const e = { id: slump(8, SMA), t: nu(), typ, status: 'skickas', tok: slump(16, SMA) };
  const r = await skickaSms(env, k.telefon, text, { hook: `${base}/sms/status?k=${k.id}&e=${e.id}&t=${e.tok}` });
  e.status = r.skickat ? (r.test ? 'levererat' : 'skickat') : 'misslyckat';
  if (!r.skickat) e.fel = ren(r.fel, 120);
  k.smsLogg = [...(k.smsLogg || []), e].slice(-12);
  return r;
}
// Korta länkar på LANK_BASE (cap.8bitcat.io, samma worker): /k/KOD loggar in, /app hämtar appen.
// Utan LANK_BASE går länkarna direkt till webbappen.
const lank = (env, kod) => env.LANK_BASE ? `${env.LANK_BASE}/k/${kod}` : `${env.APP_BASE}#/k/${kod}`;
const hamtaLank = env => env.LANK_BASE ? `${env.LANK_BASE}/app` : `${env.APP_BASE}#/app`;
const kodVisa = kod => `${kod.slice(0, 3)}-${kod.slice(3)}`;
// Carl 2026-10-26: "ett sms för att hämta appen och ett som man sedan trycker på för att logga in när appen är inne i telefonen"
function smsHamta(env, k) {
  return `Hej${k.foralder ? ' ' + k.foralder : ''}! Haris har lagt in ${k.barn || 'ditt barn'} i CAP, träningsappen från Complete Athletic Performance.\nHämta appen här: ${hamtaLank(env)}\nNär appen är installerad trycker du på länken i nästa sms, så loggas du in.\n/Haris`;
}
function smsLogga(env, k, kod) {
  return `Logga in i CAP: ${lank(env, kod)}\nTryck på länken när appen är installerad. Går det inte: öppna appen och skriv koden ${kodVisa(kod)}.\n/Haris`;
}
const giltigKod = k => (k.kod?.kod && !k.kod.forbrukad ? k.kod.kod : null);
// var föräldern loggade in senast: i appen eller i webbläsaren
const kallaAv = d => (d?.kalla === 'app' ? 'app' : 'webb');
function inloggad(k, kalla) { k.senast = nu(); k.inloggad = { ...(k.inloggad || {}), [kalla]: nu() }; if (k.status === 'ny') k.status = 'aktiv'; k.vilLank = null; }

// Sidan bakom inloggningslänken när den öppnas i Safari: knappen öppnar appen (caponline://k/KOD).
// När appen har Associated Domains öppnar iOS appen direkt och sidan syns aldrig.
function landning(env, kod, finns) {
  const webb = `${env.APP_BASE}#/k/${kod}`;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Logga in · CAP</title><meta name="theme-color" content="#000912">
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:#000912;color:#fdfdfd;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;padding:24px 16px}
main{width:100%;max-width:420px;text-align:center}.eb{font-size:12px;font-weight:800;letter-spacing:.2em;color:#00d4cb}h1{font-size:28px;margin:6px 0 8px}p{color:#9aa5b1;margin:0 0 18px}
a.btn{display:block;padding:15px 18px;border-radius:12px;font-weight:700;text-decoration:none;margin:10px 0;border:1px solid #243040;color:#fdfdfd;background:#182230}
a.btn.grad{background:linear-gradient(90deg,#0a9e9a,#00d4cb 55%,#00f0ff);color:#00242a;border:0;font-size:18px}
.kod{font-size:30px;font-weight:800;letter-spacing:.18em;margin:18px 0 4px}.sm{font-size:13px;color:#67727e}.hint{display:none;background:rgba(251,191,36,.08);border-left:3px solid #fbbf24;text-align:left;padding:10px 12px;border-radius:0 10px 10px 0;color:#fdfdfd;font-size:14px}</style></head>
<body><main><div class="eb">CAP</div>
${finns ? `<h1>Logga in i appen</h1><p>Tryck på knappen så öppnas CAP och du loggas in.</p>
<a class="btn grad" id="oppna" href="caponline://k/${kod}">Öppna CAP</a>
<div class="hint" id="hint">Hittade du inte appen? Hämta den först, kom sedan tillbaka till sms:et och tryck på länken igen.</div>
<a class="btn" href="${esc(hamtaLank(env))}">Har du inte appen? Hämta den</a>
<a class="btn" href="${esc(webb)}">Fortsätt i webbläsaren</a>
<div class="kod">${kodVisa(kod)}</div><div class="sm">Fungerar inte knappen: öppna appen och skriv koden.</div>`
  : `<h1>Länken har gått ut</h1><p>Be Haris skicka en ny inloggningslänk.</p><a class="btn" href="${esc(env.APP_BASE)}">Till CAP</a>`}
</main><script>
var ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
${finns ? `if(!ios){location.replace(${JSON.stringify(webb)});}
document.getElementById('oppna').addEventListener('click',function(){setTimeout(function(){if(document.visibilityState==='visible')document.getElementById('hint').style.display='block';},1800);});` : ''}
</script></body></html>`;
  return new Response(html, { status: finns ? 200 : 410, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
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
    barn: ren(d.barn, 40), efternamn: ren(d.efternamn, 40), fodd: /^\d{4}$/.test(String(d.fodd || '')) ? +d.fodd : (gammal.fodd || null),
    position: POSITIONER.includes(d.position) ? d.position : (gammal.position || 'okand'), lag: ren(d.lag, 60),
    niva, nivaHistorik: hist, anteckning: ren(d.anteckning, 2000),
    status: ['ny', 'aktiv', 'paus'].includes(d.status) ? d.status : (gammal.status || 'ny'),
    pin: gammal.pin || null, kod: gammal.kod || null, vilLank: gammal.vilLank || null, smsLogg: gammal.smsLogg || [], inloggad: gammal.inloggad || {}, paket: gammal.paket || [], pris: gammal.pris ?? null, passLogg: gammal.passLogg || [],
  };
}
// Det föräldern och adminlistan får se (aldrig pin-hashen eller sms-loggens nycklar)
const publikKlient = k => { const { pin, ...rest } = k; return { ...rest, harPin: !!pin, smsLogg: (k.smsLogg || []).map(({ tok, ...e }) => e) }; };
const userAvKlient = k => ({ uid: k.id, klientId: k.id, typ: 'klient', namn: k.foralder, barn: k.barn, efternamn: k.efternamn || '', telefon: k.telefon, email: k.email, fodd: k.fodd, position: k.position, niva: k.niva, harPin: !!k.pin });
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
  await env.DB.put(`sess:${token}`, JSON.stringify({ uid, skapad: nu(), forlangd: Date.now() }), { expirationTtl: SESS_TTL });
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
const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const veckaSpann = v => [0, 6].map(n => { const d = new Date(mandag(v).getTime() + n * 864e5); return `${d.getUTCDate()} ${MANAD[d.getUTCMonth()]}`; }).join(' – ');
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
  for (const w of veckor) for (const s of w.slots) if (s.bokad?.uid === uid) ut.push({ v: w.v, id: s.id, dag: s.dag, start: s.start, slut: s.slut, plats: s.plats, barn: s.bokad.barn, datum: datumFor(w.v, s.dag), mandag: mandag(w.v).toISOString().slice(0, 10), av: s.bokad.av || 'foralder',
    pris: s.bokad.pris || null, swishad: s.bokad.swishad || null, betald: s.bokad.betald || null, paket: s.bokad.paket || null });
  return ut.sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start));
}

// ---------- betalning med Swish Företag ----------
// Företagsnummer 123xxxxxxx, insamlingsnummer 90xxxxx, eller ett mobilnummer (Swish vill ha 46-formen)
function swishNr(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (/^07\d{8}$/.test(d)) d = '46' + d.slice(1);
  return /^(123\d{7}|90\d{5}|467\d{8})$/.test(d) ? d : '';
}
const hamtaBetalning = async env => ({ swish: '', pris: null, paket: [], ...((await env.DB.get('config:betalning', 'json')) || {}) });
// Paketen Haris säljer (Carl 2026-10-28: 10 pass 6 900 kr, 20 pass 12 900 kr): namn, antal pass och pris
function renPaketMallar(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 8).map(m => {
    const antal = Math.round(+m.antal || 0), pris = Math.round(+String(m.pris ?? '').replace(',', '.') || 0);
    return { id: /^[a-z0-9]{2,16}$/.test(String(m.id || '')) ? m.id : nyttId('m'), namn: ren(m.namn, 40) || `${antal} pass`, antal, pris };
  }).filter(m => m.antal >= 1 && m.antal <= 100 && m.pris >= 1 && m.pris <= 1000000);
}
// till föräldrarna bara när både nummer och pris finns, annars visas ingen Swish-knapp
const publikBetalning = b => (b?.swish && b?.pris ? { swish: b.swish, pris: b.pris, paket: b.paket || [] } : null);
// Pushnotis till alla telefoner som slagit på notiser (server/cap-push). hash = sidan appen öppnar vid tryck.
async function pushAlla(env, title, text, hash = '') {
  if (!env.PUSH_BASE || !env.PUSH_HEMLIG) return { ok: false, skickade: 0, fel: 'push är inte påslaget' };
  try {
    const r = await fetch(`${env.PUSH_BASE}/skicka`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hemlig: env.PUSH_HEMLIG, title, text, hash }) });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok, skickade: j.skickade || 0, fel: j.fel || '' };
  } catch (e) { return { ok: false, skickade: 0, fel: String(e?.message || e) }; }
}
// ---------- paket på barnet (klippkort) ----------
// Carl 2026-10-28: "en person köper ett paket, alltså 10 pass, så man kan lägga det på barnet". Paketet ligger på
// klienten (k.paket). Använda pass räknas ur bokningarna som pekar på paketet, så en avbokning lämnar tillbaka
// passet av sig själv. Reglerna från provet: föräldern kan köpa själv, passen går att boka innan paketet är betalt,
// och kommande obetalda bokningar flyttas in i ett nytt paket.
function paketSaldo(k, veckor) {
  const anv = {};
  for (const w of veckor) for (const s of w.slots) if (s.bokad?.uid === k.id && s.bokad.paket) anv[s.bokad.paket] = (anv[s.bokad.paket] || 0) + 1;
  // tidigare = pass som redan var använda när Haris lade in pass betalda utanför appen
  return (k.paket || []).map(p => { const anvanda = (p.tidigare || 0) + (anv[p.id] || 0); return { ...p, anvanda, kvar: Math.max(0, p.antal - anvanda) }; });
}
// Carl 2026-10-28: "olika barn ska kunna ha deals" – Haris sätter ett eget pris per pass på barnet
const klientPris = (k, cfg) => k?.pris || cfg.pris || null;
const krText = n => `${Number(n).toLocaleString('sv-SE')} kr`;
const DAGK = ['', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
const tidText = (v, s) => { const d = new Date(datumFor(v, s.dag) + 'T12:00:00Z'); return `${DAGK[s.dag]} ${d.getUTCDate()} ${MANAD[d.getUTCMonth()]} kl ${s.start}`; };
// Carl 2026-10-28: "en logg på alla pass" – inlagda och borttagna pass, bokningar och avbokningar, med datum.
// antal = hur saldot ändrades (+10 inlagt, −1 bokat från paketet, 0 för en bokning som betalas styckvis)
function logga(k, typ, text, antal = 0, av = '') { k.passLogg = [...(k.passLogg || []), { t: nu(), typ, text: ren(text, 160), antal, av }].slice(-300); }
const ledigtPaket = (k, veckor) => paketSaldo(k, veckor).find(p => p.kvar > 0) || null;
const nyttPaket = (m, av, betald) => ({ id: nyttId('pk'), namn: ren(m.namn, 40) || `${m.antal} pass`, antal: m.antal, pris: m.pris, kopt: nu(), av, betald: betald || !m.pris ? nu() : null, swishad: null });
async function sparaVeckor(env, veckor) { await Promise.all([...veckor].map(w => env.DB.put(`vecka:${w.v}`, JSON.stringify(w)))); }
// Ett nytt paket tar över kommande bokningar som inte är betalda eller swishade
async function flyttaTillPaket(env, k, pk, veckor) {
  let kvar = paketSaldo(k, veckor).find(p => p.id === pk.id)?.kvar || 0;
  const rader = [];
  for (const w of veckor) for (const s of w.slots) {
    const b = s.bokad;
    if (b?.uid === k.id && !b.paket && !b.betald && !b.swishad && datumFor(w.v, s.dag) >= idag()) rader.push({ w, s, nyckel: datumFor(w.v, s.dag) + s.start });
  }
  rader.sort((a, b) => a.nyckel.localeCompare(b.nyckel));
  const andrade = new Set();
  let n = 0;
  for (const r of rader) { if (kvar <= 0) break; r.s.bokad.paket = pk.id; r.s.bokad.pris = null; kvar--; n++; andrade.add(r.w); }
  await sparaVeckor(env, andrade);
  return n;
}
// Paketet tas bort: tiderna i det betalas styckvis igen, till dagens pris
async function slappPaket(env, k, pid, veckor) {
  const pris = klientPris(k, await hamtaBetalning(env));
  const andrade = new Set();
  for (const w of veckor) for (const s of w.slots) if (s.bokad?.uid === k.id && s.bokad.paket === pid) { s.bokad.paket = null; s.bokad.pris = pris; andrade.add(w); }
  await sparaVeckor(env, andrade);
}
async function sessionUser(env, req) {
  const t = bearer(req);
  const s = t && await env.DB.get(`sess:${t}`, 'json');
  if (!s) return null;
  // glidande: varje användning (högst en skrivning i veckan) förlänger sessionen, så man förblir inloggad
  if (!s.forlangd || Date.now() - s.forlangd > 7 * 864e5) { s.forlangd = Date.now(); await env.DB.put(`sess:${t}`, JSON.stringify(s), { expirationTtl: SESS_TTL }); }
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
    ovningId: ren(b.ovningId, 40), // övningen i övningsbanken blocket kom från (filmklippet i kör-läget)
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

    const lankVard = env.LANK_BASE && url.host === new URL(env.LANK_BASE).host;
    if (req.method === 'GET' && p === '/.well-known/apple-app-site-association') {
      return new Response(JSON.stringify({ applinks: { details: [{ appIDs: [env.IOS_APP_ID || 'GYTVJ3CTBJ.se.completeathletic.caponline'], components: [{ '/': '/k/*' }] }] } }), { headers: { 'content-type': 'application/json' } });
    }
    const mkl = /^\/k\/([A-Za-z0-9-]{6,8})\/?$/.exec(p);
    if (req.method === 'GET' && mkl) {
      const kod = mkl[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
      return landning(env, kod, !!(await env.DB.get(`kod:${kod}`)) || !!(await env.DB.get(`inv:${kod}`)));
    }
    if (req.method === 'GET' && (p === '/app' || p === '/app/')) {
      const ua = req.headers.get('user-agent') || '';
      const ios = /iPhone|iPad|iPod/.test(ua);
      return Response.redirect(ios && env.APP_LANK_IOS ? env.APP_LANK_IOS : `${env.APP_BASE}#/app`, 302);
    }
    if (req.method === 'GET' && p === '/' && lankVard) return Response.redirect(env.APP_BASE, 302);
    if (req.method === 'GET' && p === '/') return svar({ ok: true, app: 'CAP API', r2: !!env.MEDIA, sms: smsPa(env), appLank: env.APP_LANK_IOS || '' });
    if (req.method === 'GET' && p.startsWith('/media/')) return media(req, env, decodeURIComponent(p.slice(7)));

    const json = async () => { try { return await req.json(); } catch { return null; } };

    // ---------- leveransstatus från 46elks ----------
    if (p === '/sms/status' && req.method === 'POST') {
      const k = await hamtaKlient(env, url.searchParams.get('k'));
      const e = k?.smsLogg?.find(x => x.id === url.searchParams.get('e'));
      if (e && e.tok === url.searchParams.get('t')) {
        const f = await req.formData().catch(() => null);
        const s = String(f?.get('status') || '');
        if (s === 'delivered') { e.status = 'levererat'; e.levererat = nu(); } else if (s === 'failed') e.status = 'misslyckat'; else if (s === 'sent') e.status = 'skickat';
        await sparaKlient(env, k);
      }
      return new Response('ok', { headers: CORS }); // 46elks vill ha 2xx, även när adressen inte stämmer
    }

    // ---------- inloggning ----------
    if (p === '/auth/sms' && req.method === 'POST') {
      if (!smsPa(env)) return fel('sms-inloggningen är inte påslagen än, logga in med din egen kod', 503);
      const d = await json(); if (!d) return fel('trasig JSON');
      const tel = telefonNorm(d.telefon);
      if (!tel) return fel('skriv mobilnumret, t.ex. 070-123 45 67');
      const ip = req.headers.get('cf-connecting-ip') || 'okand';
      const ipN = +(await env.DB.get(`smsip:${ip}`)) || 0;
      if (ipN >= 20) return fel('för många försök härifrån, vänta en stund', 429);
      const lim = (await env.DB.get(`smsl:${tel}`, 'json')) || { n: 0, senast: 0 };
      const vanta = Math.ceil((lim.senast + 45000 - Date.now()) / 1000);
      if (vanta > 0) return fel(`vänta ${vanta} sekunder innan du ber om en ny kod`, 429);
      if (lim.n >= 5) return fel('för många koder den senaste timmen, vänta en stund eller hör av dig till Haris', 429);
      await env.DB.put(`smsip:${ip}`, String(ipN + 1), { expirationTtl: 3600 });
      const id = await env.DB.get(`tel:${tel}`);
      const k = id ? await hamtaKlient(env, id) : null;
      if (!k) return fel('numret finns inte hos Haris än. Be honom lägga in er.', 404);
      const kod = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
      const salt = slump(16, SMA);
      await env.DB.put(`otp:${tel}`, JSON.stringify({ salt, hash: await pinHash(kod, salt), forsok: 0, t: Date.now() }), { expirationTtl: 600 });
      await env.DB.put(`smsl:${tel}`, JSON.stringify({ n: lim.n + 1, senast: Date.now() }), { expirationTtl: 3600 });
      const r = await skickaTillKlient(env, k, 'kod', `${kod} är din kod till CAP. Den gäller i 10 minuter.`, base);
      await sparaKlient(env, k);
      if (!r.skickat) return fel(r.tak ? 'Dagens sms är slut. Försök i morgon, eller be Haris skicka en ny länk.' : `sms:et gick inte iväg (${r.fel}). Prova igen om en stund eller hör av dig till Haris.`, r.tak ? 503 : 502);
      return svar({ ok: true, giltigSek: 600, vantaSek: 45 });
    }
    if (p === '/auth/sms/verifiera' && req.method === 'POST') {
      const d = await json(); if (!d) return fel('trasig JSON');
      const tel = telefonNorm(d.telefon);
      const kod = String(d.kod || '').replace(/\D/g, '');
      if (!tel || kod.length !== 6) return fel('skriv de sex siffrorna från sms:et');
      const o = await env.DB.get(`otp:${tel}`, 'json');
      if (!o) return fel('koden har gått ut, tryck Skicka ny kod', 410);
      if (o.forsok >= 5) { await env.DB.delete(`otp:${tel}`); return fel('för många fel, tryck Skicka ny kod', 429); }
      if ((await pinHash(kod, o.salt)) !== o.hash) {
        o.forsok++;
        await env.DB.put(`otp:${tel}`, JSON.stringify(o), { expirationTtl: Math.max(60, 600 - Math.floor((Date.now() - o.t) / 1000)) });
        return fel(`fel kod${o.forsok >= 3 ? `, ${5 - o.forsok} försök kvar` : ''}`, 403);
      }
      await env.DB.delete(`otp:${tel}`);
      const k = await hamtaKlient(env, await env.DB.get(`tel:${tel}`));
      if (!k) return fel('numret finns inte hos Haris längre', 404);
      inloggad(k, kallaAv(d));
      await sparaKlient(env, k);
      return svar({ ok: true, token: await nySession(env, k.id), user: userAvKlient(k) });
    }
    if (p === '/auth/kod' && req.method === 'POST') {
      const d = await json(); if (!d) return fel('trasig JSON');
      const kod = String(d.kod || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (kod.length < 6) return fel('koden ska vara sex tecken');
      // ny klientlänk
      const kl = await env.DB.get(`kod:${kod}`, 'json');
      if (kl) {
        const k = await hamtaKlient(env, kl.klientId);
        if (!k) return fel('kontot finns inte längre', 404);
        // länken fungerar flera gånger (först i Safari, sedan i appen) tills Haris skapar en ny
        if (k.kod?.kod === kod && !k.kod.anvand) k.kod.anvand = nu();
        inloggad(k, kallaAv(d));
        await sparaKlient(env, k);
        return svar({ ok: true, token: await nySession(env, k.id), user: userAvKlient(k) });
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
      inloggad(k, kallaAv(d));
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
      const kod = giltigKod(k) || await nyKod(env, k);
      const sms = await skickaTillKlient(env, k, 'lank', smsLogga(env, k, kod), base);
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
      const veckor = await hamtaAlla(env, 'vecka:');
      const alla = veckor.filter(w => w.oppen && w.v >= nuV).sort((a, b) => a.v.localeCompare(b.v));
      const k = user.klientId ? await hamtaKlient(env, user.klientId) : null;
      const cfg = await hamtaBetalning(env);
      return svar({ ok: true, nu: nuV, veckor: alla.map(w => publikVecka(stadaHall(w), user.uid)), betalning: publikBetalning({ ...cfg, pris: klientPris(k, cfg) }), paket: k ? paketSaldo(k, veckor) : [] });
    }
    if (p.startsWith('/boka/') && req.method === 'POST') {
      const user = await sessionUser(env, req);
      if (!user) return fel('inte inloggad', 401);
      const d = await json(); if (!d) return fel('trasig JSON');
      const v = String(d.v || '');
      if (!VECKA_RE.test(v)) return fel('ogiltig vecka');
      const vecka = stadaHall(await hamtaVecka(env, v));
      const s = vecka.slots.find(x => x.id === String(d.slot || ''));
      if (!s || (!vecka.oppen && p !== '/boka/avboka' && p !== '/boka/swishad')) return fel('tiden finns inte', 404);
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
        // betalning: 'paket' = ett köpt pass, 'swish' = betala det här passet med Swish (Carl 2026-10-28: "använd dina
        // köpta pass eller swisha för nytt och använd inte det köpta"). Utan val (äldre appar) dras det från paketet.
        const kl = user.klientId ? await hamtaKlient(env, user.klientId) : null;
        const cfg = await hamtaBetalning(env);
        const pk = kl && d.betalning !== 'swish' ? ledigtPaket(kl, await hamtaAlla(env, 'vecka:')) : null;
        if (d.betalning === 'paket' && !pk) return fel('du har inga pass kvar i paketet', 409);
        s.bokad = { uid: user.uid, namn: user.namn || '', barn: ren(d.barn, 40) || user.barn || '', email: user.email || '', telefon: user.telefon || '', t: nu(), av: 'foralder', pris: pk ? null : klientPris(kl, cfg), paket: pk?.id || null };
        s.hall = null;
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        if (kl) {
          if (pk) logga(kl, 'bokad', `Bokade ${tidText(v, s)} med ett pass ur ${pk.namn}`, -1, 'foralder');
          else logga(kl, 'styck', `Bokade ${tidText(v, s)}${s.bokad.pris ? `, ${krText(s.bokad.pris)} med Swish` : ''}`, 0, 'foralder');
          await sparaKlient(env, kl);
        }
        return svar({ ok: true, slot: publikVecka(vecka, user.uid).slots.find(x => x.id === s.id) });
      }
      if (p === '/boka/swishad') {
        if (s.bokad?.uid !== user.uid) return fel('det är inte din bokning', 403);
        if (!s.bokad.betald) s.bokad.swishad = d.angra ? null : nu();
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        return svar({ ok: true });
      }
      if (p === '/boka/avboka') {
        if (s.bokad?.uid === user.uid) {
          const kl = user.klientId ? await hamtaKlient(env, user.klientId) : null;
          if (kl) { logga(kl, 'avbokad', `Avbokade ${tidText(v, s)}${s.bokad.paket ? ', passet tillbaka' : ''}`, s.bokad.paket ? 1 : 0, 'foralder'); await sparaKlient(env, kl); }
          s.bokad = null;
        }
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
      const cfg = await hamtaBetalning(env);
      return svar({ ok: true, bokningar, planer, klient, bedomningar, media, betalning: publikBetalning({ ...cfg, pris: klientPris(klient, cfg) }), paket: klient ? paketSaldo(klient, veckor) : [] });
    }

    // barnets namn och födelseår, det första föräldern fyller i (Carl 2026-10-25)
    // Paket (Carl 2026-10-28): föräldern köper ett paket i appen och betalar med Swish, Haris bockar av
    if (p.startsWith('/mina/paket') && req.method === 'POST') {
      const se = await env.DB.get(`sess:${bearer(req)}`, 'json');
      const k = se && await hamtaKlient(env, se.uid);
      if (!k) return fel('inte inloggad', 401);
      const d = await json(); if (!d) return fel('trasig JSON');
      const veckor = await hamtaAlla(env, 'vecka:');
      if (p === '/mina/paket') {
        const cfg = await hamtaBetalning(env);
        const m = (cfg.paket || []).find(x => x.id === String(d.mall || ''));
        if (!m || !cfg.swish) return fel('paketet finns inte', 404);
        if ((k.paket || []).some(x => x.av === 'foralder' && !x.betald && !x.swishad)) return fel('betala paketet du redan köpt först, eller ångra köpet', 409);
        const pk = nyttPaket(m, 'foralder', false);
        k.paket = [...(k.paket || []), pk]; k.uppdaterad = nu();
        logga(k, 'in', `Köpte ${pk.namn} för ${krText(pk.pris)}`, pk.antal, 'foralder');
        await sparaKlient(env, k);
        const flyttade = await flyttaTillPaket(env, k, pk, veckor);
        if (flyttade) { logga(k, 'flytt', `${flyttade === 1 ? 'En bokad tid' : `${flyttade} bokade tider`} flyttades in i ${pk.namn}`, -flyttade); await sparaKlient(env, k); }
        return svar({ ok: true, id: pk.id, flyttade, paket: paketSaldo(k, veckor), bokningar: bokningarFor(veckor, k.id) });
      }
      const pk = (k.paket || []).find(x => x.id === String(d.id || ''));
      if (!pk) return fel('paketet finns inte', 404);
      if (p === '/mina/paket/swishad') { if (!pk.betald) pk.swishad = d.angra ? null : nu(); }
      else if (p === '/mina/paket/angra') {
        if (pk.av !== 'foralder' || pk.betald || pk.swishad) return fel('paketet går inte att ångra här, hör av dig till Haris', 409);
        const kvar = paketSaldo(k, veckor).find(x => x.id === pk.id)?.kvar || 0;
        await slappPaket(env, k, pk.id, veckor);
        k.paket = k.paket.filter(x => x !== pk);
        logga(k, 'bort', `Ångrade köpet av ${pk.namn}`, -kvar, 'foralder');
      } else return fel('okänd adress', 404);
      k.uppdaterad = nu();
      await sparaKlient(env, k);
      return svar({ ok: true, paket: paketSaldo(k, veckor), bokningar: bokningarFor(veckor, k.id) });
    }

    if (p === '/mina/barn' && req.method === 'PUT') {
      const se = await env.DB.get(`sess:${bearer(req)}`, 'json');
      const k = se && await hamtaKlient(env, se.uid);
      if (!k) return fel('inte inloggad', 401);
      const d = await json(); if (!d) return fel('trasig JSON');
      const barn = ren(d.barn, 40); if (!barn) return fel('förnamnet saknas');
      k.barn = barn; k.efternamn = ren(d.efternamn, 40);
      if (/^\d{4}$/.test(String(d.fodd || ''))) k.fodd = +d.fodd;
      if (POSITIONER.includes(d.position)) k.position = d.position;
      k.uppdaterad = nu();
      await sparaKlient(env, k);
      return svar({ ok: true, user: userAvKlient(k) });
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
          const saldo = paketSaldo(k, veckor);
          return { ...publikKlient(k), paketKvar: saldo.reduce((n, x) => n + x.kvar, 0), paketObetalda: saldo.filter(x => !x.betald).length, nastaTid: b[0] || null, antalPass: planer.filter(x => x.uid === k.id).length, antalBed: bed.length, senasteBed: bed[0] ? { namn: bed[0].namn, medel: bed[0].medel, datum: bed[0].datum } : null, lank: k.kod?.kod && !k.kod.forbrukad ? lank(env, k.kod.kod) : null };
        }).sort((a, b) => (a.barn || a.foralder || '').localeCompare(b.barn || b.foralder || '', 'sv'));
        return svar({ ok: true, klienter: ut, sms: smsPa(env), r2: !!env.MEDIA, ...(await smsDag(env)) });
      }
      if (p === '/admin/klient' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const tel = telefonNorm(d.telefon);
        if (!tel) return fel('mobilnumret ser fel ut, skriv t.ex. 070-123 45 67');
        if (await env.DB.get(`tel:${tel}`)) return fel('det numret finns redan i registret', 409);
        const k = renKlient(d, { id: nyttId('k') });
        const kod = await nyKod(env, k);
        const l = lank(env, kod);
        let sms = { ok: false, skickat: false, av: !smsPa(env) };
        if (d.skicka) { sms = await skickaTillKlient(env, k, 'hamta', smsHamta(env, k), base); if (sms.skickat) sms = await skickaTillKlient(env, k, 'lank', smsLogga(env, k, kod), base); }
        await sparaKlient(env, k);
        await env.DB.put(`tel:${tel}`, k.id);
        const ids = await klientIndex(env); if (!ids.includes(k.id)) { ids.push(k.id); await env.DB.put('klienter', JSON.stringify(ids)); }
        return svar({ ok: true, klient: publikKlient(k), lank: l, kod, sms, hamtaText: smsHamta(env, k), loggaText: smsLogga(env, k, kod), hamtaLank: hamtaLank(env), ...(await smsDag(env)) });
      }
      const mk = /^\/admin\/klient\/([a-z0-9]+)(?:\/(lank|niva|bedomning|media|boka|avboka|paket|tidpaket|pris|utanfor)(?:\/([a-z0-9]+))?)?$/.exec(p);
      if (mk) {
        const k = await hamtaKlient(env, mk[1]);
        if (!k) return fel('klienten finns inte', 404);
        const del = mk[2], sub = mk[3];
        if (!del && req.method === 'GET') {
          const [veckor, planer, bedomningar, media] = await Promise.all([hamtaAlla(env, 'vecka:'), hamtaAlla(env, 'plan:'), env.DB.get(`bed:${k.id}`, 'json'), env.DB.get(`med:${k.id}`, 'json')]);
          const kod = giltigKod(k);
          return svar({ ok: true, klient: publikKlient(k), bokningar: bokningarFor(veckor, k.id), planer: planer.filter(x => x.uid === k.id).sort((a, b) => (b.datum + b.uppdaterad).localeCompare(a.datum + a.uppdaterad)),
            bedomningar: bedomningar || [], media: media || [], paket: paketSaldo(k, veckor), paketMallar: (await hamtaBetalning(env)).paket, standardPris: (await hamtaBetalning(env)).pris, lank: kod ? lank(env, kod) : null, kod, hamtaText: smsHamta(env, k), loggaText: kod ? smsLogga(env, k, kod) : '', hamtaLank: hamtaLank(env),
            sms: smsPa(env), r2: !!env.MEDIA, ...(await smsDag(env)) });
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
        // typ: hamta (sms 1), logga (sms 2) eller bada. ny: true ger en ny inloggningslänk (den gamla slutar gälla).
        if (del === 'lank' && req.method === 'POST') {
          const typ = ['hamta', 'logga', 'bada'].includes(d.typ) ? d.typ : 'logga';
          let kod = giltigKod(k);
          if (typ !== 'hamta' && (d.ny || !kod)) kod = await nyKod(env, k);
          let sms = { ok: false, skickat: false, av: !smsPa(env) };
          if (d.skicka) {
            if (typ !== 'logga') sms = await skickaTillKlient(env, k, 'hamta', smsHamta(env, k), base);
            if (typ !== 'hamta' && (typ === 'logga' || sms.skickat)) sms = await skickaTillKlient(env, k, 'lank', smsLogga(env, k, kod), base);
          }
          if (sms.skickat && typ !== 'hamta') k.vilLank = null;
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k), lank: kod ? lank(env, kod) : null, kod, sms, hamtaText: smsHamta(env, k), loggaText: kod ? smsLogga(env, k, kod) : '', hamtaLank: hamtaLank(env), ...(await smsDag(env)) });
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
        // Paket på klienten: lägg på (mall eller eget), markera betalt, ta bort, och flytta en tid in i eller ur paketet
        if (del === 'paket') {
          const veckor = await hamtaAlla(env, 'vecka:');
          let flyttade = 0;
          if (req.method === 'POST' && !sub) {
            const cfg = await hamtaBetalning(env);
            let m = d.mall ? (cfg.paket || []).find(x => x.id === String(d.mall)) : null;
            if (!m) {
              const antal = Math.round(+d.antal || 0), pris = Math.round(+String(d.pris ?? '').replace(',', '.') || 0);
              if (!(antal >= 1 && antal <= 100) || pris < 0 || pris > 1000000) return fel('skriv antal pass (1–100) och ett pris');
              m = { namn: ren(d.namn, 40) || `${antal} pass`, antal, pris };
            }
            const pk = nyttPaket(m, 'haris', !!d.betald);
            k.paket = [...(k.paket || []), pk];
            logga(k, 'in', `Haris lade in ${pk.namn}${pk.betald ? ', betalt' : ''}`, pk.antal, 'haris');
            await sparaKlient(env, k);
            flyttade = await flyttaTillPaket(env, k, pk, veckor);
            if (flyttade) logga(k, 'flytt', `${flyttade === 1 ? 'En bokad tid' : `${flyttade} bokade tider`} flyttades in i ${pk.namn}`, -flyttade);
          } else {
            const pk = (k.paket || []).find(x => x.id === sub);
            if (!pk) return fel('paketet finns inte', 404);
            if (req.method === 'PUT') { pk.betald = d.betald ? nu() : null; logga(k, 'betald', pk.betald ? `Haris bekräftade betalningen av ${pk.namn}` : `Haris ångrade betalningen av ${pk.namn}`, 0, 'haris'); }
            else if (req.method === 'DELETE') {
              const kvar = paketSaldo(k, veckor).find(x => x.id === pk.id)?.kvar || 0;
              await slappPaket(env, k, pk.id, veckor); k.paket = k.paket.filter(x => x !== pk);
              logga(k, 'bort', `Haris tog bort ${pk.namn} (${kvar} ${kvar === 1 ? 'pass' : 'pass'} kvar)`, -kvar, 'haris');
            }
            else return fel('okänd metod', 405);
            k.uppdaterad = nu();
            await sparaKlient(env, k);
          }
          await sparaKlient(env, k);
          return svar({ ok: true, flyttade, klient: publikKlient(k), paket: paketSaldo(k, veckor), bokningar: bokningarFor(veckor, k.id) });
        }
        if (del === 'tidpaket' && req.method === 'POST') {
          const veckor = await hamtaAlla(env, 'vecka:');
          const w = veckor.find(x => x.v === String(d.v || '')), s = w?.slots.find(x => x.id === String(d.slot || ''));
          if (!s?.bokad || s.bokad.uid !== k.id) return fel('tiden är inte bokad åt klienten', 404);
          if (d.paket) {
            if (s.bokad.betald) return fel('tiden är redan betald');
            const pk = ledigtPaket(k, veckor);
            if (!pk) return fel('inget paket med pass kvar', 409);
            s.bokad.paket = pk.id; s.bokad.pris = null; s.bokad.swishad = null;
            logga(k, 'flytt', `Haris drog ${tidText(w.v, s)} från ${pk.namn}`, -1, 'haris');
          } else {
            s.bokad.paket = null; s.bokad.pris = klientPris(k, await hamtaBetalning(env));
            logga(k, 'flytt', `${tidText(w.v, s)} betalas styckvis i stället, passet tillbaka`, 1, 'haris');
          }
          await env.DB.put(`vecka:${w.v}`, JSON.stringify(w));
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k), paket: paketSaldo(k, veckor), bokningar: bokningarFor(veckor, k.id) });
        }
        // eget pris per pass för barnet (tomt = standardpriset)
        if (del === 'pris' && req.method === 'PUT') {
          const pris = Math.round(+String(d.pris ?? '').replace(',', '.') || 0);
          if (pris < 0 || pris > 100000) return fel('priset ser fel ut');
          k.pris = pris || null; k.uppdaterad = nu();
          logga(k, 'pris', k.pris ? `Haris satte ett eget pris: ${krText(k.pris)} per pass` : 'Haris tog bort det egna priset, standardpriset gäller', 0, 'haris');
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k) });
        }
        // pass betalda utanför appen: hur många från början och hur många som redan är använda (ett sådant paket per barn)
        if (del === 'utanfor' && req.method === 'PUT') {
          const antal = Math.round(+d.antal || 0), tidigare = Math.round(+d.tidigare || 0);
          if (antal < 0 || antal > 500 || tidigare < 0 || tidigare > antal) return fel('använda pass kan inte vara fler än passen från början');
          const veckor = await hamtaAlla(env, 'vecka:');
          let pk = (k.paket || []).find(x => x.utanfor);
          if (!antal) {
            if (pk) { await slappPaket(env, k, pk.id, veckor); k.paket = k.paket.filter(x => x !== pk); logga(k, 'bort', 'Haris tog bort passen betalda utanför appen', -(paketSaldo({ ...k, paket: [pk] }, veckor)[0]?.kvar || 0), 'haris'); }
          } else if (pk) {
            const fore = paketSaldo(k, veckor).find(x => x.id === pk.id).kvar;
            pk.antal = antal; pk.tidigare = tidigare;
            const efter = paketSaldo(k, veckor).find(x => x.id === pk.id).kvar;
            logga(k, 'utanfor', `Haris ändrade passen betalda utanför appen: ${antal} från början, ${tidigare} använda`, efter - fore, 'haris');
          } else {
            pk = { id: nyttId('pk'), namn: 'Betalda utanför appen', antal, tidigare, pris: 0, kopt: nu(), av: 'haris', betald: nu(), swishad: null, utanfor: true };
            k.paket = [...(k.paket || []), pk];
            logga(k, 'in', `Haris lade in ${antal} pass betalda utanför appen${tidigare ? `, ${tidigare} redan använda` : ''}`, antal - tidigare, 'haris');
          }
          k.uppdaterad = nu();
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k), paket: paketSaldo(k, veckor), bokningar: bokningarFor(veckor, k.id) });
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
            const pk = ledigtPaket(k, await hamtaAlla(env, 'vecka:'));
            s.bokad = { uid: k.id, namn: k.foralder, barn: k.barn, telefon: k.telefon, email: k.email, t: nu(), av: 'haris', pris: pk ? null : klientPris(k, await hamtaBetalning(env)), paket: pk?.id || null };
            s.hall = null;
            logga(k, pk ? 'bokad' : 'styck', `Haris bokade ${tidText(v, s)}${pk ? ` med ett pass ur ${pk.namn}` : s.bokad.pris ? `, ${krText(s.bokad.pris)}` : ''}`, pk ? -1 : 0, 'haris');
          } else if (s.bokad?.uid === k.id) {
            logga(k, 'avbokad', `Haris avbokade ${tidText(v, s)}${s.bokad.paket ? ', passet tillbaka' : ''}`, s.bokad.paket ? 1 : 0, 'haris');
            s.bokad = null;
          }
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          await sparaKlient(env, k);
          return svar({ ok: true, vecka, bokningar: bokningarFor([vecka, ...(await hamtaAlla(env, 'vecka:')).filter(w => w.v !== v)], k.id) });
        }
        return fel('okänd klientadress', 404);
      }

      if (p === '/admin/smstest' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const tel = telefonNorm(d.telefon); if (!tel) return fel('mobilnumret ser fel ut');
        const r = await skickaSms(env, tel, 'Test från CAP. Sms-utskicken fungerar. /CapSwe');
        return svar({ ok: r.skickat, fel: r.fel, sms: r, ...(await smsDag(env)) }, r.skickat ? 200 : 502);
      }
      if (p === '/admin/smsut' && req.method === 'GET') {
        if (!env.SMS_TEST) return fel('bara i testläge', 404);
        return svar({ ok: true, ut: (await env.DB.get('smsut', 'json')) || [] });
      }
      if (p === '/admin/filmer' && req.method === 'GET') {
        const filmer = (await hamtaAlla(env, 'film:')).sort((a, b) => (b.uppdaterad || '').localeCompare(a.uppdaterad || ''));
        return svar({ ok: true, filmer, r2: !!env.MEDIA, sms: smsPa(env), ...(await smsDag(env)) });
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
      const mv = /^\/admin\/vecka\/(\d{4}-W\d{2})(\/auto|\/duplicera|\/betald)?$/.exec(p);
      if (mv) {
        const v = mv[1];
        const d = await json(); if (!d) return fel('trasig JSON');
        const vecka = stadaHall(await hamtaVecka(env, v));
        if (!mv[2] && req.method === 'PUT') {
          const gamla = Object.fromEntries(vecka.slots.map(s => [s.id, s]));
          const varOppen = !!vecka.oppen;
          // Carl 2026-10-28: "man ska inte kunna öppna en vecka om inte pris är satt"
          if (!varOppen && d.oppen) { const b = await hamtaBetalning(env); if (!b.swish || !b.pris) return fel('sätt pris per pass innan veckan öppnas, så att föräldrarna kan betala med Swish', 409); }
          vecka.oppen = !!d.oppen;
          const st = stadaSlots((Array.isArray(d.slots) ? d.slots : []).slice(0, 80).map(s => renSlot(s, gamla[s.id])));
          vecka.slots = st.slots;
          // Carl 2026-10-28: "en notis som går ut när man öppnar veckan för bokning, till alla föräldrar". En gång per vecka.
          let notis = null;
          if (!varOppen && vecka.oppen && d.notis !== false && !vecka.notis && v >= veckaAv()) {
            const lediga = vecka.slots.filter(s => !s.bokad && datumFor(v, s.dag) >= idag()).length;
            if (lediga) {
              notis = await pushAlla(env, 'Nya tider hos Haris', `${lediga} lediga ${lediga === 1 ? 'tid' : 'tider'} vecka ${Number(v.split('-W')[1])} (${veckaSpann(v)}). Tryck här för att boka.`, `/boka/${v}`);
              if (notis.ok) vecka.notis = nu();
            }
          }
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          const borta = Object.values(gamla).filter(s => s.bokad && !vecka.slots.some(n => n.bokad && n.bokad.uid === s.bokad.uid && n.bokad.t === s.bokad.t));
          for (const s of borta) {
            const kl = await hamtaKlient(env, s.bokad.uid);
            if (kl) { logga(kl, 'avbokad', `Haris avbokade ${tidText(v, s)}${s.bokad.paket ? ', passet tillbaka' : ''}`, s.bokad.paket ? 1 : 0, 'haris'); await sparaKlient(env, kl); }
          }
          return svar({ ok: true, vecka, kastade: st.kastade, notis });
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
        if (mv[2] === '/betald' && req.method === 'POST') {
          const s = vecka.slots.find(x => x.id === String(d.slot || ''));
          if (!s?.bokad) return fel('tiden är inte bokad', 404);
          s.bokad.betald = d.betald ? nu() : null;
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka });
        }
      }

      // Swish-nummer och pris per pass
      if (p === '/admin/config/betalning' && req.method === 'GET') return svar({ ok: true, config: await hamtaBetalning(env) });
      if (p === '/admin/config/betalning' && req.method === 'PUT') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const swish = swishNr(d.swish);
        if (String(d.swish || '').trim() && !swish) return fel('Swish-numret ser fel ut, skriv t.ex. 123 456 78 90');
        const pris = Math.round(+String(d.pris ?? '').replace(',', '.') || 0);
        if (pris < 0 || pris > 100000) return fel('priset ser fel ut');
        // paket följer bara med när admin skickar dem, så att t.ex. Tiders prisruta inte tömmer listan
        const cfg = { swish, pris: pris || null, paket: Array.isArray(d.paket) ? renPaketMallar(d.paket) : (await hamtaBetalning(env)).paket, uppdaterad: nu() };
        await env.DB.put('config:betalning', JSON.stringify(cfg));
        return svar({ ok: true, config: cfg });
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
        const r = await fetch(`${env.PUSH_BASE}/skicka`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hemlig: env.PUSH_HEMLIG, text: ren(d.text, 180), title: ren(d.title, 40) || 'CAP' }) });
        return svar(await r.json().catch(() => ({ ok: false, fel: 'pushservern svarade konstigt' })), r.status);
      }
      return fel('okänd adminadress', 404);
    }
    return fel('okänd adress', 404);
  },
};
