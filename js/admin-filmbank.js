// Admin → Filmbank (Carl 2026-11-24): alla filmer och ljud från passen på ett ställe, "material för sin
// marknadsföring". Haris märker de bästa med ⭐, laddar ner dem, jämför första och senaste filmen av en bedömning
// och tar bort gamla filmer när lagringen börjar bli full (gratis upp till 10 GB, uppladdningar stoppas vid 9,5 GB).
// Samtycke till marknadsföring sköter Haris själv med föräldrarna (Carl 2026-11-24).
import { api } from './api.js';
import { filmMedTid, jamforHtml, fmtSek, fmtDag } from './passfilm.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gb = b => `${(b / 1e9).toLocaleString('sv-SE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} GB`;
const mb = b => b ? `${Math.max(1, Math.round(b / 1048576))} MB` : '';
let st = { filmer: [], lagring: null, r2: false, hamtat: 0, hamtar: false, filter: 'alla', barn: '', jamfor: null };
let ui = null, ritarOm = false;
export function filmbankInit(deps) { ui = deps; }
export function filmbankGlom() { st.hamtat = 0; }

function hamta() {
  if (st.hamtar) { st.igen = true; return; }
  st.hamtar = true; st.igen = false;
  const forut = JSON.stringify([st.filmer, st.lagring]);
  api.admin.get('/admin/passfilmer').then(r => { if (r.ok) { st.filmer = r.filmer; st.lagring = r.lagring; st.r2 = r.r2; st.hamtat = Date.now(); } })
    .finally(() => { st.hamtar = false; if (st.igen) { hamta(); return; } if (location.hash.startsWith('#/admin/filmbank') && JSON.stringify([st.filmer, st.lagring]) !== forut) { ritarOm = true; try { ui.route(); } finally { ritarOm = false; } } });
}

function meter() {
  const l = st.lagring;
  if (!st.r2) return `<section class="note warn small">Fillagringen är inte påslagen än. Filmerna ligger kvar på telefonen där de spelades in tills den är på.</section>`;
  const andel = Math.min(1, l.anvant / l.gratis);
  const klass = l.anvant >= l.tak ? 'full' : andel > 0.8 ? 'varn' : '';
  return `<section class="panel">
    <div class="section-head"><h3>Lagringen</h3><span class="small"><b>${gb(l.anvant)}</b> av 10 GB</span></div>
    <div class="fb-meter ${klass}"><i style="width:${Math.round(andel * 100)}%"></i></div>
    <p class="small muted" style="margin:0">${l.anvant >= l.tak ? 'Full: nya filmer laddas inte upp förrän du tagit bort gamla. ' : ''}Gratis upp till 10 GB. Filmer från appen 1.4 görs om till ungefär 14 MB per minut innan de laddas upp. Uppladdningen stoppas vid 9,5 GB, så det kostar aldrig något.</p>
  </section>`;
}

function kort(m) {
  const etikett = m.bed ? `${m.bed.namn} · ${fmtSek(m.bed.medel)}` : '';
  const serie = m.bed ? st.filmer.filter(x => x.klientId === m.klientId && x.bed?.namn === m.bed.namn && x.url && x.typ === 'video') : [];
  return `<div class="panel fb-kort ${m.marknad ? 'marknad' : ''}">
    ${!m.url ? `<div class="small muted">${m.typ === 'audio' ? '🎙' : '🎥'} Ligger kvar på telefonen</div>`
      : m.typ === 'audio' ? `<audio controls preload="none" src="${esc(m.url)}" style="width:100%"></audio>`
      : filmMedTid({ url: m.url, poster: m.poster, etikett })}
    <div class="fb-meta small"><b>${esc(m.barn)}</b> · ${esc(m.moment || m.titel || m.namn)}<div class="muted">${fmtDag(m.plan?.datum || m.t)}${m.sek ? ` · ${Math.round(m.sek)} s` : ''}${m.storlek ? ` · ${mb(m.storlek)}` : ''}${m.delad ? '' : ' · inte delad'}</div></div>
    <div class="fb-knappar">
      <button class="film" data-action="fb-marknad" data-kid="${m.klientId}" data-id="${m.id}" title="Till marknadsföring">${m.marknad ? '⭐ Vald' : '☆ Välj'}</button>
      ${m.url ? `<a class="film" href="${esc(m.url)}" download="${esc(m.namn || 'film.mp4')}" target="_blank" rel="noopener">⬇ Ladda ner</a>` : ''}
      ${serie.length > 1 ? `<button class="film" data-action="fb-jamfor" data-kid="${m.klientId}" data-namn="${esc(m.bed.namn)}">⇆ Jämför</button>` : ''}
      ${m.plan ? `<a class="film" href="#/admin/pass/${m.plan.id}">Passet</a>` : ''}
      <button class="film" data-action="fb-bort" data-kid="${m.klientId}" data-id="${m.id}">🗑</button>
    </div>
  </div>`;
}

export function filmbankView() {
  if (!ritarOm && (!st.hamtat || Date.now() - st.hamtat > 1500)) hamta();
  if (!st.hamtat) return `<section class="panel"><p class="muted" style="margin:0">Hämtar filmerna…</p></section>`;
  if (st.jamfor) {
    const s = st.filmer.filter(x => x.klientId === st.jamfor.kid && x.bed?.namn === st.jamfor.namn && x.url && x.typ === 'video')
      .sort((a, b) => String(a.bed.datum).localeCompare(String(b.bed.datum)));
    const f = s[0], l = s.at(-1);
    return `<a class="back" href="#/admin/filmbank" data-action="fb-jamfor-stang">‹ Filmbanken</a>
    <section><div class="eyebrow">${esc(f?.barn || '')}</div><h1>${esc(st.jamfor.namn)}</h1></section>
    ${f && l && f !== l ? `<section>${jamforHtml({ url: f.url, poster: f.poster, datum: f.bed.datum, sek: f.bed.medel }, { url: l.url, poster: l.poster, datum: l.bed.datum, sek: l.bed.medel })}</section>` : '<p class="muted">Behöver två filmer.</p>'}
    ${s.length > 2 ? `<section><h3>Alla ${s.length} gånger</h3><ul class="list small">${s.map(x => `<li>${fmtDag(x.bed.datum)} · <b>${fmtSek(x.bed.medel)}</b></li>`).join('')}</ul></section>` : ''}`;
  }
  const barnLista = [...new Map(st.filmer.map(m => [m.klientId, m.barn])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'sv'));
  const synliga = st.filmer.filter(m => (st.filter === 'alla' || (st.filter === 'marknad' && m.marknad) || (st.filter === 'bed' && m.bed) || (st.filter === 'ljud' && m.typ === 'audio') || (st.filter === 'telefon' && !m.url)) && (!st.barn || m.klientId === st.barn));
  return `
  ${meter()}
  <section>
    <div class="chips">${[['alla', 'Alla'], ['marknad', '⭐ Marknadsföring'], ['bed', '⏱ Med tid'], ['ljud', '🎙 Ljud'], ['telefon', 'På telefonen']].map(([k, t]) => `<button class="chip ${st.filter === k ? 'brand on' : ''}" data-action="fb-filter" data-f="${k}">${t}</button>`).join('')}</div>
    ${barnLista.length > 1 ? `<div class="field" style="margin:10px 0 0"><select data-action-change="fb-barn" id="fbBarn"><option value="">Alla barn</option>${barnLista.map(([id, n]) => `<option value="${id}" ${st.barn === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : ''}
  </section>
  <section>${synliga.length ? `<div class="fb-lista">${synliga.map(kort).join('')}</div>` : `<p class="muted">${st.filmer.length ? 'Inga filmer här.' : 'Inga filmer från passen än. Filma i Kör-läget under ett pass.'}</p>`}</section>`;
}

export function filmbankAfterRender(view) {
  const s = view.querySelector('#fbBarn');
  if (s) s.onchange = () => { st.barn = s.value; ui.route(); };
}

export async function filmbankAction(action, el, e) {
  const d = el.dataset;
  if (action === 'fb-filter') { st.filter = d.f; ui.route(); return true; }
  if (action === 'fb-jamfor') { st.jamfor = { kid: d.kid, namn: d.namn }; ui.route(); window.scrollTo(0, 0); return true; }
  if (action === 'fb-jamfor-stang') { e?.preventDefault?.(); st.jamfor = null; ui.route(); return true; }
  if (action === 'fb-marknad') {
    const m = st.filmer.find(x => x.id === d.id && x.klientId === d.kid); if (!m) return true;
    const r = await api.admin.patch(`/admin/klient/${d.kid}/media/${d.id}`, { marknad: !m.marknad });
    if (r.ok) m.marknad = r.media.marknad; else ui.toast(`Gick inte: ${r.fel}`);
    ui.route(); return true;
  }
  if (action === 'fb-bort') {
    if (!d.armed) { d.armed = '1'; el.textContent = 'Ta bort?'; setTimeout(() => { delete d.armed; el.textContent = '🗑'; }, 4000); return true; }
    const r = await api.admin.del(`/admin/klient/${d.kid}/media/${d.id}`);
    if (r.ok) { st.filmer = st.filmer.filter(x => !(x.id === d.id && x.klientId === d.kid)); st.hamtat = 0; ui.toast('Borttagen'); } else ui.toast(`Gick inte: ${r.fel}`);
    ui.route(); return true;
  }
  return false;
}
