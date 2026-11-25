// Admin → Övningar → Frågor (Carl 2026-11-25: "skapa det inne i appen"). Haris går igenom övningarna i övningsbanken
// och svarar på hur var och en ska användas: med eller inte, namn, instruktion, var den används (stigen, pass,
// biblioteket), nivåer, positioner, åldrar, fas, tid, färdigheter, utrustning, yta, klippet i filmen. Flera val på
// allt utom Ja/Nej och klippet (Carl: "man ska alltid välja fler"). Svaren sparas på servern (/admin/ovfragor) och
// läses sedan in i data/ovningsbank.json, stigen och biblioteket. Frågorna fanns först på en Claude-sida
// (docs/ovningsfragor/), men där måste Haris logga in på claude.ai för att spara.
import { api } from './api.js';
import { hamtaBank, bankNu } from './ovningsbank.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, el = document) => el.querySelector(s);

const NIVA = ['1 Bollkompis', '2 Touchmästare', '3 Dribblare', '4 Spelmotor', '5 Matchvinnare'];
const L = {
  var: ['Träna hemma (stigen)', 'Pass med Haris', 'Träna något specifikt (biblioteket)'],
  position: ['Alla', 'Målvakt', 'Back', 'Mittfältare', 'Anfallare'],
  alder: ['7–8', '9–10', '11–12', '13–14', '15–16', '17+'],
  erfarenhet: ['Nybörjare', 'Spelat 1–2 år', 'Spelat 3+ år'],
  fas: ['Uppvärmning', 'Huvuddel', 'Avslut'],
  fardighet: ['Första touch', 'Driv', 'Vändningar', 'Jonglering & bollkänsla', 'Passning insida', 'Långa tillslag', 'Avslut', 'Dribbling & finter', 'Nickar', 'Snabba fötter', 'Reaktion', 'Balans', 'Spelförståelse', 'Målvaktsspel'],
  utr: ['Boll', 'Koner', 'Mål', 'Vägg', 'Medspelare', 'Stege/häckar'],
  sallskap: ['Ensam', 'Med förälder', 'Med kompis'],
  yta: ['Liten (5×5 m)', 'Mellan (10×10 m)', 'Stor (halvplan)'],
  plats: ['Utomhus', 'Inomhus', 'Hemma'],
  typ: ['Övning', 'Tidtagning', 'Bedömning', 'Nivåprov'],
};
const GRUPPER = [
  ['Filmade moment i CAP-passet', o => !!o.film],
  ['Övningar som saknar film', o => !o.film && o.typ === 'Övning' && !/^(avslut|mall)-/.test(o.id)],
  ['Tidtagningar på stigen', o => o.typ === 'Tidtagning'],
  ['Nivåproven', o => o.typ === 'Nivåprov'],
  ['Avslut och passmallen', o => /^(avslut|mall)-/.test(o.id)],
];
const ALLMANT = [
  ['passlangd', 'Hur långt ska ett hemmapass vara, som standard?', ['20 min', '30 min', '45 min', '60 min']],
  ['filmerna', 'De fem filmerna (Uppvärmning, Första touch, Passningar, Dribblingar, Koordination). Vad är de?', ['Hela CAP-passet, 55 min', 'Smakprov ur ett längre pass', 'Annat, jag skriver nedan']],
  ['utanFilm', 'Övningar som saknar film: ska föräldrarna se dem i appen?', ['Ja, med texten och "Film kommer"', 'Nej, dölj dem tills jag filmat']],
  ['nivastyr', 'Ska nivån styra var övningen hamnar på stigen? (Nivå 1 = etapp 1 gratis, nivå 2 = Nivå 2-blocket och så vidare.)', ['Ja, så är det enklast', 'Nej, jag väljer etapp själv i Admin → Stigen']],
  ['ordning', 'Ska övningarna i stigen komma i samma ordning som du kör dem på plan?', ['Ja', 'Nej, enklast först', 'Spelar ingen roll']],
];
const MULTI = ['var', 'position', 'alder', 'erfarenhet', 'fas', 'fardighet', 'utr', 'sallskap', 'yta', 'plats', 'typ', 'niva'];

const lista = x => Array.isArray(x) ? x : (x === '' || x == null ? [] : [x]);
const nivor = v => lista(v?.niva).map(Number).filter(Boolean).sort((a, b) => a - b);
let st = { svar: {}, nya: {}, allmant: {}, hamtat: 0, hamtar: false, flik: 'lista', filter: 'alla', utkast: null, nyId: null };
let ui = null;
export function ovfInit(deps) { ui = deps; }

function hamta() {
  if (st.hamtar) return;
  st.hamtar = true;
  Promise.all([api.admin.get('/admin/ovfragor'), hamtaBank()]).then(([r]) => { if (r.ok) { st.svar = r.svar || {}; st.nya = r.nya || {}; st.allmant = r.allmant || {}; st.hamtat = Date.now(); } })
    .finally(() => { st.hamtar = false; if (/^#\/admin\/(fragor|ovningar)/.test(location.hash)) ui.route(); });
}
const ovningar = () => bankNu() || [];
const status = o => { const s = st.svar[o.id]; return !s ? '' : s.beslut === 'bort' ? 'bort' : s.beslut === 'osaker' ? 'osaker' : 'klar'; };

// förifyllt ur appen, sedan Haris svar ovanpå
function grund(o) {
  return { beslut: '', namn: o.namn, desc: o.desc, typ: [o.typ], tid: o.tid ?? '', maltid: o.maltid ?? '', niva: o.niva ? [+o.niva] : [],
    position: o.position && o.position !== 'Alla' ? [o.position] : ['Alla'], alder: [], erfarenhet: [], fas: o.fas ? [o.fas] : [],
    fardighet: [...(o.fardighet || [])], utr: [...(o.utr || [])], sallskap: [...(o.sallskap || [])], yta: o.yta ? [o.yta] : [], plats: [], var: [],
    film: '', start: o.film?.start ?? '', slut: o.film?.slut ?? '', kommentar: '' };
}
const tomNy = () => ({ beslut: 'ny', namn: '', desc: '', typ: ['Övning'], tid: '', maltid: '', niva: [], position: ['Alla'], alder: [], erfarenhet: [], fas: [], fardighet: [], utr: ['Boll'], sallskap: [], yta: [], plats: [], var: [], film: '', start: '', slut: '', kommentar: '' });
function flera(v) { for (const k of MULTI) v[k] = k === 'niva' ? nivor(v) : lista(v[k]); return v; }

// vart övningen hamnar i appen
function hamnar(v) {
  if (v.beslut === 'bort') return ['<b>Tas bort</b> ur appen när svaren läses in.'];
  const rader = [];
  if (v.var.includes('Träna hemma (stigen)')) {
    const pos = v.position.filter(p => p !== 'Alla'), n = nivor(v)[0] || 0;
    const blk = !n ? 'välj nivå' : pos.length ? `Positionsblocket (249 kr) för ${pos.join(', ').toLowerCase()}` : n === 1 ? 'Etapp 1, gratis för alla'
      : n === 2 ? 'Etapp 2, blocket Nivå 2: Passa och dribbla (129 kr)' : n === 3 ? 'Etapp 3, blocket Nivå 3: Finter och koordination (149 kr)' : `Etapp ${n}, blocket Nivå 4–5: Matchfart (199 kr)`;
    rader.push(`Stigen: <b>${esc(blk)}</b>`);
  }
  if (v.var.includes('Pass med Haris')) rader.push(`Admin → Övningar: <b>valbar när du planerar pass${nivor(v).length ? `, nivå ${nivor(v).join(', ')}` : ''}</b>`);
  if (v.var.includes('Träna något specifikt (biblioteket)')) rader.push(`Föräldrarna: <b>Träna något specifikt${v.fardighet.length ? `, under ${esc(v.fardighet[0])}` : ''}</b>`);
  return rader.length ? rader : ['Välj var den ska användas, så syns det här vart den hamnar.'];
}

const chips = (falt, val, multi, v) => `<div class="chips ovf-chips">${val.map((x, i) => {
  const varde = falt === 'niva' ? i + 1 : x;
  const on = falt === 'beslut' ? v.beslut === { 'Ja': 'ja', 'Osäker': 'osaker', 'Nej, ta bort den': 'bort' }[x] : multi ? lista(v[falt]).map(String).includes(String(varde)) : String(v[falt]) === String(x);
  return `<button type="button" class="chip ${on ? 'on' : ''}" data-falt="${falt}" data-v="${esc(varde)}" data-multi="${multi ? 1 : 0}" aria-pressed="${on}">${esc(x)}</button>`; }).join('')}</div>`;
const fraga = (rubrik, hint, inne) => `<div class="ovf-q"><b>${rubrik}</b>${hint ? `<span class="small muted">${hint}</span>` : ''}${inne}</div>`;
const FLERA = 'Välj ett eller flera.';

function falt(v, o, ny) {
  const tid = lista(v.typ).some(t => t === 'Tidtagning' || t === 'Bedömning');
  return `
  ${ny ? '' : fraga('Ska övningen vara med i appen?', '', chips('beslut', ['Ja', 'Osäker', 'Nej, ta bort den'], false, v))}
  <div class="field"><label for="ovf-namn">Namn</label><input type="text" id="ovf-namn" value="${esc(v.namn)}" placeholder="T.ex. Vändning med sulan"></div>
  <div class="field"><label for="ovf-desc">Instruktion till barnet och föräldern</label><textarea id="ovf-desc">${esc(v.desc)}</textarea></div>
  ${ny ? fraga('Vad är det för sorts övning?', FLERA, chips('typ', L.typ, true, v)) : ''}
  ${fraga('Var ska den användas?', FLERA, chips('var', L.var, true, v))}
  ${fraga('Nivå', 'Välj alla nivåer den passar för. På stigen hamnar den på den lägsta.', chips('niva', NIVA, true, v))}
  ${fraga('För vilken position?', FLERA, chips('position', L.position, true, v))}
  <div class="ovf-lands" id="ovfLands">${hamnar(v).map(r => `<span>${r}</span>`).join('')}</div>
  ${fraga('Ålder', 'Välj ett eller flera. Lämna tomt om den passar alla åldrar.', chips('alder', L.alder, true, v))}
  ${fraga('Erfarenhet', 'Lämna tomt om den passar alla.', chips('erfarenhet', L.erfarenhet, true, v))}
  ${fraga('Var i passet?', FLERA, chips('fas', L.fas, true, v))}
  <div class="field"><label for="ovf-tid">Hur lång tid tar den i ett pass? (minuter)</label><input type="number" id="ovf-tid" min="1" max="60" inputmode="numeric" value="${esc(v.tid)}"></div>
  ${tid ? `<div class="field"><label for="ovf-maltid">Måltid (sekunder) – tiden barnet ska klara</label><input type="number" id="ovf-maltid" min="1" inputmode="numeric" value="${esc(v.maltid)}"></div>` : ''}
  ${fraga('Vad tränar den?', 'Det första du väljer blir huvudfärdigheten.', chips('fardighet', L.fardighet, true, v))}
  ${fraga('Vad behövs?', FLERA, chips('utr', L.utr, true, v))}
  ${fraga('Vem tränar barnet med?', FLERA, chips('sallskap', L.sallskap, true, v))}
  ${fraga('Hur stor yta?', FLERA, chips('yta', L.yta, true, v))}
  ${fraga('Var kan man göra den?', 'Lämna tomt om det går överallt.', chips('plats', L.plats, true, v))}
  ${o?.film ? fraga('Stämmer klippet?', 'Appen hoppar till början och stannar i slutet av klippet.', `${chips('film', ['Klippet stämmer', 'Justera början eller slut'], false, v)}
    ${v.film === 'Justera början eller slut' ? `<div class="ovf-rad"><label for="ovf-start">Början</label><input type="number" id="ovf-start" min="0" step="1" value="${esc(v.start)}"><button type="button" class="film" data-satt="start">Filmens läge</button></div>
    <div class="ovf-rad"><label for="ovf-slut">Slut</label><input type="number" id="ovf-slut" min="0" step="1" value="${esc(v.slut)}"><button type="button" class="film" data-satt="slut">Filmens läge</button></div>
    <p class="small muted" style="margin:0">Pausa filmen där momentet börjar och tryck Filmens läge. Gör sedan samma sak för slutet.</p>` : ''}`)
    : fraga('Film', 'Övningen har ingen film i appen än.', chips('film', ['Jag filmar den', 'Det finns redan en film', 'Behövs ingen film'], false, v))}
  <div class="field"><label for="ovf-kommentar">Något mer Carl ska veta?</label><textarea id="ovf-kommentar" placeholder="T.ex. den här passar bara på gräs.">${esc(v.kommentar)}</textarea></div>`;
}

function huvud() {
  const ov = ovningar(), klara = ov.filter(status).length;
  const flik = (k, t) => `<a class="chip ${st.flik === k ? 'on' : ''}" href="#/admin/fragor" data-action="ovf-flik" data-flik="${k}">${t}</a>`;
  return `<section>
    <a class="back" href="#/admin/ovningar">‹ Övningar</a>
    <div class="eyebrow">Övningsbanken</div><h1 style="margin:0">Frågor om övningarna</h1>
    <p class="small muted">Gå igenom övningarna en i taget och svara. Svaren sparas direkt, och Carl läser in dem i appen.</p>
    <div class="ovf-progress"><i style="width:${ov.length ? Math.round(100 * klara / ov.length) : 0}%"></i></div>
    <p class="small" style="margin:4px 0 0"><b>${klara} av ${ov.length}</b> klara</p>
    <div class="chips">${flik('lista', 'Övningarna')}${flik('ny', '+ Ny övning')}${flik('allmant', 'Allmänna frågor')}</div>
  </section>`;
}

export function ovfView(id) {
  if (!st.hamtat || !bankNu()) { hamta(); if (!st.hamtat) return `<section class="panel"><p class="muted" style="margin:0">Hämtar frågorna…</p></section>`; }
  const ov = ovningar();
  if (id) {
    const o = ov.find(x => x.id === id);
    if (!o) return `<section><a class="back" href="#/admin/fragor">‹ Alla övningar</a><p class="muted">Övningen finns inte.</p></section>`;
    if (st.utkast?.id !== id) st.utkast = { id, v: flera({ ...grund(o), ...(st.svar[id] ? JSON.parse(JSON.stringify(st.svar[id])) : {}) }) };
    const v = st.utkast.v, i = ov.indexOf(o);
    return `<section>
      <a class="back" href="#/admin/fragor">‹ Alla övningar</a>
      <div class="eyebrow">Övning ${i + 1} av ${ov.length} · ${esc(o.kalla || o.fas || '')}</div><h1 style="margin:0">${esc(o.namn)}</h1>
    </section>
    ${o.film ? `<section><div class="player portrait manuell ovf-film"><video id="ovfVid" playsinline controls preload="metadata" poster="${esc(o.film.poster)}" src="${esc(o.film.url)}"></video></div>
      <div class="btn-row" style="justify-content:center"><button type="button" class="btn secondary" id="ovfKlipp">▶ Spela klippet ${esc(v.start)}–${esc(v.slut)} s</button></div></section>` : ''}
    <section class="panel ovf-form" id="ovfFalt" data-id="${o.id}">${falt(v, o, false)}</section>
    <section class="btn-row two ovf-knappar"><button class="btn secondary" data-action="ovf-spara">Spara</button><button class="btn grad" data-action="ovf-nasta">Spara och nästa ›</button></section>`;
  }
  if (st.flik === 'ny') {
    if (!st.utkast || st.utkast.id !== 'ny') st.utkast = { id: 'ny', v: st.nyId && st.nya[st.nyId] ? flera({ ...tomNy(), ...JSON.parse(JSON.stringify(st.nya[st.nyId])) }) : tomNy() };
    const nya = Object.entries(st.nya).sort((a, b) => String(a[1].t).localeCompare(String(b[1].t)));
    return huvud() + `<section><p class="small muted">Lägg till en övning som inte finns i appen än.</p>
      ${nya.length ? `<ul class="list">${nya.map(([nid, n]) => `<li class="row"><a class="grow" href="#/admin/fragor" data-action="ovf-nyoppna" data-id="${esc(nid)}"><b>${esc(n.namn || 'Utan namn')}</b><div class="small muted">${esc([lista(n.typ).join(', '), nivor(n).length ? `nivå ${nivor(n).join(', ')}` : '', n.tid ? `${n.tid} min` : ''].filter(Boolean).join(' · '))}</div></a><span class="small ${st.nyId === nid ? '' : 'muted'}">${st.nyId === nid ? 'Ändrar' : 'Sparad'}</span></li>`).join('')}</ul>` : ''}</section>
      <section class="panel ovf-form" id="ovfFalt" data-id="ny">${falt(st.utkast.v, null, true)}</section>
      <section class="btn-row ${st.nyId ? 'two' : ''} ovf-knappar"><button class="btn grad block" data-action="ovf-sparany">${st.nyId ? 'Spara ändringen' : 'Lägg till övningen'}</button>${st.nyId ? '<button class="btn secondary" data-action="ovf-nytom">Ny tom</button>' : ''}</section>`;
  }
  if (st.flik === 'allmant') {
    const a = st.allmant;
    return huvud() + `<section class="panel ovf-form">${ALLMANT.map(([k, f, val]) => fraga(esc(f), FLERA, `<div class="chips ovf-chips">${val.map(x => `<button type="button" class="chip ${lista(a[k]).includes(x) ? 'on' : ''}" data-action="ovf-allm" data-k="${k}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`)).join('')}
      <div class="field"><label for="ovf-mer">Något annat om övningarna eller passen?</label><textarea id="ovf-mer">${esc(a.mer || '')}</textarea></div></section>
      <section><button class="btn grad block" data-action="ovf-sparaallm">Spara svaren</button></section>`;
  }
  const passar = o => st.filter === 'alla' || (st.filter === 'kvar' ? !status(o) : !!status(o));
  let html = huvud() + `<section><div class="chips">${[['alla', 'Alla'], ['kvar', 'Kvar att svara'], ['klar', 'Klara']].map(([k, t]) => `<button class="chip ${st.filter === k ? 'on' : ''}" data-action="ovf-filter" data-f="${k}">${t}</button>`).join('')}</div>`;
  for (const [titel, test] of GRUPPER) {
    const alla = ov.filter(test), rad = alla.filter(passar);
    if (!rad.length) continue;
    html += `<div class="section-head" style="margin-top:14px"><h3 style="margin:0">${titel}</h3><span class="small muted">${alla.filter(status).length}/${alla.length}</span></div><ul class="list">`;
    html += rad.map(o => { const s = status(o), sv = st.svar[o.id];
      return `<li class="row"><a class="grow" href="#/admin/fragor/${o.id}"><b>${esc(sv?.namn || o.namn)}</b><div class="small muted">${esc([o.typ !== 'Övning' ? o.typ : '', (sv?.tid || o.tid) ? `${sv?.tid || o.tid} min` : '', nivor(sv || o).length ? `nivå ${nivor(sv || o).join(', ')}` : ''].filter(Boolean).join(' · '))}</div></a>
        <span class="ovf-pill ${s}">${s === 'klar' ? 'Klar' : s === 'bort' ? 'Ta bort' : s === 'osaker' ? 'Osäker' : 'Svara'}</span></li>`; }).join('') + '</ul>';
  }
  if (st.filter === 'kvar' && !ov.some(o => !status(o))) html += '<p class="muted">Alla övningar har svar. Tack! Titta gärna på Allmänna frågor också.</p>';
  return html + '</section>';
}

// läs textfälten in i utkastet
function lasFalt() {
  const v = st.utkast?.v; if (!v) return;
  for (const [id, k] of [['ovf-namn', 'namn'], ['ovf-desc', 'desc'], ['ovf-tid', 'tid'], ['ovf-maltid', 'maltid'], ['ovf-start', 'start'], ['ovf-slut', 'slut'], ['ovf-kommentar', 'kommentar']]) {
    const el = document.getElementById(id); if (el) v[k] = el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
  }
}
// formuläret ritas om för sig, så att filmen och skrollen ligger still
function ritaFalt() {
  const box = $('#ovfFalt'); if (!box) return;
  const o = ovningar().find(x => x.id === box.dataset.id);
  box.innerHTML = falt(st.utkast.v, o, box.dataset.id === 'ny');
  const k = $('#ovfKlipp'); if (k) k.textContent = `▶ Spela klippet ${st.utkast.v.start}–${st.utkast.v.slut} s`;
}

export function ovfAfterRender(view) {
  const box = view.querySelector('#ovfFalt');
  if (box) box.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el || !st.utkast) return;
    lasFalt();
    const v = st.utkast.v;
    if (el.dataset.satt) { const vid = $('#ovfVid'); if (vid) v[el.dataset.satt] = Math.round(vid.currentTime); ritaFalt(); return; }
    const f = el.dataset.falt; if (!f) return;
    const x = el.dataset.v;
    if (f === 'beslut') v.beslut = { 'Ja': 'ja', 'Osäker': 'osaker', 'Nej, ta bort den': 'bort' }[x] === v.beslut ? '' : { 'Ja': 'ja', 'Osäker': 'osaker', 'Nej, ta bort den': 'bort' }[x];
    else if (el.dataset.multi === '1') {
      let a = f === 'niva' ? nivor(v) : lista(v[f]);
      const t = f === 'niva' ? +x : x;
      a = a.includes(t) ? a.filter(y => y !== t) : [...a, t];
      if (f === 'niva') a.sort((p, q) => p - q);
      if (f === 'position') a = t === 'Alla' ? (a.includes('Alla') ? ['Alla'] : []) : a.filter(y => y !== 'Alla');
      v[f] = a;
    } else v[f] = v[f] === x ? '' : x;
    ritaFalt();
  });
  const vid = view.querySelector('#ovfVid');
  if (vid) {
    let stopp = null;
    const v = () => st.utkast?.v || {};
    vid.addEventListener('loadedmetadata', () => { vid.currentTime = +v().start || 0; }, { once: true });
    vid.addEventListener('timeupdate', () => { if (stopp && vid.currentTime >= stopp) { vid.pause(); stopp = null; } });
    view.querySelector('#ovfKlipp')?.addEventListener('click', () => { vid.currentTime = +v().start || 0; stopp = +v().slut || null; vid.play().catch(() => {}); });
  }
}

async function spara(sokvag, data) {
  const r = await api.admin.put(`/admin/ovfragor/${sokvag}`, data);
  if (!r.ok) ui.toast(`Gick inte att spara: ${r.fel}`);
  return r;
}

export async function ovfAction(action, el, e) {
  const { toast, route, go } = ui;
  if (action === 'ovf-flik') { e?.preventDefault?.(); lasFalt(); st.flik = el.dataset.flik; st.utkast = null; st.nyId = null; route(); window.scrollTo(0, 0); return true; }
  if (action === 'ovf-filter') { st.filter = el.dataset.f; route(); return true; }
  if (action === 'ovf-spara' || action === 'ovf-nasta') {
    lasFalt();
    const id = st.utkast.id, d = { ...st.utkast.v }; if (!d.beslut) d.beslut = 'ja';
    el.disabled = true;
    const r = await spara(`svar/${id}`, d); el.disabled = false;
    if (!r.ok) return true;
    st.svar[id] = r.data; toast('Sparat');
    const ov = ovningar(), i = ov.findIndex(o => o.id === id);
    const nasta = action === 'ovf-nasta' && (ov.slice(i + 1).find(o => !status(o)) || ov.find(o => !status(o)));
    st.utkast = null;
    go(nasta ? `/admin/fragor/${nasta.id}` : '/admin/fragor'); window.scrollTo(0, 0); return true;
  }
  if (action === 'ovf-sparany') {
    lasFalt();
    const v = st.utkast.v;
    if (!String(v.namn || '').trim()) { toast('Skriv ett namn först'); $('#ovf-namn')?.focus(); return true; }
    const fanns = !!st.nyId, id = st.nyId || ('n' + Date.now().toString(36));
    const r = await spara(`nya/${id}`, v); if (!r.ok) return true;
    st.nya[id] = r.data; st.nyId = null; st.utkast = null;
    toast(fanns ? 'Ändringen är sparad' : 'Övningen är tillagd'); route(); window.scrollTo(0, 0); return true;
  }
  if (action === 'ovf-nyoppna') { e?.preventDefault?.(); st.nyId = el.dataset.id; st.utkast = null; route(); window.scrollTo(0, 0); return true; }
  if (action === 'ovf-nytom') { st.nyId = null; st.utkast = null; route(); return true; }
  if (action === 'ovf-allm') {
    const k = el.dataset.k, x = el.dataset.v, a = lista(st.allmant[k]);
    st.allmant = { ...st.allmant, mer: $('#ovf-mer')?.value ?? st.allmant.mer, [k]: a.includes(x) ? a.filter(y => y !== x) : [...a, x] };
    route(); return true;
  }
  if (action === 'ovf-sparaallm') {
    st.allmant.mer = $('#ovf-mer')?.value || '';
    const r = await spara('allmant', st.allmant); if (r.ok) { st.allmant = r.data; toast('Svaren är sparade'); }
    return true;
  }
  return false;
}
// antal klara, för kortet under Övningar
export function ovfRaknare() {
  if (!st.hamtat) { hamta(); return null; }
  const ov = ovningar();
  return ov.length ? { klara: ov.filter(status).length, alla: ov.length } : null;
}
