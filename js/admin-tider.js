// Admin → Tider: veckor med bokningsbara tider. Autosätt timmespass, justera, öppna veckan, duplicera,
// boka en tid åt en befintlig kund (tiden blir röd i kalendern).
import { api } from './api.js';
import { lugnt } from './lugnt.js';
import { klienterNu, klienterLadda, klienterLaddade, klientGlom, visaTel } from './admin-klienter.js';
import { betalStatus, kr, visaSwish } from './swish.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const DAG = ['', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const DAGL = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']; // DAG + 'dag' gav «Tordag»
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

let st = { nu: null, veckor: [], mandag: {}, vald: null, laddat: false, nyTid: null, bokaFor: null };
let ui = null;
export function tiderInit(deps) { ui = deps; }

function mandag(v) {
  const [ar, w] = v.split('-W').map(Number);
  const j4 = new Date(ar, 0, 4);
  const m = new Date(j4); m.setDate(j4.getDate() - ((j4.getDay() + 6) % 7) + (w - 1) * 7);
  return m;
}
const datumFor = (v, dag) => { const d = new Date(mandag(v)); d.setDate(d.getDate() + dag - 1); return d; };
const fmtDatum = d => `${d.getDate()} ${MAN[d.getMonth()]}`;
function veckaPlus(v, n) {
  const d = new Date(mandag(v)); d.setDate(d.getDate() + n * 7 + 3);
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const forsta = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const vn = 1 + Math.round(((x - forsta) / 864e5 - 3 + ((forsta.getUTCDay() + 6) % 7)) / 7);
  return `${x.getUTCFullYear()}-W${String(vn).padStart(2, '0')}`;
}

export async function tiderLadda(tvinga = false) {
  if (st.laddat && !tvinga) return;
  const [r, b] = await Promise.all([api.admin.get('/admin/veckor'), api.admin.get('/admin/config/betalning')]);
  st.betalning = b.ok ? b.config : null;
  if (r.ok) { st.nu = r.nu; st.veckor = r.veckor; st.mandag = r.mandag; st.schema = r.schema || null; st.laddat = true; st.hamtat = Date.now(); if (!st.vald || st.vald < veckaPlus(st.nu, -1)) st.vald = st.nu; }
}
export const tiderGlom = () => { st.laddat = false; };
// Bokningar som föräldrarna gör ska synas direkt hos Haris (Carl 2026-11-24: "Haris måste kunna se direkt när ett pass
// blir bokat"). Anropas när en notis kommer, när appen kommer tillbaka och var 20:e sekund. Ritar bara om vid ändring.
export async function tiderUppdatera() {
  if (!st.laddat) return;
  const fore = JSON.stringify(st.veckor);
  await tiderLadda(true);
  if (JSON.stringify(st.veckor) !== fore) st.ritaOm = true; // ritas när Haris inte håller på med något
  if (st.ritaOm && /^#\/admin\/tider/.test(location.hash) && lugnt()) { st.ritaOm = false; const y = window.scrollY; ui.route(); window.scrollTo(0, y); }
}
const vecka = () => st.veckor.find(w => w.v === st.vald) || { v: st.vald, oppen: false, slots: [] };
const fmtTid = iso => new Date(iso).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const notisText = n => !n ? '' : n.ok ? (n.skickade ? ` Notis skickad till ${n.skickade} ${n.skickade === 1 ? 'telefon' : 'telefoner'}.` : ' Ingen förälder har slagit på notiser än.') : ` Notisen gick inte iväg (${n.fel}).`;
const stangdText = () => vecka().oppen ? '' : '. Den är stängd: tryck Öppna veckan för bokning så kan föräldrarna boka.';

export function tiderView() {
  if (!st.laddat) { tiderLadda().then(ui.kvar()); return `<section class="panel"><p class="muted" style="margin:0">Hämtar veckor…</p></section>`; }
  // föräldrar kan ha bokat sedan sist (t.ex. efter ⇄): hämta om i bakgrunden och rita om bara om något ändrats
  if (Date.now() - (st.hamtat || 0) > 15000) {
    const fore = JSON.stringify(st.veckor), om = ui.kvar();
    st.hamtat = Date.now();
    tiderLadda(true).then(() => { if (JSON.stringify(st.veckor) !== fore) om(); });
  }
  if (!klienterLaddade()) klienterLadda().then(ui.kvar());
  const w = vecka();
  const v = st.vald;
  const m = mandag(v), s = datumFor(v, 7);
  const bokade = w.slots.filter(x => x.bokad).length;
  let dagar = '';
  for (let d = 1; d <= 7; d++) {
    const slots = w.slots.filter(x => x.dag === d);
    if (!slots.length) continue;
    dagar += `<div class="dag"><div class="dag-rubrik"><b>${DAGL[d]}</b> <span class="muted small">${fmtDatum(datumFor(v, d))}</span></div>
      <div class="list">${slots.map(x => `<div class="step slotrad ${x.bokad ? 'bokad' : ''}" data-id="${x.id}" data-dag="${x.dag}">
        <span class="num">${x.bokad ? '●' : '○'}</span>
        <div style="display:grid;gap:6px">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input type="time" data-f="start" value="${esc(x.start)}" ${x.bokad ? 'disabled' : ''}> – <input type="time" data-f="slut" value="${esc(x.slut)}" ${x.bokad ? 'disabled' : ''}>
            <input type="text" data-f="plats" value="${esc(x.plats || '')}" placeholder="Plats" style="flex:1;min-width:120px">
          </div>
          ${x.bokad ? `<div class="small"><b style="color:var(--danger)">Bokad:</b> ${x.bokad.uid && klienterNu().some(k => k.id === x.bokad.uid) ? `<a href="#/admin/klient/${x.bokad.uid}">${esc(x.bokad.barn || '')}</a>` : esc(x.bokad.barn || '')}${x.bokad.namn ? ` (${esc(x.bokad.namn)})` : ''}${x.bokad.telefon ? ` · <a href="tel:${esc(x.bokad.telefon)}">${esc(visaTel(x.bokad.telefon))}</a>` : x.bokad.email ? ` · ${esc(x.bokad.email)}` : ''}${x.bokad.av === 'haris' ? ' · av Haris' : ''} <button class="film" data-action="tid-avboka" data-id="${x.id}">Avboka</button>
            <div class="betal-rad-admin">${betalStatus(x.bokad)}${x.bokad.paket ? '' : ` <button type="button" class="film" data-action="tid-betald" data-id="${x.id}" ${x.bokad.betald ? '' : 'data-betald="1"'}>${x.bokad.betald ? 'Ångra betald' : 'Markera betald'}</button>`}</div></div>`
          : x.hall ? '<div class="small muted">Någon håller platsen just nu.</div>'
          : st.bokaFor === x.id ? `<div class="boka-rad"><select data-boka-klient>${klienterNu().flatMap(k => [`<option value="${k.id}">${esc(k.barn)} · ${esc(k.foralder || visaTel(k.telefon))}</option>`, ...(k.syskonNamn?.length ? [`<option value="${k.id}|alla">${esc([k.barn, ...k.syskonNamn].join(' och '))} tillsammans</option>`] : [])]).join('') || '<option value="">Inga klienter än</option>'}</select><button type="button" class="btn" data-action="tid-boka-klient" data-id="${x.id}">Boka</button><button type="button" class="btn secondary" data-action="tid-boka" data-id="">Avbryt</button></div>`
          : `<div class="small"><button type="button" class="film" data-action="tid-boka" data-id="${x.id}">Boka åt en kund</button></div>`}
        </div>
        <button type="button" class="film" data-action="tid-bort" data-id="${x.id}" ${x.bokad ? 'disabled title="Avboka först"' : ''}>✕</button>
      </div>`).join('')}</div></div>`;
  }
  // Carl 2026-10-28: "tiden bokad, vi ses – var är betalflödet?" Utan pris får föräldrarna ingen Swish-knapp.
  const harPris = !!(st.betalning?.swish && st.betalning?.pris);
  const utanPris = st.betalning && !harPris;
  return `
  ${utanPris ? '<div class="note warn small">Inget pris per pass är satt. Veckor går inte att öppna förrän priset är satt, och de som redan är öppna har ingen Swish-knapp. Skriv priset i rutan för veckan här under, eller <a href="#/admin/mer">under Mer → Betalning med Swish ›</a></div>' : ''}
  <section>
    <div class="vecka-nav">
      <button class="btn secondary" data-action="tid-vecka" data-v="${veckaPlus(v, -1)}" ${v <= veckaPlus(st.nu, -1) ? 'disabled' : ''}>‹</button>
      <div class="vecka-titel"><b>Vecka ${Number(v.split('-W')[1])}</b><div class="small muted">${fmtDatum(m)} – ${fmtDatum(s)}${v === st.nu ? ' · denna vecka' : ''}</div></div>
      <button class="btn secondary" data-action="tid-vecka" data-v="${veckaPlus(v, 1)}">›</button>
    </div>
    ${w.oppen ? `<div class="panel brand" style="margin-top:12px">
      <div class="section-head" style="align-items:center"><div><b style="color:var(--ok)">✓ Öppen för bokning</b><div class="small muted">${w.slots.length} tider · ${bokade} bokade. Föräldrarna ser tiderna under Med Haris.${w.notis ? ` Senaste notisen gick ut ${esc(fmtTid(w.notis))}${w.notisAntal != null ? ` till ${w.notisAntal} ${w.notisAntal === 1 ? 'telefon' : 'telefoner'}` : ''}.` : ''}</div></div>
      <button class="film" data-action="tid-oppen" data-oppna="0">Stäng veckan</button></div>
      ${v >= st.nu && w.slots.length > bokade ? `<button class="btn secondary block" data-action="tid-notis" style="margin-top:10px">🔔 ${w.notis ? 'Skicka en ny notis om lediga tider' : 'Skicka notis om lediga tider'}</button>` : ''}
    </div>` : `<div class="panel vecka-stangd" style="margin-top:12px">
      <b>Veckan är stängd</b>
      <div class="small muted" style="margin:2px 0 ${w.slots.length ? '10px' : '0'}">${w.slots.length ? `${w.slots.length} tider, men föräldrarna ser dem inte förrän veckan är öppen.` : 'Lägg till tider här under och öppna sedan veckan.'}</div>
      ${w.slots.length ? `${harPris ? `<button class="btn grad block" data-action="tid-oppen" data-oppna="1">Öppna veckan för bokning</button>
      <p class="small muted" style="margin:8px 0 0">${esc(kr(st.betalning.pris))} per pass, betalas med Swish till ${esc(visaSwish(st.betalning.swish))}. Ändra under Mer.</p>`
      : `<div class="field" style="margin:0 0 8px"><label for="oppnaPris">Pris per pass (kr)</label><input type="number" id="oppnaPris" min="1" max="100000" step="1" inputmode="numeric" placeholder="t.ex. 300"></div>
      ${st.betalning?.swish ? '' : '<div class="field" style="margin:0 0 8px"><label for="oppnaSwish">Swish-nummer</label><input type="text" id="oppnaSwish" inputmode="numeric" placeholder="123 456 78 90"></div>'}
      <button class="btn grad block" data-action="tid-oppen" data-oppna="1">Spara priset och öppna veckan</button>
      <p class="small muted" style="margin:8px 0 0">En vecka går inte att öppna utan pris, så att föräldrarna alltid kan betala med Swish när de bokat.</p>`}
      ${w.notis ? `<p class="small muted" style="margin:8px 0 0">Notisen om veckan gick ut ${esc(fmtTid(w.notis))}. När veckan är öppen kan du skicka en ny.</p>` : v < st.nu ? '' : '<label class="check" style="margin:10px 0 0"><input type="checkbox" id="oppnaNotis" checked><span>Skicka en notis till alla föräldrar med appen</span></label>'}` : ''}
    </div>`}
  </section>
  ${schemaPanel(v, w)}
  <section>
    <div class="section-head"><h2>Tiderna</h2><button class="btn ${st.nyTid ? 'secondary' : ''}" data-action="tid-ny">${st.nyTid ? 'Stäng' : '+ Lägg till en tid'}</button></div>
    ${st.nyTid ? `<form data-form="tid-ny" class="panel brand" style="margin-bottom:14px">
      <h3 style="margin-top:0">Ny tid</h3>
      <div class="auto-rad">
        <label>Dag <select name="dag">${[1, 2, 3, 4, 5, 6, 7].map(d => `<option value="${d}" ${d === (st.nyTid.dag || 1) ? 'selected' : ''}>${DAGL[d]} ${fmtDatum(datumFor(v, d))}</option>`).join('')}</select></label>
        <label>Från <input type="time" name="start" value="${esc(st.nyTid.start || '17:00')}" required></label>
        <label>Till <input type="time" name="slut" value="${esc(st.nyTid.slut || '18:00')}" required></label>
      </div>
      <div class="field" style="margin:10px 0"><input type="text" name="plats" value="${esc(st.nyTid.plats || '')}" placeholder="Plats, t.ex. Hisings Backa"></div>
      <div class="btn-row two"><button class="btn grad" type="submit">Lägg till tiden</button><button class="btn secondary" type="button" data-action="tid-ny">Avbryt</button></div>
    </form>` : ''}
    ${dagar || '<p class="muted">Inga tider än. Använd Autosätt eller lägg till en tid.</p>'}
    <div class="btn-row two" style="margin-top:14px">
      <button class="btn grad" data-action="tid-spara">Spara veckan</button>
      <button class="btn secondary" data-action="tid-duplicera">Duplicera till nästa vecka</button>
    </div>
    <p class="small muted">Ändrade tider och platser sparas med Spara veckan. Bokade tider går inte att flytta, avboka dem först.</p>
  </section>`;
}

// Veckoschemat (Haris 2026-11-22: "det går inte att sätta olika tider för olika dagar utan alla är mellan samma
// intervall ex 14-17. Vissa dagar har jag till 18 och helger har jag endast två tider"). Varje dag har egen början
// och eget slut. Schemat sparas på servern och fylls i nästa gång, på alla Haris enheter.
const STANDARD = { schema: [1, 2, 3, 4, 5, 6, 7].map(dag => ({ dag, pa: dag <= 5, start: dag <= 5 ? '14:00' : '10:00', slut: dag <= 5 ? '17:00' : '12:00' })), langd: 60, plats: '', ersatt: true };
const tillMin = t => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + m; };
const antalPass = (start, slut, langd) => Math.max(0, Math.floor((tillMin(slut) - tillMin(start)) / langd));
const passText = n => `${n} ${n === 1 ? 'pass' : 'pass'}`;
function schemaPanel(v, w) {
  const s = st.schema || STANDARD;
  const rad = d => s.schema?.find(x => x.dag === d) || STANDARD.schema[d - 1];
  const plats = s.plats || w.slots.find(x => x.plats)?.plats || '';
  const lediga = w.slots.filter(x => !x.bokad).length;
  return `<section class="panel" id="schema">
    <h3>Veckoschema</h3>
    <p class="small muted" style="margin-top:0">Bocka i dagarna du tränar och skriv när du börjar och slutar. Varje dag kan ha egna tider. Passen läggs efter varandra, så 14–18 blir fyra pass om ett pass är 60 minuter.</p>
    <form data-form="tid-auto" class="auto-form schema-form">
      <div class="schema">${[1, 2, 3, 4, 5, 6, 7].map(d => { const r = rad(d); return `<div class="schema-rad ${r.pa ? '' : 'av'}" data-dag="${d}">
        <label class="schema-dag"><input type="checkbox" name="pa${d}" ${r.pa ? 'checked' : ''}><span><b>${DAG[d]}</b> <small class="muted">${fmtDatum(datumFor(v, d))}</small><small class="schema-antal">${r.pa ? passText(antalPass(r.start, r.slut, s.langd || 60)) : 'ledig'}</small></span></label>
        <input type="time" name="start${d}" value="${esc(r.start)}" aria-label="${DAGL[d]} från"><span class="muted">–</span><input type="time" name="slut${d}" value="${esc(r.slut)}" aria-label="${DAGL[d]} till">
      </div>`; }).join('')}</div>
      <div class="auto-rad">
        <label>Ett pass är <select name="langd">${[30, 45, 60, 75, 90, 120].map(m => `<option value="${m}" ${m === (s.langd || 60) ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
      </div>
      <div class="field" style="margin:8px 0"><input type="text" name="plats" value="${esc(plats)}" placeholder="Plats, t.ex. Hisings Backa"></div>
      <label class="check" style="margin:0 0 10px"><input type="checkbox" name="ersatt" ${s.ersatt !== false ? 'checked' : ''}><span>Ta bort veckans lediga tider först${lediga ? ` (${lediga} st)` : ''}. Bokade tider ligger alltid kvar.</span></label>
      <button class="btn secondary block" type="submit">Lägg in tiderna i vecka ${Number(v.split('-W')[1])}</button>
    </form>
  </section>`;
}
// antalet pass per dag räknas om medan Haris skriver
function schemaRakna(e) {
  const f = e.target.closest?.('.schema-form');
  if (!f) return;
  const langd = Number(f.elements.langd.value) || 60;
  for (const r of f.querySelectorAll('.schema-rad')) {
    const d = r.dataset.dag, pa = f.elements[`pa${d}`].checked;
    r.classList.toggle('av', !pa);
    r.querySelector('.schema-antal').textContent = pa ? passText(antalPass(f.elements[`start${d}`].value, f.elements[`slut${d}`].value, langd)) : 'ledig';
  }
}
document.addEventListener('input', schemaRakna);
document.addEventListener('change', schemaRakna);

function lasSlots() {
  const w = vecka();
  return $$('.slotrad').map(row => {
    const id = row.dataset.id, gammal = w.slots.find(x => x.id === id) || {};
    return { id, dag: Number(row.dataset.dag), start: row.querySelector('[data-f=start]').value || gammal.start, slut: row.querySelector('[data-f=slut]').value || gammal.slut, plats: row.querySelector('[data-f=plats]').value };
  });
}
// stående tider som bokades när veckan sparades (Haris 2026-11-26)
const staendeText = s => !s?.bokade?.length ? '' : `Stående tider bokade: ${s.bokade.join(', ')}.${s.missade?.length ? ` Kunde inte bokas: ${s.missade.join('; ')}.` : ''}`;
async function sparaVecka(slots, oppen, extra = {}) {
  const r = await api.admin.put(`/admin/vecka/${st.vald}`, { oppen, slots, ...extra });
  if (r.ok) {
    const i = st.veckor.findIndex(w => w.v === r.vecka.v); if (i >= 0) st.veckor[i] = r.vecka; else st.veckor.push(r.vecka);
    if (r.kastade) ui.toast(`${r.kastade} ${r.kastade === 1 ? 'dubblett togs' : 'dubbletter togs'} bort: tider som krockade på samma dag`);
    else if (r.staende?.bokade?.length) ui.toast(staendeText(r.staende));
  }
  return r;
}

export async function tiderAction(action, el) {
  const { toast, route } = ui;
  const w = vecka();
  if (action === 'tid-vecka') { st.vald = el.dataset.v; route(); return true; }
  // Carl 2026-10-28: "veckan är sparad men jag får inga tider" – en sparad vecka är inte öppen, det sägs nu tydligt
  if (action === 'tid-oppen') {
    const oppna = el.dataset.oppna === '1';
    // utan pris: spara priset (och Swish-numret) från rutan först, sedan öppnas veckan
    if (oppna && !(st.betalning?.swish && st.betalning?.pris)) {
      const pris = Math.round(+String(document.getElementById('oppnaPris')?.value || '').replace(',', '.'));
      if (!(pris > 0)) { toast('Skriv priset per pass först'); document.getElementById('oppnaPris')?.focus(); return true; }
      const swish = st.betalning?.swish || document.getElementById('oppnaSwish')?.value || '';
      const b = await api.admin.put('/admin/config/betalning', { swish, pris });
      if (!b.ok) { toast(`Gick inte: ${b.fel}`); return true; }
      st.betalning = b.config;
      if (!b.config.swish) { toast('Skriv Haris Swish-nummer också'); route(); return true; }
    }
    const r = await sparaVecka(lasSlots(), oppna, { notis: !!document.getElementById('oppnaNotis')?.checked });
    toast(!r.ok ? `Gick inte: ${r.fel}` : !oppna ? 'Veckan är stängd' : `Veckan är öppen för bokning.${notisText(r.notis)}`);
    route(); return true;
  }
  // Carl 2026-11-13: "skicka notis att det finns tider släppta" – även igen, t.ex. när Haris lagt till tider
  if (action === 'tid-notis') {
    if (!el.dataset.armed) { const t = el.textContent; el.dataset.armed = '1'; el.textContent = 'Tryck igen för att skicka till alla föräldrar'; el.classList.add('armed'); setTimeout(() => { delete el.dataset.armed; el.textContent = t; el.classList.remove('armed'); }, 4000); return true; }
    el.disabled = true;
    const sp = await sparaVecka(lasSlots(), w.oppen);
    if (!sp.ok) { toast(`Gick inte: ${sp.fel}`); route(); return true; }
    const r = await api.admin.post(`/admin/vecka/${st.vald}/notis`, {});
    if (r.ok) { const i = st.veckor.findIndex(x => x.v === r.vecka.v); if (i >= 0) st.veckor[i] = r.vecka; }
    toast(r.ok ? `Notisen är skickad.${notisText(r.notis)}` : `Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'tid-spara') { const r = await sparaVecka(lasSlots(), w.oppen); toast(r.ok ? `Veckan är sparad${stangdText()}` : `Gick inte: ${r.fel}`); route(); return true; }
  if (action === 'tid-ny') {
    // öppnar formuläret med ett förslag: nästa lediga timme efter sista tiden, annars måndag 17
    if (st.nyTid) { st.nyTid = null; route(); return true; }
    const slots = lasSlots();
    const sista = slots.slice().sort((a, b) => a.dag - b.dag || a.start.localeCompare(b.start)).at(-1);
    const min = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    let dag = 1, start = 17 * 60;
    if (sista) { dag = sista.dag; start = min(sista.slut); if (start + 60 > 22 * 60) { dag = Math.min(7, dag + 1); start = 17 * 60; } }
    st.nyTid = { dag, start: fmt(start), slut: fmt(Math.min(23 * 60 + 59, start + 60)), plats: sista?.plats || '' };
    route(); return true;
  }
  if (action === 'tid-bort') { const slots = lasSlots().filter(x => x.id !== el.dataset.id); const r = await sparaVecka(slots, w.oppen); toast(r.ok ? 'Tiden är borttagen' : `Gick inte: ${r.fel}`); route(); return true; }
  if (action === 'tid-boka') { st.bokaFor = el.dataset.id || null; route(); return true; }
  if (action === 'tid-betald') {
    const betald = !!el.dataset.betald;
    const r = await api.admin.post(`/admin/vecka/${st.vald}/betald`, { slot: el.dataset.id, betald });
    if (r.ok) { const i = st.veckor.findIndex(x => x.v === r.vecka.v); if (i >= 0) st.veckor[i] = r.vecka; klientGlom(); toast(betald ? 'Markerad som betald' : 'Betalningen är ångrad'); }
    else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'tid-boka-klient') {
    const sel = document.querySelector('[data-boka-klient]'); const [kid, alla] = String(sel?.value || '').split('|');
    if (!kid) { toast('Lägg in klienten under Klienter först'); return true; }
    const kl = klienterNu().find(k => k.id === kid);
    const r = await api.admin.post(`/admin/klient/${kid}/boka`, { v: st.vald, slot: el.dataset.id, barnIds: alla ? [kid, ...(kl?.syskon || [])] : undefined });
    if (r.ok) { const i = st.veckor.findIndex(x => x.v === r.vecka.v); if (i >= 0) st.veckor[i] = r.vecka; else st.veckor.push(r.vecka); st.bokaFor = null; klientGlom(); toast(`Bokad åt ${alla ? [kl?.barn, ...(kl?.syskonNamn || [])].join(' och ') : kl?.barn || 'klienten'}`); }
    else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'tid-avboka') {
    const slots = lasSlots(); const s = w.slots.find(x => x.id === el.dataset.id); if (s) s.bokad = null;
    // bokningen ligger i serverns kopia; nollställ via en ny slot med samma tid
    const nya = slots.map(x => x.id === el.dataset.id ? { ...x, id: undefined } : x);
    const r = await sparaVecka(nya, w.oppen); klientGlom(); toast(r.ok ? 'Avbokad' : `Gick inte: ${r.fel}`); route(); return true;
  }
  if (action === 'tid-duplicera') {
    const r = await api.admin.post(`/admin/vecka/${st.vald}/duplicera`, {});
    if (r.ok) { const i = st.veckor.findIndex(x => x.v === r.vecka.v); if (i >= 0) st.veckor[i] = r.vecka; else st.veckor.push(r.vecka); st.vald = r.vecka.v; toast(`Tiderna kopierade till vecka ${Number(r.vecka.v.split('-W')[1])} (stängd tills du öppnar den). ${staendeText(r.staende)}`.trim()); }
    else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  return false;
}

export async function tiderSubmit(kind, f, fd) {
  const { toast, route } = ui;
  if (kind === 'tid-ny') {
    const w = vecka();
    const ny = { dag: Number(fd.get('dag')), start: fd.get('start'), slut: fd.get('slut'), plats: fd.get('plats') };
    const min = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    if (min(ny.slut) <= min(ny.start)) { toast('Sluttiden måste vara efter starttiden'); return true; }
    const krock = w.slots.find(x => x.dag === ny.dag && min(ny.start) < min(x.slut) && min(ny.slut) > min(x.start));
    if (krock) { toast(`Krockar med ${krock.start}–${krock.slut} samma dag`); return true; }
    const r = await sparaVecka([...lasSlots(), ny], w.oppen);
    if (r.ok) { st.nyTid = null; toast(`Tillagd: ${DAGL[ny.dag]} ${ny.start}–${ny.slut}${stangdText()}`); } else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (kind !== 'tid-auto') return false;
  const langd = Number(fd.get('langd')) || 60, ersatt = fd.get('ersatt') === 'on';
  const schema = [1, 2, 3, 4, 5, 6, 7].map(dag => ({ dag, pa: fd.get(`pa${dag}`) === 'on', start: fd.get(`start${dag}`) || '', slut: fd.get(`slut${dag}`) || '' }));
  const pa = schema.filter(x => x.pa);
  if (!pa.length && !ersatt) { toast('Bocka i minst en dag'); return true; }
  const fel = pa.find(x => !x.start || !x.slut || antalPass(x.start, x.slut, langd) < 1);
  if (fel) { toast(`${DAGL[fel.dag]}: sluttiden måste vara minst ${langd} min efter starten`); return true; }
  // att ersätta lediga tider i en vecka kräver ett andra tryck, så att inget försvinner av misstag
  const lediga = vecka().slots.filter(x => !x.bokad).length;
  const knapp = f.querySelector('button[type=submit]');
  if (ersatt && lediga && !knapp.dataset.armed) {
    const t = knapp.textContent; knapp.dataset.armed = '1'; knapp.classList.add('armed');
    knapp.textContent = `Tryck igen: ${lediga} lediga tider byts mot schemat`;
    setTimeout(() => { delete knapp.dataset.armed; knapp.textContent = t; knapp.classList.remove('armed'); }, 5000);
    return true;
  }
  const r = await api.admin.post(`/admin/vecka/${st.vald}/auto`, { schema, langd, plats: fd.get('plats'), ersatt });
  if (r.ok) {
    st.schema = { schema, langd, plats: fd.get('plats'), ersatt };
    const i = st.veckor.findIndex(x => x.v === r.vecka.v); if (i >= 0) st.veckor[i] = r.vecka; else st.veckor.push(r.vecka);
    toast(`${r.nya} ${r.nya === 1 ? 'tid' : 'tider'} inlagda${r.bort ? `, ${r.bort} gamla borttagna` : ''}. Veckan har ${r.vecka.slots.length} tider${stangdText()} ${staendeText(r.staende)}`.trim());
  } else toast(`Gick inte: ${r.fel}`);
  route(); return true;
}
