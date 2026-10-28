// Adminsidan för Haris (Carl 2026-10-21/23): klientregister, tider, pass, filmer med taggar, stigen, nyhet som push.
import { store } from './store.js?v=34b2e5f';
import { api, laddaUppFilm, laddaUppPoster, hamtaFilmer } from './api.js?v=34b2e5f';
import { tiderInit, tiderView, tiderAction, tiderSubmit, tiderGlom } from './admin-tider.js?v=34b2e5f';
import { swishLank, visaSwish, kr } from './swish.js?v=34b2e5f';
import { passInit, passView, passAction, passSubmit, passStopur, passStoppa, passFilVald, passGlom } from './admin-pass.js?v=34b2e5f';
import { stigAdminInit, stigAdminView, stigAdminAction } from './admin-stig.js?v=34b2e5f';
import { klienterInit, klienterView, klienterAction, klienterSubmit, klienterAfterRender, klienterLadda, klientGlom } from './admin-klienter.js?v=34b2e5f';
import { ovningarInit, ovningarView, ovningarAction, ovningarAfterRender } from './admin-ovningar.js?v=34b2e5f';
import { kopplaKlipp } from './ovningsbank.js?v=34b2e5f';
import { sattR2 } from './media.js?v=34b2e5f';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const fmtT = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

let TAGS = null;          // data/taggar.json
let state = { flik: 'klienter', filmer: [], r2: false, sms: false, redigerar: null, laddat: false };
let ui = null;            // { toast, route, go, content }
const FLIKAR = [['klienter', 'Klienter'], ['tider', 'Tider'], ['ovningar', 'Övningar'], ['filmer', 'Filmer'], ['stigen', 'Stigen'], ['mer', 'Mer']];

export async function adminInit(deps) {
  // när ett pass sparas/tas bort ska klientsidan hämtas om nästa gång
  ui = { ...deps, klientAndrad: () => { klientGlom(); }, passAndrad: () => { passGlom(); }, tiderAndrad: () => { tiderGlom(); } };
  tiderInit(ui); passInit(ui); stigAdminInit(ui, deps.content); klienterInit(ui); ovningarInit(ui);
  if (!TAGS) TAGS = await (await fetch('data/taggar.json?v=34b2e5f', { cache: 'no-cache' })).json();
}
export const taggar = () => TAGS;
export const adminLaddat = () => state.laddat;

// Kopplar in filval, sök och stoppur efter att adminvyn ritats; stoppar klockor när man lämnar
export function adminAfterRender(view) {
  const fil = view.querySelector('#fil'); if (fil) fil.addEventListener('change', () => adminFilVald(fil));
  const pf = view.querySelector('#passfilm'); if (pf) pf.addEventListener('change', () => passFilVald(pf));
  if (view.querySelector('.stopur #stopurKnapp') || view.querySelector('#recTid')) passStopur();
  klienterAfterRender(view);
  ovningarAfterRender(view);
  kopplaKlipp(view);
}
export function adminStop() { passStoppa(); }

export function adminPage(flik = 'klienter', id, lage) {
  if (!store.admin) return `
  <section class="hero" style="padding-top:30px">
    <img class="hero-logo" src="assets/cap-logo.png" alt="">
    <div class="eyebrow">Admin</div>
    <h1>Logga in</h1>
    <p class="lead">För Haris och Carl. Klienter, tider, pass, filmer och stigen.</p>
  </section>
  <section class="panel">
    <form data-form="admin-login">
      <div class="field"><label for="losen">Lösenord</label><input type="password" id="losen" name="losen" autocomplete="current-password"></div>
      <button class="btn grad block" type="submit">Logga in</button>
    </form>
  </section>
  <p class="small muted" style="text-align:center"><a href="#/login">‹ Till appen</a></p>`;

  if (flik === 'klient') flik = 'klienter';
  if (!FLIKAR.some(([k]) => k === flik) && flik !== 'pass') flik = 'klienter';
  state.flik = flik;
  const rubrik = { klienter: 'Klienter', tider: 'Tider att boka', ovningar: 'Övningsbanken', pass: 'Alla pass', filmer: 'Filmer', stigen: 'Träna själv-stigen', mer: 'Mer' }[flik];
  const inre = flik === 'klienter' ? klienterView(id, lage)
    : flik === 'tider' ? tiderView()
    : flik === 'ovningar' ? ovningarView()
    : flik === 'pass' ? passView(id, lage)
    : flik === 'filmer' ? filmerFlik()
    : flik === 'stigen' ? stigAdminView()
    : merFlik();
  const topp = id ? '' : `
  <section>
    <div class="section-head"><div><div class="eyebrow">Admin</div><h1 style="margin:0">${rubrik}</h1></div><a class="small" href="#/">Till appen ›</a></div>
    <div class="chips" style="margin-top:10px">${FLIKAR.map(([k, t]) => `<a class="chip ${flik === k || (flik === 'pass' && k === 'klienter') ? 'brand on' : ''}" href="#/admin/${k}">${t}</a>`).join('')}</div>
  </section>`;
  return topp + inre;
}

function merFlik() {
  // dagens sms-räknare ändras hela tiden; hämta om när fliken visas
  if (Date.now() - (state.hamtat || 0) > 4000 && !state.hamtar) { state.hamtar = true; adminLadda().finally(() => { state.hamtar = false; if (location.hash === '#/admin/mer') ui.route(); }); }
  return `
  <section class="cards">
    <a class="card" href="#/admin/pass"><div class="card-body"><div class="eyebrow">Pass</div><h3>Alla pass</h3><p class="desc">Passen för alla klienter i en lista. Nya pass planeras från klientens sida.</p></div></a>
  </section>
  ${betalningPanel()}
  ${nyhetFlik()}
  <section class="panel">
    <h3>Tjänster</h3>
    <ul class="checks small">
      <li>Sms: ${state.sms ? `på. Länkar och inloggningskoder skickas från <b>${esc(state.smsFran || 'CapSwe')}</b>. I dag <b>${state.smsIdag || 0}</b> av ${state.smsTak || 25} sms.` : 'inte påslaget än. Länken skickas från Haris telefon (appen öppnar Meddelanden med texten ifylld) och föräldrarna loggar in med en egen kod. När sms-tjänsten är på loggar de in med mobilnummer och sms-kod.'}</li>
      <li>Fillagring för filmer och ljud (R2): ${state.r2 ? 'på. Inspelningar laddas upp till spelaren.' : 'inte påslagen än. Inspelningar sparas på telefonen tills dess och kan laddas upp från klientens sida sedan.'}</li>
    </ul>
    ${state.sms ? `<form data-form="admin-smstest" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <input type="tel" name="telefon" placeholder="Ditt mobilnummer" required style="flex:1;min-width:160px">
      <button class="btn secondary" type="submit">Skicka testsms</button>
    </form>` : ''}
  </section>
  <section class="panel"><div class="section-head"><h3>Konto</h3><a class="small" data-action="admin-ut" href="#/admin">Logga ut</a></div><p class="small muted" style="margin:0"><a href="#/">Till förälderappen ›</a></p></section>`;
}

// Priser och Swish (Carl 2026-10-27/28): numret, priset per pass och paketen (850 kr per pass, 10 pass 6 900 kr,
// 20 pass 12 900 kr). Föräldrarna får en Swish-knapp med allt ifyllt. Appen kan inte se betalningen, så Haris bockar
// av den under Tider eller på klientens sida.
const paketRad = (m = {}) => `<div class="paket-rad">
  <input type="hidden" name="pid" value="${esc(m.id || '')}">
  <input type="text" name="pnamn" value="${esc(m.namn || '')}" placeholder="Namn, t.ex. 10 pass" aria-label="Paketets namn">
  <label class="small">Antal pass <input type="number" name="pantal" min="1" max="100" step="1" value="${m.antal || ''}"></label>
  <label class="small">Pris (kr) <input type="number" name="ppris" min="1" step="1" value="${m.pris || ''}"></label>
  <button type="button" class="film" data-action="admin-paket-bort" aria-label="Ta bort paketet">✕</button>
  ${m.antal && m.pris ? `<div class="small muted per">${esc(perPass(m))}</div>` : ''}
</div>`;
const perPass = m => { const styck = state.betalning?.pris, spar = styck ? styck * m.antal - m.pris : 0; return `${kr(Math.round(m.pris / m.antal))} per pass${spar > 0 ? ` · ${kr(spar)} billigare än ${m.antal} enstaka pass` : ''}`; };
function betalningPanel() {
  if (!state.betalning && !state.betalningHamtar) {
    state.betalningHamtar = true;
    api.admin.get('/admin/config/betalning').then(r => { state.betalning = r.ok ? r.config : { swish: '', pris: null, paket: [] }; }).finally(() => { state.betalningHamtar = false; if (location.hash === '#/admin/mer') ui.route(); });
  }
  const b = state.betalning;
  if (!b) return `<section class="panel"><h3>Priser och Swish</h3><p class="small muted" style="margin:0">Hämtar…</p></section>`;
  const klar = b.swish && b.pris;
  return `
  <section class="panel ${klar ? 'brand' : ''}" id="priser">
    <h3>Priser och Swish</h3>
    <p class="small muted" style="margin-top:0">${klar
      ? `Föräldrarna får knappen <b>Betala ${esc(kr(b.pris))} med Swish</b> när de bokat. Swish öppnas med ${esc(visaSwish(b.swish))}, beloppet och ett meddelande som "CAP Alva Lind 3 nov kl 17.00" ifyllt. Du ser betalningen i din Swish och bockar av den under Tider.`
      : 'Skriv Swish-numret och priset för ett pass. Veckor går inte att öppna för bokning förrän båda finns.'}</p>
    <form data-form="admin-betalning">
      <div class="auto-rad" style="align-items:end">
        <label>Swish-nummer <input type="text" name="swish" inputmode="numeric" value="${esc(visaSwish(b.swish))}" placeholder="123 456 78 90"></label>
        <label>Pris per pass (kr) <input type="number" name="pris" min="0" max="100000" step="1" value="${b.pris || ''}" placeholder="t.ex. 850"></label>
      </div>
      <h4 style="margin:16px 0 2px">Paket</h4>
      <p class="small muted" style="margin:0 0 6px">Flera pass till ett lägre pris. Paketet läggs på barnet och bokningarna dras från det.</p>
      <div class="paket-rader">${(b.paket || []).map(paketRad).join('')}</div>
      <div class="btn-row two" style="margin-top:10px"><button type="button" class="btn secondary" data-action="admin-paket-ny">+ Lägg till paket</button><button class="btn grad" type="submit">Spara priserna</button></div>
    </form>
    ${klar ? `<p class="small" style="margin:10px 0 0"><a href="${esc(swishLank(b.swish, b.pris, 'CAP test'))}">Prova länken på mobilen ›</a> <span class="muted">Öppnar Swish med ${esc(kr(b.pris))} och "CAP test", betala inte.</span></p>` : ''}
  </section>`;
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

/* ---------- Nyhet ---------- */

function nyhetFlik() {
  return `
  <section>
    <h2>Skicka en nyhet</h2>
    <p class="small muted">Går som pushnotis till alla telefoner som slagit på "Nyheter från Haris" i appen.</p>
    <form data-form="admin-notis" class="panel">
      <div class="field"><label for="ntitle">Rubrik</label><input type="text" id="ntitle" name="title" value="CAP" maxlength="40"></div>
      <div class="field"><label for="ntext">Text</label><textarea id="ntext" name="text" required maxlength="180" placeholder="T.ex. Nytt pass ute: Avslut insida!"></textarea></div>
      <button class="btn grad block" type="submit">Skicka till alla</button>
    </form>
  </section>`;
}

/* ---------- Händelser ---------- */

export async function adminLadda() {
  if (!store.admin) return;
  const r = await api.admin.get('/admin/filmer');
  if (r.ok) { state.filmer = r.filmer; state.r2 = !!r.r2; state.sms = !!r.sms; state.smsIdag = r.smsIdag; state.smsTak = r.smsTak; state.smsFran = r.smsFran; state.hamtat = Date.now(); sattR2(!!r.r2); }
  state.laddat = true;
}

export async function adminAction(action, el, e) {
  const { toast, route } = ui;
  if (action.startsWith('tid-')) return tiderAction(action, el, e);
  if (action.startsWith('pass-')) return passAction(action, el, e);
  if (action.startsWith('stig-')) return stigAdminAction(action, el, e);
  if (action.startsWith('klient-')) return klienterAction(action, el, e);
  if (action.startsWith('ov-')) return ovningarAction(action, el, e);
  if (action === 'admin-ut') { e.preventDefault(); store.admin = null; state = { ...state, laddat: false, redigerar: null }; klientGlom(); passGlom(); ui.go('/admin'); return true; }
  if (action === 'admin-paket-ny') {
    const lista = el.closest('form')?.querySelector('.paket-rader'); if (!lista) return true;
    lista.insertAdjacentHTML('beforeend', paketRad());
    const rad = lista.lastElementChild; rad.querySelectorAll('[data-action]').forEach(x => x.addEventListener('click', ui.onAction)); rad.querySelector('input[name=pnamn]').focus();
    return true;
  }
  if (action === 'admin-paket-bort') { el.closest('.paket-rad')?.remove(); return true; }
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
  if (kind.startsWith('klient-')) return klienterSubmit(kind, f, fd);
  if (kind === 'admin-login') {
    const r = await api.post('/admin/login', { losen: fd.get('losen') });
    if (!r.ok) { toast(r.fel || 'Fel lösenord'); return true; }
    store.admin = r.token; state.laddat = false; klientGlom(); passGlom(); ui.go('/admin/klienter'); await adminLadda(); klienterLadda(true).then(() => route()); route(); return true;
  }
  if (kind === 'admin-film') {
    const film = lasForm();
    if (!film.titel.trim()) { toast('Filmen behöver en titel'); return true; }
    const r = film.id ? await api.admin.put(`/admin/film/${film.id}`, film) : await api.admin.post('/admin/film', film);
    if (!r.ok) { toast(`Gick inte att spara: ${r.fel}`); return true; }
    toast(film.status === 'publicerad' ? 'Sparad och publicerad' : 'Sparad som utkast');
    state.redigerar = null; await adminLadda(); hamtaFilmer({ tvinga: true }); route(); return true;
  }
  if (kind === 'admin-betalning') {
    const pid = fd.getAll('pid'), antal = fd.getAll('pantal'), pris = fd.getAll('ppris');
    const paket = fd.getAll('pnamn').map((namn, i) => ({ id: pid[i], namn, antal: antal[i], pris: pris[i] })).filter(m => String(m.namn).trim() || m.antal || m.pris);
    const halv = paket.findIndex(m => !(+m.antal >= 1) || !(+m.pris >= 1));
    if (halv >= 0) { toast(`Paket ${halv + 1} saknar antal pass eller pris`); return true; }
    const r = await api.admin.put('/admin/config/betalning', { swish: fd.get('swish'), pris: fd.get('pris'), paket });
    // vid fel ritas inget om, så att det Haris skrivit står kvar
    if (!r.ok) { toast(`Gick inte: ${r.fel}`); return true; }
    state.betalning = r.config; tiderGlom();
    toast(r.config.swish && r.config.pris ? `Sparat: ${kr(r.config.pris)} per pass${r.config.paket.length ? ` och ${r.config.paket.length} ${r.config.paket.length === 1 ? 'paket' : 'paket'}` : ''}.` : 'Sparat. Veckor kan öppnas när både Swish-nummer och pris finns.');
    route(); return true;
  }
  if (kind === 'admin-smstest') {
    const r = await api.admin.post('/admin/smstest', { telefon: fd.get('telefon') });
    if (r.smsTak !== undefined) { state.smsIdag = r.smsIdag; state.smsTak = r.smsTak; }
    toast(r.ok ? 'Testsms:et är skickat' : `Gick inte: ${r.fel}`);
    route(); return true;
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
