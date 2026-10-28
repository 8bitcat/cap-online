// Admin → Klienter (Carl 2026-10-23): kundregistret. Haris lägger in en ny kund med mobilnummer och skickar
// länken som sms, bokar tider åt befintliga kunder, höjer och sänker nivån, planerar pass för personen och ser
// bedömningarna över tid som diagram. Samma sida på datorn och i appen.
import { api } from './api.js?v=34b2e5f';
import { diagram, sammanfattning } from './diagram.js?v=34b2e5f';
import { betalStatus, kr } from './swish.js?v=34b2e5f';
import { vantande, lokalUrl, laddaUppVantande, taBortLokal, r2Pa, sattR2 } from './media.js?v=34b2e5f';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const DAG = ['', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const DAGL = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const POS = { mv: 'Målvakt', back: 'Back', mitt: 'Mittfältare', anf: 'Anfallare', okand: 'Vet inte än' };
const fmtSek = s => `${Number(s).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const fmtIso = iso => { const [, m, d] = String(iso || '').split('-'); return m ? `${+d} ${MAN[+m - 1]}` : ''; };
const idag = () => new Date().toISOString().slice(0, 10);

// +46701234567 → 070-123 45 67
export function visaTel(t) {
  if (!t) return '';
  let s = String(t);
  if (s.startsWith('+46')) s = '0' + s.slice(3);
  const m = /^(0\d{2})(\d{3})(\d{2})(\d{2})$/.exec(s) || /^(0\d{2,3})(\d{2,3})(\d{2})(\d{2})$/.exec(s);
  return m ? `${m[1]}-${m[2]} ${m[3]} ${m[4]}` : s;
}
export const smsLank = (tel, text) => `sms:${tel}?&body=${encodeURIComponent(text)}`;

let st = { klienter: [], laddat: false, sms: false, sok: '', vald: null, nyLank: null, veckor: null, nu: null, veckaVald: null, bedForm: false, lokala: [], upp: null };
let ui = null, C = null;
export function klienterInit(deps) { ui = deps; C = deps.content; }
export const klienterNu = () => st.klienter;
export const klienterLaddade = () => st.laddat;
const nivaNamn = n => C?.game?.levels?.find(l => l.n === n)?.name || `Nivå ${n}`;
const alder = fodd => fodd ? `${new Date().getFullYear() - fodd} år` : '';
const helt = k => [k.barn, k.efternamn].filter(Boolean).join(' ');
const traff = (k, q) => !q || [k.barn, k.efternamn, helt(k), k.foralder, k.telefon, visaTel(k.telefon), k.lag, k.email].some(x => (x || '').toLowerCase().includes(q));
// tidsstämplarna sparas i UTC; visa svensk tid
const fmtTid = iso => { const d = new Date(iso || ''); return isNaN(d) ? '' : `${d.getDate()} ${MAN[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const SMS_TYP = { hamta: 'Hämta appen', lank: 'Inloggningslänk', kod: 'Inloggningskod', test: 'Test' };
const SMS_ST = { levererat: '<span style="color:var(--ok)">levererat ✓</span>', skickat: 'skickat', skickas: 'skickas…', misslyckat: '<span style="color:var(--danger)">gick inte fram</span>' };

// Ritar om klientsidan utan att hoppa upp (Haris står ofta mitt på sidan när han bockar av)
function ritaKvar() { const y = window.scrollY; ui.route(); window.scrollTo(0, y); }

export async function klienterLadda(tvinga = false) {
  if (st.laddat && !tvinga) return;
  const r = await api.admin.get('/admin/klienter');
  if (r.ok) { st.klienter = r.klienter; st.sms = !!r.sms; sattR2(!!r.r2); st.laddat = true; st.hamtat = Date.now(); smsRakna(r); }
}
async function klientLadda(id) {
  const r = await api.admin.get(`/admin/klient/${id}`);
  if (r.ok) { st.vald = { id, ...r, hamtat: Date.now() }; st.sms = !!r.sms; sattR2(!!r.r2); st.lokala = await vantande(id); smsRakna(r); }
  else st.vald = { id, saknas: true };
}
// klientsidan hämtas om i bakgrunden när kopian är gammal: föräldern kan ha fyllt i barnets namn, sms kan ha levererats
function friska(id) {
  if (st.vald?.id !== id || st.vald.saknas || Date.now() - (st.vald.hamtat || 0) < 8000 || st.friskar) return;
  st.friskar = true;
  klientLadda(id).finally(() => { st.friskar = false; if (location.hash.replace(/^#/, '') === `/admin/klient/${id}`) ui.route(); });
}
function smsRakna(r) { if (r && r.smsTak !== undefined) { st.smsIdag = r.smsIdag; st.smsTak = r.smsTak; st.smsFran = r.smsFran; } }
export function klientGlom() { st.vald = null; st.laddat = false; }

export function klienterView(id, lage) {
  // klientsidan som redan är hämtad visas direkt; listan hämtas om i bakgrunden (annars blinkade "Hämtar…" efter varje bockning)
  if (!st.laddat && !(id && st.vald?.id === id)) { klienterLadda().then(ui.kvar()); return `<section class="panel"><p class="muted" style="margin:0">Hämtar klienterna…</p></section>`; }
  if (!st.laddat) klienterLadda();
  if (id === 'ny') return kundForm(null);
  if (id) {
    if (st.vald?.id !== id) { klientLadda(id).then(ui.kvar()); return `<section class="panel"><p class="muted" style="margin:0">Hämtar klienten…</p></section>`; }
    if (st.vald.saknas) return `<section><a class="back" href="#/admin/klienter">‹ Klienter</a><p class="muted">Klienten hittades inte.</p></section>`;
    if (lage === 'redigera') return kundForm(st.vald.klient);
    if (lage === 'boka') return bokaVy();
    friska(id);
    return klientSida();
  }
  // listan hämtas om i bakgrunden om den är gammal (flaggor, nästa tid, senaste bedömning ändras från annat håll)
  if (Date.now() - (st.hamtat || 0) > 10000) klienterLadda(true).then(() => { if (location.hash.replace(/^#/, '') === '/admin/klienter') ui.route(); });
  return lista();
}

/* ---------- lista ---------- */

function lista() {
  const q = st.sok.trim().toLowerCase();
  const tr = st.klienter.filter(k => traff(k, q));
  const flagg = st.klienter.filter(k => k.vilLank).length;
  return `
  <section>
    <div class="section-head"><h2>Klienter <span class="muted small">${st.klienter.length}</span></h2><a class="btn" href="#/admin/klient/ny">+ Ny kund</a></div>
    <p class="small muted">Varje spelare med förälder och mobilnummer. Tryck på en klient för att boka, planera pass, sätta nivå och se bedömningarna.</p>
    ${flagg ? `<div class="note warn small">${flagg === 1 ? 'En förälder' : flagg + ' föräldrar'} har tryckt "Glömt koden" och väntar på en ny länk. Markerat med ⚠ nedan.</div>` : ''}
    <input type="search" id="klientsok" placeholder="Sök barn, förälder, lag eller nummer" value="${esc(st.sok)}" autocomplete="off">
    ${st.sms ? `<p class="small muted" style="margin:8px 0 0">📤 Sms i dag: <b>${st.smsIdag || 0}</b> av ${st.smsTak || 25} · avsändare ${esc(st.smsFran || 'CapSwe')}</p>` : ''}
    ${tr.length ? `<div class="klient-lista">${tr.map(kort).join('')}</div>` : `<p class="muted" style="margin-top:14px">${st.klienter.length ? 'Ingen träff.' : 'Inga klienter än. Lägg in den första med Ny kund.'}</p>`}
  </section>`;
}
function kort(k) {
  const n = k.nastaTid;
  return `<a class="klient-card ${k.vilLank ? 'flagg' : ''}" href="#/admin/klient/${k.id}">
    <span class="kc-niva" title="Nivå ${k.niva}">${k.niva}</span>
    <span class="kc-body">
      <b>${esc(helt(k) || '(namn saknas)')}${k.fodd ? ` <span class="muted small">${esc(alder(k.fodd))}</span>` : ''}</b>
      <span class="small muted">${esc(k.foralder || '')}${k.foralder ? ' · ' : ''}${esc(visaTel(k.telefon))} · ${esc(POS[k.position] || '')}${k.lag ? ` · ${esc(k.lag)}` : ''}</span>
      <span class="small kc-rad">${n ? `📅 ${DAG[n.dag]} ${fmtIso(n.datum)} ${esc(n.start)}` : '📅 Ingen tid bokad'}${k.paketKvar ? ` · 🎟 ${k.paketKvar} pass kvar` : ''}${k.paketObetalda ? ' · <span style="color:var(--warn)">paket obetalt</span>' : ''}${k.senasteBed ? ` · 📊 ${esc(k.senasteBed.namn)} ${fmtSek(k.senasteBed.medel)}` : ''}${k.antalPass ? ` · ${k.antalPass} pass` : ''}</span>
    </span>
    <span class="kc-flagg">${k.vilLank ? '⚠ Ny länk' : k.inloggad?.app ? '<span style="color:var(--ok)">I appen ✓</span>' : !k.senast ? '<span class="muted">Ej inloggad än</span>' : '<span class="muted">Inte i appen än</span>'}</span>
  </a>`;
}

/* ---------- ny kund / redigera ---------- */

function kundForm(k) {
  const ny = !k;
  k = k || { barn: '', efternamn: '', fodd: '', position: 'okand', lag: '', foralder: '', telefon: '', email: '', niva: 1, anteckning: '', status: 'ny' };
  const ar = new Date().getFullYear();
  const tel = `<div class="field"><label for="ktel">Förälderns mobilnummer</label><input type="tel" id="ktel" name="telefon" value="${esc(ny ? '' : visaTel(k.telefon))}" required placeholder="070-123 45 67" autocomplete="tel"><span class="hint">Det enda som behövs. Används för inloggningen och för sms med länken.</span></div>`;
  const resten = `
      <h3>Spelaren</h3>
      <div class="auto-rad" style="display:flex;gap:12px;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:140px"><label for="kbarn">Barnets förnamn</label><input type="text" id="kbarn" name="barn" value="${esc(k.barn)}" placeholder="Föräldern kan fylla i"></div>
        <div class="field" style="flex:1;min-width:140px"><label for="kefter">Efternamn</label><input type="text" id="kefter" name="efternamn" value="${esc(k.efternamn || '')}" placeholder="T.ex. Andersson"></div>
      </div>
      <div class="auto-rad" style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="field" style="flex:1;min-width:120px">Född år <select name="fodd"><option value="">–</option>${Array.from({ length: 12 }, (_, i) => ar - 5 - i).map(y => `<option value="${y}" ${String(k.fodd) === String(y) ? 'selected' : ''}>${y} (${ar - y} år)</option>`).join('')}</select></label>
        <label class="field" style="flex:1;min-width:140px">Position <select name="position">${Object.entries(POS).map(([v, t]) => `<option value="${v}" ${k.position === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <div class="field"><label for="klag">Lag/förening</label><input type="text" id="klag" name="lag" value="${esc(k.lag || '')}" placeholder="T.ex. KBK F2017"></div>
      <div class="field"><label for="kniva">Nivå</label><select id="kniva" name="niva">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${k.niva === n ? 'selected' : ''}>Nivå ${n} · ${esc(nivaNamn(n))}</option>`).join('')}</select></div>
      <h3 style="margin-top:18px">Föräldern</h3>
      <div class="field"><label for="kforalder">Förälderns namn</label><input type="text" id="kforalder" name="foralder" value="${esc(k.foralder)}" placeholder="T.ex. Anna"></div>
      ${ny ? '' : tel}
      <div class="field"><label for="kemail">E-post</label><input type="email" id="kemail" name="email" value="${esc(k.email || '')}" placeholder="namn@exempel.se"></div>
      <div class="field"><label for="kant">Anteckning</label><textarea id="kant" name="anteckning" placeholder="Styrkor, vad ni jobbar på, annat att komma ihåg…">${esc(k.anteckning || '')}</textarea></div>
      ${ny ? '' : `<div class="field"><label for="kstatus">Status</label><select id="kstatus" name="status">${[['ny', 'Ny'], ['aktiv', 'Aktiv'], ['paus', 'Paus']].map(([v, t]) => `<option value="${v}" ${k.status === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`}`;
  return `
  <section>
    <a class="back" href="#${ny ? '/admin/klienter' : '/admin/klient/' + k.id}">‹ ${ny ? 'Klienter' : esc(k.barn)}</a>
    <h1>${ny ? 'Ny kund' : 'Ändra uppgifter'}</h1>
    ${ny ? `<p class="small muted">Skriv förälderns mobilnummer. Föräldern får två sms: ett där hen hämtar appen och ett med en länk som loggar in. Barnets namn och födelseår fyller föräldern i själv första gången.</p>` : ''}
    <form data-form="${ny ? 'klient-ny' : 'klient-spara'}" class="panel">
      ${ny ? `${tel}
      ${st.sms ? `<label class="toggle"><input type="checkbox" name="skicka" checked><span><b>Skicka båda sms:en direkt</b><small>Från ${esc(st.smsFran || 'CapSwe')} till numret ovan. ${st.smsIdag || 0} av ${st.smsTak || 25} sms använda i dag.</small></span></label>` : ''}
      <details class="mer-om"><summary>Mer om spelaren och föräldern (valfritt)</summary>${resten}</details>` : resten}
      <div class="btn-row two" style="margin-top:12px"><button class="btn grad" type="submit">${ny ? 'Lägg till kunden' : 'Spara'}</button><a class="btn secondary" href="#${ny ? '/admin/klienter' : '/admin/klient/' + k.id}">Avbryt</a></div>
    </form>
  </section>`;
}

/* ---------- klientsidan ---------- */

function klientSida() {
  const d = st.vald, k = d.klient;
  const kommande = d.bokningar.filter(b => b.datum >= idag());
  const tidigare = d.bokningar.filter(b => b.datum < idag());
  const obetalda = tidigare.filter(b => !b.betald && !b.paket).reverse();
  const harPass = (d.paket || []).some(p => p.kvar > 0);
  const tidRad = (b, kan) => `<li class="row bokning"><span class="grow"><b>${DAGL[b.dag]} ${fmtIso(b.datum)}</b> · ${esc(b.start)}–${esc(b.slut)}${b.plats ? ` · ${esc(b.plats)}` : ''}<div class="small muted">v. ${Number(b.v.split('-W')[1])} · bokad av ${b.av === 'haris' ? 'Haris' : 'föräldern'}</div>
    <div class="betal-rad-admin">${betalStatus(b)} ${b.paket ? `<button type="button" class="film" data-action="klient-tidpaket" data-v="${b.v}" data-slot="${b.id}">Betala styckvis i stället</button>` : `<button type="button" class="film" data-action="klient-betald" data-v="${b.v}" data-slot="${b.id}" ${b.betald ? '' : 'data-betald="1"'}>${b.betald ? 'Ångra betald' : 'Markera betald'}</button>${harPass && !b.betald && !b.swishad ? ` <button type="button" class="film" data-action="klient-tidpaket" data-v="${b.v}" data-slot="${b.id}" data-paket="1">Dra från paketet</button>` : ''}`}</div></span>${kan ? `<button class="film" data-action="klient-avboka" data-v="${b.v}" data-slot="${b.id}">Avboka</button>` : ''}</li>`;
  return `
  <section>
    <a class="back" href="#/admin/klienter">‹ Klienter</a>
    <div class="eyebrow">Klient · nivå ${k.niva} ${esc(nivaNamn(k.niva))}${k.status === 'paus' ? ' · paus' : ''}</div>
    <h1 style="margin-bottom:4px">${esc(helt(k) || 'Barnets namn saknas')}</h1>${k.barn ? '' : `<p class="small muted" style="margin:0 0 6px">Föräldern fyller i barnets namn och födelseår första gången hen loggar in.</p>`}
    <p class="muted small" style="margin:0">${esc(POS[k.position] || '')}${k.fodd ? ` · ${alder(k.fodd)} (${k.fodd})` : ''}${k.lag ? ` · ${esc(k.lag)}` : ''}<br>
      ${esc(k.foralder || 'Förälder')} · <a href="tel:${esc(k.telefon)}">${esc(visaTel(k.telefon))}</a>${k.email ? ` · <a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : ''}</p>
    <div class="btn-row two" style="margin-top:14px">
      <a class="btn grad" href="#/admin/pass/ny/${k.id}">⚽ Planera nytt pass</a>
      <a class="btn secondary" href="#/admin/klient/${k.id}/boka">📅 Boka en tid</a>
    </div>
  </section>
  <div class="admin-grid">
  <div>
  ${lankPanel(d)}
  <section class="panel">
    <div class="section-head"><h3>Nivå</h3><span class="small muted">${k.nivaHistorik?.length > 1 ? `ändrad ${k.nivaHistorik.length - 1} ${k.nivaHistorik.length === 2 ? 'gång' : 'gånger'}` : ''}</span></div>
    <div class="niva-stepper">
      <button class="btn secondary" data-action="klient-niva" data-d="-1" ${k.niva <= 1 ? 'disabled' : ''} aria-label="Sänk nivån">−</button>
      <div class="niva-tal"><b>${k.niva}</b><span>${esc(nivaNamn(k.niva))}</span></div>
      <button class="btn secondary" data-action="klient-niva" data-d="1" ${k.niva >= 5 ? 'disabled' : ''} aria-label="Höj nivån">+</button>
    </div>
    <div class="niva-skala">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= k.niva ? 'on' : ''}"></i>`).join('')}</div>
    ${k.nivaHistorik?.length > 1 ? `<p class="small muted" style="margin:10px 0 0">${k.nivaHistorik.slice(-3).reverse().map(h => `${esc(h.t.slice(0, 10))}: nivå ${h.niva}${h.kommentar ? ` (${esc(h.kommentar)})` : ''}`).join(' · ')}</p>` : ''}
  </section>
  ${paketPanel(d)}
  <section>
    <div class="section-head"><h2>Tider</h2><a class="small" href="#/admin/klient/${k.id}/boka">Boka ›</a></div>
    ${kommande.length ? `<ul class="list">${kommande.map(b => tidRad(b, true)).join('')}</ul>` : '<p class="muted small">Ingen kommande tid. Boka en åt familjen, så ser de den i appen.</p>'}
    ${obetalda.length ? `<h3 style="margin:14px 0 6px">Inte betalda</h3><ul class="list">${obetalda.map(b => tidRad(b, false)).join('')}</ul>` : ''}
    ${tidigare.length ? `<p class="small muted" style="margin-top:8px">${tidigare.length} tidigare ${tidigare.length === 1 ? 'tillfälle' : 'tillfällen'}, senast ${fmtIso(tidigare.at(-1).datum)}${tidigare.length - obetalda.length > 0 ? ` · ${tidigare.length - obetalda.length} betalda` : ''}.</p>` : ''}
  </section>
  <section>
    <div class="section-head"><h2>Pass</h2><a class="small" href="#/admin/pass/ny/${k.id}">+ Nytt ›</a></div>
    ${d.planer.length ? `<ul class="list">${d.planer.map(p => `<li class="row"><a class="grow" href="#/admin/pass/${p.id}"><b>${esc(p.titel)}</b><div class="small muted">${esc(p.datum)} · ${p.block.length} block · ${p.block.filter(b => b.klar).length} klara${p.delad ? ' · <span style="color:var(--brand)">delat</span>' : ' · inte delat'}</div></a><a class="film" href="#/admin/pass/${p.id}/kor">▶ Kör</a></li>`).join('')}</ul>` : '<p class="muted small">Inga pass än. Planera ett med samtal, moment, bedömningar och filmning.</p>'}
  </section>
  </div>
  <div>
  ${bedomningar(d)}
  ${mediaSektion(d)}
  <section class="panel">
    <form data-form="klient-ant">
      <div class="field" style="margin:0"><label for="kant2">Anteckning</label><textarea id="kant2" name="anteckning" placeholder="Styrkor, vad ni jobbar på, annat att komma ihåg…">${esc(k.anteckning || '')}</textarea></div>
      <button class="btn secondary" type="submit" style="margin-top:10px">Spara anteckningen</button>
    </form>
  </section>
  <p class="small" style="text-align:center"><a href="#/admin/klient/${k.id}/redigera">Ändra uppgifter</a> · <a data-action="klient-radera" data-id="${k.id}" href="#/admin/klient/${k.id}">Ta bort klienten</a></p>
  </div>
  </div>`;
}

// Pass och pris på barnet (Carl 2026-10-28): saldot, ett eget pris per pass ("olika barn ska kunna ha deals"),
// pass betalda utanför appen (från början och använda), paketen och historiken som föräldern också ser.
const MAN_K = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const loggLista = rader => `<ul class="logg">${rader.map(r => `<li><span class="logg-dat">${esc(fmtTid(r.t))}</span><span class="logg-text">${esc(r.text)}</span>${r.antal ? `<span class="logg-antal ${r.antal > 0 ? 'plus' : 'minus'}">${r.antal > 0 ? '+' : '−'}${Math.abs(r.antal)}</span>` : '<span></span>'}</li>`).join('')}</ul>`;
function paketPanel(d) {
  const k = d.klient, lista = (d.paket || []).slice().reverse(), mallar = d.paketMallar || [], standard = d.standardPris;
  const kvar = lista.reduce((n, p) => n + p.kvar, 0);
  const utanfor = lista.find(p => p.utanfor);
  const logg = (k.passLogg || []).slice().reverse();
  const rad = p => `<li class="row"><span class="grow"><b>${esc(p.namn)}</b> · <span class="pk-kvar">${p.kvar} av ${p.antal} kvar</span>
    ${p.antal <= 24 ? `<div class="hal" aria-hidden="true">${Array.from({ length: p.antal }, (_, i) => `<i class="${i < p.anvanda ? 'anv' : ''}"></i>`).join('')}</div>` : ''}
    <div class="small muted">${p.utanfor ? `${p.tidigare || 0} använda innan appen` : p.av === 'foralder' ? 'Köpt i appen' : 'Lagt på av dig'} · ${esc(fmtTid(p.kopt))}</div>
    <div class="betal-rad-admin">${p.utanfor ? '' : `${betalStatus({ ...p, paket: null })} <button type="button" class="film" data-action="klient-paket-betald" data-id="${p.id}" ${p.betald ? '' : 'data-betald="1"'}>${p.betald ? 'Ångra betald' : 'Markera betald'}</button> `}<button type="button" class="film" data-action="klient-paket-bort" data-id="${p.id}">Ta bort</button></div></span></li>`;
  return `
  <section class="panel ${kvar ? 'brand' : ''}" id="pass">
    <div class="section-head"><h3>Pass och pris</h3><span class="pk-kvar">${kvar} ${kvar === 1 ? 'pass' : 'pass'} kvar</span></div>
    <form data-form="klient-pris" class="rad-form">
      <label>Pris per pass för ${esc(k.barn || 'barnet')} (kr) <input type="number" name="pris" min="0" step="1" value="${k.pris || ''}" placeholder="${standard ? `standard ${standard}` : 'kr'}"></label>
      <button class="btn secondary" type="submit">Spara</button>
    </form>
    <p class="small muted" style="margin:4px 0 12px">${k.pris ? `${esc(k.barn || 'Barnet')} betalar ${esc(kr(k.pris))} per pass${standard ? ` i stället för ${esc(kr(standard))}` : ''}. Töm rutan för standardpriset.` : `Tomt = standardpriset${standard ? `, ${esc(kr(standard))}` : ''}. Skriv ett eget pris för en deal.`}</p>
    <h4 style="margin:0 0 4px">Pass betalda utanför appen</h4>
    <form data-form="klient-utanfor" class="rad-form">
      <label>Från början <input type="number" name="antal" min="0" max="500" step="1" value="${utanfor?.antal ?? ''}" placeholder="t.ex. 10"></label>
      <label>Använda <input type="number" name="tidigare" min="0" step="1" value="${utanfor?.tidigare ?? ''}" placeholder="t.ex. 3"></label>
      <button class="btn secondary" type="submit">Spara</button>
    </form>
    <p class="small muted" style="margin:4px 0 12px">T.ex. 10 pass som betalats kontant, varav 3 redan körda. Bokningarna i appen dras sedan från dem.</p>
    ${lista.length ? `<ul class="list">${lista.map(rad).join('')}</ul>` : ''}
    <form data-form="klient-paket" class="lagg-paket">
      <label class="field" style="margin:12px 0 8px">Lägg på ett paket <select name="mall">${mallar.map(m => `<option value="${m.id}">${esc(m.namn)} · ${esc(kr(m.pris))}</option>`).join('')}</select></label>
      <details class="small"><summary>Eget paket i stället</summary>
        <div class="auto-rad" style="margin-top:8px"><label>Antal pass <input type="number" name="antal" min="1" max="100" step="1"></label><label>Pris (kr) <input type="number" name="pris" min="0" step="1"></label></div>
      </details>
      <label class="check" style="margin:10px 0"><input type="checkbox" name="betald"><span>Redan betalt (Swish eller kontant)</span></label>
      <button class="btn grad block" type="submit">Lägg paketet på ${esc(k.barn || 'spelaren')}</button>
    </form>
    <details class="pass-historik" ${logg.length ? '' : 'hidden'}><summary>Historik (${logg.length})</summary>${loggLista(logg.slice(0, 40))}</details>
  </section>`;
}

// Inloggning (Carl 2026-10-26): två sms. 1 = hämta appen, 2 = länken som loggar in i appen (med koden som reserv).
// Båda kan skickas från Haris telefon (Meddelanden öppnas ifyllt, gratis) eller från servern när en sms-tjänst finns.
function lankPanel(d) {
  const k = d.klient;
  const ny = st.nyLank?.klientId === k.id ? st.nyLank : null;
  const hamtaText = ny?.hamtaText || d.hamtaText || '';
  const loggaText = ny?.loggaText ?? d.loggaText ?? '';
  const kod = ny?.kod || d.kod;
  const ii = k.inloggad || {};
  const status = ii.app ? `<span style="color:var(--ok)">Inloggad i appen ✓</span> · ${esc(fmtTid(ii.app))}` : k.senast ? `Inloggad i webbläsaren ${esc(fmtTid(ii.webb || k.senast))}, inte i appen än` : 'Har inte loggat in än';
  const logg = (k.smsLogg || []).slice(-4).reverse();
  const kvar = Math.max(0, (st.smsTak || 25) - (st.smsIdag || 0));
  const steg = (n, rubrik, text, typ, id, extra = '') => `
    <div class="sms-steg">
      <div class="sms-steg-head"><span class="sms-nr">${n}</span><b>${rubrik}</b></div>
      ${text ? `<div class="btn-row two" style="margin:8px 0 6px">
        <a class="btn ${n === 1 && !ii.app ? 'grad' : n === 2 && !ii.app ? 'grad' : 'secondary'}" href="${esc(smsLank(k.telefon, text))}">💬 Skicka från min telefon</a>
        ${st.sms ? `<button class="btn secondary" data-action="klient-lank" data-typ="${typ}" data-skicka="1" ${kvar ? '' : 'disabled title="Dagens sms är slut"'}>📤 Skicka från servern</button>` : `<button class="btn secondary" data-action="kopiera" data-el="${id}">Kopiera texten</button>`}
      </div>
      <details class="sms-text"><summary class="small">Visa sms:et</summary><div class="msg" id="${id}">${esc(text)}</div>${extra}</details>`
      : `<div class="btn-row" style="margin:8px 0 6px"><button class="btn secondary" data-action="klient-lank" data-typ="logga">🔗 Skapa inloggningslänk</button></div>`}
    </div>`;
  return `
  <section class="panel ${k.vilLank || ny ? 'brand' : ''}">
    <div class="section-head"><h3>Inloggning</h3><span class="small muted">${esc(visaTel(k.telefon))}</span></div>
    <p class="small ${k.vilLank ? '' : 'muted'}" style="margin:0 0 6px">${k.vilLank ? `⚠ Föräldern tryckte "Glömt koden" ${esc(fmtTid(k.vilLank))}. Skicka sms 2 igen.` : status}</p>
    ${ny?.sms?.skickat ? `<div class="note small">Sms:et är skickat från ${esc(st.smsFran || 'CapSwe')}.</div>` : ny?.sms?.fel && !ny.sms.av ? `<div class="note warn small">Servern kunde inte skicka sms: ${esc(ny.sms.fel)}. Skicka från telefonen i stället.</div>` : ''}
    <p class="small muted" style="margin:0 0 4px">Skicka båda till föräldern. Först hämtar hen appen, sedan trycker hen på länken i sms 2 så loggas hen in i appen.</p>
    ${steg(1, 'Hämta appen', hamtaText, 'hamta', 'smsHamta', d.hamtaLank ? `<p class="small muted" style="margin:0">Länken: ${esc(d.hamtaLank.replace(/^https?:\/\//, ''))}</p>` : '')}
    ${steg(2, 'Logga in i appen', loggaText, 'logga', 'smsLogga', kod ? `<p class="small muted" style="margin:0">Koden: <b>${esc(kod.slice(0, 3))}-${esc(kod.slice(3))}</b> · <a data-action="kopiera" data-text="${esc(ny?.lank || d.lank || '')}" href="#/admin/klient/${k.id}">kopiera länken</a> · <a data-action="klient-lank" data-typ="logga" data-ny="1" href="#/admin/klient/${k.id}">ny länk</a> (den gamla slutar gälla)</p>` : '')}
    ${st.sms ? `<p class="small muted" style="margin:6px 0 0">${kvar} av ${st.smsTak || 25} sms kvar i dag.</p>` : ''}
    ${logg.length ? `<ul class="sms-logg small">${logg.map(e => `<li>${SMS_TYP[e.typ] || e.typ} · ${esc(fmtTid(e.t))} · ${SMS_ST[e.status] || esc(e.status)}${e.fel ? ` <span class="muted">(${esc(e.fel)})</span>` : ''}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function bedomningar(d) {
  const alla = d.bedomningar || [];
  const typer = [...new Map(alla.map(b => [b.typ, b.namn])).entries()];
  const forslag = [...new Set(['Konbana', 'Slalom 5 koner', 'Skott på mål, 10 st', ...typer.map(([, n]) => n)])];
  return `
  <section>
    <div class="section-head"><h2>Bedömningar</h2><button class="btn ${st.bedForm ? 'secondary' : ''}" data-action="klient-bed-ny">${st.bedForm ? 'Stäng' : '+ Ny'}</button></div>
    ${st.bedForm ? `<form data-form="klient-bed" class="panel brand" style="margin-bottom:12px">
      <div class="field"><label for="bnamn">Vad mättes?</label><input type="text" id="bnamn" name="namn" list="bedtyper" required placeholder="T.ex. Konbana" value="${esc(typer[0]?.[1] || '')}"><datalist id="bedtyper">${forslag.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div class="field"><label for="bvarv">Tider i sekunder, en per försök</label><input type="text" id="bvarv" name="varv" required placeholder="T.ex. 33,2  31,5  30,9" inputmode="decimal"><span class="hint">Medelvärdet blir resultatet. Under passet tas tiderna med stoppuret i stället.</span></div>
      <div class="auto-rad" style="display:flex;gap:12px;flex-wrap:wrap"><label class="field" style="flex:1">Datum <input type="date" name="datum" value="${idag()}"></label></div>
      <div class="field"><label for="bkom">Kommentar</label><input type="text" id="bkom" name="kommentar" placeholder="Valfritt"></div>
      <button class="btn grad block" type="submit">Spara bedömningen</button>
    </form>` : ''}
    ${!alla.length ? '<p class="muted small">Inga bedömningar än. De tas under passet (block "Bedömning med tid") eller läggs in här.</p>'
      : typer.map(([typ, namn]) => {
        const rader = alla.filter(b => b.typ === typ).sort((a, b) => (a.datum + a.t).localeCompare(b.datum + b.t));
        const punkter = rader.map(b => ({ datum: b.datum, varde: b.medel }));
        return `<div class="panel bed-typ">
          <div class="section-head"><h3>${esc(namn)}</h3><span class="small muted">${rader.length} ${rader.length === 1 ? 'tillfälle' : 'tillfällen'}</span></div>
          ${diagram(punkter)}
          <p class="small" style="margin:6px 0 10px">${esc(sammanfattning(punkter))}</p>
          <ul class="list small">${rader.slice().reverse().map(b => `<li class="row"><span class="grow"><b>${fmtIso(b.datum)} ${b.datum.slice(0, 4)}</b> · medel <b>${fmtSek(b.medel)}</b>${b.varv.length > 1 ? ` · bäst ${fmtSek(b.bast)} · ${b.varv.map(v => fmtSek(v)).join(', ')}` : ''}${b.kommentar ? `<div class="muted">${esc(b.kommentar)}</div>` : ''}${b.mediaId ? '<div class="muted">🎥 filmad</div>' : ''}</span><button class="film" data-action="klient-bed-bort" data-bid="${b.id}">✕</button></li>`).join('')}</ul>
        </div>`;
      }).join('')}
  </section>`;
}

function mediaSektion(d) {
  const m = (d.media || []).slice().sort((a, b) => (b.t || '').localeCompare(a.t || ''));
  const lok = st.lokala || [];
  if (!m.length && !lok.length) return `<section><h2>Filmer och ljud</h2><p class="muted small">Det du filmar och spelar in under passen hamnar här, och i förälderns app under Utveckling.</p></section>`;
  return `
  <section>
    <div class="section-head"><h2>Filmer och ljud</h2>${lok.length && r2Pa() ? `<button class="btn" data-action="klient-media-upp">Ladda upp ${lok.length} väntande</button>` : ''}</div>
    ${lok.length && !r2Pa() ? `<div class="note warn small">${lok.length} ${lok.length === 1 ? 'inspelning ligger' : 'inspelningar ligger'} bara på den här enheten tills fillagringen (R2) är påslagen. Då kan de laddas upp härifrån.</div>` : ''}
    ${st.upp ? `<div class="note small">${esc(st.upp)}</div>` : ''}
    <div class="media-lista">
      ${lok.map(x => `<div class="media-item lokal" data-lokal="${x.id}"><div class="small"><b>${x.typ === 'audio' ? '🎙' : '🎥'} ${esc(x.titel || x.filnamn)}</b><div class="muted">${esc((x.t || '').slice(0, 16).replace('T', ' '))} · på den här enheten${x.storlek ? ` · ${(x.storlek / 1e6).toFixed(1)} MB` : ''}</div></div><div class="btn-row two" style="margin:8px 0 0"><button class="btn secondary" data-action="klient-media-spela" data-lokal="${x.id}" data-typ="${x.typ}">Spela upp</button><button class="film" data-action="klient-media-lokal-bort" data-lokal="${x.id}">Ta bort</button></div></div>`).join('')}
      ${m.map(x => `<div class="media-item"><div class="small"><b>${x.typ === 'audio' ? '🎙' : '🎥'} ${esc(x.titel || x.namn)}</b><div class="muted">${esc((x.t || '').slice(0, 16).replace('T', ' '))}${x.delad === false ? ' · inte delad' : ''}</div></div>
        ${x.typ === 'audio' ? `<audio controls preload="none" src="${esc(x.url)}"></audio>` : `<div class="player portrait manuell" style="max-height:46vh;margin:8px 0"><video controls playsinline preload="metadata" src="${esc(x.url)}" poster="${esc(x.poster || '')}"></video></div>`}
        <p class="small" style="margin:4px 0 0"><a data-action="klient-media-bort" data-mid="${x.id}" href="#/admin/klient/${d.id}">Ta bort</a></p></div>`).join('')}
    </div>
  </section>`;
}

/* ---------- boka åt klienten ---------- */

function mandag(v) { const [ar, w] = v.split('-W').map(Number); const j4 = new Date(ar, 0, 4); const m = new Date(j4); m.setDate(j4.getDate() - ((j4.getDay() + 6) % 7) + (w - 1) * 7); return m; }
const datumFor = (v, dag) => { const d = new Date(mandag(v)); d.setDate(d.getDate() + dag - 1); return d; };
const fmtDatum = d => `${d.getDate()} ${MAN[d.getMonth()]}`;
function veckaPlus(v, n) {
  const d = new Date(mandag(v)); d.setDate(d.getDate() + n * 7 + 3);
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const forsta = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - forsta) / 864e5 - 3 + ((forsta.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
}
async function veckorLadda() { const r = await api.admin.get('/admin/veckor'); if (r.ok) { st.veckor = r.veckor; st.nu = r.nu; if (!st.veckaVald || st.veckaVald < r.nu) st.veckaVald = r.nu; } }
function bokaVy() {
  const d = st.vald, k = d.klient;
  if (!st.veckor) { veckorLadda().then(ui.kvar()); return `<section class="panel"><p class="muted" style="margin:0">Hämtar tiderna…</p></section>`; }
  const v = st.veckaVald, w = st.veckor.find(x => x.v === v) || { v, oppen: false, slots: [] };
  const idagD = new Date(new Date().toDateString());
  let dagar = '';
  for (let dag = 1; dag <= 7; dag++) {
    const slots = w.slots.filter(x => x.dag === dag); if (!slots.length) continue;
    const datum = datumFor(v, dag), passerad = datum < idagD;
    dagar += `<div class="dag"><div class="dag-rubrik"><b>${DAGL[dag]}</b> <span class="muted small">${fmtDatum(datum)}</span></div><div class="tider">${slots.map(s => {
      const min = s.bokad?.uid === k.id, upptagen = !!s.bokad && !min, hall = !s.bokad && s.hall;
      return `<button class="tid ${min ? 'min' : upptagen ? 'upptagen' : hall ? 'haller' : ''}" ${passerad || upptagen || hall || min ? 'disabled' : ''} data-action="klient-boka" data-v="${v}" data-slot="${s.id}"><b>${esc(s.start)}–${esc(s.slut)}</b><small>${min ? `Bokad åt ${esc(k.barn)}` : upptagen ? `Upptagen · ${esc(s.bokad.barn || s.bokad.namn || '')}` : hall ? 'Någon håller platsen' : 'Ledig'}${s.plats ? ` · ${esc(s.plats)}` : ''}</small></button>`;
    }).join('')}</div></div>`;
  }
  return `
  <section>
    <a class="back" href="#/admin/klient/${k.id}">‹ ${esc(k.barn)}</a>
    <h1>Boka en tid åt ${esc(k.barn)}</h1>
    <p class="muted small">Tryck på en ledig tid. Familjen ser den direkt i appen under Träna med Haris, även om veckan inte är öppnad för andra.</p>
    <div class="vecka-nav">
      <button class="btn secondary" data-action="klient-boka-vecka" data-v="${veckaPlus(v, -1)}" ${v <= st.nu ? 'disabled' : ''}>‹</button>
      <div class="vecka-titel"><b>Vecka ${Number(v.split('-W')[1])}</b><div class="small muted">${fmtDatum(mandag(v))} – ${fmtDatum(datumFor(v, 7))} · ${w.oppen ? 'öppen' : 'stängd för föräldrarna'}</div></div>
      <button class="btn secondary" data-action="klient-boka-vecka" data-v="${veckaPlus(v, 1)}">›</button>
    </div>
    ${dagar || `<div class="panel empty"><h3>Inga tider den här veckan</h3><p class="small muted" style="margin:0">Lägg till tider under <a href="#/admin/tider">Tider</a> först.</p></div>`}
  </section>`;
}

/* ---------- händelser ---------- */

export function klienterAfterRender(view) {
  const sok = view.querySelector('#klientsok');
  if (sok) sok.addEventListener('input', () => { st.sok = sok.value; const lista = view.querySelector('.klient-lista'); const q = st.sok.trim().toLowerCase(); if (lista) { lista.innerHTML = st.klienter.filter(k => traff(k, q)).map(kort).join(''); } });
}

export async function klienterAction(action, el, e) {
  const { toast, route, go } = ui;
  const d = st.vald, k = d?.klient;
  const uppdatera = async () => { if (d) await klientLadda(d.id); st.laddat = false; };
  if (action === 'klient-niva') {
    const niva = k.niva + Number(el.dataset.d);
    const r = await api.admin.post(`/admin/klient/${k.id}/niva`, { niva });
    if (r.ok) { d.klient = r.klient; st.laddat = false; toast(`${k.barn} är nu på nivå ${niva} · ${nivaNamn(niva)}`); } else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'klient-lank') {
    e.preventDefault();
    const typ = el.dataset.typ || 'logga';
    const r = await api.admin.post(`/admin/klient/${k.id}/lank`, { typ, skicka: !!el.dataset.skicka, ny: !!el.dataset.ny });
    if (r.ok) {
      st.nyLank = { klientId: k.id, ...r }; d.klient = r.klient; d.lank = r.lank; d.kod = r.kod; d.hamtaText = r.hamtaText; d.loggaText = r.loggaText; smsRakna(r); st.laddat = false;
      const vad = typ === 'hamta' ? 'Sms 1 (hämta appen)' : 'Sms 2 (logga in)';
      toast(r.sms?.skickat ? `${vad} är skickat till ${visaTel(k.telefon)}` : r.sms?.tak ? 'Dagens sms är slut. Skicka från din telefon i stället.' : el.dataset.skicka ? `Sms:et gick inte iväg: ${r.sms?.fel || 'okänt fel'}` : el.dataset.ny ? 'Ny inloggningslänk skapad. Den gamla gäller inte längre.' : 'Inloggningslänken är skapad');
    } else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'klient-boka-vecka') { st.veckaVald = el.dataset.v; route(); return true; }
  if (action === 'klient-boka') {
    const r = await api.admin.post(`/admin/klient/${k.id}/boka`, { v: el.dataset.v, slot: el.dataset.slot });
    if (r.ok) { d.bokningar = r.bokningar; st.laddat = false; st.veckor = null; toast(`Tiden är bokad åt ${k.barn}`); go(`/admin/klient/${k.id}`); } else { toast(`Gick inte: ${r.fel}`); st.veckor = null; route(); }
    return true;
  }
  if (action === 'klient-avboka') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen'; el.classList.add('armed'); setTimeout(() => { delete el.dataset.armed; el.textContent = 'Avboka'; el.classList.remove('armed'); }, 4000); return true; }
    const r = await api.admin.post(`/admin/klient/${k.id}/avboka`, { v: el.dataset.v, slot: el.dataset.slot });
    if (r.ok) { d.bokningar = r.bokningar; st.laddat = false; toast('Avbokad'); } else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'klient-betald') {
    const betald = !!el.dataset.betald;
    const r = await api.admin.post(`/admin/vecka/${el.dataset.v}/betald`, { slot: el.dataset.slot, betald });
    if (r.ok) { const b = d.bokningar.find(x => x.v === el.dataset.v && x.id === el.dataset.slot); if (b) b.betald = betald ? new Date().toISOString() : null; st.laddat = false; ui.tiderAndrad?.(); toast(betald ? 'Markerad som betald' : 'Betalningen är ångrad'); }
    else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'klient-tidpaket') {
    const r = await api.admin.post(`/admin/klient/${k.id}/tidpaket`, { v: el.dataset.v, slot: el.dataset.slot, paket: !!el.dataset.paket });
    if (r.ok) { d.bokningar = r.bokningar; d.paket = r.paket; if (r.klient) d.klient = r.klient; st.laddat = false; ui.tiderAndrad?.(); toast(el.dataset.paket ? 'Tiden dras från paketet' : 'Tiden betalas styckvis');  } else toast(`Gick inte: ${r.fel}`);
    ritaKvar(); return true;
  }
  if (action === 'klient-paket-betald') {
    const betald = !!el.dataset.betald;
    const r = await api.admin.put(`/admin/klient/${k.id}/paket/${el.dataset.id}`, { betald });
    if (r.ok) { d.paket = r.paket; if (r.klient) d.klient = r.klient; st.laddat = false; toast(betald ? 'Paketet är markerat betalt' : 'Betalningen är ångrad');  } else toast(`Gick inte: ${r.fel}`);
    ritaKvar(); return true;
  }
  if (action === 'klient-paket-bort') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen för att ta bort'; el.classList.add('armed'); setTimeout(() => { delete el.dataset.armed; el.textContent = 'Ta bort'; el.classList.remove('armed'); }, 4000); return true; }
    const r = await api.admin.del(`/admin/klient/${k.id}/paket/${el.dataset.id}`);
    if (r.ok) { d.paket = r.paket; d.bokningar = r.bokningar; if (r.klient) d.klient = r.klient; st.laddat = false; ui.tiderAndrad?.(); toast('Paketet är borttaget. Tiderna i det betalas styckvis.');  } else toast(`Gick inte: ${r.fel}`);
    ritaKvar(); return true;
  }
  if (action === 'klient-bed-ny') { st.bedForm = !st.bedForm; route(); return true; }
  if (action === 'klient-bed-bort') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Ta bort?'; setTimeout(() => { delete el.dataset.armed; el.textContent = '✕'; }, 4000); return true; }
    const r = await api.admin.del(`/admin/klient/${k.id}/bedomning/${el.dataset.bid}`);
    if (r.ok) { d.bedomningar = r.bedomningar; st.laddat = false; toast('Bedömningen är borttagen'); } else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'klient-media-bort') {
    e.preventDefault();
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen för att ta bort'; setTimeout(() => { delete el.dataset.armed; el.textContent = 'Ta bort'; }, 4000); return true; }
    const r = await api.admin.del(`/admin/klient/${k.id}/media/${el.dataset.mid}`);
    if (r.ok) { d.media = r.media; toast('Borttagen'); } else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'klient-media-lokal-bort') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen'; setTimeout(() => { delete el.dataset.armed; el.textContent = 'Ta bort'; }, 4000); return true; }
    await taBortLokal(el.dataset.lokal); st.lokala = await vantande(k.id); toast('Borttagen från enheten'); route(); return true;
  }
  if (action === 'klient-media-spela') {
    const u = await lokalUrl(el.dataset.lokal);
    if (!u) { toast('Hittar inte filen på den här enheten'); return true; }
    const box = el.closest('.media-item');
    const m = document.createElement(el.dataset.typ === 'audio' ? 'audio' : 'video');
    m.controls = true; m.playsInline = true; m.src = u; m.autoplay = true;
    if (el.dataset.typ !== 'audio') { const w = document.createElement('div'); w.className = 'player portrait manuell'; w.style.cssText = 'max-height:46vh;margin:8px 0'; w.appendChild(m); box.appendChild(w); } else box.appendChild(m);
    el.remove(); return true;
  }
  if (action === 'klient-media-upp') {
    st.upp = 'Laddar upp…'; route();
    const r = await laddaUppVantande(k.id, (id, res) => { st.upp = res.ok ? `Uppladdad: ${id}` : `Misslyckades: ${res.fel}`; });
    st.upp = r.ok ? `${r.klara} av ${r.antal} uppladdade${r.fel.length ? `. Fel: ${r.fel.join(', ')}` : ''}` : r.fel;
    await uppdatera(); route(); return true;
  }
  if (action === 'klient-radera') {
    e.preventDefault();
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen för att ta bort klienten'; el.classList.add('armed'); setTimeout(() => { delete el.dataset.armed; el.textContent = 'Ta bort klienten'; el.classList.remove('armed'); }, 4000); return true; }
    const r = await api.admin.del(`/admin/klient/${k.id}`);
    if (r.ok) { st.vald = null; st.laddat = false; toast('Klienten är borttagen'); go('/admin/klienter'); } else toast(`Gick inte: ${r.fel}`);
    return true;
  }
  return false;
}

export async function klienterSubmit(kind, f, fd) {
  const { toast, route, go } = ui;
  const falt = () => ({ barn: fd.get('barn'), efternamn: fd.get('efternamn'), fodd: fd.get('fodd'), position: fd.get('position'), lag: fd.get('lag'), niva: +fd.get('niva') || 1, foralder: fd.get('foralder'), telefon: fd.get('telefon'), email: fd.get('email'), anteckning: fd.get('anteckning'), status: fd.get('status') });
  if (kind === 'klient-ny') {
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    const r = await api.admin.post('/admin/klient', { ...falt(), skicka: fd.get('skicka') === 'on' });
    btn.disabled = false;
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    st.nyLank = { klientId: r.klient.id, ...r }; st.laddat = false; st.vald = null; smsRakna(r);
    const vem = helt(r.klient) || r.klient.foralder || visaTel(r.klient.telefon);
    toast(r.sms?.skickat ? `${vem} är inlagd och båda sms:en skickade` : `${vem} är inlagd. Skicka sms 1 och 2 till ${r.klient.foralder || 'föräldern'} härunder.`);
    go(`/admin/klient/${r.klient.id}`); return true;
  }
  if (kind === 'klient-spara') {
    const k = st.vald.klient;
    const r = await api.admin.put(`/admin/klient/${k.id}`, falt());
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    st.vald.klient = r.klient; st.laddat = false; toast('Sparat'); go(`/admin/klient/${k.id}`); return true;
  }
  if (kind === 'klient-pris' || kind === 'klient-utanfor') {
    const k = st.vald.klient;
    const r = kind === 'klient-pris' ? await api.admin.put(`/admin/klient/${k.id}/pris`, { pris: fd.get('pris') }) : await api.admin.put(`/admin/klient/${k.id}/utanfor`, { antal: fd.get('antal'), tidigare: fd.get('tidigare') });
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    st.vald.klient = r.klient; if (r.paket) { st.vald.paket = r.paket; st.vald.bokningar = r.bokningar; } st.laddat = false; ui.tiderAndrad?.();
    toast(kind === 'klient-pris' ? (r.klient.pris ? `Eget pris sparat: ${kr(r.klient.pris)} per pass` : 'Standardpriset gäller') : 'Passen betalda utanför appen är sparade');
    ritaKvar(); return true;
  }
  if (kind === 'klient-paket') {
    const k = st.vald.klient;
    const eget = String(fd.get('antal') || '').trim() && String(fd.get('pris') ?? '').trim() !== '';
    const r = await api.admin.post(`/admin/klient/${k.id}/paket`, eget ? { antal: fd.get('antal'), pris: fd.get('pris'), betald: fd.get('betald') === 'on' } : { mall: fd.get('mall'), betald: fd.get('betald') === 'on' });
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    st.vald.paket = r.paket; st.vald.bokningar = r.bokningar; if (r.klient) st.vald.klient = r.klient; st.laddat = false; ui.tiderAndrad?.();
    const pk = r.paket.at(-1);
    toast(`${pk.namn} är lagt på ${k.barn || 'spelaren'}.${r.flyttade ? ` ${r.flyttade === 1 ? 'En bokad tid' : `${r.flyttade} bokade tider`} dras nu från paketet.` : ''}`);
    ritaKvar(); return true;
  }
  if (kind === 'klient-ant') {
    const k = st.vald.klient;
    const r = await api.admin.put(`/admin/klient/${k.id}`, { ...k, anteckning: fd.get('anteckning') });
    if (r.ok) { st.vald.klient = r.klient; toast('Anteckningen är sparad'); } else toast(`Gick inte: ${r.fel}`);
    return true;
  }
  if (kind === 'klient-bed') {
    const k = st.vald.klient;
    // "33,2 31,5 30,9" – mellanslag mellan försöken, decimalkomma eller punkt i tiderna
    const varv = String(fd.get('varv') || '').split(/[\s;]+/).map(x => parseFloat(x.replace(/,$/, '').replace(',', '.'))).filter(x => x > 0);
    if (!varv.length) { toast('Skriv minst en tid i sekunder, t.ex. 31,5'); return true; }
    const r = await api.admin.post(`/admin/klient/${k.id}/bedomning`, { namn: fd.get('namn'), varv, datum: fd.get('datum'), kommentar: fd.get('kommentar') });
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    st.vald.bedomningar = r.bedomningar; st.bedForm = false; st.laddat = false;
    toast(r.tidigare ? `${r.bedomning.namn}: ${fmtSek(r.bedomning.medel)} (förra gången ${fmtSek(r.tidigare.medel)})` : `${r.bedomning.namn}: ${fmtSek(r.bedomning.medel)} sparad`);
    route(); return true;
  }
  return false;
}
