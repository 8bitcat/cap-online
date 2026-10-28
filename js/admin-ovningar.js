// Admin → Övningar (Carl 2026-10-28: "lägg också till övningsbanken så att Haris kan se den i appen och planera
// upp ett pass"). Haris söker och filtrerar bland övningarna, ser filmklippet, väljer övningar och gör ett pass av
// dem åt en klient. Kommer han från ett pass (knappen Ur övningsbanken) läggs de valda i det passet i stället.
import { hamtaBank, bankNu, blockAv, malNu, sattMal, klippHtml, kopplaKlipp } from './ovningsbank.js?v=34b2e5f';
import { klienterNu, klienterLadda, klienterLaddade } from './admin-klienter.js?v=34b2e5f';
import { passMedOvningar, passLaggTill } from './admin-pass.js?v=34b2e5f';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const FASER = ['Uppvärmning', 'Huvuddel', 'Avslut'];
const TYPER = ['Övning', 'Tidtagning', 'Bedömning', 'Nivåprov'];

let st = { sok: '', fas: '', typ: '', niva: 0, film: false, valda: [], oppen: null, kid: '' };
let ui = null;
export function ovningarInit(deps) { ui = deps; }

const malTillbaka = m => m.passId ? `/admin/pass/${m.passId}` : `/admin/pass/ny${m.uid ? '/' + m.uid : ''}`;
const minuter = valda => valda.reduce((n, o) => n + (o.tid || 5), 0);

function traffar(bank) {
  const q = st.sok.trim().toLowerCase();
  return bank.filter(o => (!st.fas || o.fas === st.fas) && (!st.typ || o.typ === st.typ) && (!st.niva || o.niva === st.niva) && (!st.film || o.film)
    && (!q || [o.namn, o.desc, o.omrade, o.position, ...o.fardighet, ...o.utr].some(x => String(x || '').toLowerCase().includes(q))));
}

export function ovningarView() {
  const bank = bankNu();
  if (!bank) { hamtaBank().then(ui.kvar()); return `<section class="panel"><p class="muted" style="margin:0">Hämtar övningarna…</p></section>`; }
  if (!klienterLaddade()) klienterLadda().then(() => { if (location.hash === '#/admin/ovningar') ui.route(); });
  const mal = malNu();
  return `
  ${mal ? `<div class="note small">Du väljer övningar till passet <b>${esc(mal.titel || 'Nytt pass')}</b>${mal.barn ? ` för ${esc(mal.barn)}` : ''}. <a href="#${malTillbaka(mal)}" data-action="ov-avbryt">Tillbaka till passet</a> · <a href="#/admin/ovningar" data-action="ov-glom">välj fritt i stället</a></div>` : ''}
  <section>
    <p class="small muted">${bank.length} övningar: CAP-passets moment med filmklipp, stigens övningar och tidtagningar, nivåproven och avsluten. Välj de du vill ha och tryck Planera pass.</p>
    <input type="search" id="ovsok" placeholder="Sök övning, färdighet eller utrustning" value="${esc(st.sok)}" autocomplete="off">
  </section>
  <div id="ovyta">${yta(bank, mal)}</div>`;
}

// Filter, lista och raden med valda. Ritas om på plats när Haris väljer, så att sidan inte hoppar upp.
function yta(bank, mal) {
  const lista = traffar(bank);
  const chip = (falt, v, text) => `<button type="button" class="chip ${st[falt] === v ? 'brand on' : ''}" data-action="ov-filter" data-falt="${falt}" data-v="${esc(v)}">${esc(text)}</button>`;
  return `
  <div class="chips ov-filter">${FASER.map(f => chip('fas', f, f)).join('')}${TYPER.map(t => chip('typ', t, t)).join('')}</div>
  <div class="chips ov-filter">${[1, 2, 3, 4, 5].map(n => chip('niva', n, `Nivå ${n}`)).join('')}${chip('film', true, '🎥 Med film')}</div>
  <p class="small muted" style="margin:4px 0 8px">${lista.length === bank.length ? `Alla ${bank.length}` : `${lista.length} av ${bank.length}`}${st.fas || st.typ || st.niva || st.film || st.sok ? ` · <a href="#/admin/ovningar" data-action="ov-nollstall">visa alla</a>` : ''}</p>
  <div class="ov-lista">${lista.map(kort).join('') || '<p class="muted">Ingen övning passar. Ta bort ett filter.</p>'}</div>
  ${valdRad(bank, mal)}`;
}

function kort(o) {
  const vald = st.valda.includes(o.id);
  const meta = [o.typ !== 'Övning' ? o.typ : '', o.tid ? `${o.tid} min` : '', o.maltid ? `mål ${o.maltid} s` : '', o.fas, o.omrade, o.niva ? `nivå ${o.niva}` : '', o.position !== 'Alla' ? o.position : ''].filter(Boolean);
  return `<div class="ov-kort ${vald ? 'vald' : ''}">
    <div class="ov-topp">
      <div class="grow"><b>${esc(o.namn)}</b><div class="small muted">${esc(meta.join(' · '))}</div></div>
      <button type="button" class="btn ${vald ? 'grad' : 'secondary'} ov-valj" data-action="ov-valj" data-id="${o.id}" aria-pressed="${vald}">${vald ? '✓ Vald' : '+ Välj'}</button>
    </div>
    <p class="small" style="margin:6px 0 0">${esc(o.desc)}</p>
    ${o.fardighet.length || o.utr.length ? `<div class="ov-taggar">${o.fardighet.map(f => `<span class="chip">${esc(f)}</span>`).join('')}${o.utr.length ? `<span class="small muted">Behövs: ${esc(o.utr.join(', ').toLowerCase())}</span>` : ''}</div>` : ''}
    ${o.film ? (st.oppen === o.id ? klippHtml(o) : `<button type="button" class="film" style="margin-top:8px" data-action="ov-film" data-id="${o.id}">▶ Filmklippet, ${o.film.slut - o.film.start} s ur ${esc(o.film.namn)}</button>`) : ''}
  </div>`;
}

function valdRad(bank, mal) {
  if (!st.valda.length) return '';
  const valda = st.valda.map(id => bank.find(o => o.id === id)).filter(Boolean);
  const text = `<b>${valda.length} ${valda.length === 1 ? 'vald övning' : 'valda övningar'}</b> · ca ${minuter(valda)} min · <a href="#/admin/ovningar" data-action="ov-rensa">rensa</a>`;
  if (mal) return `<div class="ov-bar"><div class="small">${text}</div><button class="btn grad block" style="margin-top:8px" data-action="ov-lagg">Lägg i passet ›</button></div>`;
  const kl = klienterNu();
  if (!st.kid || !kl.some(k => k.id === st.kid)) st.kid = kl[0]?.id || '';
  return `<div class="ov-bar">
    <div class="small">${text}</div>
    <div class="ov-bar-rad">
      <select id="ovkid" aria-label="Spelare">${kl.map(k => `<option value="${k.id}" ${st.kid === k.id ? 'selected' : ''}>${esc([k.barn, k.efternamn].filter(Boolean).join(' ') || k.foralder || '?')}</option>`).join('') || '<option value="">Inga klienter än</option>'}</select>
      <button class="btn grad" data-action="ov-planera">Planera pass ›</button>
    </div>
  </div>`;
}

function ritaOm() {
  const el = $('#ovyta'); if (!el || !bankNu()) return;
  el.innerHTML = yta(bankNu(), malNu());
  koppla(el);
}
function koppla(el) {
  el.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', ui.onAction));
  const kid = $('#ovkid', el); if (kid) kid.addEventListener('change', () => { st.kid = kid.value; });
  kopplaKlipp(el);
}
export function ovningarAfterRender(view) {
  const sok = $('#ovsok', view); if (!sok) return;
  sok.addEventListener('input', () => { st.sok = sok.value; ritaOm(); });
  const el = $('#ovyta', view);
  const kid = $('#ovkid', el); if (kid) kid.addEventListener('change', () => { st.kid = kid.value; });
}

export async function ovningarAction(action, el, e) {
  const { toast, go } = ui;
  if (action === 'ov-filter') {
    const v = el.dataset.falt === 'niva' ? Number(el.dataset.v) : el.dataset.falt === 'film' ? true : el.dataset.v;
    st[el.dataset.falt] = st[el.dataset.falt] === v ? (el.dataset.falt === 'niva' ? 0 : el.dataset.falt === 'film' ? false : '') : v;
    ritaOm(); return true;
  }
  if (action === 'ov-nollstall') { e.preventDefault(); st = { ...st, sok: '', fas: '', typ: '', niva: 0, film: false }; const s = $('#ovsok'); if (s) s.value = ''; ritaOm(); return true; }
  if (action === 'ov-valj') { const id = el.dataset.id; st.valda = st.valda.includes(id) ? st.valda.filter(x => x !== id) : [...st.valda, id]; ritaOm(); return true; }
  if (action === 'ov-film') { st.oppen = el.dataset.id; ritaOm(); const v = document.querySelector('.ov-klipp video'); v?.play().catch(() => {}); return true; }
  if (action === 'ov-rensa') { e.preventDefault(); st.valda = []; ritaOm(); return true; }
  if (action === 'ov-glom') { e.preventDefault(); sattMal(null); ui.route(); return true; }
  if (action === 'ov-avbryt') { e.preventDefault(); const m = malNu(); sattMal(null); go(malTillbaka(m)); return true; }
  const valda = st.valda.map(id => bankNu().find(o => o.id === id)).filter(Boolean);
  if (action === 'ov-lagg') {
    const m = malNu(); if (!m) return true;
    passLaggTill(valda.map(blockAv)); sattMal(null); st.valda = [];
    toast(`${valda.length} ${valda.length === 1 ? 'övning lagd' : 'övningar lagda'} i passet. Glöm inte Spara.`); go(malTillbaka(m)); return true;
  }
  if (action === 'ov-planera') {
    const kid = $('#ovkid')?.value || st.kid;
    const k = klienterNu().find(x => x.id === kid);
    if (!k) { toast('Lägg in spelaren under Klienter först'); return true; }
    passMedOvningar({ uid: k.id, barn: k.barn, block: valda.map(blockAv) }); st.valda = [];
    toast(`Passet har ${valda.length} ${valda.length === 1 ? 'övning' : 'övningar'} plus samtal före och efter. Ändra och tryck Spara.`);
    go(`/admin/pass/ny/${k.id}`); return true;
  }
  return false;
}
