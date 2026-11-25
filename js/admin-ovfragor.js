// Admin → Övningar → Övningsbanken (Carl 2026-11-25: "ett ställe där Haris kan lägga upp nya och ta bort övningar likt
// artefakten och lägga till filmer till övningarna"). Haris ändrar en övning, lägger till nya, tar bort och kopplar
// filmer: välj en av filmerna som redan finns (CAP-passet, biblioteket) och sätt klippets början och slut, eller ladda
// upp en ny. Det han sparar gäller direkt överallt i admin (Övningar, planera pass, kör-läget): servern
// (/admin/ovningsbank) lägger hans övningar ovanpå data/ovningsbank.json (js/ovningsbank.js). Flera val på allt
// (Carl: "man ska alltid välja fler"). Allmänna frågor om övningarna sparas för sig (/admin/ovfragor/allmant).
import { api, laddaUppFilm } from './api.js';
import { bankNu, bankLaddaOm, bankMedAndringar, bankSatt, bankBort, grundOvning } from './ovningsbank.js';
import { kanKomprimera, filmaKomprimerat, mb } from './media.js';

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
  ['Egna övningar', o => !!o.egen],
  ['Filmade moment i CAP-passet', o => !o.egen && !!grundOvning(o.id)?.film],
  ['Övningar som saknar film i grunden', o => !o.egen && !grundOvning(o.id)?.film && (grundOvning(o.id)?.typ || o.typ) === 'Övning' && !/^(avslut|mall)-/.test(o.id)],
  ['Tidtagningar på stigen', o => !o.egen && (grundOvning(o.id)?.typ || o.typ) === 'Tidtagning'],
  ['Nivåproven', o => !o.egen && (grundOvning(o.id)?.typ || o.typ) === 'Nivåprov'],
  ['Avslut och passmallen', o => !o.egen && /^(avslut|mall)-/.test(o.id)],
];
const ALLMANT = [
  ['passlangd', 'Hur långt ska ett hemmapass vara, som standard?', ['20 min', '30 min', '45 min', '60 min']],
  ['filmerna', 'De fem filmerna (Uppvärmning, Första touch, Passningar, Dribblingar, Koordination). Vad är de?', ['Hela CAP-passet, 55 min', 'Smakprov ur ett längre pass', 'Annat, jag skriver nedan']],
  ['utanFilm', 'Övningar som saknar film: ska föräldrarna se dem i appen?', ['Ja, med texten och "Film kommer"', 'Nej, dölj dem tills jag filmat']],
  ['nivastyr', 'Ska nivån styra var övningen hamnar på stigen? (Nivå 1 = etapp 1 gratis, nivå 2 = Nivå 2-blocket och så vidare.)', ['Ja, så är det enklast', 'Nej, jag väljer etapp själv i Admin → Stigen']],
  ['ordning', 'Ska övningarna i stigen komma i samma ordning som du kör dem på plan?', ['Ja', 'Nej, enklast först', 'Spelar ingen roll']],
];

const lista = x => Array.isArray(x) ? x : (x === '' || x == null ? [] : [x]);
const nivor = v => lista(v?.niva).map(Number).filter(Boolean).sort((a, b) => a - b);
let st = { allmant: {}, hamtat: 0, hamtar: false, flik: 'lista', filter: 'alla', utkast: null, filmer: null, r2: null, laddar: null };
let ui = null;
export function ovfInit(deps) { ui = deps; }

function hamta() {
  if (st.hamtar) return;
  st.hamtar = true;
  const fore = bankNu();
  Promise.all([api.admin.get('/admin/ovfragor'), bankMedAndringar(), api.get('/')]).then(([r, , rot]) => {
    if (r.ok) st.allmant = r.allmant || {};
    st.r2 = !!rot?.r2; st.hamtat = Date.now();
  }).finally(() => { st.hamtar = false; if (location.hash.startsWith('#/admin/fragor') || (location.hash.startsWith('#/admin/ovningar') && bankNu() !== fore)) ui.route(); });
}
const ovningar = () => bankNu() || [];
const status = o => o.egen ? 'ny' : o.andrad ? 'andrad' : '';

// övningen → formulärets värden (flera val som listor)
function tillForm(o) {
  const pos = o.positioner?.length ? o.positioner : o.position && o.position !== 'Alla' ? String(o.position).split(', ') : ['Alla'];
  return { namn: o.namn || '', desc: o.desc || '', typ: o.typer?.length ? o.typer : [o.typ || 'Övning'], tid: o.tid ?? '', maltid: o.maltid ?? '',
    niva: o.nivor?.length ? o.nivor : o.niva ? [+o.niva] : [], position: pos, alder: [...(o.alder || [])], erfarenhet: [...(o.erfarenhet || [])],
    fas: o.faser?.length ? o.faser : o.fas ? [o.fas] : [], fardighet: [...(o.fardighet || [])], utr: [...(o.utr || [])], sallskap: [...(o.sallskap || [])],
    yta: o.ytor?.length ? o.ytor : o.yta ? [o.yta] : [], plats: [...(o.plats || [])], var: [...(o.var || [])], kommentar: o.kommentar || '',
    film: o.film ? { ...o.film, slut: o.film.slut ?? '' } : null, omrade: o.omrade || '', kalla: o.kalla || '', egen: !!o.egen };
}
// formuläret → det servern sparar
const tillServer = v => ({ namn: v.namn, desc: v.desc, omrade: v.omrade, kalla: v.kalla, kommentar: v.kommentar, tid: v.tid, maltid: v.maltid, film: v.film, egen: v.egen,
  var: v.var, typer: v.typ, faser: v.fas, nivor: nivor(v), positioner: v.position, ytor: v.yta, alder: v.alder, erfarenhet: v.erfarenhet,
  fardighet: v.fardighet, utr: v.utr, sallskap: v.sallskap, plats: v.plats });
const tomNy = () => ({ namn: '', desc: '', typ: ['Övning'], tid: '', maltid: '', niva: [], position: ['Alla'], alder: [], erfarenhet: [], fas: [], fardighet: [], utr: ['Boll'], sallskap: [], yta: [], plats: [], var: [], kommentar: '', film: null, omrade: '', kalla: 'Egen övning', egen: true });

// vart övningen hamnar i appen
function hamnar(v) {
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

const chips = (falt, val, v) => `<div class="chips ovf-chips">${val.map((x, i) => {
  const varde = falt === 'niva' ? i + 1 : x, on = lista(v[falt]).map(String).includes(String(varde));
  return `<button type="button" class="chip ${on ? 'on' : ''}" data-falt="${falt}" data-v="${esc(varde)}" aria-pressed="${on}">${esc(x)}</button>`; }).join('')}</div>`;
const fraga = (rubrik, hint, inne) => `<div class="ovf-q"><b>${rubrik}</b>${hint ? `<span class="small muted">${hint}</span>` : ''}${inne}</div>`;
const FLERA = 'Välj ett eller flera.';

function falt(v) {
  const tid = lista(v.typ).some(t => t === 'Tidtagning' || t === 'Bedömning');
  return `
  <div class="field"><label for="ovf-namn">Namn</label><input type="text" id="ovf-namn" value="${esc(v.namn)}" placeholder="T.ex. Vändning med sulan"></div>
  <div class="field"><label for="ovf-desc">Instruktion till barnet och föräldern</label><textarea id="ovf-desc">${esc(v.desc)}</textarea></div>
  ${fraga('Vad är det för sorts övning?', FLERA, chips('typ', L.typ, v))}
  ${fraga('Var ska den användas?', FLERA, chips('var', L.var, v))}
  ${fraga('Nivå', 'Välj alla nivåer den passar för. På stigen hamnar den på den lägsta.', chips('niva', NIVA, v))}
  ${fraga('För vilken position?', FLERA, chips('position', L.position, v))}
  <div class="ovf-lands" id="ovfLands">${hamnar(v).map(r => `<span>${r}</span>`).join('')}</div>
  ${fraga('Ålder', 'Välj ett eller flera. Lämna tomt om den passar alla åldrar.', chips('alder', L.alder, v))}
  ${fraga('Erfarenhet', 'Lämna tomt om den passar alla.', chips('erfarenhet', L.erfarenhet, v))}
  ${fraga('Var i passet?', FLERA, chips('fas', L.fas, v))}
  <div class="field"><label for="ovf-tid">Hur lång tid tar den i ett pass? (minuter)</label><input type="number" id="ovf-tid" min="1" max="60" inputmode="numeric" value="${esc(v.tid)}"></div>
  ${tid ? `<div class="field"><label for="ovf-maltid">Måltid (sekunder) – tiden barnet ska klara</label><input type="number" id="ovf-maltid" min="1" inputmode="numeric" value="${esc(v.maltid)}"></div>` : ''}
  ${fraga('Vad tränar den?', 'Det första du väljer blir huvudfärdigheten.', chips('fardighet', L.fardighet, v))}
  ${fraga('Vad behövs?', FLERA, chips('utr', L.utr, v))}
  ${fraga('Vem tränar barnet med?', FLERA, chips('sallskap', L.sallskap, v))}
  ${fraga('Hur stor yta?', FLERA, chips('yta', L.yta, v))}
  ${fraga('Var kan man göra den?', 'Lämna tomt om det går överallt.', chips('plats', L.plats, v))}
  ${v.film ? `<div class="ovf-q"><b>Klippet</b><span class="small muted">Övningen visar filmen från början till slut av klippet. Pausa filmen där momentet börjar och tryck Filmens läge, gör sedan samma sak för slutet.</span>
    <div class="ovf-rad"><label for="ovf-start">Början (s)</label><input type="number" id="ovf-start" min="0" step="1" value="${esc(v.film.start)}"><button type="button" class="film" data-satt="start">Filmens läge</button></div>
    <div class="ovf-rad"><label for="ovf-slut">Slut (s)</label><input type="number" id="ovf-slut" min="0" step="1" value="${esc(v.film.slut)}" placeholder="hela"><button type="button" class="film" data-satt="slut">Filmens läge</button></div></div>` : ''}
  <div class="field"><label for="ovf-kommentar">Egen anteckning</label><textarea id="ovf-kommentar" placeholder="T.ex. den här passar bara på gräs.">${esc(v.kommentar)}</textarea></div>`;
}

// filmerna som finns att välja: CAP-passets filmer och filmerna i biblioteket
function filmval() {
  if (!st.filmer) {
    st.filmer = [];
    api.get('/filmer').then(r => { st.filmer = [...new Map([...ovningar().filter(o => o.film?.url).map(o => [o.film.url, { namn: o.film.namn || o.namn, url: o.film.url, poster: o.film.poster || '' }]),
      ...(r?.filmer || []).filter(f => f.video?.url && /\.(mp4|mov|m4v|webm)(\?|$)|\/media\//i.test(f.video.url)).map(f => [f.video.url, { namn: f.titel, url: f.video.url, poster: f.video.poster || '' }])]).values()];
      if (location.hash.startsWith('#/admin/fragor/')) { const y = window.scrollY; ui.route(); window.scrollTo(0, y); } });
  }
  return st.filmer;
}
function filmPanel(v, id) {
  const val = filmval();
  const ladda = st.laddar ? `<div class="progress"><i style="width:${Math.round((st.laddar.andel || 0) * 100)}%"></i></div><p class="small muted" style="margin:4px 0 0">${esc(st.laddar.text)}</p>` : '';
  return `<section class="panel ovf-filmpanel">
    <div class="section-head"><h3 style="margin:0">🎥 Film</h3>${v.film ? '<button type="button" class="film" data-action="ovf-filmbort">Ta bort filmen</button>' : ''}</div>
    ${v.film ? `<div class="player portrait manuell ovf-film"><video id="ovfVid" playsinline controls preload="metadata" ${v.film.poster ? `poster="${esc(v.film.poster)}"` : ''} src="${esc(v.film.url)}"></video></div>
      <div class="btn-row" style="justify-content:center;margin-top:8px"><button type="button" class="btn secondary" id="ovfKlipp">▶ Spela klippet</button></div>
      <p class="small muted" style="text-align:center;margin:6px 0 0">${esc(v.film.namn || '')}</p>` : '<p class="small muted" style="margin:0">Övningen har ingen film än.</p>'}
    <div class="field" style="margin:12px 0 0"><label for="ovfFilmVal">${v.film ? 'Byt till en annan film' : 'Välj en film som redan finns'}</label>
      <select id="ovfFilmVal" data-action-change="ovf-filmval"><option value="">Välj film…</option>${val.map(f => `<option value="${esc(f.url)}" ${v.film?.url === f.url ? 'selected' : ''}>${esc(f.namn)}</option>`).join('')}</select></div>
    <div style="margin-top:12px"><b class="small">Eller ladda upp en ny film</b>
      ${st.r2 === false ? '<p class="small muted" style="margin:4px 0 0">Uppladdning kräver att filmlagringen är påslagen. Carl slår på den.</p>'
        : kanKomprimera() ? `<div class="btn-row two" style="margin-top:6px"><button type="button" class="btn secondary" data-action="ovf-filma" data-kalla="kamera" data-id="${esc(id)}">🎥 Filma</button><button type="button" class="btn secondary" data-action="ovf-filma" data-kalla="bibliotek" data-id="${esc(id)}">📁 Från telefonen</button></div>`
        : `<label class="btn secondary block" style="margin-top:6px" for="ovfFil">📁 Välj en film</label><input type="file" id="ovfFil" accept="video/*" hidden data-id="${esc(id)}">`}
      ${ladda}</div>
  </section>`;
}

function huvud() {
  const ov = ovningar(), andrade = ov.filter(o => status(o)).length;
  const flik = (k, t) => `<a class="chip ${st.flik === k ? 'on' : ''}" href="#/admin/fragor" data-action="ovf-flik" data-flik="${k}">${t}</a>`;
  return `<section>
    <a class="back" href="#/admin/ovningar">‹ Övningar</a>
    <div class="eyebrow">Övningsbanken</div><h1 style="margin:0">Ändra övningarna</h1>
    <p class="small muted">Ändra en övning, lägg till nya, ta bort och koppla filmer. Det du sparar gäller direkt när du planerar och kör pass.</p>
    <p class="small" style="margin:6px 0 0"><b>${ov.length}</b> övningar · ${andrade} ändrade eller nya</p>
    <div class="chips">${flik('lista', 'Övningarna')}${flik('ny', '+ Ny övning')}${flik('allmant', 'Allmänna frågor')}</div>
  </section>`;
}

export function ovfView(id) {
  if (!st.hamtat) { hamta(); return `<section class="panel"><p class="muted" style="margin:0">Hämtar övningsbanken…</p></section>`; }
  const ov = ovningar();
  if (id) {
    const o = ov.find(x => x.id === id);
    if (!o) return `<section><a class="back" href="#/admin/fragor">‹ Alla övningar</a><p class="muted">Övningen finns inte, eller är borttagen.</p></section>`;
    if (st.utkast?.id !== id) st.utkast = { id, v: tillForm(o) };
    const v = st.utkast.v, i = ov.indexOf(o);
    return `<section>
      <a class="back" href="#/admin/fragor">‹ Alla övningar</a>
      <div class="eyebrow">${o.egen ? 'Egen övning' : `Övning ${i + 1} av ${ov.length}`}${o.kalla && !o.egen ? ` · ${esc(o.kalla)}` : ''}</div><h1 style="margin:0">${esc(v.namn || o.namn)}</h1>
    </section>
    ${filmPanel(v, id)}
    <section class="panel ovf-form" id="ovfFalt" data-id="${esc(id)}">${falt(v)}</section>
    <section class="btn-row two ovf-knappar"><button class="btn secondary" data-action="ovf-spara">Spara</button><button class="btn grad" data-action="ovf-nasta">Spara och nästa ›</button></section>
    <section style="text-align:center;margin-top:8px"><button type="button" class="film" data-action="ovf-bort" data-id="${esc(id)}">🗑 Ta bort övningen</button>
      ${o.andrad && !o.egen ? `<p class="small muted" style="margin:8px 0 0"><a href="#" data-action="ovf-aterstall" data-id="${esc(id)}">Ångra mina ändringar</a> och gå tillbaka till originalet.</p>` : ''}</section>`;
  }
  if (st.flik === 'ny') {
    if (st.utkast?.id !== 'ny') st.utkast = { id: 'ny', v: tomNy() };
    return huvud() + `<section><p class="small muted">Fyll i övningen och tryck Lägg till. Sedan kan du koppla en film till den.</p></section>
      <section class="panel ovf-form" id="ovfFalt" data-id="ny">${falt(st.utkast.v)}</section>
      <section class="ovf-knappar"><button class="btn grad block" data-action="ovf-sparany">Lägg till övningen</button></section>`;
  }
  if (st.flik === 'allmant') {
    const a = st.allmant;
    return huvud() + `<section class="panel ovf-form">${ALLMANT.map(([k, f, val]) => fraga(esc(f), FLERA, `<div class="chips ovf-chips">${val.map(x => `<button type="button" class="chip ${lista(a[k]).includes(x) ? 'on' : ''}" data-action="ovf-allm" data-k="${k}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`)).join('')}
      <div class="field"><label for="ovf-mer">Något annat om övningarna eller passen?</label><textarea id="ovf-mer">${esc(a.mer || '')}</textarea></div></section>
      <section><button class="btn grad block" data-action="ovf-sparaallm">Spara svaren</button></section>`;
  }
  const passar = o => st.filter === 'alla' || (st.filter === 'kvar' ? !status(o) : !!status(o));
  let html = huvud() + `<section><div class="chips">${[['alla', 'Alla'], ['kvar', 'Inte ändrade'], ['andrade', 'Ändrade och nya']].map(([k, t]) => `<button class="chip ${st.filter === k ? 'on' : ''}" data-action="ovf-filter" data-f="${k}">${t}</button>`).join('')}</div>`;
  for (const [titel, test] of GRUPPER) {
    const alla = ov.filter(test), rad = alla.filter(passar);
    if (!rad.length) continue;
    html += `<div class="section-head" style="margin-top:14px"><h3 style="margin:0">${titel}</h3><span class="small muted">${alla.length}</span></div><ul class="list">`;
    html += rad.map(o => { const s = status(o);
      return `<li class="row"><a class="grow" href="#/admin/fragor/${o.id}"><b>${o.film ? '🎥 ' : ''}${esc(o.namn)}</b><div class="small muted">${esc([o.typ !== 'Övning' ? o.typ : '', o.tid ? `${o.tid} min` : '', nivor({ niva: o.nivor?.length ? o.nivor : o.niva }).length ? `nivå ${nivor({ niva: o.nivor?.length ? o.nivor : o.niva }).join(', ')}` : ''].filter(Boolean).join(' · '))}</div></a>
        ${s ? `<span class="ovf-pill ${s === 'ny' ? 'osaker' : 'klar'}">${s === 'ny' ? 'Ny' : 'Ändrad'}</span>` : '<span class="small muted">Ändra ›</span>'}</li>`; }).join('') + '</ul>';
  }
  return html + '</section>';
}

// läs textfälten in i utkastet
function lasFalt() {
  const v = st.utkast?.v; if (!v) return;
  for (const [id, k] of [['ovf-namn', 'namn'], ['ovf-desc', 'desc'], ['ovf-tid', 'tid'], ['ovf-maltid', 'maltid'], ['ovf-kommentar', 'kommentar']]) {
    const el = document.getElementById(id); if (el) v[k] = el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
  }
  if (v.film) for (const k of ['start', 'slut']) { const el = document.getElementById(`ovf-${k}`); if (el) v.film[k] = el.value === '' ? '' : +el.value; }
}
// formuläret ritas om för sig, så att filmen och skrollen ligger still
function ritaFalt() { const box = $('#ovfFalt'); if (box) box.innerHTML = falt(st.utkast.v); }
function ritaOm() { const y = window.scrollY; ui.route(); window.scrollTo(0, y); }

export function ovfAfterRender(view) {
  const box = view.querySelector('#ovfFalt');
  if (box) box.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el || !st.utkast) return;
    lasFalt();
    const v = st.utkast.v;
    if (el.dataset.satt) { const vid = $('#ovfVid'); if (vid && v.film) v.film[el.dataset.satt] = Math.round(vid.currentTime); ritaFalt(); return; }
    const f = el.dataset.falt; if (!f) return;
    let a = f === 'niva' ? nivor(v) : lista(v[f]);
    const t = f === 'niva' ? +el.dataset.v : el.dataset.v;
    a = a.includes(t) ? a.filter(y => y !== t) : [...a, t];
    if (f === 'niva') a.sort((p, q) => p - q);
    if (f === 'position') a = t === 'Alla' ? (a.includes('Alla') ? ['Alla'] : []) : a.filter(y => y !== 'Alla');
    v[f] = a;
    ritaFalt();
  });
  const vid = view.querySelector('#ovfVid');
  if (vid) {
    let stopp = null;
    const film = () => st.utkast?.v?.film || {};
    vid.addEventListener('loadedmetadata', () => { vid.currentTime = +film().start || 0; }, { once: true });
    vid.addEventListener('timeupdate', () => { if (stopp && vid.currentTime >= stopp) { vid.pause(); stopp = null; } });
    view.querySelector('#ovfKlipp')?.addEventListener('click', () => { lasFalt(); vid.currentTime = +film().start || 0; stopp = +film().slut || null; vid.play().catch(() => {}); });
  }
  const fil = view.querySelector('#ovfFil');
  if (fil) fil.addEventListener('change', () => laddaUpp(fil));
}

// ladda upp en film från webbläsaren (okomprimerad) eller med appen (komprimerad, app 1.4)
async function laddaUpp(input) {
  const file = input.files?.[0]; if (!file || !st.utkast) return;
  lasFalt();
  st.laddar = { andel: 0, text: `Laddar upp ${mb(file.size)}…` }; ritaOm();
  const r = await laddaUppFilm(`ov-${st.utkast.id}`, file, k => { st.laddar = { andel: k, text: `Laddar upp… ${Math.round(k * 100)} %` }; const bar = $('.ovf-filmpanel .progress i'); if (bar) bar.style.width = `${Math.round(k * 100)}%`; });
  st.laddar = null;
  if (!r.ok) { ui.toast(`Gick inte: ${r.fel}`); ritaOm(); return; }
  st.utkast.v.film = { namn: file.name.replace(/\.[^.]+$/, '').slice(0, 60), url: r.url, poster: '', start: 0, slut: '' };
  st.filmer = null; ui.toast('Filmen är uppladdad. Tryck Spara.'); ritaOm();
}

async function sparaOvning() {
  lasFalt();
  const id = st.utkast.id, v = st.utkast.v;
  if (!String(v.namn || '').trim()) { ui.toast('Skriv ett namn först'); $('#ovf-namn')?.focus(); return null; }
  const r = await api.admin.put(`/admin/ovningsbank/${id}`, tillServer(v));
  if (!r.ok) { ui.toast(`Gick inte att spara: ${r.fel}`); return null; }
  bankSatt(r.ovning);
  return r.ovning;
}

export async function ovfAction(action, el, e) {
  const { toast, route, go } = ui;
  if (action === 'ovf-flik') { e?.preventDefault?.(); lasFalt(); st.flik = el.dataset.flik; st.utkast = null; route(); window.scrollTo(0, 0); return true; }
  if (action === 'ovf-filter') { st.filter = el.dataset.f; route(); return true; }
  if (action === 'ovf-spara' || action === 'ovf-nasta') {
    el.disabled = true;
    const o = await sparaOvning(); el.disabled = false;
    if (!o) return true;
    toast('Sparat');
    const ov = ovningar(), i = ov.findIndex(x => x.id === o.id);
    const nasta = action === 'ovf-nasta' && (ov.slice(i + 1).find(x => !status(x)) || ov[i + 1]);
    st.utkast = null;
    go(nasta ? `/admin/fragor/${nasta.id}` : '/admin/fragor'); window.scrollTo(0, 0); return true;
  }
  if (action === 'ovf-sparany') {
    lasFalt();
    st.utkast.id = 'n' + Date.now().toString(36);
    const o = await sparaOvning();
    if (!o) { st.utkast.id = 'ny'; return true; }
    toast('Övningen är tillagd. Koppla gärna en film.'); st.utkast = null; st.flik = 'lista';
    go(`/admin/fragor/${o.id}`); window.scrollTo(0, 0); return true;
  }
  if (action === 'ovf-bort') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen för att ta bort övningen'; setTimeout(() => { delete el.dataset.armed; el.textContent = '🗑 Ta bort övningen'; }, 4000); return true; }
    const o = ovningar().find(x => x.id === el.dataset.id);
    const r = await api.admin.del(`/admin/ovningsbank/${el.dataset.id}${o?.egen ? '?egen=1' : ''}`);
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    bankBort(el.dataset.id); st.utkast = null; toast(`${o?.namn || 'Övningen'} är borttagen`); go('/admin/fragor'); return true;
  }
  if (action === 'ovf-aterstall') {
    e?.preventDefault?.();
    const r = await api.admin.del(`/admin/ovningsbank/${el.dataset.id}?egen=1`); // tar bara bort ändringen
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    await bankLaddaOm(); st.utkast = null; toast('Tillbaka till originalet'); route(); return true;
  }
  if (action === 'ovf-filmval') {
    lasFalt();
    const f = (st.filmer || []).find(x => x.url === el.value);
    if (f && st.utkast) { st.utkast.v.film = { namn: f.namn, url: f.url, poster: f.poster, start: 0, slut: '' }; toast('Filmen är vald. Sätt klippets början och slut, och tryck Spara.'); ritaOm(); }
    return true;
  }
  if (action === 'ovf-filmbort') { lasFalt(); if (st.utkast) st.utkast.v.film = null; ritaOm(); return true; }
  if (action === 'ovf-filma') {
    lasFalt();
    st.laddar = { andel: 0, text: 'Öppnar kameran…' }; ritaOm();
    const m = await filmaKomprimerat(el.dataset.kalla, { klientId: '', namn: `ovning-${st.utkast.id}.mp4` }, ({ steg, andel }) => {
      st.laddar = { andel, text: steg === 'laddar' ? `Laddar upp… ${Math.round(andel * 100)} %` : `Gör filmen mindre… ${Math.round(andel * 100)} %` };
      const bar = $('.ovf-filmpanel .progress i'); if (bar) bar.style.width = `${Math.round(andel * 100)}%`;
      const t = $('.ovf-filmpanel .progress + p'); if (t) t.textContent = st.laddar.text;
    });
    st.laddar = null;
    if (m.avbrutet) { ritaOm(); return true; }
    if (!m.ok || !m.url) { toast(`Gick inte: ${m.fel || 'filmen kunde inte laddas upp'}`); ritaOm(); return true; }
    st.utkast.v.film = { namn: st.utkast.v.namn || 'Film', url: m.url, poster: '', start: 0, slut: '' };
    st.filmer = null; toast(`Filmen är uppladdad (${mb(m.fore)} → ${mb(m.efter)}). Tryck Spara.`); ritaOm(); return true;
  }
  if (action === 'ovf-allm') {
    const k = el.dataset.k, x = el.dataset.v, a = lista(st.allmant[k]);
    st.allmant = { ...st.allmant, mer: $('#ovf-mer')?.value ?? st.allmant.mer, [k]: a.includes(x) ? a.filter(y => y !== x) : [...a, x] };
    ritaOm(); return true;
  }
  if (action === 'ovf-sparaallm') {
    st.allmant.mer = $('#ovf-mer')?.value || '';
    const r = await api.admin.put('/admin/ovfragor/allmant', st.allmant);
    if (r.ok) { st.allmant = r.data; toast('Svaren är sparade'); } else toast(`Gick inte: ${r.fel}`);
    return true;
  }
  return false;
}
// för kortet under Övningar
export function ovfRaknare() {
  if (!st.hamtat) { hamta(); return null; }
  const ov = ovningar();
  return ov.length ? { alla: ov.length, andrade: ov.filter(status).length } : null;
}
