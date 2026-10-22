// Admin → Stigen: listorna i prototyp 4 (drömspelare) och stegen per etapp. Sparas på servern och
// används av Träna själv. Tomma listor = appens standard (data/content.json).
import { api, filmerNu } from './api.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const TYP = { film: 'Pass ur appen', block: 'Film kommer / film från biblioteket', fraga: 'Frågetecken (text)', tid: 'Ta tid', video: 'Film till Haris', grind: 'Grind (film till Haris)' };
const POS = [['mv', 'MV'], ['back', 'Back'], ['mitt', 'Mitt'], ['anf', 'Anf']];

let st = { cfg: null, laddat: false, etapp: 1 };
let ui = null, C = null;
export function stigAdminInit(deps, content) { ui = deps; C = content; }
export const stigConfigNu = () => st.cfg;

export async function stigAdminLadda(tvinga = false) {
  if (st.laddat && !tvinga) return;
  const r = await api.get('/config/stig');
  const cfg = r.ok && r.config && (r.config.drommar?.length || r.config.etapper?.length) ? r.config : null;
  st.cfg = cfg ? { drommar: cfg.drommar.length ? cfg.drommar : JSON.parse(JSON.stringify(C.stig.drommar)), etapper: cfg.etapper.length ? cfg.etapper : JSON.parse(JSON.stringify(C.stig.etapper)) }
              : { drommar: JSON.parse(JSON.stringify(C.stig.drommar)), etapper: JSON.parse(JSON.stringify(C.stig.etapper)) };
  st.laddat = true;
}

export function stigAdminView() {
  if (!st.laddat) { stigAdminLadda().then(() => ui.route()); return `<section class="panel"><p class="muted" style="margin:0">Hämtar stigen…</p></section>`; }
  const cfg = st.cfg;
  const e = cfg.etapper.find(x => x.n === st.etapp) || cfg.etapper[0];
  const filmer = filmerNu();
  return `
  <section>
    <h2>Drömspelare</h2>
    <p class="small muted">Valen barnet får i startguiden: "Vilken spelare vill du bli?"</p>
    <div class="list" id="dromlista">${cfg.drommar.map((d, i) => `<div class="step dromrad" data-i="${i}"><span class="num"><input type="text" data-d="ikon" value="${esc(d.ikon)}" style="width:40px;text-align:center;padding:4px"></span>
      <div style="display:grid;gap:6px"><input type="text" data-d="namn" value="${esc(d.namn)}" placeholder="Namn"><input type="text" data-d="desc" value="${esc(d.desc)}" placeholder="Beskrivning"></div>
      <button type="button" class="film" data-action="stig-drom-bort" data-i="${i}">✕</button></div>`).join('')}</div>
    <p><button class="btn secondary" data-action="stig-drom-ny">+ Lägg till spelartyp</button></p>
  </section>
  <section>
    <div class="section-head"><h2>Stegen</h2><span class="small muted">${cfg.etapper.reduce((a, x) => a + x.noder.length, 0)} steg</span></div>
    <div class="chips">${cfg.etapper.map(x => `<button class="chip ${x.n === st.etapp ? 'brand on' : ''}" data-action="stig-etapp" data-n="${x.n}">Etapp ${x.n}</button>`).join('')}</div>
    <p class="small muted">Ordningen uppifrån och ner är stigen. Ett tomt block kan kopplas till en film ur biblioteket, då blir det ett riktigt steg med ▶. Position tom = alla.</p>
    <div class="list" id="nodlista" data-n="${e.n}">${e.noder.map((n, i) => `<div class="step nodrad" data-i="${i}">
      <span class="num">${i + 1}</span>
      <div style="display:grid;gap:6px">
        <select data-n="typ">${Object.entries(TYP).map(([k, t]) => `<option value="${k}" ${n.typ === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <input type="text" data-n="titel" value="${esc(n.titel)}" placeholder="Titel">
        <input type="text" data-n="desc" value="${esc(n.desc || '')}" placeholder="Beskrivning">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${POS.map(([id, t]) => `<label class="small"><input type="checkbox" data-n="pos" value="${id}" ${(n.position || []).includes(id) ? 'checked' : ''} style="accent-color:var(--brand)"> ${t}</label>`).join('')}
          <label class="small">mål <input type="number" data-n="mal" value="${n.mal || ''}" min="0" style="width:64px" placeholder="s"> s</label>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <select data-n="session" style="flex:1;min-width:140px"><option value="">Pass ur appen: inget</option>${C.sessions.map(s => `<option value="${s.id}" ${n.session === s.id ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select>
          <select data-n="filmId" style="flex:1;min-width:140px"><option value="">Film ur biblioteket: ingen</option>${filmer.map(f => `<option value="${f.id}" ${n.filmId === f.id ? 'selected' : ''}>${esc(f.titel)}</option>`).join('')}</select>
        </div>
        ${n.typ === 'fraga' ? `<textarea data-n="text" placeholder="Texten vid frågetecknet, ett stycke per rad">${esc((n.text || []).join('\n'))}</textarea>${n.modul ? `<div class="small muted">Quiz ur utbildningsvägen: ${esc(n.modul)}</div>` : ''}` : ''}
      </div>
      <div style="display:grid;gap:4px"><button type="button" class="film" data-action="stig-nod-upp" data-i="${i}">↑</button><button type="button" class="film" data-action="stig-nod-ner" data-i="${i}">↓</button><button type="button" class="film" data-action="stig-nod-bort" data-i="${i}">✕</button></div>
    </div>`).join('')}</div>
    <div class="chips" style="margin-top:10px">${Object.entries(TYP).map(([k, t]) => `<button class="chip" data-action="stig-nod-ny" data-typ="${k}">+ ${t}</button>`).join('')}</div>
    <div class="btn-row two" style="margin-top:14px"><button class="btn grad" data-action="stig-spara">Spara stigen</button><button class="btn secondary" data-action="stig-aterstall">Återställ till standard</button></div>
  </section>`;
}

function lasAllt() {
  const cfg = st.cfg;
  cfg.drommar = $$('#dromlista .dromrad').map(r => ({ id: cfg.drommar[+r.dataset.i]?.id, ikon: r.querySelector('[data-d=ikon]').value, namn: r.querySelector('[data-d=namn]').value, desc: r.querySelector('[data-d=desc]').value }));
  const e = cfg.etapper.find(x => x.n === Number($('#nodlista')?.dataset.n));
  if (e) e.noder = $$('#nodlista .nodrad').map(r => {
    const g = e.noder[+r.dataset.i] || {};
    const v = k => r.querySelector(`[data-n=${k}]`)?.value;
    const n = { ...g, typ: v('typ'), titel: v('titel'), desc: v('desc'), position: $$('[data-n=pos]:checked', r).map(x => x.value) };
    const mal = +v('mal'); if (mal) n.mal = mal; else delete n.mal;
    const s = v('session'); if (s) n.session = s; else delete n.session;
    const f = v('filmId'); if (f) n.filmId = f; else delete n.filmId;
    const t = v('text'); if (t !== undefined) n.text = t.split('\n').map(x => x.trim()).filter(Boolean);
    if (!n.position.length) delete n.position;
    if (n.typ === 'grind' && !n.krav) n.krav = 'video';
    if (n.typ !== 'grind') delete n.krav;
    return n;
  });
  return cfg;
}

export async function stigAdminAction(action, el) {
  const { toast, route } = ui;
  if (action === 'stig-etapp') { lasAllt(); st.etapp = Number(el.dataset.n); route(); return true; }
  if (action === 'stig-drom-ny') { lasAllt(); st.cfg.drommar.push({ ikon: '⭐', namn: '', desc: '' }); route(); return true; }
  if (action === 'stig-drom-bort') { lasAllt(); st.cfg.drommar.splice(+el.dataset.i, 1); route(); return true; }
  const e = () => st.cfg.etapper.find(x => x.n === st.etapp);
  if (action === 'stig-nod-ny') { lasAllt(); e().noder.push({ typ: el.dataset.typ, titel: '', desc: '' }); route(); return true; }
  if (action === 'stig-nod-bort') { lasAllt(); e().noder.splice(+el.dataset.i, 1); route(); return true; }
  if (action === 'stig-nod-upp' || action === 'stig-nod-ner') { lasAllt(); const n = e().noder, i = +el.dataset.i, j = action === 'stig-nod-upp' ? i - 1 : i + 1; if (n[j]) [n[i], n[j]] = [n[j], n[i]]; route(); return true; }
  if (action === 'stig-spara') {
    const cfg = lasAllt();
    const r = await api.admin.put('/admin/config/stig', cfg);
    if (r.ok) { st.cfg = { drommar: r.config.drommar, etapper: r.config.etapper }; toast('Stigen är sparad och gäller nu i appen'); ui.stigUppdaterad?.(st.cfg); }
    else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'stig-aterstall') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen för att återställa'; setTimeout(() => { delete el.dataset.armed; el.textContent = 'Återställ till standard'; }, 4000); return true; }
    const r = await api.admin.put('/admin/config/stig', { drommar: [], etapper: [] });
    if (r.ok) { st.laddat = false; await stigAdminLadda(true); toast('Standardstigen gäller igen'); ui.stigUppdaterad?.(null); }
    route(); return true;
  }
  return false;
}
