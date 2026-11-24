// Admin → Idag (Carl 2026-11-24: "hjälpa Haris med sin planering av pass … appen vet att det är övningen vi har
// filmat och med vilket barn, det läser vi ur att det är ett pass för den bokningen"). Haris bokade tider från i
// förrgår till om en vecka. Varje bokat barn får ett pass som hör till just den bokningen (plan.bokning {v, slot}),
// så allt som filmas och mäts i passet hamnar på rätt barn och rätt dag.
import { api } from './api.js';
import { passFranBokning, passSkapaFranBokning } from './admin-pass.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAGAR = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const MAN = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
let st = { pass: [], idag: '', hamtat: 0, hamtar: false };
let ui = null, ritarOm = false;
export function idagInit(deps) { ui = deps; }
export function idagGlom() { st.hamtat = 0; }

function hamta() {
  if (st.hamtar) { st.igen = true; return; } // en hämtning pågår redan: gör en till när den är klar
  st.hamtar = true; st.igen = false;
  const forut = JSON.stringify(st.pass);
  api.admin.get('/admin/idag').then(r => { if (r.ok) { st.pass = r.pass; st.idag = r.idag; st.hamtat = Date.now(); } })
    .finally(() => { st.hamtar = false; if (st.igen) { hamta(); return; } if (/^#\/admin(\/idag)?$/.test(location.hash) && JSON.stringify(st.pass) !== forut) { ritarOm = true; try { ui.route(); } finally { ritarOm = false; } } });
}
function dagRubrik(d) {
  const i = new Date(st.idag + 'T12:00:00'), x = new Date(d + 'T12:00:00');
  const diff = Math.round((x - i) / 864e5);
  const namn = `${DAGAR[x.getDay()]} ${x.getDate()} ${MAN[x.getMonth()]}`;
  return diff === 0 ? `I dag, ${namn}` : diff === 1 ? `I morgon, ${namn}` : diff === -1 ? `I går, ${namn}` : namn[0].toUpperCase() + namn.slice(1);
}

export function idagView() {
  if (!ritarOm) hamta(); // visar det senaste direkt och ritar om när svaret kommer
  if (!st.hamtat) return `<section class="panel"><p class="muted" style="margin:0">Hämtar dagens pass…</p></section>`;
  const kommande = st.pass.filter(p => p.datum >= st.idag), tidigare = st.pass.filter(p => p.datum < st.idag && p.barn.some(b => !b.plan?.delad));
  const dagar = [...new Set(kommande.map(p => p.datum))];
  const passKort = p => `<div class="panel idag-pass">
    <div class="section-head"><b>${esc(p.start)}–${esc(p.slut)}</b><span class="small muted">${esc(p.plats)}</span></div>
    ${p.barn.map(b => `<div class="idag-barn">
      <span class="grow"><b>${esc(b.barn || 'Bokad')}</b>${b.niva ? ` <span class="small muted">nivå ${b.niva}</span>` : ''}
        ${b.plan ? `<div class="small muted">${esc(b.plan.titel)} · ${b.plan.klara} av ${b.plan.block} klara${b.plan.filmer ? ` · ${b.plan.filmer} inspelningar` : ''}${b.plan.delad ? ' · <span style="color:var(--brand)">delat</span>' : ''}</div>` : ''}</span>
      ${!b.finns ? '<span class="small muted">finns inte i klientregistret</span>'
        : b.plan ? `<a class="btn secondary" href="#/admin/pass/${b.plan.id}">Passet</a><a class="btn grad" href="#/admin/pass/${b.plan.id}/kor">▶ Kör</a>`
        : `<button class="btn secondary" data-action="idag-planera" data-uid="${b.id}" data-barn="${esc(b.fornamn)}" data-v="${p.v}" data-slot="${p.slot}" data-datum="${p.datum}">⚽ Planera</button><button class="btn grad" data-action="idag-kor" data-uid="${b.id}" data-barn="${esc(b.fornamn)}" data-v="${p.v}" data-slot="${p.slot}" data-datum="${p.datum}">▶ Kör direkt</button>`}
    </div>`).join('')}
  </div>`;
  return `
  <section>
    <p class="small muted" style="margin-top:0">Varje bokning får ett eget pass. Det som filmas, spelas in och mäts i passet sparas på barnet och den dagen. «Kör direkt» startar standardpasset med samtal före, konbana, dagens moment och samtal efter.</p>
    ${dagar.length ? dagar.map(d => `<div class="idag-dag"><h2 style="margin:0">${esc(dagRubrik(d))}</h2>${kommande.filter(p => p.datum === d).map(passKort).join('')}</div>`).join('')
      : '<section class="empty"><p class="muted">Inga bokade pass den närmaste veckan.</p><a class="btn secondary" href="#/admin/tider">Till Tider</a></section>'}
    ${tidigare.length ? `<div class="idag-dag"><h2 style="margin:0">Inte delade än</h2><p class="small muted" style="margin:4px 0 0">Pass från de senaste dagarna som inte är delade med föräldern.</p>${tidigare.map(passKort).join('')}</div>` : ''}
  </section>`;
}

export async function idagAction(action, el) {
  const d = el.dataset, bokning = { v: d.v, slot: d.slot };
  if (action === 'idag-planera') {
    passFranBokning({ uid: d.uid, barn: d.barn, datum: d.datum, bokning });
    ui.go(`/admin/pass/ny/${d.uid}`); return true;
  }
  if (action === 'idag-kor') {
    el.disabled = true;
    const r = await passSkapaFranBokning({ uid: d.uid, barn: d.barn, datum: d.datum, bokning });
    if (!r.ok) { el.disabled = false; ui.toast(`Gick inte: ${r.fel}`); return true; }
    idagGlom(); ui.go(`/admin/pass/${r.plan.id}/kor`); return true;
  }
  return false;
}
