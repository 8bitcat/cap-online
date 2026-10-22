// Admin → Tider: veckor med bokningsbara tider. Autosätt timmespass, justera, öppna veckan, duplicera.
import { api } from './api.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const DAG = ['', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

let st = { nu: null, veckor: [], mandag: {}, vald: null, laddat: false };
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
  const r = await api.admin.get('/admin/veckor');
  if (r.ok) { st.nu = r.nu; st.veckor = r.veckor; st.mandag = r.mandag; st.laddat = true; if (!st.vald || st.vald < veckaPlus(st.nu, -1)) st.vald = st.nu; }
}
const vecka = () => st.veckor.find(w => w.v === st.vald) || { v: st.vald, oppen: false, slots: [] };

export function tiderView() {
  if (!st.laddat) { tiderLadda().then(() => ui.route()); return `<section class="panel"><p class="muted" style="margin:0">Hämtar veckor…</p></section>`; }
  const w = vecka();
  const v = st.vald;
  const m = mandag(v), s = datumFor(v, 7);
  const bokade = w.slots.filter(x => x.bokad).length;
  let dagar = '';
  for (let d = 1; d <= 7; d++) {
    const slots = w.slots.filter(x => x.dag === d);
    if (!slots.length) continue;
    dagar += `<div class="dag"><div class="dag-rubrik"><b>${DAG[d]}dag</b> <span class="muted small">${fmtDatum(datumFor(v, d))}</span></div>
      <div class="list">${slots.map(x => `<div class="step slotrad" data-id="${x.id}" data-dag="${x.dag}">
        <span class="num">${x.bokad ? '●' : '○'}</span>
        <div style="display:grid;gap:6px">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input type="time" data-f="start" value="${esc(x.start)}" ${x.bokad ? 'disabled' : ''}> – <input type="time" data-f="slut" value="${esc(x.slut)}" ${x.bokad ? 'disabled' : ''}>
            <input type="text" data-f="plats" value="${esc(x.plats || '')}" placeholder="Plats" style="flex:1;min-width:120px">
          </div>
          ${x.bokad ? `<div class="small"><b>Bokad:</b> ${esc(x.bokad.barn || '')}${x.bokad.namn ? ` (${esc(x.bokad.namn)})` : ''} · ${esc(x.bokad.email || '')} <button class="film" data-action="tid-avboka" data-id="${x.id}">Avboka</button></div>` : x.hall ? '<div class="small muted">Någon håller platsen just nu.</div>' : ''}
        </div>
        <button type="button" class="film" data-action="tid-bort" data-id="${x.id}" ${x.bokad ? 'disabled title="Avboka först"' : ''}>✕</button>
      </div>`).join('')}</div></div>`;
  }
  return `
  <section>
    <div class="vecka-nav">
      <button class="btn secondary" data-action="tid-vecka" data-v="${veckaPlus(v, -1)}" ${v <= veckaPlus(st.nu, -1) ? 'disabled' : ''}>‹</button>
      <div class="vecka-titel"><b>Vecka ${Number(v.split('-W')[1])}</b><div class="small muted">${fmtDatum(m)} – ${fmtDatum(s)}${v === st.nu ? ' · denna vecka' : ''}</div></div>
      <button class="btn secondary" data-action="tid-vecka" data-v="${veckaPlus(v, 1)}">›</button>
    </div>
    <div class="panel ${w.oppen ? 'brand' : ''}" style="margin-top:12px">
      <label class="toggle" style="border:0;padding:0"><input type="checkbox" data-action="tid-oppen" ${w.oppen ? 'checked' : ''}><span><b>${w.oppen ? 'Öppen för bokning' : 'Stängd'}</b><small>${w.slots.length} tider · ${bokade} bokade. Bara öppna veckor syns för föräldrarna.</small></span></label>
    </div>
  </section>
  <section class="panel">
    <h3>Autosätt tider</h3>
    <form data-form="tid-auto" class="auto-form">
      <div class="chips">${[1, 2, 3, 4, 5, 6, 7].map(d => `<label class="chip"><input type="checkbox" name="dagar" value="${d}" ${d <= 5 ? 'checked' : ''} style="margin:0 6px 0 0;accent-color:var(--brand)">${DAG[d]}</label>`).join('')}</div>
      <div class="auto-rad">
        <label>Från <input type="time" name="start" value="16:00"></label>
        <label>Till <input type="time" name="slut" value="20:00"></label>
        <label>Längd <select name="langd"><option value="45">45 min</option><option value="60" selected>60 min</option><option value="90">90 min</option></select></label>
      </div>
      <div class="field" style="margin:8px 0"><input type="text" name="plats" placeholder="Plats, t.ex. Hisings Backa"></div>
      <button class="btn secondary block" type="submit">Lägg till lediga tider</button>
    </form>
  </section>
  <section>
    <div class="section-head"><h2>Tiderna</h2><button class="btn" data-action="tid-ny">+ Lägg till en tid</button></div>
    ${dagar || '<p class="muted">Inga tider än. Använd Autosätt eller lägg till en tid.</p>'}
    <div class="btn-row two" style="margin-top:14px">
      <button class="btn grad" data-action="tid-spara">Spara veckan</button>
      <button class="btn secondary" data-action="tid-duplicera">Duplicera till nästa vecka</button>
    </div>
    <p class="small muted">Ändrade tider och platser sparas med Spara veckan. Bokade tider går inte att flytta, avboka dem först.</p>
  </section>`;
}

function lasSlots() {
  const w = vecka();
  return $$('.slotrad').map(row => {
    const id = row.dataset.id, gammal = w.slots.find(x => x.id === id) || {};
    return { id, dag: Number(row.dataset.dag), start: row.querySelector('[data-f=start]').value || gammal.start, slut: row.querySelector('[data-f=slut]').value || gammal.slut, plats: row.querySelector('[data-f=plats]').value };
  });
}
async function sparaVecka(slots, oppen) {
  const r = await api.admin.put(`/admin/vecka/${st.vald}`, { oppen, slots });
  if (r.ok) { const i = st.veckor.findIndex(w => w.v === r.vecka.v); if (i >= 0) st.veckor[i] = r.vecka; else st.veckor.push(r.vecka); }
  return r;
}

export async function tiderAction(action, el) {
  const { toast, route } = ui;
  const w = vecka();
  if (action === 'tid-vecka') { st.vald = el.dataset.v; route(); return true; }
  if (action === 'tid-oppen') { const r = await sparaVecka(lasSlots(), el.checked); toast(r.ok ? (el.checked ? 'Veckan är öppen för bokning' : 'Veckan är stängd') : `Gick inte: ${r.fel}`); route(); return true; }
  if (action === 'tid-spara') { const r = await sparaVecka(lasSlots(), w.oppen); toast(r.ok ? 'Veckan är sparad' : `Gick inte: ${r.fel}`); route(); return true; }
  if (action === 'tid-ny') {
    const slots = lasSlots(); slots.push({ dag: 1, start: '17:00', slut: '18:00', plats: slots[0]?.plats || '' });
    const r = await sparaVecka(slots, w.oppen); if (!r.ok) toast(`Gick inte: ${r.fel}`); route(); return true;
  }
  if (action === 'tid-bort') { const slots = lasSlots().filter(x => x.id !== el.dataset.id); const r = await sparaVecka(slots, w.oppen); toast(r.ok ? 'Tiden är borttagen' : `Gick inte: ${r.fel}`); route(); return true; }
  if (action === 'tid-avboka') {
    const slots = lasSlots(); const s = w.slots.find(x => x.id === el.dataset.id); if (s) s.bokad = null;
    // bokningen ligger i serverns kopia; nollställ via en ny slot med samma tid
    const nya = slots.map(x => x.id === el.dataset.id ? { ...x, id: undefined } : x);
    const r = await sparaVecka(nya, w.oppen); toast(r.ok ? 'Avbokad' : `Gick inte: ${r.fel}`); route(); return true;
  }
  if (action === 'tid-duplicera') {
    const r = await api.admin.post(`/admin/vecka/${st.vald}/duplicera`, {});
    if (r.ok) { const i = st.veckor.findIndex(x => x.v === r.vecka.v); if (i >= 0) st.veckor[i] = r.vecka; else st.veckor.push(r.vecka); st.vald = r.vecka.v; toast(`Tiderna kopierade till vecka ${Number(r.vecka.v.split('-W')[1])} (stängd tills du öppnar den)`); }
    else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  return false;
}

export async function tiderSubmit(kind, f, fd) {
  const { toast, route } = ui;
  if (kind !== 'tid-auto') return false;
  const dagar = fd.getAll('dagar').map(Number);
  if (!dagar.length) { toast('Välj minst en dag'); return true; }
  const r = await api.admin.post(`/admin/vecka/${st.vald}/auto`, { dagar, start: fd.get('start'), slut: fd.get('slut'), langd: Number(fd.get('langd')), plats: fd.get('plats') });
  if (r.ok) { const i = st.veckor.findIndex(x => x.v === r.vecka.v); if (i >= 0) st.veckor[i] = r.vecka; else st.veckor.push(r.vecka); toast(`${r.vecka.slots.length} tider i veckan`); }
  else toast(`Gick inte: ${r.fel}`);
  route(); return true;
}
