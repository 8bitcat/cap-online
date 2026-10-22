// Adminsidan för Haris (Carl 2026-10-21): filmer med taggar, inbjudningar med kod, nyhet som push.
import { store } from './store.js';
import { api, laddaUppFilm, laddaUppPoster, hamtaFilmer } from './api.js';
import { tiderInit, tiderView, tiderAction, tiderSubmit } from './admin-tider.js';
import { passInit, passView, passAction, passSubmit, passStopur, passStoppa, passFilVald } from './admin-pass.js';
import { stigAdminInit, stigAdminView, stigAdminAction } from './admin-stig.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const fmtT = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

let TAGS = null;          // data/taggar.json
let state = { flik: 'tider', filmer: [], r2: false, redigerar: null, inb: null, laddat: false };
let ui = null;            // { toast, route, go, content }
const FLIKAR = [['tider', 'Tider'], ['pass', 'Pass'], ['filmer', 'Filmer'], ['stigen', 'Stigen'], ['mer', 'Mer']];

export async function adminInit(deps) {
  ui = deps;
  tiderInit(deps); passInit(deps); stigAdminInit(deps, deps.content);
  if (!TAGS) TAGS = await (await fetch('data/taggar.json', { cache: 'no-cache' })).json();
}
export const taggar = () => TAGS;
export const adminLaddat = () => state.laddat;

// Kopplar in filval och stoppur efter att adminvyn ritats; stoppar klockor när man lämnar
export function adminAfterRender(view) {
  const fil = view.querySelector('#fil'); if (fil) fil.addEventListener('change', () => adminFilVald(fil));
  const pf = view.querySelector('#passfilm'); if (pf) pf.addEventListener('change', () => passFilVald(pf));
  if (view.querySelector('.stopur #stopurKnapp')) passStopur();
}
export function adminStop() { passStoppa(); }

export function adminPage(flik = 'tider', id, lage) {
  if (!store.admin) return `
  <section class="hero" style="padding-top:30px">
    <img class="hero-logo" src="assets/cap-logo.png" alt="">
    <div class="eyebrow">Admin</div>
    <h1>Logga in</h1>
    <p class="lead">För Haris och Carl. Här lägger ni upp filmer, taggar dem och bjuder in föräldrar.</p>
  </section>
  <section class="panel">
    <form data-form="admin-login">
      <div class="field"><label for="losen">Lösenord</label><input type="password" id="losen" name="losen" autocomplete="current-password"></div>
      <button class="btn grad block" type="submit">Logga in</button>
    </form>
  </section>
  <p class="small muted" style="text-align:center"><a href="#/login">‹ Till appen</a></p>`;

  if (!FLIKAR.some(([k]) => k === flik)) flik = 'tider';
  state.flik = flik;
  const rubrik = { tider: 'Tider att boka', pass: 'Pass med spelare', filmer: 'Filmer', stigen: 'Träna själv-stigen', mer: 'Mer' }[flik];
  const inre = flik === 'tider' ? tiderView()
    : flik === 'pass' ? passView(id, lage)
    : flik === 'filmer' ? filmerFlik()
    : flik === 'stigen' ? stigAdminView()
    : `${inbjudningarFlik()}${nyhetFlik()}
       <section class="panel"><div class="section-head"><h3>Konto</h3><a class="small" data-action="admin-ut" href="#/admin">Logga ut</a></div><p class="small muted" style="margin:0"><a href="#/">Till förälderappen ›</a></p></section>`;
  const topp = id ? '' : `
  <section>
    <div class="section-head"><div><div class="eyebrow">Admin</div><h1 style="margin:0">${rubrik}</h1></div><a class="small" href="#/">Till appen ›</a></div>
    <div class="chips" style="margin-top:10px">${FLIKAR.map(([k, t]) => `<a class="chip ${flik === k ? 'brand on' : ''}" href="#/admin/${k}">${t}</a>`).join('')}</div>
  </section>`;
  return topp + inre;
}

/* ---------- Filmer ---------- */

function filmerFlik() {
  if (!state.laddat) return `<section class="panel"><p class="muted" style="margin:0">Hämtar filmer…</p></section>`;
  if (state.redigerar) return filmForm(state.redigerar);
  const f = state.filmer;
  return `
  <section>
    <div class="section-head"><h2>Filmer</h2><button class="btn" data-action="admin-ny">+ Ny film</button></div>
    ${state.r2 ? '' : `<div class="note warn small">Fillagringen (R2) är inte påslagen hos Cloudflare än. Tills dess läggs filmer in som länk, till exempel en mp4 på webben. Uppladdning från telefonen slår på när Carl aktiverat R2.</div>`}
    ${f.length ? `<ul class="list">${f.map(x => `<li class="row">
      <span class="grow"><b>${esc(x.titel)}</b> <span class="chip ${x.status === 'publicerad' ? 'brand' : ''}" style="font-size:11px;padding:2px 8px">${x.status}</span>
        <div class="small muted">${sammanfattaTaggar(x.tags)}${x.moment?.length ? ` · ${x.moment.length} moment` : ''}${x.video?.url ? '' : ' · <span style="color:var(--warn)">ingen film</span>'}</div></span>
      <button class="film" data-action="admin-redigera" data-id="${x.id}">Redigera</button></li>`).join('')}</ul>`
      : `<p class="muted">Inga filmer än. Tryck på Ny film.</p>`}
  </section>`;
}

function sammanfattaTaggar(tags = {}) {
  const delar = [];
  for (const k of ['alder', 'position', 'omrade', 'fardighet']) if (tags[k]?.length) delar.push(tags[k].join('/'));
  return delar.join(' · ') || 'inga taggar';
}

function filmForm(f) {
  const tagBlock = Object.entries(TAGS).map(([k, d]) => `
    <div class="field"><span class="label">${esc(d.namn)}</span>
      <div class="chips tagval" data-dim="${k}">
        ${d.alla ? `<button type="button" class="chip ${(f.tags[k] || []).includes('Alla') ? 'brand on' : ''}" data-action="tag" data-dim="${k}" data-v="Alla">Alla</button>` : ''}
        ${d.val.map(v => `<button type="button" class="chip ${(f.tags[k] || []).includes(v) ? 'brand on' : ''}" data-action="tag" data-dim="${k}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}
      </div></div>`).join('');
  const momentRader = (f.moment || []).map((m, i) => `
    <div class="step" data-i="${i}">
      <span class="num">${i + 1}</span>
      <div style="display:grid;gap:6px">
        <input type="text" data-m="namn" value="${esc(m.namn)}" placeholder="Momentets namn">
        <input type="text" data-m="desc" value="${esc(m.desc || '')}" placeholder="Kort beskrivning (valfritt)">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <input type="number" data-m="start" value="${m.start || 0}" min="0" style="width:84px" title="start, sekunder"> –
          <input type="number" data-m="slut" value="${m.slut || 0}" min="0" style="width:84px" title="slut, sekunder"> s
          <button type="button" class="film" data-action="m-start" data-i="${i}">start = spelaren</button>
          <button type="button" class="film" data-action="m-slut" data-i="${i}">slut = spelaren</button>
          <input type="number" data-m="minuter" value="${m.minuter || 0}" min="0" style="width:70px" title="träningsminuter"> min
        </div>
      </div>
      <button type="button" class="film" data-action="m-bort" data-i="${i}" title="Ta bort">✕</button>
    </div>`).join('');
  return `
  <section>
    <a class="back" data-action="admin-avbryt" href="#/admin/filmer">‹ Alla filmer</a>
    <h1>${f.id ? 'Redigera film' : 'Ny film'}</h1>
    <form data-form="admin-film" id="filmform">
      <div class="field"><label for="titel">Titel</label><input type="text" id="titel" name="titel" value="${esc(f.titel || '')}" required placeholder="T.ex. Första touch mot vägg"></div>
      <div class="field"><label for="beskrivning">Beskrivning</label><textarea id="beskrivning" name="beskrivning" placeholder="Vad tränar man, hur gör man?">${esc(f.beskrivning || '')}</textarea></div>
      <div class="field"><label for="traningMin">Träningstid, minuter</label><input type="number" id="traningMin" name="traningMin" value="${f.traningMin || 10}" min="0" max="120" style="width:110px"></div>

      <h3>Film</h3>
      <div class="panel" style="padding:12px">
        <div class="player manuell ${f.video?.portrait === false ? '' : 'portrait'}" id="adminplayer" style="max-height:50vh;margin:0 auto 10px">${f.video?.url ? `<video controls playsinline preload="metadata" src="${esc(f.video.url)}" poster="${esc(f.video.poster || '')}"></video>` : '<div class="missing"><span>Ingen film vald</span></div>'}</div>
        <div class="field"><label for="videoUrl">Länk till mp4 (eller ladda upp nedan)</label><input type="url" id="videoUrl" name="videoUrl" value="${esc(f.video?.url || '')}" placeholder="https://…/film.mp4"></div>
        <div class="field"><label for="fil">Ladda upp från telefonen${state.r2 ? '' : ' (kräver R2, inte påslaget än)'}</label>
          <input type="file" id="fil" accept="video/mp4,video/quicktime,video/*" ${state.r2 ? '' : 'disabled'}>
          <span class="hint" id="upphint">${state.r2 ? 'Filen laddas upp i delar. Omslaget tas automatiskt ur filmen.' : 'Carl slår på R2 i Cloudflare, sedan fungerar knappen.'}</span>
          <div class="progress" hidden id="uppbar"><i style="width:0%"></i></div></div>
        <input type="hidden" name="videoPoster" value="${esc(f.video?.poster || '')}">
        <input type="hidden" name="videoSek" value="${f.video?.sek || 0}">
        <input type="hidden" name="videoTyp" value="${esc(f.video?.typ || 'url')}">
      </div>

      <h3 style="margin-top:18px">Taggar</h3>
      <p class="small muted">Flera går att välja. "Alla" betyder att filmen passar oavsett.</p>
      ${tagBlock}

      <h3 style="margin-top:18px">Moment i filmen</h3>
      <p class="small muted">Varje moment får en ▶-knapp i appen som hoppar till rätt ställe. Spela filmen ovan och tryck "start = spelaren" där momentet börjar.</p>
      <div class="list" id="momentlista">${momentRader || '<p class="muted small">Inga moment än.</p>'}</div>
      <p><button type="button" class="btn secondary" data-action="m-ny">+ Lägg till moment</button></p>

      <h3 style="margin-top:18px">Status</h3>
      <div class="options rating">
        <label><input type="radio" name="status" value="utkast" ${f.status !== 'publicerad' ? 'checked' : ''}>Utkast</label>
        <label><input type="radio" name="status" value="publicerad" ${f.status === 'publicerad' ? 'checked' : ''}>Publicerad</label>
      </div>
      <div class="btn-row two" style="margin-top:16px">
        <button class="btn grad" type="submit">Spara</button>
        ${f.id ? `<button type="button" class="btn secondary" data-action="admin-radera" data-id="${f.id}">Ta bort filmen</button>` : `<a class="btn secondary" data-action="admin-avbryt" href="#/admin/filmer">Avbryt</a>`}
      </div>
    </form>
  </section>`;
}

function tomFilm() {
  const tags = {}; for (const k of Object.keys(TAGS)) tags[k] = [];
  return { titel: '', beskrivning: '', traningMin: 10, status: 'utkast', tags, moment: [], video: { typ: 'url', url: '', poster: '', sek: 0 } };
}

// Läser formuläret till ett filmobjekt (taggar och moment ligger i state.redigerar, resten i fälten)
function lasForm() {
  const f = state.redigerar;
  const fd = new FormData($('#filmform'));
  $$('#momentlista .step').forEach(row => {
    const i = +row.dataset.i, m = f.moment[i];
    if (!m) return;
    for (const k of ['namn', 'desc', 'start', 'slut', 'minuter']) { const el = row.querySelector(`[data-m=${k}]`); m[k] = k === 'namn' || k === 'desc' ? el.value : +el.value || 0; }
  });
  return {
    ...f,
    titel: fd.get('titel'), beskrivning: fd.get('beskrivning'), traningMin: +fd.get('traningMin') || 0, status: fd.get('status'),
    video: { typ: fd.get('videoTyp') || 'url', url: (fd.get('videoUrl') || '').trim(), poster: fd.get('videoPoster') || '', sek: +fd.get('videoSek') || 0 },
  };
}

/* ---------- Inbjudningar ---------- */

function inbjudningarFlik() {
  const d = state.inb;
  return `
  <section>
    <h2>Bjud in en förälder</h2>
    <p class="small muted">Föräldern får en kod och en länk. Koden skriver man in på första sidan i appen, länken loggar in direkt i webbläsaren. Kontot skapas på mejladressen när koden används.</p>
    <form data-form="admin-inbjudan" class="panel">
      <div class="field"><label for="iemail">Förälderns e-post</label><input type="email" id="iemail" name="email" required placeholder="namn@exempel.se"></div>
      <div class="field"><label for="inamn">Förälderns namn</label><input type="text" id="inamn" name="namn" placeholder="T.ex. Anna"></div>
      <div class="field"><label for="ibarn">Barnets namn</label><input type="text" id="ibarn" name="barn" placeholder="T.ex. Elsa"></div>
      <button class="btn grad block" type="submit">Skapa kod</button>
    </form>
    ${state.nyKod ? `<section class="panel brand">
      <div class="eyebrow">Ny inbjudan</div>
      <div style="font-size:34px;font-weight:800;letter-spacing:.18em;font-variant-numeric:tabular-nums">${esc(state.nyKod.kod.slice(0, 3))}-${esc(state.nyKod.kod.slice(3))}</div>
      <p class="small muted">${esc(state.nyKod.inbjudan.email)}${state.nyKod.inbjudan.barn ? ` · ${esc(state.nyKod.inbjudan.barn)}` : ''}</p>
      <div class="msg" id="inbmsg">Hej${state.nyKod.inbjudan.namn ? ' ' + esc(state.nyKod.inbjudan.namn) : ''}! Här är din inbjudan till CAP Online${state.nyKod.inbjudan.barn ? ', träningsappen för ' + esc(state.nyKod.inbjudan.barn) : ''}.

Öppna länken så är du inne: ${esc(state.nyKod.lank)}

I appen: skriv koden ${esc(state.nyKod.kod.slice(0, 3))}-${esc(state.nyKod.kod.slice(3))} på första sidan.

/Haris, Complete Athletic Performance</div>
      <div class="btn-row two"><button class="btn" data-action="kopiera" data-el="inbmsg">Kopiera meddelandet</button><button class="btn secondary" data-action="kopiera" data-text="${esc(state.nyKod.lank)}">Kopiera länken</button></div>
    </section>` : ''}
  </section>
  <section>
    <h2>Skickade koder</h2>
    ${d ? (d.inbjudningar.length ? `<ul class="list">${d.inbjudningar.map(i => `<li class="row"><span class="grow"><b>${esc(i.kod.slice(0, 3))}-${esc(i.kod.slice(3))}</b> · ${esc(i.email)}${i.barn ? ` · ${esc(i.barn)}` : ''}<div class="small muted">${i.skapad.slice(0, 10)} · ${i.anvand ? '✓ använd ' + i.anvand.slice(0, 10) : 'ej använd än'}</div></span></li>`).join('')}</ul>` : '<p class="muted">Inga koder skapade än.</p>') : '<p class="muted">Hämtar…</p>'}
  </section>
  <section>
    <h2>Konton</h2>
    ${d ? (d.anvandare.length ? `<ul class="list">${d.anvandare.map(u => `<li><b>${esc(u.email)}</b>${u.barn ? ` · ${esc(u.barn)}` : ''}<div class="small muted">senast ${(u.senast || '').slice(0, 10)}</div></li>`).join('')}</ul>` : '<p class="muted">Inga konton än.</p>') : ''}
  </section>`;
}

/* ---------- Nyhet ---------- */

function nyhetFlik() {
  return `
  <section>
    <h2>Skicka en nyhet</h2>
    <p class="small muted">Går som pushnotis till alla telefoner som slagit på "Nyheter från Haris" i appen.</p>
    <form data-form="admin-notis" class="panel">
      <div class="field"><label for="ntitle">Rubrik</label><input type="text" id="ntitle" name="title" value="CAP Online" maxlength="40"></div>
      <div class="field"><label for="ntext">Text</label><textarea id="ntext" name="text" required maxlength="180" placeholder="T.ex. Nytt pass ute: Avslut insida!"></textarea></div>
      <button class="btn grad block" type="submit">Skicka till alla</button>
    </form>
  </section>`;
}

/* ---------- Händelser ---------- */

export async function adminLadda() {
  if (!store.admin) return;
  const r = await api.admin.get('/admin/filmer');
  if (r.ok) { state.filmer = r.filmer; state.r2 = !!r.r2; }
  state.laddat = true;
  const i = await api.admin.get('/admin/inbjudningar'); if (i.ok) state.inb = i;
}

export async function adminAction(action, el, e) {
  const { toast, route } = ui;
  if (action.startsWith('tid-')) return tiderAction(action, el, e);
  if (action.startsWith('pass-')) return passAction(action, el, e);
  if (action.startsWith('stig-')) return stigAdminAction(action, el, e);
  if (action === 'admin-ut') { e.preventDefault(); store.admin = null; state = { ...state, laddat: false, redigerar: null }; ui.go('/admin'); return true; }
  if (action === 'admin-ny') { state.redigerar = tomFilm(); route(); return true; }
  if (action === 'admin-redigera') { const f = state.filmer.find(x => x.id === el.dataset.id); state.redigerar = JSON.parse(JSON.stringify(f)); route(); return true; }
  if (action === 'admin-avbryt') { e.preventDefault(); state.redigerar = null; route(); return true; }
  if (action === 'admin-radera') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen för att ta bort'; setTimeout(() => { delete el.dataset.armed; el.textContent = 'Ta bort filmen'; }, 4000); return true; }
    const r = await api.admin.del(`/admin/film/${el.dataset.id}`);
    toast(r.ok ? 'Filmen är borttagen' : `Gick inte: ${r.fel}`);
    state.redigerar = null; await adminLadda(); hamtaFilmer({ tvinga: true }); route(); return true;
  }
  if (action === 'tag') {
    const f = state.redigerar, k = el.dataset.dim, v = el.dataset.v;
    const nuv = new Set(f.tags[k] || []);
    if (v === 'Alla') { nuv.has('Alla') ? nuv.delete('Alla') : (nuv.clear(), nuv.add('Alla')); }
    else { nuv.delete('Alla'); nuv.has(v) ? nuv.delete(v) : nuv.add(v); }
    f.tags[k] = [...nuv];
    $$(`.tagval[data-dim="${k}"] .chip`).forEach(c => c.classList.toggle('brand', nuv.has(c.dataset.v)) || c.classList.toggle('on', nuv.has(c.dataset.v)));
    $$(`.tagval[data-dim="${k}"] .chip`).forEach(c => { const on = nuv.has(c.dataset.v); c.classList.toggle('brand', on); c.classList.toggle('on', on); });
    return true;
  }
  if (action === 'm-ny') { state.redigerar = lasForm(); state.redigerar.moment.push({ namn: '', desc: '', start: 0, slut: 0, minuter: 5 }); route(); return true; }
  if (action === 'm-bort') { state.redigerar = lasForm(); state.redigerar.moment.splice(+el.dataset.i, 1); route(); return true; }
  if (action === 'm-start' || action === 'm-slut') {
    const v = $('#adminplayer video'); if (!v) { toast('Ingen film att ta tiden från'); return true; }
    const row = el.closest('.step'); row.querySelector(`[data-m=${action === 'm-start' ? 'start' : 'slut'}]`).value = Math.round(v.currentTime);
    return true;
  }
  if (action === 'kopiera') {
    const text = el.dataset.text || $('#' + el.dataset.el)?.textContent || '';
    try { await navigator.clipboard.writeText(text); toast('Kopierat'); } catch { toast('Markera texten och kopiera själv'); }
    return true;
  }
  return false;
}

export async function adminSubmit(kind, f, fd) {
  const { toast, route } = ui;
  if (kind.startsWith('tid-')) return tiderSubmit(kind, f, fd);
  if (kind.startsWith('pass-')) return passSubmit(kind, f, fd);
  if (kind === 'admin-login') {
    const r = await api.post('/admin/login', { losen: fd.get('losen') });
    if (!r.ok) { toast(r.fel || 'Fel lösenord'); return true; }
    store.admin = r.token; state.laddat = false; ui.go('/admin/tider'); await adminLadda(); route(); return true;
  }
  if (kind === 'admin-film') {
    const film = lasForm();
    if (!film.titel.trim()) { toast('Filmen behöver en titel'); return true; }
    const r = film.id ? await api.admin.put(`/admin/film/${film.id}`, film) : await api.admin.post('/admin/film', film);
    if (!r.ok) { toast(`Gick inte att spara: ${r.fel}`); return true; }
    toast(film.status === 'publicerad' ? 'Sparad och publicerad' : 'Sparad som utkast');
    state.redigerar = null; await adminLadda(); hamtaFilmer({ tvinga: true }); route(); return true;
  }
  if (kind === 'admin-inbjudan') {
    const r = await api.admin.post('/admin/inbjudan', { email: fd.get('email'), namn: fd.get('namn'), barn: fd.get('barn') });
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    state.nyKod = r;
    const i = await api.admin.get('/admin/inbjudningar');
    if (i.ok) state.inb = i;
    // KV-listningen släpar efter några sekunder; visa den nya koden direkt ändå
    if (state.inb && !state.inb.inbjudningar.some(x => x.kod === r.kod)) state.inb.inbjudningar.unshift(r.inbjudan);
    f.reset(); route(); return true;
  }
  if (kind === 'admin-notis') {
    const r = await api.admin.post('/admin/notis', { text: fd.get('text'), title: fd.get('title') });
    toast(r.ok ? `Skickad till ${r.skickade} telefoner` : `Gick inte: ${r.fel}`);
    if (r.ok) f.reset();
    return true;
  }
  return false;
}

// Filval i adminformuläret: ladda upp i delar, ta ett omslag ur filmen, fyll i fälten.
export async function adminFilVald(input) {
  const { toast } = ui;
  const file = input.files?.[0]; if (!file) return;
  const film = state.redigerar;
  if (!film.id) {
    // spara först som utkast så att filen får ett id
    const r = await api.admin.post('/admin/film', { ...lasForm(), status: 'utkast' });
    if (!r.ok) { toast(`Kunde inte skapa filmen: ${r.fel}`); return; }
    state.redigerar = { ...lasForm(), id: r.film.id, skapad: r.film.skapad };
  }
  const bar = $('#uppbar'), hint = $('#upphint');
  bar.hidden = false;
  const r = await laddaUppFilm(state.redigerar.id, file, p => { bar.firstElementChild.style.width = Math.round(p * 100) + '%'; hint.textContent = `Laddar upp… ${Math.round(p * 100)} %`; });
  if (!r.ok) { hint.textContent = `Uppladdningen misslyckades: ${r.fel}`; return; }
  $('[name=videoUrl]').value = r.url; $('[name=videoTyp]').value = 'r2';
  hint.textContent = 'Uppladdad. Tar ett omslag…';
  try {
    const { poster, sek, portrait } = await omslagUrFil(file);
    $('[name=videoSek]').value = sek;
    const pr = await laddaUppPoster(state.redigerar.id, poster);
    if (pr.ok) $('[name=videoPoster]').value = pr.url;
    state.redigerar.video = { ...(state.redigerar.video || {}), portrait };
    hint.textContent = `Klart: ${Math.round(sek)} s film${pr.ok ? ', omslag sparat' : ''}. Glöm inte Spara.`;
  } catch { hint.textContent = 'Uppladdad. Kunde inte ta omslag, men filmen fungerar. Glöm inte Spara.'; }
  const v = document.createElement('video'); v.controls = true; v.playsInline = true; v.src = r.url;
  $('#adminplayer').replaceChildren(v);
}

function omslagUrFil(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(2, (v.duration || 4) / 2); });
    v.addEventListener('seeked', () => {
      const c = document.createElement('canvas');
      const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight) * (v.videoHeight > v.videoWidth ? 1.78 : 1));
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(url); b ? resolve({ poster: b, sek: v.duration || 0, portrait: v.videoHeight > v.videoWidth }) : reject(new Error('tom bild')); }, 'image/jpeg', 0.82);
    }, { once: true });
    v.addEventListener('error', () => reject(new Error('kunde inte läsa filmen')), { once: true });
  });
}
