// CAP API. Cloudflare Worker med KV (DB) och, när det är påslaget, R2 (MEDIA) för filmer och ljud.
//
// Konton och inloggning (Carl 2026-10-23: "logga in med telefonnummer … sms med länken … glömt lösenord";
// 2026-10-25: "sms-inloggning via telefonnummer … länken till det numret för att ladda ner appen")
//   POST /auth/sms        {telefon}                 → {ok}            engångskod (6 siffror, 10 min) som sms till registrerat nummer
//   POST /auth/sms/verifiera {telefon, kod}         → {token, user}
//   POST /auth/kod        {kod}                     → {token, user}   länken #/k/KOD ur sms:et (eller en gammal e-postkod)
//   POST /auth/login      {anvandare, losen}        → {token, user, nyttLosen} | {admin}   EN inloggning för alla (Carl 2026-11-16):
//                         mobilnummer + lösenord, eller mobilnummer + koden ur sms:et första gången (nyttLosen: välj
//                         lösenord direkt). E-post + adminlösenordet = Haris (adminkontot). Äldre appar skickar {telefon, pin}.
//   POST /auth/pin        {losen} Bearer            → {ok}            välj (nytt) lösenord, minst 6 tecken; sms-koden förbrukas
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
//   POST /mina/push {token, av}  Bearer               telefonens pushkod kopplas till kontot (notiser till rätt förälder)
//   PUT  /mina/installningar {paminnelse}  Bearer       förälderns inställningar (klient.installningar)
//   POST /mina/radera {pushToken} Bearer              radera mitt konto (App Store 5.1.1(v)); Haris får en notis
//   /veckor och /mina skickar med pott {saldo, ledigt, bokat, passKvar, pris, bokade, historik} när barnet har en pott
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
//     POST /admin/klient/<id>/pott {typ: in|ut, belopp, text} · DELETE …/pott/<rid>   pott med pengar (eget avtal)
//     POST …/tidpaket {v, slot, satt: paket|pott|styck}   hur en bokad tid betalas
//     Klienten har passLogg: inlagda/borttagna pass, bokningar och avbokningar (föräldern ser den under Mina pass)
//   Filmer: GET /admin/filmer · POST /admin/film · PUT/DELETE /admin/film/<id>
//   Uppladdning i delar till R2: POST /admin/upload/start {filmId|klientId, filnamn, typ} · PUT /admin/upload/part · POST /admin/upload/complete · PUT /admin/upload/poster/<id>
//   Tider: GET /admin/veckor · PUT /admin/vecka/<v> {oppen, slots, notis} · POST /admin/vecka/<v>/auto · POST /admin/vecka/<v>/duplicera
//     /auto {schema: [{dag, pa, start, slut}], langd, plats, ersatt}   veckoschema med egna tider per dag (config:tidschema)
//     Påminnelser: schemat var 15:e minut (scheduled) och POST /admin/paminnelser {nu (bara TEST_LAGE)}
//   Kalender: GET /kal/<v>/<slot>/<uid>/<sig>.ics   signerad länk i /mina (bokningar[].kal), en kalenderhändelse
//   Syskon: POST /admin/klient/<id>/syskon {barn, efternamn, fodd}   nytt barn med samma förälder och nummer (k.huvud /
//     k.syskon). Bokningar {barnIds} i /boka/bekrafta och /admin/klient/<id>/boka: en bokning, ett pris, flera barn.
//     /veckor och /mina skickar familj; pris, paket och pott ligger på huvudklienten.
//     En vecka går inte att öppna utan Swish-nummer och pris per pass (409).
//     När en vecka öppnas går en pushnotis till alla föräldrar med notiser på (en gång per vecka, notis: false hoppar över)
//     POST /admin/vecka/<v>/betald {slot, betald}   Haris bockar av (eller ångrar) en betalning
//   Stigen: GET /config/stig · PUT /admin/config/stig
//   Swish: GET/PUT /admin/config/betalning {swish, pris, paket: [{id, namn, antal, pris}]}
//   Pass: GET /admin/planer · POST /admin/plan · GET/PUT/DELETE /admin/plan/<id>
//   Notiser: GET/PUT /admin/notiser {vecka, bokning, pass, betald, utveckling, haris} · POST /admin/push {token, av}
//     (Haris telefon) · POST /admin/vecka/<v>/notis   skicka notis om lediga tider igen
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
// Köp i appen: POST /mina/kop {jws} → {block, kop}. /mina ger block = det familjen låst upp. Se apple.js.

import { kollaTransaktion } from './apple.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400' };
const svar = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const fel = (text, status = 400) => svar({ ok: false, fel: text }, status);
const KOD_TECKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SMA = 'abcdefghijklmnopqrstuvwxyz0123456789';

// ---------- träningsblocken (köp i appen, Carl 2026-11-23: "ja till alla produkter") ----------
// Engångsköp i App Store. Ett köp gäller hela familjen (läggs på huvudklienten, som priset och paketen) och följer
// kontot, inte telefonen. Vilka steg i stigen ett block låser upp står i stigen (nod.block, admin → Stigen).
const APP_BUNDLE = 'se.completeathletic.caponline';
const BLOCK = [
  { id: 'niva2', namn: 'Nivå 2: Passa och dribbla', pris: 129, ger: ['niva2'] },
  { id: 'niva3', namn: 'Nivå 3: Finter och koordination', pris: 149, ger: ['niva3'] },
  { id: 'matchfart', namn: 'Nivå 4–5: Matchfart', pris: 199, ger: ['matchfart'] },
  { id: 'position', namn: 'Positionsblocket', pris: 249, ger: ['position'] },
  { id: 'stigen', namn: 'Hela stigen', pris: 499, ger: ['niva2', 'niva3', 'matchfart', 'position'] },
  { id: 'plus', namn: 'CAP Hemma Plus', pris: 999, ger: ['niva2', 'niva3', 'matchfart', 'position', 'plus'] },
];
const blockSku = id => `${APP_BUNDLE}.block.${id}`;
function blockFor(k) {
  const s = new Set();
  for (const x of k?.kop || []) if (!x.aterkallad) for (const g of BLOCK.find(b => b.id === x.id)?.ger || []) s.add(g);
  return [...s];
}
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
// som hamtaAlla, men som {id: dokument} där id är det som står efter prefixet
async function hamtaAllaMedId(env, prefix) {
  const ut = {};
  let cursor;
  do {
    const l = await env.DB.list({ prefix, cursor });
    const varden = await Promise.all(l.keys.map(k => env.DB.get(k.name, 'json')));
    l.keys.forEach((k, i) => { if (varden[i]) ut[k.name.slice(prefix.length)] = varden[i]; });
    cursor = l.list_complete ? undefined : l.cursor;
  } while (cursor);
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
async function skickaTillKlient(env, k, typ, text, base, till = k.telefon) {
  const e = { id: slump(8, SMA), t: nu(), typ, status: 'skickas', tok: slump(16, SMA), ...(till !== k.telefon ? { till } : {}) };
  const r = await skickaSms(env, till, text, { hook: `${base}/sms/status?k=${k.id}&e=${e.id}&t=${e.tok}` });
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
// Carl 2026-11-16: "Haris skapar användaren när han gör sitt sms, och den koden man får är ens login. Det första som
// ska hända när man loggar in via koden är att man sätter ett lösenord." Ett sms med allt.
function smsLogga(env, k, kod, f = null) {
  if (f) k = { ...k, foralder: f.namn, telefon: f.telefon };
  const tel = String(k.telefon || '').replace(/^\+46/, '0').replace(/^(0\d{2})(\d{3})(\d{2})(\d{2})$/, '$1-$2 $3 $4');
  return `Hej${k.foralder ? ' ' + k.foralder : ''}! Välkommen till CAP, appen för träningen hos Haris.\n1. Hämta appen: ${hamtaLank(env)}\n2. Logga in med ditt mobilnummer ${tel} och koden ${kodVisa(kod)}.\n3. Välj ett eget lösenord. Sedan loggar du in med mobilnumret och lösenordet.\n/Haris`;
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
    pin: gammal.pin || null, kod: gammal.kod || null, vilLank: gammal.vilLank || null, smsLogg: gammal.smsLogg || [], inloggad: gammal.inloggad || {}, paket: gammal.paket || [], pris: gammal.pris ?? null, passLogg: gammal.passLogg || [], pott: gammal.pott || [], notiser: gammal.notiser || [],
    huvud: gammal.huvud || null, syskon: gammal.syskon || [], installningar: gammal.installningar || {}, kop: gammal.kop || [],
  };
}
// ---------- syskon (Haris 2026-11-22: "en klient som lämnar sina tvillingar till mig") ----------
// Varje barn är en egen klient med egen nivå, egna bedömningar och filmer. Syskonen delar förälderns mobilnummer och
// inloggning: huvudklienten (det första barnet) har tel:-nyckeln, inloggningen, priset, paketen och potten, och varje
// syskon har huvud = huvudklientens id (huvudklienten har syskon = [id]). En bokning tillhör huvudklienten (bokad.uid)
// och har barnIds = barnen som kommer. Carl: "samma tid, en bokning" och "ett pris för passet".
const betalare = async (env, k) => (k?.huvud ? (await hamtaKlient(env, k.huvud)) || k : k);
async function familj(env, k) {
  const h = await betalare(env, k);
  if (!h) return [];
  return [h, ...(await Promise.all((h.syskon || []).map(id => hamtaKlient(env, id)))).filter(Boolean)];
}
const barnText = namn => { const n = namn.filter(Boolean); return n.length <= 1 ? (n[0] || '') : `${n.slice(0, -1).join(', ')} och ${n.at(-1)}`; };
const bokadeBarn = b => (b?.barnIds?.length ? b.barnIds : b?.uid ? [b.uid] : []);
// barnen som kommer: de valda ur familjen, annars bara det barn som angavs
function valdaBarn(fam, ids, standard) {
  const val = fam.filter(x => (Array.isArray(ids) && ids.length ? ids : [standard]).includes(x.id));
  return val.length ? val : fam.filter(x => x.id === standard);
}
// Det föräldern och adminlistan får se (aldrig pin-hashen eller sms-loggens nycklar)
const publikKlient = k => { const { pin, ...rest } = k; return { ...rest, harPin: !!pin, smsLogg: (k.smsLogg || []).map(({ tok, ...e }) => e), foraldrar: (k.foraldrar || []).map(f => ({ id: f.id, namn: f.namn, telefon: f.telefon, harPin: !!f.pin, kod: f.kod?.kod && !f.kod.forbrukad ? f.kod.kod : null, inloggad: f.inloggad || null, senast: f.senast || null, av: f.av, skapad: f.skapad })) }; };
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
  let kod; do { kod = slump(6, '0123456789'); } while (await env.DB.get(`kod:${kod}`));
  await env.DB.put(`kod:${kod}`, JSON.stringify({ klientId: k.id, skapad: nu() }), { expirationTtl: 60 * 60 * 24 * 90 });
  k.kod = { kod, skapad: nu(), anvand: null };
  return kod;
}
async function nySession(env, uid, foralder = null) {
  const token = tokenNy();
  await env.DB.put(`sess:${token}`, JSON.stringify({ uid, ...(foralder ? { foralder } : {}), skapad: nu(), forlangd: Date.now() }), { expirationTtl: SESS_TTL });
  return token;
}
// Fler föräldrar på samma konto (Haris 2026-11-25: "om mamma och pappa vill ha tillgång till barnets spelarkort … att
// jag knappar in två olika telefonnummer"; Carl: "föräldrarna ska kunna bjuda in en annan förälder eller så gör Haris
// det till samma konto"). En extra förälder ligger i k.foraldrar på huvudklienten med eget nummer, egen kod och eget
// lösenord. tel:<nummer> pekar på samma klient, kod:<KOD> har {klientId, foralder}, sessionen har foralder = id.
const foralderAv = (k, tel) => (tel && tel !== k?.telefon ? (k?.foraldrar || []).find(f => f.telefon === tel) || null : null);
const giltigKodF = f => (f?.kod?.kod && !f.kod.forbrukad ? f.kod.kod : null);
const userFor = (k, f) => (f ? { ...userAvKlient(k), namn: f.namn, telefon: f.telefon, foralderId: f.id, harPin: !!f.pin } : userAvKlient(k));
const publikForalder = f => ({ id: f.id, namn: f.namn, telefon: f.telefon, harPin: !!f.pin, kod: giltigKodF(f), inloggad: f.inloggad || null, senast: f.senast || null, av: f.av, skapad: f.skapad });
async function nyKodF(env, k, f) {
  if (f.kod?.kod) await env.DB.delete(`kod:${f.kod.kod}`);
  let kod; do { kod = slump(6, '0123456789'); } while (await env.DB.get(`kod:${kod}`));
  await env.DB.put(`kod:${kod}`, JSON.stringify({ klientId: k.id, foralder: f.id, skapad: nu() }), { expirationTtl: 60 * 60 * 24 * 90 });
  f.kod = { kod, skapad: nu(), anvand: null };
  return kod;
}
// lägger till en förälder på huvudklienten h; fel som text om numret redan används
async function laggTillForalder(env, h, d, av) {
  const tel = telefonNorm(d.telefon);
  if (!tel) return { fel: 'skriv mobilnumret, t.ex. 070-123 45 67' };
  if (tel === h.telefon || (h.foraldrar || []).some(f => f.telefon === tel)) return { fel: 'det numret finns redan på kontot' };
  if (await env.DB.get(`tel:${tel}`)) return { fel: 'det numret hör redan till ett annat konto hos Haris' };
  if ((h.foraldrar || []).length >= 4) return { fel: 'högst fem föräldrar på ett konto' };
  const f = { id: nyttId('f'), namn: ren(d.namn, 60), telefon: tel, pin: null, kod: null, skapad: nu(), av };
  const kod = await nyKodF(env, h, f);
  h.foraldrar = [...(h.foraldrar || []), f];
  await env.DB.put(`tel:${tel}`, h.id);
  return { f, kod };
}
async function rensaForaldrar(env, k) {
  for (const f of k?.foraldrar || []) {
    await env.DB.delete(`tel:${f.telefon}`).catch(() => {});
    if (f.kod?.kod) await env.DB.delete(`kod:${f.kod.kod}`).catch(() => {});
  }
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
  storlek: Math.max(0, Math.round(+d.storlek || 0)), sek: Math.max(0, Math.round((+d.sek || 0) * 10) / 10), marknad: !!d.marknad,
});

// Lagringen i R2 (Carl 2026-11-24: "vi ska komprimera filmerna, så att vi inte går över 10 gb"). Gratis upp till
// 10 GB; uppladdningar stoppas vid 9,5 GB. Summan räknas genom att lista bucketen (cache i KV r2:anvant, 10 min).
const R2_TAK = 9.5e9, R2_GRATIS = 10e9;
async function r2Anvant(env, farsk = false) {
  if (!env.MEDIA) return { b: 0, n: 0, t: Date.now() };
  const c = await env.DB.get('r2:anvant', 'json');
  if (!farsk && c && Date.now() - c.t < 10 * 60e3) return c;
  let b = 0, n = 0, cursor;
  do {
    const l = await env.MEDIA.list({ cursor, limit: 1000 });
    for (const o of l.objects) { b += o.size || 0; n++; }
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  const ut = { b, n, t: Date.now() };
  await env.DB.put('r2:anvant', JSON.stringify(ut));
  return ut;
}
const gbText = b => `${(b / 1e9).toFixed(1).replace('.', ',')} GB`;

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
  for (const w of veckor) for (const s of w.slots) if (s.bokad && (s.bokad.uid === uid || s.bokad.barnIds?.includes(uid))) ut.push({ v: w.v, id: s.id, dag: s.dag, start: s.start, slut: s.slut, plats: s.plats, barn: s.bokad.barn, barnIds: bokadeBarn(s.bokad), datum: datumFor(w.v, s.dag), mandag: mandag(w.v).toISOString().slice(0, 10), av: s.bokad.av || 'foralder',
    pris: s.bokad.pris || null, swishad: s.bokad.swishad || null, betald: s.bokad.betald || null, paket: s.bokad.paket || null, pott: !!s.bokad.pott, bokadT: s.bokad.t || null });
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
// Haris telefoner (admin) får inte föräldrarnas "nya tider", de vet redan om dem.
const pushAlla = (env, title, text, hash = '') => pushServer(env, '/skicka', { title, text, hash, foraldrar: true });
// "N lediga tider vecka X (datum)" – till föräldrarna när veckan öppnas, eller när Haris trycker Skicka notis
function veckaNotisText(vecka) {
  const v = vecka.v, nuL = lokal();
  const lediga = vecka.slots.filter(s => !s.bokad && `${datumFor(v, s.dag)}T${s.start}` > nuL).length;
  return { lediga, text: `${lediga} lediga ${lediga === 1 ? 'tid' : 'tider'} vecka ${Number(v.split('-W')[1])} (${veckaSpann(v)}). Tryck här för att boka.` };
}
// ---------- paket på barnet (klippkort) ----------
// Carl 2026-10-28: "en person köper ett paket, alltså 10 pass, så man kan lägga det på barnet". Paketet ligger på
// klienten (k.paket). Använda pass räknas ur bokningarna som pekar på paketet, så en avbokning lämnar tillbaka
// passet av sig själv. Reglerna från provet: föräldern kan köpa själv, passen går att boka innan paketet är betalt,
// och kommande obetalda bokningar flyttas in i ett nytt paket.
// Passen räknas ner när passet körts (Haris 2026-11-26: "jag vill att passen ska räknas ner precis efter passen. Det
// var en annan som hade bokat på söndag och passet försvann i samma stund hon bokade"). kvar = pass som inte körts,
// bokade = kommande bokningar ur paketet, ledigt = det som går att boka (kvar minus bokade). tidigare = pass som redan
// var använda när Haris lade in pass betalda utanför appen, och sena avbokningar.
const kortsPass = (v, s, nuL = lokal()) => `${datumFor(v, s.dag)}T${s.slut}` <= nuL;
function paketSaldo(k, veckor) {
  const korda = {}, bokade = {}, nuL = lokal();
  for (const w of veckor) for (const s of w.slots) if (s.bokad?.uid === k.id && s.bokad.paket) {
    const m = kortsPass(w.v, s, nuL) ? korda : bokade;
    m[s.bokad.paket] = (m[s.bokad.paket] || 0) + 1;
  }
  return (k.paket || []).map(p => {
    const anvanda = (p.tidigare || 0) + (korda[p.id] || 0), bok = bokade[p.id] || 0;
    return { ...p, anvanda, bokade: bok, kvar: Math.max(0, p.antal - anvanda), ledigt: Math.max(0, p.antal - anvanda - bok) };
  });
}
// Carl 2026-10-28: "olika barn ska kunna ha deals" – Haris sätter ett eget pris per pass på barnet
const klientPris = (k, cfg) => k?.pris || cfg.pris || null;
const krText = n => `${Number(n).toLocaleString('sv-SE')} kr`;
const DAGK = ['', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
const tidText = (v, s) => { const d = new Date(datumFor(v, s.dag) + 'T12:00:00Z'); return `${DAGK[s.dag]} ${d.getUTCDate()} ${MANAD[d.getUTCMonth()]} kl ${s.start}`; };
// Carl 2026-10-28: "en logg på alla pass" – inlagda och borttagna pass, bokningar och avbokningar, med datum.
// antal = hur saldot ändrades (+10 inlagt, −1 bokat från paketet, 0 för en bokning som betalas styckvis)
function logga(k, typ, text, antal = 0, av = '') { k.passLogg = [...(k.passLogg || []), { t: nu(), typ, text: ren(text, 160), antal, av }].slice(-300); }
const ledigtPaket = (k, veckor) => paketSaldo(k, veckor).find(p => p.ledigt > 0) || null;
const nyttPaket = (m, av, betald) => ({ id: nyttId('pk'), namn: ren(m.namn, 40) || `${m.antal} pass`, antal: m.antal, pris: m.pris, kopt: nu(), av, betald: betald || !m.pris ? nu() : null, swishad: null });
async function sparaVeckor(env, veckor) { await Promise.all([...veckor].map(w => env.DB.put(`vecka:${w.v}`, JSON.stringify(w)))); }
// Ett nytt paket tar över kommande bokningar som inte är betalda eller swishade
async function flyttaTillPaket(env, k, pk, veckor) {
  let kvar = paketSaldo(k, veckor).find(p => p.id === pk.id)?.ledigt || 0;
  const rader = [];
  for (const w of veckor) for (const s of w.slots) {
    const b = s.bokad;
    if (b?.uid === k.id && !b.paket && !b.pott && !b.betald && !b.swishad && datumFor(w.v, s.dag) >= idag()) rader.push({ w, s, nyckel: datumFor(w.v, s.dag) + s.start });
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
// ---------- pott med pengar (Carl 2026-11-13) ----------
// "egna avtal med vissa klienter och lägga in en pott. Först lägger man en pott med pengar, sen ska det dras av
// ifrån den varje gång ett pass körs. Det ska finnas historik hos klienten och Haris." + "om ett pass är 500 kr och man
// satt in 20 000 kr … när vi är på 15 500 kr och ändrar priset uppåt ska det visas att det blir färre pass kvar."
// k.pott = [{id, t, belopp, text, av}]: Haris insättningar (+) och uttag (−). Pass som betalas ur potten är bokningar
// med bokad.pott = true och ett låst pris. Beloppet dras när passet har körts (sluttiden passerad, svensk tid) och är
// reserverat dessförinnan. Pass kvar = det lediga beloppet delat med barnets pris JUST NU, så ett höjt pris ger färre pass.
const lokal = (d = new Date()) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).replace(' ', 'T').slice(0, 16);
function pottSaldo(k, veckor, cfg) {
  const rader = k.pott || [];
  if (!rader.length) return null;
  const nuL = lokal();
  const pass = [];
  for (const w of veckor) for (const s of w.slots) if (s.bokad?.uid === k.id && s.bokad.pott) {
    const dag = datumFor(w.v, s.dag), slut = `${dag}T${s.slut}`;
    // beloppet dras när passet körts, eller när Haris lagt in ett redan kört pass i efterhand (det som kom sist)
    const bokat = s.bokad.t ? lokal(new Date(s.bokad.t)) : '';
    pass.push({ typ: 'pass', v: w.v, slot: s.id, text: `Pass ${tidText(w.v, s)}`, belopp: -(s.bokad.pris || 0), nar: bokat > slut ? bokat : slut, start: `${dag}T${s.start}`, kord: slut <= nuL });
  }
  const insatt = rader.reduce((n, r) => n + r.belopp, 0);
  const kord = pass.filter(x => x.kord), bokade = pass.filter(x => !x.kord).sort((a, b) => a.start.localeCompare(b.start));
  const dragna = -kord.reduce((n, x) => n + x.belopp, 0), bokat = -bokade.reduce((n, x) => n + x.belopp, 0);
  const saldo = insatt - dragna, ledigt = saldo - bokat, pris = klientPris(k, cfg);
  // historiken i tidsordning med saldot efter varje rad, nyast först
  let lop = 0;
  const historik = [...rader.map(r => ({ typ: r.belopp >= 0 ? 'in' : 'ut', id: r.id, text: r.text, belopp: r.belopp, nar: lokal(new Date(r.t)), av: r.av })), ...kord]
    .sort((a, b) => a.nar.localeCompare(b.nar)).map(r => ({ ...r, saldo: (lop += r.belopp) })).reverse();
  return { saldo, bokat, ledigt, dragna, insatt, pris, passKvar: pris ? Math.max(0, Math.floor(ledigt / pris)) : 0, antalKorda: kord.length, bokade, historik: historik.slice(0, 200) };
}
const pottRacker = (k, veckor, cfg) => { const p = pottSaldo(k, veckor, cfg); const pris = klientPris(k, cfg); return !!(p && pris && p.ledigt >= pris); };
const pottText = p => p ? `${krText(p.saldo)} i potten${p.pris ? `, räcker till ${p.passKvar} ${p.passKvar === 1 ? 'pass' : 'pass'}` : ''}` : '';
// En insättning tar över kommande bokningar som inte är betalda, swishade eller i ett paket (samma regel som paketen)
async function flyttaTillPott(env, k, veckor, cfg) {
  const pris = klientPris(k, cfg);
  if (!pris) return 0;
  const rader = [];
  for (const w of veckor) for (const s of w.slots) {
    const b = s.bokad;
    if (b?.uid === k.id && !b.paket && !b.pott && !b.betald && !b.swishad && datumFor(w.v, s.dag) >= idag()) rader.push({ w, s, nyckel: datumFor(w.v, s.dag) + s.start });
  }
  rader.sort((a, b) => a.nyckel.localeCompare(b.nyckel));
  const andrade = new Set();
  let n = 0;
  for (const r of rader) {
    if (!pottRacker(k, veckor, cfg)) break;
    r.s.bokad.pott = true; r.s.bokad.pris = pris; n++; andrade.add(r.w);
  }
  await sparaVeckor(env, andrade);
  return n;
}

// ---------- notiser till rätt telefon (Carl 2026-11-13) ----------
// "vi har olika login på telefonerna" + "skicka notiser när Haris gör olika saker, såsom att han öppnat en vecka".
// Telefonen registrerar sin pushkod hos cap-push via cap-api, som skickar med klientens id (kid) eller admin-flaggan.
// Varje notis till en förälder sparas också i k.notiser, så att den syns under 🔔 i appen även utan push.
// Haris stänger av typer i config:notiser {vecka, bokning, pass, betald, utveckling, haris} (allt är på från början).
const NOTIS_TYPER = ['vecka', 'bokning', 'pass', 'betald', 'utveckling', 'haris', 'paminnelse'];
const hamtaNotisCfg = async env => ({ ...Object.fromEntries(NOTIS_TYPER.map(t => [t, true])), ...((await env.DB.get('config:notiser', 'json')) || {}) });
async function pushServer(env, path, data) {
  if (!env.PUSH_BASE || !env.PUSH_HEMLIG) return { ok: false, skickade: 0, fel: 'push är inte påslaget' };
  try {
    const r = await fetch(`${env.PUSH_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hemlig: env.PUSH_HEMLIG, ...data }) });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok, skickade: j.skickade || 0, fel: j.fel || '' };
  } catch (e) { return { ok: false, skickade: 0, fel: String(e?.message || e) }; }
}
async function pushTyp(env, typ, data) {
  if ((await hamtaNotisCfg(env))[typ] === false) return { ok: false, skickade: 0, av: true };
  return pushServer(env, '/skicka', data);
}
function noteraKlient(k, typ, title, text, hash = '') {
  const n = { id: slump(8, SMA), t: nu(), typ, title: ren(title, 40), text: ren(text, 180), hash };
  k.notiser = [...(k.notiser || []), n].slice(-60);
  return n;
}

// ---------- påminnelse inför passet (Khaleds mamma via Haris 2026-11-22: "kan man få notis inför träningspassen?") ----------
// Carl 2026-11-24: "en notis kommer 24h innan, och att man får en notis när det är dags att åka". Två påminnelser:
// 24 timmar före och när det är dags att åka (passets start minus familjens restid, 45 min om inget annat är valt
// under Inställningar). En påminnelse som skulle ha gått innan tiden bokades skickas inte. Har familjen passen i
// telefonens kalender (appen 1.4, installningar.kalender) kommer samma två larm därifrån, och då skickas inga notiser.
// Schemat kör var 15:e minut ([triggers] i wrangler.toml). Att en påminnelse gått iväg sparas som
// pam:<vecka>:<tid>:<bokningens tid>:<dygn|aka> (egen nyckel, så att schemat aldrig skriver över en vecka som någon
// bokar i samtidigt). Haris kan stänga av typen paminnelse under Admin → Mer → Notiser.
const dagFore = dag => new Date(Date.parse(`${dag}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const RESTID = 45;
const restidAv = k => { const r = Math.round(+k?.installningar?.restid || 0); return r >= 5 && r <= 180 ? r : RESTID; };
function paminnNar(v, s, restid = RESTID) {
  const start = utcAv(datumFor(v, s.dag), s.start).getTime();
  const bokat = s.bokad.t ? Date.parse(s.bokad.t) : 0;
  const ut = [];
  if (bokat < start - 864e5) ut.push({ typ: 'dygn', nar: lokal(new Date(start - 864e5)) });
  if (bokat < start - restid * 60e3) ut.push({ typ: 'aka', nar: lokal(new Date(start - restid * 60e3)) });
  return ut;
}
async function paminnelser(env, nuL = lokal()) {
  if ((await hamtaNotisCfg(env)).paminnelse === false) return { skickade: 0, av: true };
  const nuV = veckaAv(new Date(Date.parse(`${nuL.slice(0, 10)}T12:00:00Z`)));
  const ut = [];
  for (const v of [nuV, veckaPlus(nuV, 1)]) {
    const w = await env.DB.get(`vecka:${v}`, 'json');
    for (const s of w?.slots || []) {
      const b = s.bokad;
      if (!b?.uid || `${datumFor(v, s.dag)}T${s.start}` <= nuL) continue;
      const alla = paminnNar(v, s);
      if (!alla.length || nuL < alla[0].nar) continue;
      const k = await env.DB.get(`klient:${b.uid}`, 'json');
      // föräldern kan stänga av påminnelsen under Inställningar (Carl 2026-11-22); med passen i kalendern kommer larmen därifrån
      if (k?.installningar?.paminnelse === false || k?.installningar?.kalender === true) continue;
      const lista = paminnNar(v, s, restidAv(k)).filter(x => nuL >= x.nar);
      if (!lista.length) continue;
      const nar = lista.at(-1); // har schemat missat en, skickas bara den senaste
      const nyckel = `pam:${v}:${s.id}:${b.t || ''}:${nar.typ}`;
      if (await env.DB.get(nyckel)) continue;
      // den gamla påminnelsen kvällen före (före 2026-11-24) räknas som dygnspåminnelsen
      if (nar.typ === 'dygn' && await env.DB.get(`pam:${v}:${s.id}:${b.t || ''}`)) continue;
      await Promise.all(lista.map(x => env.DB.put(`pam:${v}:${s.id}:${b.t || ''}:${x.typ}`, '1', { expirationTtl: 14 * 86400 })));
      const plats = s.plats || 'Backavallen';
      const title = nar.typ === 'aka' ? 'Dags att åka till träningen' : 'Träning med Haris i morgon';
      const text = nar.typ === 'aka' ? `${b.barn || 'Passet'} börjar ${s.start} på ${plats}. Vi ses!` : `${b.barn || 'Ni'} tränar i morgon, ${tidText(v, s)}–${s.slut}, ${plats}.`;
      const r = await pushServer(env, '/skicka', { title, text, hash: '/boka', till: [b.uid] });
      ut.push({ v, slot: s.id, uid: b.uid, typ: nar.typ, title, text, ok: r.ok, skickade: r.skickade });
    }
  }
  return { skickade: ut.length, paminnelser: ut };
}

// ---------- lägg passet i kalendern (Carl 2026-11-22) ----------
// Mina bokningar har en länk /kal/<vecka>/<tid>/<uid>/<sig>.ics. Länken är signerad, så den behöver ingen inloggning
// (Safari öppnar den utanför appen) och kan inte gissas. iPhone visar "Lägg till i kalendern" med en påminnelse en timme före.
async function kalSig(env, v, slot, uid) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`kal|${env.PUSH_HEMLIG || env.ADMIN_LOSEN || 'cap'}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${v}|${slot}|${uid}`)));
  return [...sig.slice(0, 9)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// svensk tid → UTC (sommar- och vintertid följer med)
function utcAv(dag, tid) { const g = Date.parse(`${dag}T${tid}:00Z`); return new Date(g - (Date.parse(`${lokal(new Date(g))}:00Z`) - g)); }
const icsTid = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = s => String(s || '').replace(/[\\;,]/g, m => `\\${m}`).replace(/\r?\n/g, '\\n');
// Carl 2026-11-22: "påminnelse att träna med cap 1 timme innan och dags att åka, plats är backavallen".
// Platsen i kalendern är den Haris skrivit på tiden (live: "Backavallen, Gratts Arena"), annars Backavallen.
const kalPlats = s => (s.plats ? `${s.plats}${/göteborg/i.test(s.plats) ? '' : ', Göteborg'}` : 'Backavallen, Göteborg');
// rader längre än 75 tecken viks enligt iCalendar (fortsättningsraden börjar med ett mellanslag)
const vik = rad => {
  const ut = []; let bit = '', byte = 0;
  for (const t of rad) {
    const n = new TextEncoder().encode(t).length;
    if (byte + n > 73) { ut.push(bit); bit = ' '; byte = 1; }
    bit += t; byte += n;
  }
  ut.push(bit);
  return ut.join('\r\n');
};
// En bokad tid som kalenderhändelse. haris: rubriken är barnens namn, beskrivningen förälder, telefon och betalning.
function kalHandelse(v, s, { haris = false, restid = RESTID } = {}) {
  const dag = datumFor(v, s.dag), b = s.bokad;
  const betalt = b.paket ? 'Ingår i paket' : b.pott ? `Ur potten${b.pris ? ` (${krText(b.pris)})` : ''}` : b.betald ? 'Betald' : b.swishad ? `Swishad${b.pris ? ` ${krText(b.pris)}` : ''}, inte bekräftad` : b.pris ? `Inte betald, ${krText(b.pris)}` : '';
  const rubrik = haris ? `CAP: ${b.barn || b.namn || 'Bokad tid'}` : `Träning med CAP${b.barn ? ` (${b.barn})` : ''}`;
  const text = haris
    ? [b.namn ? `Förälder: ${b.namn}` : '', b.telefon ? `Telefon: ${b.telefon}` : '', betalt ? `Betalning: ${betalt}` : '', `Bokad av ${b.av === 'haris' ? 'dig' : 'föräldern'} i CAP.`].filter(Boolean).join('\n')
    : 'Bokat i CAP. Kan ni inte komma? Avboka i appen under Med Haris.';
  return ['BEGIN:VEVENT', `UID:cap-${v}-${s.id}-${String(b.t || '').replace(/\D/g, '')}@cap.8bitcat.io`, `DTSTAMP:${icsTid(new Date())}`,
    `DTSTART:${icsTid(utcAv(dag, s.start))}`, `DTEND:${icsTid(utcAv(dag, s.slut))}`,
    `SUMMARY:${icsText(rubrik)}`, `LOCATION:${icsText(kalPlats(s))}`, `DESCRIPTION:${icsText(text)}`,
    ...(haris ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Om en timme: ${b.barn || 'träning'} på ${s.plats || 'Backavallen'}.`)}`, 'TRIGGER:-PT1H', 'END:VALARM']
      : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`I morgon: träning med CAP, ${s.start} på ${s.plats || 'Backavallen'}.`)}`, 'TRIGGER:-P1D', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Dags att åka till ${s.plats || 'Backavallen'}. Passet börjar ${s.start}.`)}`, `TRIGGER:-PT${restid}M`, 'END:VALARM']),
    'END:VEVENT'];
}
function icsKalender(handelser, namn = '') {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//8bitcat//CAP//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...(namn ? [`X-WR-CALNAME:${icsText(namn)}`, 'X-WR-TIMEZONE:Europe/Stockholm', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M'] : []),
    ...handelser.flat(), 'END:VCALENDAR'].map(vik).join('\r\n') + '\r\n';
}
const icsFor = (v, s) => icsKalender([kalHandelse(v, s)]);
// Prenumeration (Carl 2026-11-22: "haris får varje bokning med namn på barnet/barnen i sin apple kalender"): alla bokade
// tider en vecka bakåt och tio framåt. Hämtas med get per vecka (inga list-anrop, kalendern frågar var 15:e minut).
async function kalFlode(env, filter, opts) {
  const nuV = veckaAv();
  const v0 = veckaPlus(nuV, -1);
  const veckor = await Promise.all(Array.from({ length: 12 }, (_, i) => veckaPlus(v0, i)).map(v => env.DB.get(`vecka:${v}`, 'json')));
  const ut = [];
  for (const w of veckor.filter(Boolean)) for (const s of w.slots) if (s.bokad && filter(s.bokad)) ut.push(kalHandelse(w.v, s, opts));
  return ut;
}
const kalSvar = ics => new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="cap.ics"', 'cache-control': 'no-store', ...CORS } });
const textSvar = (t, status) => new Response(t, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });
// Haris loggar in med sin e-post (Carl 2026-11-16). Tillåtna adresser: config:admins.epost (Admin → Mer) och
// ADMIN_EPOST (kommaseparerad, för lokala tester). Lösenordet är adminlösenordet ADMIN_LOSEN.
async function adminEpost(env) {
  const cfg = (await env.DB.get('config:admins', 'json')) || {};
  return [...String(env.ADMIN_EPOST || '').split(','), ...(cfg.epost || [])].map(x => String(x).trim().toLowerCase()).filter(Boolean);
}
async function sessionUser(env, req) {
  const t = bearer(req);
  const s = t && await env.DB.get(`sess:${t}`, 'json');
  if (!s) return null;
  // glidande: varje användning (högst en skrivning i veckan) förlänger sessionen, så man förblir inloggad
  if (!s.forlangd || Date.now() - s.forlangd > 7 * 864e5) { s.forlangd = Date.now(); await env.DB.put(`sess:${t}`, JSON.stringify(s), { expirationTtl: SESS_TTL }); }
  const k = await env.DB.get(`klient:${s.uid}`, 'json');
  if (k && s.foralder) { const f = (k.foraldrar || []).find(x => x.id === s.foralder); return f ? userFor(k, f) : null; }
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
    // ljud eller film för hela passet, t.ex. Haris röst om känslan från passet (Carl 2026-11-24)
    media: (Array.isArray(d.media) ? d.media : []).slice(0, 6).map(m => ({ id: ren(m.id, 24), typ: m.typ === 'audio' ? 'audio' : 'video', url: ren(m.url, 400), namn: ren(m.namn, 80), t: ren(m.t, 30), lokal: !!m.lokal })),
    // kommentarerna (Haris och föräldern) ändras bara genom /svar, aldrig genom att passet sparas
    svar: gammal.svar || [],
  };
}
const renSvar = (d, av, namn) => ({ id: nyttId('s'), blockId: ren(d.blockId, 20), av, namn: ren(namn, 60), text: ren(d.text, 1000), t: nu() });
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
      if (n.block) ut.block = ren(n.block, 20).replace(/[^a-z0-9]/g, '');
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
    const mkal = /^\/kal\/(\d{4}-W\d{2})\/([a-z0-9]{4,12})\/([A-Za-z0-9_-]{1,40})\/([0-9a-f]{18})\.ics$/.exec(p);
    if (req.method === 'GET' && mkal) {
      const [, v, sid, uid, sig] = mkal;
      if (sig !== await kalSig(env, v, sid, uid)) return textSvar('Länken stämmer inte.', 403);
      const s = (await hamtaVecka(env, v)).slots.find(x => x.id === sid);
      if (s?.bokad?.uid !== uid) return textSvar('Tiden är inte bokad längre. Öppna CAP för att se era bokningar.', 404);
      return kalSvar(icsFor(v, s));
    }
    // Haris kalender: alla bokningar (hemlig nyckel i config:kalhemlig, byts under Admin → Mer)
    const mkh = /^\/kal\/haris\/([a-z0-9]{24,40})\.ics$/.exec(p);
    if (req.method === 'GET' && mkh) {
      const hemlig = await env.DB.get('config:kalhemlig');
      if (!hemlig || mkh[1] !== hemlig) return textSvar('Länken gäller inte längre. Hämta den nya under Admin → Mer → Bokningarna i din kalender.', 403);
      return kalSvar(icsKalender(await kalFlode(env, () => true, { haris: true }), 'CAP bokningar'));
    }
    // familjens kalender: deras egna bokningar
    const mkf = /^\/kal\/familj\/([a-z0-9]{4,20})\/([0-9a-f]{18})\.ics$/.exec(p);
    if (req.method === 'GET' && mkf) {
      if (mkf[2] !== await kalSig(env, 'familj', 'alla', mkf[1])) return textSvar('Länken stämmer inte.', 403);
      return kalSvar(icsKalender(await kalFlode(env, b => b.uid === mkf[1], { restid: restidAv(await hamtaKlient(env, mkf[1])) }), 'Träning med CAP'));
    }

    const json = async () => { try { return await req.json(); } catch { return null; } };
    // notiser skickas i bakgrunden, så att svaret inte väntar på Apple. tillKlient sparar också notisen på klienten
    // (anropa före sparaKlient).
    const bakgrund = pr => { try { ctx.waitUntil(Promise.resolve(pr).catch(() => {})); } catch { /* ok */ } };
    // ett syskon har ingen egen telefon i appen: pushen går till huvudklientens (förälderns) telefon
    const tillKlient = (k, typ, title, text, hash = '') => { if (!k) return; noteraKlient(k, typ, title, text, hash); bakgrund(pushTyp(env, typ, { title, text, hash, till: [k.huvud || k.id] })); };
    const tillHaris = (title, text, hash = '/admin/tider') => bakgrund(pushTyp(env, 'haris', { title, text, hash, admin: true }));
    const barnNamn = (k, u) => [k?.barn || u?.barn, k?.efternamn].filter(Boolean).join(' ') || k?.foralder || u?.namn || 'En förälder';

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
      const r = await skickaTillKlient(env, k, 'kod', `${kod} är din kod till CAP. Den gäller i 10 minuter.`, base, tel);
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
      const f = foralderAv(k, tel);
      if (f) { f.senast = nu(); f.inloggad = { ...(f.inloggad || {}), [kallaAv(d)]: nu() }; } else inloggad(k, kallaAv(d));
      await sparaKlient(env, k);
      return svar({ ok: true, token: await nySession(env, k.id, f?.id), user: userFor(k, f) });
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
        const f = kl.foralder ? (k.foraldrar || []).find(x => x.id === kl.foralder) : null;
        if (kl.foralder && !f) return fel('inbjudan gäller inte längre. Be om en ny.', 404);
        // länken fungerar flera gånger (först i Safari, sedan i appen) tills Haris skapar en ny
        if (f) { if (!f.kod?.anvand && f.kod) f.kod.anvand = nu(); f.senast = nu(); f.inloggad = { ...(f.inloggad || {}), [kallaAv(d)]: nu() }; }
        else { if (k.kod?.kod === kod && !k.kod.anvand) k.kod.anvand = nu(); inloggad(k, kallaAv(d)); }
        await sparaKlient(env, k);
        return svar({ ok: true, token: await nySession(env, k.id, f?.id), user: userFor(k, f), nyttLosen: true });
      }
      // gammal e-postkod
      const inv = await env.DB.get(`inv:${kod}`, 'json');
      if (!inv) return fel('koden finns inte längre. Har du redan valt ett lösenord? Logga in med mobilnummer och lösenord.', 404);
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
      const anv = String(d.anvandare ?? d.telefon ?? '').trim();
      const losen = String(d.losen ?? d.pin ?? '');
      if (!anv) return fel('skriv ditt mobilnummer');
      if (!losen) return fel('skriv lösenordet, eller koden från sms:et första gången');
      // Haris: e-post + adminlösenordet ger adminkontot
      if (anv.includes('@')) {
        const epost = anv.toLowerCase();
        const limKey = `lim:${epost}`;
        const forsok = +(await env.DB.get(limKey)) || 0;
        if (forsok >= 10) return fel('för många försök, vänta en kvart och prova igen', 429);
        if (!env.ADMIN_LOSEN || !(await adminEpost(env)).includes(epost) || losen !== env.ADMIN_LOSEN) {
          await env.DB.put(limKey, String(forsok + 1), { expirationTtl: 900 });
          return fel('fel e-post eller lösenord', 403);
        }
        await env.DB.delete(limKey);
        const token = tokenNy();
        await env.DB.put(`adm:${token}`, JSON.stringify({ skapad: nu(), epost }), { expirationTtl: 60 * 60 * 24 * 365 });
        return svar({ ok: true, admin: token, epost });
      }
      const tel = telefonNorm(anv);
      if (!tel) return fel('skriv mobilnumret, t.ex. 070-123 45 67 (Haris loggar in med sin e-post)');
      const limKey = `lim:${tel}`;
      const forsok = +(await env.DB.get(limKey)) || 0;
      if (forsok >= 10) return fel('för många försök, vänta en kvart och prova igen', 429);
      const id = await env.DB.get(`tel:${tel}`);
      const k = id ? await hamtaKlient(env, id) : null;
      if (!k) return fel('numret finns inte hos Haris än. Be honom lägga in er.', 404);
      // den andra föräldern på kontot loggar in med sitt eget nummer, sin kod och sitt lösenord
      const fo = foralderAv(k, tel);
      const markera = () => { if (fo) { fo.senast = nu(); fo.inloggad = { ...(fo.inloggad || {}), [kallaAv(d)]: nu() }; } else inloggad(k, kallaAv(d)); };
      // koden ur sms:et loggar in, och då väljer man ett lösenord direkt
      const kod = fo ? giltigKodF(fo) : giltigKod(k), skrivet = losen.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (kod && skrivet === kod) {
        await env.DB.delete(limKey);
        const kk = fo ? fo.kod : k.kod; if (!kk.anvand) kk.anvand = nu();
        markera();
        await sparaKlient(env, k);
        return svar({ ok: true, token: await nySession(env, k.id, fo?.id), user: userFor(k, fo), nyttLosen: true });
      }
      const pin = fo ? fo.pin : k.pin;
      if (!pin) { await env.DB.put(limKey, String(forsok + 1), { expirationTtl: 900 }); return fel('fel kod. Första gången loggar du in med koden i sms:et från Haris.', 403); }
      if ((await pinHash(losen, pin.salt)) !== pin.hash) { await env.DB.put(limKey, String(forsok + 1), { expirationTtl: 900 }); return fel(`fel lösenord${forsok >= 6 ? `, ${10 - forsok - 1} försök kvar` : ''}`, 403); }
      await env.DB.delete(limKey);
      markera();
      await sparaKlient(env, k);
      return svar({ ok: true, token: await nySession(env, k.id, fo?.id), user: userFor(k, fo) });
    }
    if (p === '/auth/pin' && req.method === 'POST') {
      const d = await json(); if (!d) return fel('trasig JSON');
      const losen = String(d.losen ?? d.pin ?? '');
      if (losen.length < 6 || losen.length > 100) return fel('lösenordet ska vara minst sex tecken');
      const s = await env.DB.get(`sess:${bearer(req)}`, 'json');
      const k = s && await hamtaKlient(env, s.uid);
      if (!k) return fel('inte inloggad', 401);
      const salt = slump(16, SMA);
      if (s.foralder) {
        const f = (k.foraldrar || []).find(x => x.id === s.foralder);
        if (!f) return fel('inte inloggad', 401);
        f.pin = { salt, hash: await pinHash(losen, salt), t: nu() };
        if (f.kod?.kod) { await env.DB.delete(`kod:${f.kod.kod}`); f.kod.forbrukad = nu(); }
        await sparaKlient(env, k);
        return svar({ ok: true, user: userFor(k, f) });
      }
      k.pin = { salt, hash: await pinHash(losen, salt), t: nu() };
      k.vilLank = null; k.status = 'aktiv';
      // sms-koden har gjort sitt: den (och länken) slutar gälla när lösenordet är valt
      if (k.kod?.kod) { await env.DB.delete(`kod:${k.kod.kod}`); k.kod.forbrukad = nu(); }
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
      const fg = foralderAv(k, tel);
      if (fg) {
        const kodF = giltigKodF(fg) || await nyKodF(env, k, fg);
        const smsF = await skickaTillKlient(env, k, 'lank', smsLogga(env, k, kodF, fg), base, fg.telefon);
        if (!smsF.skickat) { fg.vilLank = nu(); tillHaris('Glömt lösenordet', `${fg.namn || 'En förälder'} (${barnNamn(k)}) har glömt lösenordet. Skicka koden från klientsidan.`, `/admin/klient/${k.id}`); }
        await sparaKlient(env, k);
        return svar({ ok: true, skickat: smsF.skickat, meddelande: smsF.skickat ? 'En ny kod är skickad som sms till ditt nummer.' : 'Haris får ett meddelande och skickar en ny kod till dig.' });
      }
      const kod = giltigKod(k) || await nyKod(env, k);
      const sms = await skickaTillKlient(env, k, 'lank', smsLogga(env, k, kod), base);
      if (!sms.skickat) { k.vilLank = nu(); tillHaris('Glömt lösenordet', `${barnNamn(k)} har glömt lösenordet. Skicka sms:et med koden från klientsidan.`, `/admin/klient/${k.id}`); }
      await sparaKlient(env, k);
      return svar({ ok: true, skickat: sms.skickat, meddelande: sms.skickat ? 'En ny kod är skickad som sms till ditt nummer.' : 'Haris får ett meddelande och skickar ett sms med en ny kod till dig.' });
    }
    if (p === '/auth/me' && req.method === 'GET') {
      const user = await sessionUser(env, req);
      return user ? svar({ ok: true, user }) : fel('inte inloggad', 401);
    }
    if (p === '/auth/ut' && req.method === 'POST') {
      const d = (await json()) || {};
      if (/^[0-9a-f]{64,200}$/i.test(String(d.pushToken || ''))) bakgrund(pushServer(env, '/registrera', { token: String(d.pushToken).toLowerCase(), kid: null }));
      await env.DB.delete(`sess:${bearer(req)}`);
      return svar({ ok: true });
    }

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
      const fam = k?.syskon?.length ? await familj(env, k) : [];
      return svar({ ok: true, nu: nuV, veckor: alla.map(w => publikVecka(stadaHall(w), user.uid)), betalning: publikBetalning({ ...cfg, pris: klientPris(k, cfg) }), paket: k ? paketSaldo(k, veckor) : [], pott: k ? pottSaldo(k, veckor, cfg) : null,
        familj: fam.length > 1 ? fam.map(x => ({ id: x.id, barn: x.barn || 'Barnet' })) : [] });
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
        // 'pott' = dra beloppet ur potten (Carl 2026-11-13). Utan val: paketet först, sedan potten, sist Swish.
        const kl = user.klientId ? await hamtaKlient(env, user.klientId) : null;
        const cfg = await hamtaBetalning(env);
        const allaV = kl ? await hamtaAlla(env, 'vecka:') : [];
        const pk = kl && (d.betalning === 'paket' || !d.betalning) ? ledigtPaket(kl, allaV) : null;
        if (d.betalning === 'paket' && !pk) return fel('du har inga pass kvar i paketet', 409);
        const pott = !pk && !!kl && (d.betalning === 'pott' || !d.betalning) && pottRacker(kl, allaV, cfg);
        if (d.betalning === 'pott' && !pott) return fel('potten räcker inte till ett pass till, prata med Haris', 409);
        // syskon: föräldern kryssar i vilka barn som kommer (en bokning, ett pris)
        const fam = kl?.syskon?.length ? await familj(env, kl) : [];
        const valda = fam.length > 1 ? valdaBarn(fam, d.barnIds, kl.id) : [];
        s.bokad = { uid: user.uid, namn: user.namn || '', barn: valda.length ? barnText(valda.map(x => x.barn)) : ren(d.barn, 40) || user.barn || '', email: user.email || '', telefon: user.telefon || '', t: nu(), av: 'foralder', pris: pk ? null : klientPris(kl, cfg), paket: pk?.id || null, pott };
        if (valda.length) s.bokad.barnIds = valda.map(x => x.id);
        s.hall = null;
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        if (kl) {
          if (pk) logga(kl, 'bokad', `Bokade ${tidText(v, s)} med ett pass ur ${pk.namn} (dras när passet körts)`, kortsPass(v, s) ? -1 : 0, 'foralder');
          else if (pott) logga(kl, 'pott', `Bokade ${tidText(v, s)}, ${krText(s.bokad.pris)} dras ur potten när passet körts`, 0, 'foralder');
          else logga(kl, 'styck', `Bokade ${tidText(v, s)}${s.bokad.pris ? `, ${krText(s.bokad.pris)} med Swish` : ''}`, 0, 'foralder');
          await sparaKlient(env, kl);
        }
        tillHaris('Ny bokning', `${s.bokad.barnIds ? `${s.bokad.barn} ${kl.efternamn || ''}`.trim() : barnNamn(kl, user)} bokade ${tidText(v, s)}${pk ? ' (paket)' : pott ? ' (potten)' : s.bokad.pris ? ` (${krText(s.bokad.pris)} Swish)` : ''}.`);
        return svar({ ok: true, slot: publikVecka(vecka, user.uid).slots.find(x => x.id === s.id) });
      }
      if (p === '/boka/swishad') {
        if (s.bokad?.uid !== user.uid) return fel('det är inte din bokning', 403);
        if (!s.bokad.betald) s.bokad.swishad = d.angra ? null : nu();
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        if (!d.angra && !s.bokad.betald) tillHaris('Swishat', `${barnNamn(null, user)} har swishat ${s.bokad.pris ? krText(s.bokad.pris) + ' ' : ''}för ${tidText(v, s)}. Bekräfta under Tider.`);
        return svar({ ok: true });
      }
      if (p === '/boka/avboka') {
        let sen = null;
        if (s.bokad?.uid === user.uid) {
          const kl = user.klientId ? await hamtaKlient(env, user.klientId) : null;
          // Sen avbokning (Carl 2026-11-24: "man får inte pengarna tillbaka om man avbokar om det är mindre än 24 timmar
          // kvar, men passet kan fortfarande bli öppet"): tiden blir ledig för andra, men passet räknas. Paketet tappar
          // passet, potten dras, Swish betalas inte tillbaka. Den som bokat fel och ångrar sig inom 15 minuter går fri.
          const start = utcAv(datumFor(v, s.dag), s.start).getTime(), bokatT = s.bokad.t ? Date.parse(s.bokad.t) : 0;
          const nuMs = env.TEST_LAGE && d.testNu ? Date.parse(d.testNu) : Date.now(); // låtsad tid bara i tester
          if (kl && start > nuMs && start - nuMs < 864e5 && nuMs - bokatT > 15 * 60e3) {
            const b = s.bokad, bk = await betalare(env, kl);
            const pk = b.paket ? (bk.paket || []).find(x => x.id === b.paket) : null;
            if (pk) { pk.tidigare = (pk.tidigare || 0) + 1; sen = 'Passet räknas från paketet.'; }
            else if (b.pott) { bk.pott = [...(bk.pott || []), { id: nyttId('pt'), belopp: -(b.pris || 0), text: `Sen avbokning ${tidText(v, s)}`, t: nu(), av: 'foralder' }]; sen = `${krText(b.pris || 0)} dras ur potten.`; }
            else if (b.betald || b.swishad) sen = 'Betalningen betalas inte tillbaka.';
            else if (b.pris) { bk.senAvbokat = [...(bk.senAvbokat || []), { v, slot: s.id, text: tidText(v, s), pris: b.pris, t: nu() }].slice(-50); sen = `Passet ska betalas (${krText(b.pris)}).`; }
            else sen = 'Passet räknas.';
            if (bk.id !== kl.id) await sparaKlient(env, bk);
          }
          logga(kl || {}, 'avbokad', sen ? `Avbokade ${tidText(v, s)} mindre än 24 timmar före: ${sen}` : `Avbokade ${tidText(v, s)}${s.bokad.paket ? ', passet drogs inte' : s.bokad.pott ? `, ${krText(s.bokad.pris || 0)} tillbaka i potten` : ''}`, sen && s.bokad.paket ? -1 : 0, 'foralder');
          if (kl) await sparaKlient(env, kl);
          tillHaris(sen ? 'Sen avbokning' : 'Avbokning', `${barnNamn(kl, user)} avbokade ${tidText(v, s)}${sen ? `, mindre än 24 timmar före. ${sen}` : ''} Tiden är ledig igen.`);
          s.bokad = null;
        }
        if (s.hall?.uid === user.uid) s.hall = null;
        await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
        return svar({ ok: true, sen });
      }
    }
    if (p === '/mina' && req.method === 'GET') {
      const user = await sessionUser(env, req);
      if (!user) return fel('inte inloggad', 401);
      const veckor = await hamtaAlla(env, 'vecka:');
      const bokningar = bokningarFor(veckor, user.uid);
      for (const b of bokningar) b.kal = `/kal/${b.v}/${b.id}/${user.uid}/${await kalSig(env, b.v, b.id, user.uid)}.ics`;
      const kRad = user.klientId ? await hamtaKlient(env, user.klientId) : null;
      // syskon: varje barns nivå, bedömningar och filmer för sig, passen och notiserna för hela familjen
      const fam = kRad?.syskon?.length ? await familj(env, kRad) : [];
      const famIds = fam.length ? fam.map(x => x.id) : [user.uid];
      const planer = (await hamtaAlla(env, 'plan:')).filter(x => famIds.includes(x.uid) && x.delad).sort((a, b) => b.datum.localeCompare(a.datum));
      const klient = kRad ? publikKlient(kRad) : null;
      if (klient && fam.length > 1) klient.notiser = fam.flatMap(x => x.notiser || []).sort((a, b) => a.t.localeCompare(b.t)).slice(-60);
      const bedomningar = user.klientId ? ((await env.DB.get(`bed:${user.klientId}`, 'json')) || []) : [];
      const media = user.klientId ? ((await env.DB.get(`med:${user.klientId}`, 'json')) || []).filter(m => m.delad) : [];
      const familjData = fam.length > 1 ? await Promise.all(fam.map(async x => {
        const { id, barn, efternamn, fodd, position, niva, nivaHistorik } = x;
        return { klient: { id, barn, efternamn, fodd, position, niva, nivaHistorik }, bedomningar: x.id === user.klientId ? bedomningar : ((await env.DB.get(`bed:${x.id}`, 'json')) || []), media: x.id === user.klientId ? media : ((await env.DB.get(`med:${x.id}`, 'json')) || []).filter(m => m.delad) };
      })) : [];
      const cfg = await hamtaBetalning(env);
      const kalFeed = kRad ? `/kal/familj/${kRad.id}/${await kalSig(env, 'familj', 'alla', kRad.id)}.ics` : null;
      const betK = kRad ? await betalare(env, kRad) : null;
      const foraldrar = betK ? [{ id: 'huvud', namn: betK.foralder || '', telefon: betK.telefon, huvud: true, du: !user.foralderId }, ...(betK.foraldrar || []).map(f => ({ ...publikForalder(f), kod: undefined, du: f.id === user.foralderId }))] : [];
      return svar({ ok: true, foraldrar, block: blockFor(betK), kopta: (betK?.kop || []).filter(x => !x.aterkallad).map(x => x.id), bokningar, planer, klient, bedomningar, media, familj: familjData, kalFeed, betalning: publikBetalning({ ...cfg, pris: klientPris(klient, cfg) }), paket: klient ? paketSaldo(klient, veckor) : [], pott: klient ? pottSaldo(klient, veckor, cfg) : null });
    }

    // Föräldern kommenterar ett moment i ett delat pass (Carl 2026-11-24: "dela passet med föräldrarna och lägga
    // kommentarer"). blockId '' = om passet i stort. Haris får en notis.
    const msv = /^\/mina\/plan\/([a-z0-9]+)\/svar$/.exec(p);
    if (msv && req.method === 'POST') {
      const user = await sessionUser(env, req);
      if (!user) return fel('inte inloggad', 401);
      const d = await json(); if (!d) return fel('trasig JSON');
      const plan = await env.DB.get(`plan:${msv[1]}`, 'json');
      const kRad = user.klientId ? await hamtaKlient(env, user.klientId) : null;
      const fam = kRad ? (kRad.syskon?.length || kRad.huvud ? (await familj(env, kRad)).map(x => x.id) : [kRad.id]) : [user.uid];
      if (!plan || !plan.delad || !fam.includes(plan.uid)) return fel('passet finns inte', 404);
      const sv = renSvar(d, 'foralder', kRad?.foralder || user.namn || 'Förälder');
      if (!sv.text) return fel('skriv något först');
      if (sv.blockId && !plan.block.some(b => b.id === sv.blockId)) return fel('momentet finns inte');
      plan.svar = [...(plan.svar || []), sv].slice(-200);
      await env.DB.put(`plan:${plan.id}`, JSON.stringify(plan));
      const moment = plan.block.find(b => b.id === sv.blockId)?.titel;
      tillHaris(`${sv.namn} svarade på passet`, `${moment ? `${moment}: ` : ''}${sv.text.slice(0, 140)}`, `/admin/pass/${plan.id}`);
      return svar({ ok: true, svar: plan.svar });
    }

    // Köp i appen: appen skickar Apples signerade transaktion efter ett köp och vid Återställ köp
    if (p === '/mina/kop' && req.method === 'POST') {
      const user = await sessionUser(env, req);
      if (!user?.klientId) return fel('inte inloggad', 401);
      const d = await json(); if (!d?.jws) return fel('ingen transaktion');
      let t;
      try { t = await kollaTransaktion(d.jws, env.TEST_LAGE && env.TEST_ROT ? { rot: env.TEST_ROT } : {}); }
      catch (e) {
        await env.DB.put(`kopfel:${Date.now()}`, JSON.stringify({ t: nu(), uid: user.uid, fel: String(e?.message || e) }), { expirationTtl: 60 * 60 * 24 * 60 });
        return fel(`Köpet kunde inte kontrolleras (${e?.message || e})`);
      }
      if (t.bundleId !== APP_BUNDLE) return fel('köpet hör till en annan app');
      const b = BLOCK.find(x => blockSku(x.id) === t.productId);
      if (!b) return fel('okänd produkt');
      const k = await betalare(env, await hamtaKlient(env, user.klientId));
      if (!k) return fel('kontot finns inte', 404);
      const otx = String(t.originalTransactionId || t.transactionId || '');
      if (!otx) return fel('köpet saknar nummer');
      const agare = await env.DB.get(`kop:${otx}`);
      // ett raderat konto släpper köpet: nästa konto på samma Apple-konto får det vid Återställ köp
      if (agare && agare !== k.id && await hamtaKlient(env, agare)) return fel('Köpet är redan kopplat till ett annat CAP-konto. Logga in med det kontot.', 409);
      k.kop = k.kop || [];
      let rad = k.kop.find(x => x.tx === otx);
      const ny = !rad && !t.revocationDate;
      if (t.revocationDate) { if (rad) rad.aterkallad = new Date(t.revocationDate).toISOString(); }
      else if (!rad) { rad = { id: b.id, tx: otx, t: nu(), pris: b.pris, miljo: t.environment === 'Production' ? 'skarp' : 'test' }; k.kop.push(rad); }
      else delete rad.aterkallad;
      if (agare !== k.id) await env.DB.put(`kop:${otx}`, k.id);
      if (ny) tillHaris(`${barnNamn(k)} köpte ${b.namn}`, b.id === 'plus' ? 'Ingår: ett personligt hemmaprogram. Gör det under Pass och dela det med familjen.' : `${b.pris} kr i App Store.`, `/admin/klient/${k.id}`);
      await sparaKlient(env, k);
      return svar({ ok: true, ny, block: blockFor(k), kopta: k.kop.filter(x => !x.aterkallad).map(x => x.id) });
    }

    // Förälderns inställningar (Carl 2026-11-22: "en inställningssida"): paminnelse = notisen kvällen före passet
    if (p === '/mina/installningar' && req.method === 'PUT') {
      const user = await sessionUser(env, req);
      if (!user?.klientId) return fel('inte inloggad', 401);
      const d = await json(); if (!d) return fel('trasig JSON');
      const k = await hamtaKlient(env, user.klientId);
      if (!k) return fel('kontot finns inte', 404);
      const restid = Math.round(+d.restid);
      k.installningar = { ...(k.installningar || {}), ...(typeof d.paminnelse === 'boolean' ? { paminnelse: d.paminnelse } : {}),
        ...(restid >= 5 && restid <= 180 ? { restid } : {}), ...(typeof d.kalender === 'boolean' ? { kalender: d.kalender } : {}) };
      await sparaKlient(env, k);
      return svar({ ok: true, installningar: k.installningar });
    }
    // Telefonens pushkod kopplas till kontot (Carl 2026-11-13: "vi har olika login på telefonerna"). av: true kopplar loss.
    if (p === '/mina/push' && req.method === 'POST') {
      const user = await sessionUser(env, req);
      if (!user) return fel('inte inloggad', 401);
      const d = await json(); if (!d) return fel('trasig JSON');
      const token = String(d.token || '').toLowerCase();
      if (!/^[0-9a-f]{64,200}$/.test(token)) return fel('ogiltig pushkod');
      const r = d.av ? await pushServer(env, '/avregistrera', { token }) : await pushServer(env, '/registrera', { token, namn: user.barn || '', kid: user.klientId || null });
      return svar({ ok: r.ok, fel: r.fel || undefined });
    }

    // Radera mitt konto (krav för App Store, riktlinje 5.1.1(v)): klienten, bedömningar, filmer, pass och kommande tider.
    // Haris får en notis, med det som fanns kvar i potten och paketen, så att han kan reda ut pengarna.
    if (p === '/mina/radera' && req.method === 'POST') {
      const se = await env.DB.get(`sess:${bearer(req)}`, 'json');
      if (!se) return fel('inte inloggad', 401);
      const d = (await json()) || {};
      const k = await hamtaKlient(env, se.uid);
      const veckor = await hamtaAlla(env, 'vecka:');
      const syskon = k?.syskon || [];
      const planer = (await hamtaAlla(env, 'plan:')).filter(x => x.uid === se.uid || syskon.includes(x.uid));
      if (k) {
        // syskonen följer med: de har ingen egen inloggning
        for (const sid of syskon) {
          const sm = (await env.DB.get(`med:${sid}`, 'json')) || [];
          if (env.MEDIA) for (const m of sm) if (m.key) await env.MEDIA.delete(m.key).catch(() => {});
          await Promise.all([env.DB.delete(`klient:${sid}`), env.DB.delete(`bed:${sid}`), env.DB.delete(`med:${sid}`)]);
        }
        const cfg = await hamtaBetalning(env);
        const pott = pottSaldo(k, veckor, cfg), kvar = paketSaldo(k, veckor).reduce((n, x) => n + x.kvar, 0);
        const media = (await env.DB.get(`med:${k.id}`, 'json')) || [];
        if (env.MEDIA) for (const m of media) if (m.key) await env.MEDIA.delete(m.key).catch(() => {});
        await rensaForaldrar(env, k);
        await Promise.all([env.DB.delete(`klient:${k.id}`), k.telefon ? env.DB.delete(`tel:${k.telefon}`) : null, env.DB.delete(`bed:${k.id}`), env.DB.delete(`med:${k.id}`), k.kod?.kod ? env.DB.delete(`kod:${k.kod.kod}`) : null]);
        const ids = (await klientIndex(env)).filter(x => x !== k.id && !syskon.includes(x)); await env.DB.put('klienter', JSON.stringify(ids));
        const rest = [pott && pott.saldo ? `${krText(pott.saldo)} kvar i potten` : '', kvar ? `${kvar} pass kvar i paket` : ''].filter(Boolean).join(' och ');
        const raderade = (await env.DB.get('raderade', 'json')) || [];
        raderade.push({ t: nu(), namn: [k.barn, (k.efternamn || '').slice(0, 1)].filter(Boolean).join(' ') + (k.efternamn ? '.' : ''), rest });
        await env.DB.put('raderade', JSON.stringify(raderade.slice(-50)));
        tillHaris('Konto raderat', `${barnNamn(k)} raderade sitt konto i appen.${rest ? ` Det fanns ${rest}.` : ''}`, '/admin/klienter');
      } else {
        const u = await env.DB.get(`user:${se.uid}`, 'json');
        if (u) await Promise.all([env.DB.delete(`user:${se.uid}`), u.email ? env.DB.delete(`email:${u.email}`) : null]);
      }
      await Promise.all(planer.map(x => env.DB.delete(`plan:${x.id}`)));
      const nuV = veckaAv();
      for (const w of veckor.filter(x => x.v >= nuV)) {
        let andrad = false;
        for (const s of w.slots) if (s.bokad?.uid === se.uid && datumFor(w.v, s.dag) >= idag()) { s.bokad = null; andrad = true; }
        if (andrad) await env.DB.put(`vecka:${w.v}`, JSON.stringify(w));
      }
      if (/^[0-9a-f]{64,200}$/i.test(String(d.pushToken || ''))) bakgrund(pushServer(env, '/registrera', { token: String(d.pushToken).toLowerCase(), kid: null }));
      await env.DB.delete(`sess:${bearer(req)}`);
      return svar({ ok: true });
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
        tillHaris('Paket köpt', `${barnNamn(k)} köpte ${pk.namn} för ${krText(pk.pris)}.`, `/admin/klient/${k.id}`);
        return svar({ ok: true, id: pk.id, flyttade, paket: paketSaldo(k, veckor), bokningar: bokningarFor(veckor, k.id) });
      }
      const pk = (k.paket || []).find(x => x.id === String(d.id || ''));
      if (!pk) return fel('paketet finns inte', 404);
      if (p === '/mina/paket/swishad') { if (!pk.betald) pk.swishad = d.angra ? null : nu(); if (!d.angra && !pk.betald) tillHaris('Swishat', `${barnNamn(k)} har swishat ${krText(pk.pris)} för ${pk.namn}. Bekräfta på klientsidan.`, `/admin/klient/${k.id}`); }
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

    // Föräldern lägger till ett syskon själv (Haris 2026-11-24: "En förälder kunde inte koppla ett syskon"). Samma som
    // Lägg till syskon hos Haris: barnet får egen nivå, egna bedömningar och filmer, och delar förälderns inloggning,
    // bokningar, paket och pott. Haris får en notis.
    if (p === '/mina/syskon' && req.method === 'POST') {
      const user = await sessionUser(env, req);
      if (!user?.klientId) return fel('inte inloggad', 401);
      const d = await json(); if (!d) return fel('trasig JSON');
      const k = await hamtaKlient(env, user.klientId);
      if (!k) return fel('kontot finns inte', 404);
      const h = await betalare(env, k);
      const barn = ren(d.barn, 40); if (!barn) return fel('skriv barnets förnamn');
      if ((h.syskon || []).length >= 6) return fel('högst sju barn på ett konto');
      const fam = await familj(env, h);
      if (fam.some(x => (x.barn || '').toLowerCase() === barn.toLowerCase())) return fel(`${barn} finns redan på kontot`, 409);
      const sk = renKlient({ barn, efternamn: ren(d.efternamn, 40) || h.efternamn, fodd: /^\d{4}$/.test(String(d.fodd || '')) ? +d.fodd : null, position: POSITIONER.includes(d.position) ? d.position : 'okand', telefon: h.telefon, foralder: h.foralder, email: h.email, status: h.status }, { id: nyttId('k') });
      sk.huvud = h.id;
      h.syskon = [...(h.syskon || []), sk.id];
      await Promise.all([sparaKlient(env, sk), sparaKlient(env, h)]);
      const ids = await klientIndex(env); if (!ids.includes(sk.id)) { ids.push(sk.id); await env.DB.put('klienter', JSON.stringify(ids)); }
      tillHaris('Nytt syskon', `${barnNamn(h)} lade till syskonet ${barn} på kontot.`, `/admin/klient/${sk.id}`);
      return svar({ ok: true, klient: { id: sk.id, barn: sk.barn, efternamn: sk.efternamn, fodd: sk.fodd } });
    }
    // Föräldern bjuder in en annan förälder till kontot: namn och mobilnummer. Med sms påslaget skickas koden direkt,
    // annars får föräldern texten att skicka själv (appen öppnar Meddelanden med texten ifylld).
    const mfo = /^\/mina\/foralder(?:\/([a-z0-9]+))?$/.exec(p);
    if (mfo) {
      const user = await sessionUser(env, req);
      if (!user?.klientId) return fel('inte inloggad', 401);
      const k = await hamtaKlient(env, user.klientId);
      if (!k) return fel('kontot finns inte', 404);
      const h = await betalare(env, k);
      if (req.method === 'DELETE' && mfo[1]) {
        const f = (h.foraldrar || []).find(x => x.id === mfo[1]);
        if (!f) return fel('föräldern finns inte på kontot', 404);
        if (f.id === user.foralderId) return fel('du kan inte ta bort dig själv här. Hör av dig till Haris.');
        await rensaForaldrar(env, { foraldrar: [f] });
        h.foraldrar = h.foraldrar.filter(x => x.id !== f.id);
        await sparaKlient(env, h);
        return svar({ ok: true, foraldrar: h.foraldrar.map(publikForalder) });
      }
      if (req.method !== 'POST') return fel('fel metod', 405);
      const d = await json(); if (!d) return fel('trasig JSON');
      if (!ren(d.namn, 60)) return fel('skriv förälderns namn');
      const r = await laggTillForalder(env, h, d, 'foralder');
      if (r.fel) return fel(r.fel, 409);
      const text = smsLogga(env, h, r.kod, r.f);
      const sms = smsPa(env) ? await skickaTillKlient(env, h, 'lank', text, base, r.f.telefon) : { skickat: false };
      await sparaKlient(env, h);
      tillHaris('Ny förälder på kontot', `${user.namn || 'En förälder'} bjöd in ${r.f.namn} till ${barnNamn(h)}s konto.`, `/admin/klient/${h.id}`);
      return svar({ ok: true, foralder: publikForalder(r.f), foraldrar: h.foraldrar.map(publikForalder), text, telefon: r.f.telefon, skickat: !!sms.skickat });
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
        const [klienter, veckor, planer, cfgB, raderade] = await Promise.all([hamtaKlienter(env), hamtaAlla(env, 'vecka:'), hamtaAlla(env, 'plan:'), hamtaBetalning(env), env.DB.get('raderade', 'json')]);
        const nuV = veckaAv();
        const beds = await Promise.all(klienter.map(k => env.DB.get(`bed:${k.id}`, 'json')));
        const ut = klienter.map((k, i) => {
          const b = bokningarFor(veckor.filter(w => w.v >= nuV), k.id).filter(x => x.datum >= idag());
          const bed = (beds[i] || []).slice().sort((x, y) => (y.datum + y.t).localeCompare(x.datum + x.t));
          const saldo = paketSaldo(k, veckor);
          const pt = pottSaldo(k, veckor, cfgB);
          return { ...publikKlient(k), notiser: undefined, pott: undefined, syskonTill: k.huvud ? (klienter.find(x => x.id === k.huvud)?.barn || 'syskon') : null, syskonNamn: (k.syskon || []).map(id => klienter.find(x => x.id === id)?.barn).filter(Boolean), pottSaldo: pt ? pt.saldo : null, pottPass: pt ? pt.passKvar : null, paketKvar: saldo.reduce((n, x) => n + x.kvar, 0), paketObetalda: saldo.filter(x => !x.betald).length, nastaTid: b[0] || null, antalPass: planer.filter(x => x.uid === k.id).length, antalBed: bed.length, senasteBed: bed[0] ? { namn: bed[0].namn, medel: bed[0].medel, datum: bed[0].datum } : null, lank: k.kod?.kod && !k.kod.forbrukad ? lank(env, k.kod.kod) : null };
        }).sort((a, b) => (a.barn || a.foralder || '').localeCompare(b.barn || b.foralder || '', 'sv'));
        return svar({ ok: true, klienter: ut, raderade: (raderade || []).filter(x => Date.now() - Date.parse(x.t) < 90 * 864e5).reverse(), sms: smsPa(env), r2: !!env.MEDIA, ...(await smsDag(env)) });
      }
      if (p === '/admin/klient' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const tel = telefonNorm(d.telefon);
        if (!tel) return fel('mobilnumret ser fel ut, skriv t.ex. 070-123 45 67');
        const finns = await env.DB.get(`tel:${tel}`);
        if (finns) { const fk = await hamtaKlient(env, finns); return svar({ ok: false, fel: `det numret finns redan i registret${fk?.barn ? ` (${fk.barn})` : ''}. Är det ett syskon? Öppna ${fk?.barn || 'den klienten'} och tryck Lägg till syskon.`, finns }, 409); }
        const k = renKlient(d, { id: nyttId('k') });
        const kod = await nyKod(env, k);
        const l = lank(env, kod);
        let sms = { ok: false, skickat: false, av: !smsPa(env) };
        if (d.skicka) sms = await skickaTillKlient(env, k, 'lank', smsLogga(env, k, kod), base);
        await sparaKlient(env, k);
        await env.DB.put(`tel:${tel}`, k.id);
        const ids = await klientIndex(env); if (!ids.includes(k.id)) { ids.push(k.id); await env.DB.put('klienter', JSON.stringify(ids)); }
        return svar({ ok: true, klient: publikKlient(k), lank: l, kod, sms, hamtaText: smsHamta(env, k), loggaText: smsLogga(env, k, kod), hamtaLank: hamtaLank(env), ...(await smsDag(env)) });
      }
      const mk = /^\/admin\/klient\/([a-z0-9]+)(?:\/(lank|niva|bedomning|media|boka|avboka|paket|tidpaket|pris|utanfor|pott|syskon|foralder)(?:\/([a-z0-9]+))?)?$/.exec(p);
      if (mk) {
        const barnK = await hamtaKlient(env, mk[1]);
        if (!barnK) return fel('klienten finns inte', 404);
        const del = mk[2], sub = mk[3];
        // pris, paket, pott och hur en tid betalas gäller hela familjen och ligger på huvudklienten
        const k = ['paket', 'tidpaket', 'pris', 'utanfor', 'pott', 'foralder'].includes(del) ? await betalare(env, barnK) : barnK;
        if (!del && req.method === 'GET') {
          const [veckor, planer, bedomningar, media] = await Promise.all([hamtaAlla(env, 'vecka:'), hamtaAlla(env, 'plan:'), env.DB.get(`bed:${k.id}`, 'json'), env.DB.get(`med:${k.id}`, 'json')]);
          const kod = giltigKod(k);
          const cfgK = await hamtaBetalning(env);
          const fam = k.huvud || k.syskon?.length ? await familj(env, k) : [];
          const bk = fam[0] || k;
          return svar({ ok: true, klient: publikKlient(k), pott: pottSaldo(bk, veckor, cfgK), bokningar: bokningarFor(veckor, k.id), planer: planer.filter(x => x.uid === k.id).sort((a, b) => (b.datum + b.uppdaterad).localeCompare(a.datum + a.uppdaterad)),
            familj: fam.map(x => ({ id: x.id, barn: x.barn, efternamn: x.efternamn, fodd: x.fodd, huvud: !x.huvud })), huvudPris: bk.pris ?? null,
            // syskon (Haris 2026-11-24: "det finns inte likadana funktioner på profilerna"): inloggningen och köpen är
            // familjens och ligger på huvudklienten; syskonets sida visar och ändrar dem där
            ...(k.huvud && bk.id !== k.id ? { huvud: { klient: publikKlient(bk), kod: giltigKod(bk), lank: giltigKod(bk) ? lank(env, giltigKod(bk)) : null, hamtaText: smsHamta(env, bk), loggaText: giltigKod(bk) ? smsLogga(env, bk, giltigKod(bk)) : '' } } : {}),
            bedomningar: bedomningar || [], media: media || [], paket: paketSaldo(bk, veckor), paketMallar: cfgK.paket, standardPris: cfgK.pris, lank: kod ? lank(env, kod) : null, kod, hamtaText: smsHamta(env, k), loggaText: kod ? smsLogga(env, k, kod) : '', hamtaLank: hamtaLank(env),
            sms: smsPa(env), r2: !!env.MEDIA, ...(await smsDag(env)) });
        }
        if (!del && req.method === 'PUT') {
          const d = await json(); if (!d) return fel('trasig JSON');
          // ett syskon har förälderns nummer, det ändras på huvudklienten
          const tel = k.huvud ? k.telefon : telefonNorm(d.telefon);
          if (!tel) return fel('mobilnumret ser fel ut');
          if (tel !== k.telefon) { const annan = await env.DB.get(`tel:${tel}`); if (annan && annan !== k.id) return fel('det numret finns redan på en annan klient', 409); }
          const ny = renKlient(k.huvud ? { ...d, telefon: k.telefon } : d, k);
          if (tel !== k.telefon) {
            await env.DB.delete(`tel:${k.telefon}`); await env.DB.put(`tel:${tel}`, k.id); ny.telefon = tel;
            for (const sid of k.syskon || []) { const sk = await hamtaKlient(env, sid); if (sk) { sk.telefon = tel; await sparaKlient(env, sk); } }
          }
          await sparaKlient(env, ny);
          return svar({ ok: true, klient: publikKlient(ny) });
        }
        if (!del && req.method === 'DELETE') {
          if (k.syskon?.length) return fel('ta bort syskonen först: den här klienten har inloggningen för hela familjen', 409);
          if (!k.huvud) await rensaForaldrar(env, k);
          await Promise.all([env.DB.delete(`klient:${k.id}`), k.huvud ? null : env.DB.delete(`tel:${k.telefon}`), env.DB.delete(`bed:${k.id}`), env.DB.delete(`med:${k.id}`), k.kod?.kod ? env.DB.delete(`kod:${k.kod.kod}`) : null]);
          const ids = (await klientIndex(env)).filter(x => x !== k.id); await env.DB.put('klienter', JSON.stringify(ids));
          if (k.huvud) { const h = await hamtaKlient(env, k.huvud); if (h) { h.syskon = (h.syskon || []).filter(x => x !== k.id); await sparaKlient(env, h); } }
          // släpp klientens kommande tider (ett syskon tas bara bort ur familjens bokning)
          const nuV = veckaAv();
          for (const w of (await hamtaAlla(env, 'vecka:')).filter(x => x.v >= nuV)) {
            let andrad = false;
            for (const s of w.slots) {
              if (s.bokad?.uid === k.id) { s.bokad = null; andrad = true; }
              else if (s.bokad?.barnIds?.includes(k.id)) {
                s.bokad.barnIds = s.bokad.barnIds.filter(x => x !== k.id);
                if (!s.bokad.barnIds.length) s.bokad = null;
                andrad = true;
              }
            }
            if (andrad) await env.DB.put(`vecka:${w.v}`, JSON.stringify(w));
          }
          return svar({ ok: true });
        }
        // Lägg till ett syskon (tvillingar): samma förälder och mobilnummer, egen nivå och egna bedömningar
        if (del === 'syskon' && req.method === 'POST') {
          const d = await json(); if (!d) return fel('trasig JSON');
          const h = await betalare(env, k);
          if (!ren(d.barn, 40)) return fel('skriv barnets förnamn');
          const sk = renKlient({ ...d, telefon: h.telefon, foralder: h.foralder, email: h.email, efternamn: ren(d.efternamn, 40) || h.efternamn, status: h.status }, { id: nyttId('k') });
          sk.huvud = h.id;
          h.syskon = [...(h.syskon || []), sk.id];
          await Promise.all([sparaKlient(env, sk), sparaKlient(env, h)]);
          const ids = await klientIndex(env); if (!ids.includes(sk.id)) { ids.push(sk.id); await env.DB.put('klienter', JSON.stringify(ids)); }
          return svar({ ok: true, klient: publikKlient(sk) });
        }
        const d = (await json()) || {};
        // typ: hamta (sms 1), logga (sms 2) eller bada. ny: true ger en ny inloggningslänk (den gamla slutar gälla).
        // fler föräldrar: lägg till (namn, mobil) → kod och sms-text, ny kod (POST …/foralder/<id>), ta bort
        if (del === 'foralder') {
          if (req.method === 'DELETE' && sub) {
            const f = (k.foraldrar || []).find(x => x.id === sub); if (!f) return fel('föräldern finns inte', 404);
            await rensaForaldrar(env, { foraldrar: [f] });
            k.foraldrar = k.foraldrar.filter(x => x.id !== sub);
            await sparaKlient(env, k); return svar({ ok: true, klient: publikKlient(k) });
          }
          if (req.method === 'POST' && sub) {
            const f = (k.foraldrar || []).find(x => x.id === sub); if (!f) return fel('föräldern finns inte', 404);
            const kod = await nyKodF(env, k, f); f.vilLank = null;
            const text = smsLogga(env, k, kod, f);
            const sms = d.skicka && smsPa(env) ? await skickaTillKlient(env, k, 'lank', text, base, f.telefon) : { skickat: false };
            await sparaKlient(env, k); return svar({ ok: true, klient: publikKlient(k), kod, text, telefon: f.telefon, skickat: !!sms.skickat });
          }
          if (req.method === 'POST') {
            if (!ren(d.namn, 60)) return fel('skriv förälderns namn');
            const r = await laggTillForalder(env, k, d, 'haris');
            if (r.fel) return fel(r.fel, 409);
            const text = smsLogga(env, k, r.kod, r.f);
            const sms = d.skicka && smsPa(env) ? await skickaTillKlient(env, k, 'lank', text, base, r.f.telefon) : { skickat: false };
            await sparaKlient(env, k); return svar({ ok: true, klient: publikKlient(k), kod: r.kod, text, telefon: r.f.telefon, skickat: !!sms.skickat });
          }
        }
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
            if (!sub) { tillKlient(k, 'utveckling', 'Ny bedömning', `Haris har lagt in ${b.namn} för ${k.barn || 'ert barn'}: ${String(b.bast).replace('.', ',')} s${tidigare ? ` (förra gången ${String(tidigare.bast).replace('.', ',')} s)` : ''}.`, '/utveckling'); await sparaKlient(env, k); }
            return svar({ ok: true, bedomning: b, bedomningar: alla, tidigare });
          }
        }
        if (del === 'media') {
          const alla = (await env.DB.get(`med:${k.id}`, 'json')) || [];
          if (req.method === 'PATCH' && sub) {
            const m = alla.find(x => x.id === sub); if (!m) return fel('filmen finns inte', 404);
            if ('marknad' in d) m.marknad = !!d.marknad;
            if ('delad' in d) m.delad = !!d.delad;
            if ('titel' in d) m.titel = ren(d.titel, 120);
            await env.DB.put(`med:${k.id}`, JSON.stringify(alla)); return svar({ ok: true, media: m });
          }
          if (req.method === 'DELETE' && sub) {
            const m = alla.find(x => x.id === sub);
            if (m?.key && env.MEDIA) { await env.MEDIA.delete(m.key).catch(() => {}); await env.DB.delete('r2:anvant'); }
            const kvar = alla.filter(x => x.id !== sub); await env.DB.put(`med:${k.id}`, JSON.stringify(kvar)); return svar({ ok: true, media: kvar });
          }
          if (req.method === 'POST') {
            const m = renMedia(d, k.id);
            const i = alla.findIndex(x => x.id === m.id); const ny = i < 0; if (i >= 0) alla[i] = { ...alla[i], ...m }; else alla.push(m);
            await env.DB.put(`med:${k.id}`, JSON.stringify(alla.slice(-500)));
            if (ny && m.delad && !m.planId && (m.url || m.key)) { tillKlient(k, 'utveckling', m.typ === 'audio' ? 'Nytt ljud från Haris' : 'Ny film från Haris', `Haris har lagt upp ${m.typ === 'audio' ? 'ett ljud' : 'en film'} från passet med ${k.barn || 'ert barn'}.`, '/utveckling'); await sparaKlient(env, k); }
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
            const kvarNu = paketSaldo(k, veckor).reduce((x, y) => x + y.kvar, 0);
            tillKlient(k, 'pass', 'Nya pass', `Haris har lagt in ${pk.namn} åt ${k.barn || 'er'}${pk.pris && !pk.betald ? ` (${krText(pk.pris)}, betala med Swish i appen)` : ''}. Ni har ${kvarNu} pass kvar.`, '/mina-pass');
          } else {
            const pk = (k.paket || []).find(x => x.id === sub);
            if (!pk) return fel('paketet finns inte', 404);
            if (req.method === 'PUT') { pk.betald = d.betald ? nu() : null; logga(k, 'betald', pk.betald ? `Haris bekräftade betalningen av ${pk.namn}` : `Haris ångrade betalningen av ${pk.namn}`, 0, 'haris'); if (pk.betald) tillKlient(k, 'betald', 'Betalningen är klar', `Haris har tagit emot betalningen för ${pk.namn}. Tack!`, '/mina-pass'); }
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
          // satt: 'paket' | 'pott' | 'styck' (äldre appar skickar paket: true/false)
          const satt = ['paket', 'pott', 'styck'].includes(d.satt) ? d.satt : (d.paket ? 'paket' : 'styck');
          const cfgT = await hamtaBetalning(env);
          const fran = s.bokad.paket ? 'paket' : s.bokad.pott ? 'pott' : 'styck';
          if (satt !== 'styck' && s.bokad.betald) return fel('tiden är redan betald');
          if (satt === 'paket') {
            const pk = ledigtPaket(k, veckor);
            if (!pk) return fel('inget paket med pass kvar', 409);
            s.bokad.paket = pk.id; s.bokad.pott = false; s.bokad.pris = null; s.bokad.swishad = null;
            logga(k, 'flytt', `Haris drog ${tidText(w.v, s)} från ${pk.namn}`, kortsPass(w.v, s) ? -1 : 0, 'haris');
          } else if (satt === 'pott') {
            const pris = klientPris(k, cfgT);
            if (fran !== 'pott' && (!pris || !pottRacker(k, veckor, cfgT))) return fel('potten räcker inte till passet', 409);
            s.bokad.paket = null; s.bokad.pott = true; s.bokad.pris = fran === 'pott' ? s.bokad.pris : pris; s.bokad.swishad = null;
            logga(k, 'pott', `Haris lät ${tidText(w.v, s)} betalas ur potten (${krText(pris)})`, fran === 'paket' ? 1 : 0, 'haris');
          } else {
            s.bokad.paket = null; s.bokad.pott = false; s.bokad.pris = klientPris(k, cfgT);
            logga(k, 'flytt', `${tidText(w.v, s)} betalas styckvis i stället${fran === 'paket' ? ', passet tillbaka' : fran === 'pott' ? ', beloppet tillbaka i potten' : ''}`, fran === 'paket' && kortsPass(w.v, s) ? 1 : 0, 'haris');
          }
          await env.DB.put(`vecka:${w.v}`, JSON.stringify(w));
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k), paket: paketSaldo(k, veckor), pott: pottSaldo(k, veckor, cfgT), bokningar: bokningarFor(veckor, k.id) });
        }
        // Potten: Haris sätter in pengar (typ in) eller drar av (typ ut, t.ex. ett pass utanför bokningen eller en
        // återbetalning). DELETE …/pott/<id> tar bort en felskriven rad.
        if (del === 'pott' && (req.method === 'POST' || req.method === 'DELETE')) {
          const veckor = await hamtaAlla(env, 'vecka:');
          const cfgP = await hamtaBetalning(env);
          let flyttade = 0;
          if (req.method === 'DELETE') {
            const r = (k.pott || []).find(x => x.id === sub);
            if (!r) return fel('raden finns inte', 404);
            k.pott = k.pott.filter(x => x !== r);
            logga(k, 'pott', `Haris tog bort raden "${r.text}" (${r.belopp > 0 ? '+' : '−'}${krText(Math.abs(r.belopp))}) ur potten`, 0, 'haris');
          } else {
            const belopp = Math.round(+String(d.belopp ?? '').replace(/\s/g, '').replace(',', '.') || 0);
            if (!(belopp > 0 && belopp <= 1000000)) return fel('skriv ett belopp i kronor');
            const ut = d.typ === 'ut';
            const text = ren(d.text, 80) || (ut ? 'Uttag' : 'Insättning');
            k.pott = [...(k.pott || []), { id: nyttId('r'), t: nu(), belopp: ut ? -belopp : belopp, text, av: 'haris' }];
            logga(k, 'pott', `Haris ${ut ? 'drog' : 'satte in'} ${krText(belopp)} ${ut ? 'från' : 'i'} potten${text && text !== 'Insättning' && text !== 'Uttag' ? ` (${text})` : ''}`, 0, 'haris');
            if (!ut) {
              flyttade = await flyttaTillPott(env, k, veckor, cfgP);
              if (flyttade) logga(k, 'flytt', `${flyttade === 1 ? 'En bokad tid betalas' : `${flyttade} bokade tider betalas`} nu ur potten`, 0);
            }
            const pt = pottSaldo(k, veckor, cfgP);
            tillKlient(k, 'pass', ut ? 'Potten' : 'Pengar i potten', `Haris har ${ut ? `dragit ${krText(belopp)} från` : `satt in ${krText(belopp)} i`} potten${text && !['Insättning', 'Uttag'].includes(text) ? ` (${text})` : ''}. ${pottText(pt)}.`, '/mina-pass');
          }
          k.uppdaterad = nu();
          await sparaKlient(env, k);
          return svar({ ok: true, flyttade, klient: publikKlient(k), pott: pottSaldo(k, veckor, cfgP), paket: paketSaldo(k, veckor), bokningar: bokningarFor(veckor, k.id) });
        }
        // eget pris per pass för barnet (tomt = standardpriset)
        if (del === 'pris' && req.method === 'PUT') {
          const pris = Math.round(+String(d.pris ?? '').replace(',', '.') || 0);
          if (pris < 0 || pris > 100000) return fel('priset ser fel ut');
          k.pris = pris || null; k.uppdaterad = nu();
          logga(k, 'pris', k.pris ? `Haris satte ett eget pris: ${krText(k.pris)} per pass` : 'Haris tog bort det egna priset, standardpriset gäller', 0, 'haris');
          const veckorP = await hamtaAlla(env, 'vecka:'), cfgPr = await hamtaBetalning(env);
          const pt = pottSaldo(k, veckorP, cfgPr), nyttPris = klientPris(k, cfgPr);
          if (nyttPris) tillKlient(k, 'pass', 'Nytt pris', `Priset per pass för ${k.barn || 'er'} är nu ${krText(nyttPris)}.${pt ? ` ${pottText(pt)}.` : ''}`, '/mina-pass');
          await sparaKlient(env, k);
          return svar({ ok: true, klient: publikKlient(k), pott: pt });
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
            // Khaled 2026-11-26: kommande obetalda bokningar ska in i passen, som för vanliga paket
            const flyttade = efter > 0 ? await flyttaTillPaket(env, k, pk, veckor) : 0;
            if (flyttade) logga(k, 'flytt', `${flyttade === 1 ? 'En bokad tid' : `${flyttade} bokade tider`} flyttades in i ${pk.namn}`, -flyttade);
            if (efter > fore) tillKlient(k, 'pass', 'Nya pass', `Haris har lagt in ${efter - fore} pass till åt ${k.barn || 'er'}. Ni har ${paketSaldo(k, veckor).reduce((x, y) => x + y.kvar, 0)} pass kvar.`, '/mina-pass');
          } else {
            pk = { id: nyttId('pk'), namn: 'Betalda utanför appen', antal, tidigare, pris: 0, kopt: nu(), av: 'haris', betald: nu(), swishad: null, utanfor: true };
            k.paket = [...(k.paket || []), pk];
            logga(k, 'in', `Haris lade in ${antal} pass betalda utanför appen${tidigare ? `, ${tidigare} redan använda` : ''}`, antal - tidigare, 'haris');
            const flyttade = antal > tidigare ? await flyttaTillPaket(env, k, pk, veckor) : 0;
            if (flyttade) logga(k, 'flytt', `${flyttade === 1 ? 'En bokad tid' : `${flyttade} bokade tider`} flyttades in i ${pk.namn}`, -flyttade);
            if (antal - tidigare > 0) tillKlient(k, 'pass', 'Nya pass', `Haris har lagt in ${antal - tidigare} pass åt ${k.barn || 'er'}. Ni har ${paketSaldo(k, veckor).reduce((x, y) => x + y.kvar, 0)} pass kvar.`, '/mina-pass');
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
          // syskon: bokningen och betalningen ligger på huvudklienten (fk), barnIds = barnen som kommer
          const fk = await betalare(env, k);
          const fam = fk.syskon?.length ? await familj(env, fk) : [fk];
          const namnPa = ids => barnText(fam.filter(x => ids.includes(x.id)).map(x => x.barn));
          if (del === 'boka') {
            const finnsMed = s.bokad && s.bokad.uid === fk.id;
            if (finnsMed && bokadeBarn(s.bokad).includes(k.id) && !(Array.isArray(d.barnIds) && d.barnIds.some(x => !bokadeBarn(s.bokad).includes(x)))) return fel('klienten har redan den tiden', 409);
            if (s.bokad && !finnsMed) return fel(`tiden är redan bokad av ${s.bokad.barn || s.bokad.namn || 'någon annan'}`, 409);
            if (finnsMed) {
              // syskonet följer med på familjens tid: samma bokning och samma pris
              const ids = fam.map(x => x.id).filter(id => [...bokadeBarn(s.bokad), k.id, ...(Array.isArray(d.barnIds) ? d.barnIds : [])].includes(id));
              s.bokad.barnIds = ids; s.bokad.barn = namnPa(ids);
              logga(fk, 'styck', `Haris lade till ${k.barn} på ${tidText(v, s)}`, 0, 'haris');
              if (`${datumFor(v, s.dag)}T${s.start}` > lokal()) tillKlient(fk, 'bokning', 'Tiden är ändrad', `${s.bokad.barn} tränar ${tidText(v, s)}${s.plats ? `, ${s.plats}` : ''}.`, `/boka/${v}`);
            } else {
              if (s.hall && s.hall.tills > Date.now()) return fel('någon håller platsen just nu, prova om en minut', 409);
              // paketet först, sedan potten, annars styckvis (Haris kan byta under klientens tider)
              const allaV = await hamtaAlla(env, 'vecka:'), cfgB = await hamtaBetalning(env);
              const pk = ledigtPaket(fk, allaV);
              const pott = !pk && pottRacker(fk, allaV, cfgB);
              const valda = valdaBarn(fam, d.barnIds, k.id);
              s.bokad = { uid: fk.id, namn: fk.foralder, barn: barnText(valda.map(x => x.barn)), telefon: fk.telefon, email: fk.email, t: nu(), av: 'haris', pris: pk ? null : klientPris(fk, cfgB), paket: pk?.id || null, pott };
              if (fam.length > 1) s.bokad.barnIds = valda.map(x => x.id);
              s.hall = null;
              logga(fk, pk ? 'bokad' : pott ? 'pott' : 'styck', `Haris bokade ${tidText(v, s)}${fam.length > 1 ? ` (${s.bokad.barn})` : ''}${pk ? ` med ett pass ur ${pk.namn}` : pott ? `, ${krText(s.bokad.pris)} ur potten` : s.bokad.pris ? `, ${krText(s.bokad.pris)}` : ''}`, pk && kortsPass(v, s) ? -1 : 0, 'haris');
              if (`${datumFor(v, s.dag)}T${s.start}` > lokal()) tillKlient(fk, 'bokning', 'Ny tid bokad', `Haris har bokat en tid åt ${s.bokad.barn || 'er'}: ${tidText(v, s)}${s.plats ? `, ${s.plats}` : ''}.${pk ? ' Passet dras från paketet.' : pott ? ` ${krText(s.bokad.pris)} dras ur potten.` : s.bokad.pris ? ` Betala ${krText(s.bokad.pris)} med Swish i appen.` : ''}`, `/boka/${v}`);
            }
          } else if (s.bokad?.uid === fk.id && bokadeBarn(s.bokad).includes(k.id)) {
            const kvar = bokadeBarn(s.bokad).filter(x => x !== k.id);
            if (kvar.length && !d.alla) {
              // bara det här barnet stryks, syskonen tränar som vanligt (priset är detsamma)
              s.bokad.barnIds = kvar; s.bokad.barn = namnPa(kvar);
              logga(fk, 'styck', `Haris strök ${k.barn} från ${tidText(v, s)}`, 0, 'haris');
              if (`${datumFor(v, s.dag)}T${s.start}` > lokal()) tillKlient(fk, 'bokning', 'Tiden är ändrad', `${k.barn} är struken från ${tidText(v, s)}. ${s.bokad.barn} tränar som vanligt.`, `/boka/${v}`);
            } else {
              logga(fk, 'avbokad', `Haris avbokade ${tidText(v, s)}${s.bokad.paket ? (kortsPass(v, s) ? ', passet tillbaka' : ', passet drogs inte') : s.bokad.pott ? `, ${krText(s.bokad.pris || 0)} tillbaka i potten` : ''}`, s.bokad.paket && kortsPass(v, s) ? 1 : 0, 'haris');
              if (`${datumFor(v, s.dag)}T${s.start}` > lokal()) tillKlient(fk, 'bokning', 'Tiden är avbokad', `Haris har avbokat ${tidText(v, s)}.${s.bokad.paket ? ' Passet är tillbaka i paketet.' : s.bokad.pott ? ' Beloppet är tillbaka i potten.' : ''}`, `/boka/${v}`);
              s.bokad = null;
            }
          }
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          await sparaKlient(env, fk);
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
        return svar({ ok: true, nu: nuV, veckor, mandag: Object.fromEntries(veckor.map(w => [w.v, mandag(w.v).toISOString().slice(0, 10)])), schema: (await env.DB.get('config:tidschema', 'json')) || null });
      }
      // Haris kalenderlänk (prenumeration). ny: true byter länken, den gamla slutar fungera.
      if (p === '/admin/kalender' && (req.method === 'GET' || req.method === 'POST')) {
        const d = req.method === 'POST' ? ((await json()) || {}) : {};
        let hemlig = await env.DB.get('config:kalhemlig');
        if (!hemlig || d.ny) { hemlig = slump(32, SMA); await env.DB.put('config:kalhemlig', hemlig); }
        return svar({ ok: true, url: `/kal/haris/${hemlig}.ics` });
      }
      // Kör påminnelserna nu (samma som schemat var 15:e minut). nu = låtsad svensk tid, bara i testläge.
      if (p === '/admin/paminnelser' && req.method === 'POST') {
        const d = (await json()) || {};
        return svar({ ok: true, ...(await paminnelser(env, env.TEST_LAGE && d.nu ? String(d.nu).slice(0, 16) : lokal())) });
      }
      const mv = /^\/admin\/vecka\/(\d{4}-W\d{2})(\/auto|\/duplicera|\/betald|\/notis)?$/.exec(p);
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
            const { lediga, text } = veckaNotisText(vecka);
            if (lediga) {
              notis = await pushTyp(env, 'vecka', { title: 'Nya tider hos Haris', text, hash: `/boka/${v}`, foraldrar: true });
              if (notis.ok) { vecka.notis = nu(); vecka.notisAntal = notis.skickade; }
            }
          }
          // en stängd vecka utan tider tas bort helt, så att den räknas som ny (och får en ny notis) om den fylls igen
          if (!vecka.oppen && !vecka.slots.length) await env.DB.delete(`vecka:${v}`);
          else await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          const borta = Object.values(gamla).filter(s => s.bokad && !vecka.slots.some(n => n.bokad && n.bokad.uid === s.bokad.uid && n.bokad.t === s.bokad.t));
          for (const s of borta) {
            const kl = await hamtaKlient(env, s.bokad.uid);
            if (kl) {
              logga(kl, 'avbokad', `Haris avbokade ${tidText(v, s)}${s.bokad.paket ? (kortsPass(v, s) ? ', passet tillbaka' : ', passet drogs inte') : s.bokad.pott ? `, ${krText(s.bokad.pris || 0)} tillbaka i potten` : ''}`, s.bokad.paket && kortsPass(v, s) ? 1 : 0, 'haris');
              if (`${datumFor(v, s.dag)}T${s.start}` > lokal()) tillKlient(kl, 'bokning', 'Tiden är avbokad', `Haris har tagit bort tiden ${tidText(v, s)}.${s.bokad.paket ? ' Passet är tillbaka i paketet.' : s.bokad.pott ? ' Beloppet är tillbaka i potten.' : ''}`, '/boka');
              await sparaKlient(env, kl);
            }
          }
          return svar({ ok: true, vecka, kastade: st.kastade, notis });
        }
        // Veckoschemat (Haris 2026-11-22: "det går inte att sätta olika tider för olika dagar … vissa dagar har jag till 18
        // och helger har jag endast två tider"): schema = [{dag, pa, start, slut}] med egna tider per dag. ersatt = ta
        // bort veckans lediga tider först (bokade och hållna ligger kvar). Schemat sparas i config:tidschema och fylls i
        // nästa gång. Det gamla formatet {dagar, start, slut} fungerar som förut.
        if (mv[2] === '/auto' && req.method === 'POST') {
          const langd = Math.max(15, Math.min(240, Math.round(+d.langd || 60)));
          let rader;
          if (Array.isArray(d.schema)) {
            const alla = d.schema.slice(0, 7).map(r => ({ dag: Math.round(+r.dag), pa: !!r.pa, start: tidOk(r.start) ? r.start : '16:00', slut: tidOk(r.slut) ? r.slut : '18:00' })).filter(r => r.dag >= 1 && r.dag <= 7);
            await env.DB.put('config:tidschema', JSON.stringify({ schema: alla, langd, plats: ren(d.plats, 60), ersatt: !!d.ersatt, uppdaterad: nu() }));
            rader = alla.filter(r => r.pa);
          } else {
            const dagar = (Array.isArray(d.dagar) ? d.dagar : [1, 2, 3, 4, 5]).map(Number).filter(x => x >= 1 && x <= 7);
            const start = tidOk(d.start) ? d.start : '16:00', slut = tidOk(d.slut) ? d.slut : '20:00';
            rader = dagar.map(dag => ({ dag, start, slut }));
          }
          const fore = vecka.slots.length;
          if (d.ersatt) vecka.slots = vecka.slots.filter(s => s.bokad || s.hall);
          const bort = fore - vecka.slots.length;
          const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          let nya = 0;
          for (const { dag, start, slut } of rader) for (let m = minuter(start); m + langd <= minuter(slut); m += langd) {
            // hoppa över tider som krockar med något som redan finns den dagen
            if (vecka.slots.some(s => s.dag === dag && m < minuter(s.slut) && m + langd > minuter(s.start))) continue;
            vecka.slots.push(renSlot({ dag, start: fmt(m), slut: fmt(m + langd), plats: d.plats }));
            nya++;
          }
          vecka.slots = stadaSlots(vecka.slots).slots;
          if (!vecka.oppen && !vecka.slots.length) await env.DB.delete(`vecka:${v}`);
          else await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka, nya, bort });
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
          if (s.bokad.betald) { const kl = await hamtaKlient(env, s.bokad.uid); if (kl) { tillKlient(kl, 'betald', 'Betalningen är klar', `Haris har tagit emot betalningen för ${tidText(v, s)}. Tack!`, `/boka/${v}`); await sparaKlient(env, kl); } }
          return svar({ ok: true, vecka });
        }
        // Skicka notis om lediga tider (igen), t.ex. när Haris lagt till tider i en öppen vecka (Carl 2026-11-13)
        if (mv[2] === '/notis' && req.method === 'POST') {
          if (!vecka.oppen) return fel('öppna veckan först', 409);
          const { lediga, text } = veckaNotisText(vecka);
          if (!lediga) return fel('det finns inga lediga tider kvar den veckan', 409);
          const r = await pushServer(env, '/skicka', { title: 'Lediga tider hos Haris', text, hash: `/boka/${v}`, foraldrar: true });
          if (!r.ok) return fel(r.fel || 'notisen gick inte iväg', 502);
          vecka.notis = nu(); vecka.notisAntal = r.skickade;
          await env.DB.put(`vecka:${v}`, JSON.stringify(vecka));
          return svar({ ok: true, vecka, notis: r });
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
      const asv = /^\/admin\/plan\/([a-z0-9]+)\/svar(?:\/([a-z0-9]+))?$/.exec(p);
      if (asv) {
        const plan = await env.DB.get(`plan:${asv[1]}`, 'json');
        if (!plan) return fel('passet finns inte', 404);
        if (req.method === 'DELETE' && asv[2]) plan.svar = (plan.svar || []).filter(x => x.id !== asv[2]);
        else if (req.method === 'POST') {
          const d = await json(); if (!d) return fel('trasig JSON');
          const sv = renSvar(d, 'haris', 'Haris');
          if (!sv.text) return fel('skriv något först');
          plan.svar = [...(plan.svar || []), sv].slice(-200);
          if (plan.delad) { const kl = await hamtaKlient(env, plan.uid); if (kl) { const moment = plan.block.find(b => b.id === sv.blockId)?.titel; tillKlient(kl, 'utveckling', 'Haris svarade', `${moment ? `${moment}: ` : ''}${sv.text.slice(0, 140)}`, `/med-haris/${plan.id}`); await sparaKlient(env, kl); } }
        } else return fel('fel metod', 405);
        await env.DB.put(`plan:${plan.id}`, JSON.stringify(plan));
        return svar({ ok: true, svar: plan.svar });
      }
      // Övningsbanken (Carl 2026-11-25: "ett ställe där Haris kan lägga upp nya och ta bort övningar … och lägga till
      // filmer till övningarna"). Grunden är data/ovningsbank.json i appen; här ligger det Haris ändrat eller lagt till
      // (obank:<id>, hela övningen) och de han tagit bort (obank:borta). Appen lägger ihop dem.
      if (p === '/admin/ovningsbank' && req.method === 'GET') {
        const [ovningar, borta] = await Promise.all([hamtaAllaMedId(env, 'obank:o:'), env.DB.get('obank:borta', 'json')]);
        return svar({ ok: true, ovningar, borta: borta || [] });
      }
      const mob = /^\/admin\/ovningsbank\/([a-z0-9-]{1,40})(\/tillbaka)?$/.exec(p);
      if (mob) {
        const id = mob[1], borta = (await env.DB.get('obank:borta', 'json')) || [];
        if (mob[2] && req.method === 'POST') {
          await env.DB.put('obank:borta', JSON.stringify(borta.filter(x => x !== id)));
          return svar({ ok: true });
        }
        if (req.method === 'DELETE') {
          await env.DB.delete(`obank:o:${id}`);
          if (!url.searchParams.get('egen') && !borta.includes(id)) await env.DB.put('obank:borta', JSON.stringify([...borta, id].slice(-500)));
          return svar({ ok: true });
        }
        if (req.method !== 'PUT') return fel('fel metod', 405);
        const d = await json(); if (!d) return fel('trasig JSON');
        const ren1 = v => typeof v === 'number' ? (Number.isFinite(v) ? v : null) : ren(v, 80);
        const lista = v => (Array.isArray(v) ? v : v === '' || v == null ? [] : [v]).slice(0, 30).map(ren1).filter(x => x !== '' && x != null);
        const tal = v => v === '' || v == null || !Number.isFinite(+v) ? null : Math.max(0, Math.round(+v * 10) / 10);
        const f = d.film && typeof d.film === 'object' && d.film.url ? { namn: ren(d.film.namn, 80), url: ren(d.film.url, 400), poster: ren(d.film.poster, 400), start: tal(d.film.start) ?? 0, slut: tal(d.film.slut) } : null;
        const o = {
          id, namn: ren(d.namn, 80), desc: ren(d.desc, 1500), omrade: ren(d.omrade, 60), kalla: ren(d.kalla, 120), kommentar: ren(d.kommentar, 2000),
          tid: tal(d.tid), maltid: tal(d.maltid), film: f, egen: !!d.egen, var: lista(d.var).map(String),
          typer: lista(d.typer).map(String), faser: lista(d.faser).map(String), nivor: lista(d.nivor).map(Number).filter(n => n >= 1 && n <= 5).sort((a, b) => a - b),
          positioner: lista(d.positioner).map(String), ytor: lista(d.ytor).map(String), alder: lista(d.alder).map(String), erfarenhet: lista(d.erfarenhet).map(String),
          fardighet: lista(d.fardighet).map(String), utr: lista(d.utr).map(String), sallskap: lista(d.sallskap).map(String), plats: lista(d.plats).map(String),
          andrad: nu(),
        };
        if (!o.namn) return fel('övningen behöver ett namn');
        // fälten appen redan läser (ett värde): det första valda, lägsta nivån, Alla om ingen position är vald
        o.typ = o.typer[0] || 'Övning'; o.fas = o.faser[0] || ''; o.niva = o.nivor[0] || null; o.yta = o.ytor[0] || '';
        o.position = !o.positioner.length || o.positioner.includes('Alla') ? 'Alla' : o.positioner.join(', ');
        await env.DB.put(`obank:o:${id}`, JSON.stringify(o));
        if (borta.includes(id)) await env.DB.put('obank:borta', JSON.stringify(borta.filter(x => x !== id)));
        return svar({ ok: true, ovning: o });
      }
      // Frågor om övningarna (Carl 2026-11-25: "skapa det inne i appen"): Haris svarar på hur varje övning i
      // övningsbanken ska användas. KV ovf:svar:<övnings-id>, ovf:nya:<id> (nya övningar), ovf:allmant.
      if (p === '/admin/ovfragor' && req.method === 'GET') {
        const [svaren, nya, allmant] = await Promise.all([hamtaAllaMedId(env, 'ovf:svar:'), hamtaAllaMedId(env, 'ovf:nya:'), env.DB.get('ovf:allmant', 'json')]);
        return svar({ ok: true, svar: svaren, nya, allmant: allmant || {} });
      }
      const movf = /^\/admin\/ovfragor\/(svar|nya|allmant)(?:\/([a-z0-9-]{1,40}))?$/.exec(p);
      if (movf) {
        const [, del, id] = movf;
        if (del !== 'allmant' && !id) return fel('id saknas');
        const nyckel = del === 'allmant' ? 'ovf:allmant' : `ovf:${del}:${id}`;
        if (req.method === 'DELETE') { await env.DB.delete(nyckel); return svar({ ok: true }); }
        if (req.method !== 'PUT') return fel('fel metod', 405);
        const d = await json(); if (!d) return fel('trasig JSON');
        const ren1 = (v, max = 60) => typeof v === 'number' ? (Number.isFinite(v) ? v : null) : ren(v, max);
        const lista = v => (Array.isArray(v) ? v : v === '' || v == null ? [] : [v]).slice(0, 30).map(x => ren1(x)).filter(x => x !== '' && x != null);
        let ut;
        if (del === 'allmant') {
          ut = { t: nu() };
          for (const k of ['passlangd', 'filmerna', 'utanFilm', 'nivastyr', 'ordning']) ut[k] = lista(d[k]);
          ut.mer = ren(d.mer, 2000);
        } else {
          ut = { t: nu(), beslut: ren(d.beslut, 20), namn: ren(d.namn, 80), desc: ren(d.desc, 1200), kommentar: ren(d.kommentar, 2000), film: ren(d.film, 60) };
          for (const k of ['tid', 'maltid', 'start', 'slut']) ut[k] = d[k] === '' || d[k] == null || !Number.isFinite(+d[k]) ? '' : +d[k];
          for (const k of ['typ', 'niva', 'position', 'alder', 'erfarenhet', 'fas', 'fardighet', 'utr', 'sallskap', 'yta', 'plats', 'var']) ut[k] = lista(d[k]);
          ut.niva = ut.niva.map(Number).filter(n => n >= 1 && n <= 5);
        }
        await env.DB.put(nyckel, JSON.stringify(ut));
        return svar({ ok: true, data: ut });
      }
      // Dagens pass (Carl 2026-11-24): bokningarna från i förrgår till om en vecka, med passet som hör till varje barn
      if (p === '/admin/idag' && req.method === 'GET') {
        const [veckor, planer, klienter] = await Promise.all([hamtaAlla(env, 'vecka:'), hamtaAlla(env, 'plan:'), hamtaKlienter(env)]);
        const fran = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), till = new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10);
        const ut = [];
        for (const w of veckor) for (const s of w.slots || []) {
          if (!s.bokad) continue;
          const datum = datumFor(w.v, s.dag);
          if (datum < fran || datum > till) continue;
          const barn = bokadeBarn(s.bokad).map(id => {
            const k = klienter.find(x => x.id === id);
            const pl = planer.find(x => x.uid === id && x.bokning?.v === w.v && x.bokning?.slot === s.id);
            return { id, barn: k ? [k.barn, k.efternamn].filter(Boolean).join(' ') : (s.bokad.barn || ''), fornamn: k?.barn || s.bokad.barn || '', niva: k?.niva || null, finns: !!k,
              plan: pl ? { id: pl.id, titel: pl.titel, block: pl.block.length, klara: pl.block.filter(b => b.klar).length, delad: pl.delad, filmer: pl.block.reduce((n, b) => n + (b.media?.length || 0), 0) } : null };
          });
          ut.push({ v: w.v, slot: s.id, datum, start: s.start, slut: s.slut, plats: s.plats || '', barn });
        }
        ut.sort((a, b) => (a.datum + a.start).localeCompare(b.datum + b.start));
        return svar({ ok: true, pass: ut, idag: idag() });
      }
      // Filmbanken: alla filmer och ljud från passen, med barnet, passet och tiden (Carl 2026-11-24: "material för
      // sin marknadsföring"), och hur mycket av lagringen som används
      if (p === '/admin/passfilmer' && req.method === 'GET') {
        const [klienter, planer] = await Promise.all([hamtaKlienter(env), hamtaAlla(env, 'plan:')]);
        const filmer = [];
        for (const k of klienter) {
          const [med, bed] = await Promise.all([env.DB.get(`med:${k.id}`, 'json'), env.DB.get(`bed:${k.id}`, 'json')]);
          for (const m of med || []) {
            const pl = planer.find(x => x.id === m.planId), bl = pl?.block.find(b => b.id === m.blockId);
            const bd = (bed || []).find(b => (m.bedId && b.id === m.bedId) || (b.mediaId && b.mediaId === m.id) || (m.planId && b.planId === m.planId && b.blockId === m.blockId));
            filmer.push({ ...m, klientId: k.id, barn: [k.barn, k.efternamn].filter(Boolean).join(' '), plan: pl ? { id: pl.id, titel: pl.titel, datum: pl.datum } : null, moment: bl?.titel || '', fardighet: bl?.fardighet || '',
              bed: bd ? { namn: bd.namn, medel: bd.medel, bast: bd.bast, datum: bd.datum } : null });
          }
        }
        filmer.sort((a, b) => String(b.t).localeCompare(String(a.t)));
        const l = await r2Anvant(env);
        return svar({ ok: true, filmer, r2: !!env.MEDIA, lagring: { anvant: l.b, antal: l.n, tak: R2_TAK, gratis: R2_GRATIS } });
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
        if (plan.delad && !gammal.delad) { const kl = await hamtaKlient(env, plan.uid); if (kl) { tillKlient(kl, 'utveckling', 'Passet från Haris', `Haris har delat passet "${plan.titel}" med tider, filmer och kommentarer.`, `/med-haris/${plan.id}`); await sparaKlient(env, kl); } }
        return svar({ ok: true, plan });
      }

      // uppladdning till R2 i delar (telefonfilmer är stora); klientId ger nyckeln klient/<id>/…
      if (p === '/admin/upload/start' && req.method === 'POST') {
        if (!env.MEDIA) return fel('R2 är inte påslaget ännu – filen sparas på telefonen så länge', 503);
        const d = await json(); if (!d) return fel('trasig JSON');
        const ny = Math.max(0, +d.storlek || 0);
        if ((await r2Anvant(env)).b + ny > R2_TAK) {
          const f = await r2Anvant(env, true);
          if (f.b + ny > R2_TAK) return fel(`Lagringen är full: ${gbText(f.b)} av 10 GB. Ta bort gamla filmer under Admin → Filmbank.`, 507);
        }
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
        const obj = await up.complete((d.parts || []).map(x => ({ partNumber: +x.partNumber, etag: String(x.etag) })));
        const c = await env.DB.get('r2:anvant', 'json');
        if (c) { c.b += obj?.size || 0; c.n++; await env.DB.put('r2:anvant', JSON.stringify(c)); }
        return svar({ ok: true, url: `${base}/media/${d.key}`, key: d.key, storlek: obj?.size || 0 });
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
      if (p === '/admin/config/admins' && req.method === 'GET') return svar({ ok: true, epost: ((await env.DB.get('config:admins', 'json')) || {}).epost || [] });
      if (p === '/admin/config/admins' && req.method === 'PUT') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const lista = [...new Set((Array.isArray(d.epost) ? d.epost : []).map(email).filter(Boolean))].slice(0, 10);
        if (!lista.length) return fel('minst en e-postadress behövs, annars kan ingen logga in som Haris');
        await env.DB.put('config:admins', JSON.stringify({ epost: lista, uppdaterad: nu() }));
        return svar({ ok: true, epost: lista });
      }
      if (p === '/admin/notiser' && req.method === 'GET') {
        let telefoner = null;
        try { telefoner = env.PUSH_BASE ? await (await fetch(`${env.PUSH_BASE}/`)).json() : null; } catch { /* ok */ }
        return svar({ ok: true, config: await hamtaNotisCfg(env), telefoner });
      }
      if (p === '/admin/notiser' && req.method === 'PUT') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const cfg = Object.fromEntries(NOTIS_TYPER.map(t => [t, d[t] !== false]));
        await env.DB.put('config:notiser', JSON.stringify(cfg));
        return svar({ ok: true, config: cfg });
      }
      // Haris telefon: notiser när föräldrar bokar, avbokar, swishar och köper paket
      if (p === '/admin/push' && req.method === 'POST') {
        const d = await json(); if (!d) return fel('trasig JSON');
        const token = String(d.token || '').toLowerCase();
        if (!/^[0-9a-f]{64,200}$/.test(token)) return fel('ogiltig pushkod');
        const r = await pushServer(env, '/registrera', { token, admin: !d.av });
        return svar({ ok: r.ok, fel: r.fel || undefined });
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
  // var 15:e minut: påminnelser inför passen
  async scheduled(ev, env, ctx) { ctx.waitUntil(paminnelser(env)); },
};
