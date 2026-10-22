// Admin → Pass: Haris pass för en spelare. Block med övningar, filmrutor (samtal före/efter, moment),
// tidtagningar med stoppur som låses, kommentarer. Delas med föräldern. Filmer kan bli delar i Träna själv.
import { store } from './store.js';
import { api, laddaUppFilm } from './api.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const TYP = { samtal: ['💬', 'Samtal på film'], film: ['🎥', 'Filma momentet'], tid: ['⏱', 'Tidtagning'], ovning: ['⚽', 'Övning'], text: ['📘', 'Anteckning'] };
const fmtSek = s => `${Number(s).toFixed(1)} s`;

let st = { planer: [], anvandare: [], laddat: false, redigerar: null, kor: null, r2: false };
let ui = null;
let tick = null;
export function passInit(deps) { ui = deps; }
export const passLaddat = () => st.laddat;

export async function passLadda(tvinga = false) {
  if (st.laddat && !tvinga) return;
  const r = await api.admin.get('/admin/planer');
  if (r.ok) { st.planer = r.planer; st.anvandare = r.anvandare; st.laddat = true; }
  const f = await api.admin.get('/admin/filmer'); if (f.ok) st.r2 = !!f.r2;
}
const plan = id => st.planer.find(p => p.id === id);

function mall(barn) {
  return [
    { typ: 'samtal', titel: 'Samtal före', desc: `Filma när du pratar med ${barn || 'barnet'}: hur känns det, vad ska vi jobba på i dag?`, minuter: 3 },
    { typ: 'ovning', titel: 'Uppvärmning med boll', desc: 'Touch på stället, driv, vändningar.', minuter: 10 },
    { typ: 'tid', titel: 'Slalom genom fem koner, före', desc: 'Fem koner, en meter mellan. Tur och retur.', minuter: 5, mal: 25, fardighet: 'Dribbling & finter' },
    { typ: 'film', titel: 'Dagens moment', desc: 'Filma momentet ni jobbar med, så föräldern kan fortsätta hemma.', minuter: 20, fardighet: 'Första touch' },
    { typ: 'tid', titel: 'Slalom genom fem koner, efter', desc: 'Samma bana igen. Har tiden blivit bättre?', minuter: 5, mal: 25, fardighet: 'Dribbling & finter' },
    { typ: 'samtal', titel: 'Samtal efter', desc: 'Filma: vad gick bra, vad tränar ni på hemma till nästa gång?', minuter: 3 },
  ];
}

export function passView(id, lage) {
  if (!st.laddat) { passLadda().then(() => ui.route()); return `<section class="panel"><p class="muted" style="margin:0">Hämtar pass…</p></section>`; }
  if (id === 'ny') return passForm(st.redigerar || { titel: 'Pass med Haris', datum: new Date().toISOString().slice(0, 10), uid: '', barn: '', block: mall(''), delad: false, anteckning: '' });
  if (id) {
    const p = plan(id);
    if (!p) return `<section><p class="muted">Passet hittades inte.</p><a class="btn secondary" href="#/admin/pass">Alla pass</a></section>`;
    return lage === 'kor' ? passKor(p) : passForm(st.redigerar?.id === id ? st.redigerar : JSON.parse(JSON.stringify(p)));
  }
  return `
  <section>
    <div class="section-head"><h2>Pass med spelare</h2><a class="btn" href="#/admin/pass/ny">+ Nytt pass</a></div>
    <p class="small muted">Ett pass per träningstillfälle: samtal på film före och efter, moment som filmas, tidtagningar som låses. Dela med föräldern när det är klart.</p>
    ${st.planer.length ? `<ul class="list">${st.planer.map(p => `<li class="row"><a class="grow" href="#/admin/pass/${p.id}"><b>${esc(p.titel)}</b> · ${esc(p.barn || anvandareNamn(p.uid))}<div class="small muted">${esc(p.datum)} · ${p.block.length} block · ${p.block.filter(b => b.klar).length} klara${p.delad ? ' · <span style="color:var(--brand)">delad</span>' : ''}</div></a><a class="film" href="#/admin/pass/${p.id}/kor">▶ Kör</a></li>`).join('')}</ul>` : '<p class="muted">Inga pass än.</p>'}
  </section>`;
}
const anvandareNamn = uid => { const u = st.anvandare.find(x => x.uid === uid); return u ? (u.barn || u.namn || u.email) : ''; };

function passForm(p) {
  st.redigerar = p;
  return `
  <section>
    <a class="back" href="#/admin/pass">‹ Alla pass</a>
    <h1>${p.id ? 'Redigera pass' : 'Nytt pass'}</h1>
    <form data-form="pass-spara" id="passform">
      <div class="field"><label for="puid">Spelare (förälderns konto)</label>
        <select id="puid" name="uid">${st.anvandare.length ? st.anvandare.map(u => `<option value="${u.uid}" ${p.uid === u.uid ? 'selected' : ''}>${esc(u.barn || '?')} · ${esc(u.email)}</option>`).join('') : '<option value="">Inga konton än, bjud in en förälder först</option>'}</select></div>
      <div class="field"><label for="pbarn">Barnets namn</label><input type="text" id="pbarn" name="barn" value="${esc(p.barn)}" placeholder="T.ex. Elsa"></div>
      <div class="field"><label for="ptitel">Titel</label><input type="text" id="ptitel" name="titel" value="${esc(p.titel)}"></div>
      <div class="field"><label for="pdatum">Datum</label><input type="date" id="pdatum" name="datum" value="${esc(p.datum)}"></div>
      <h3>Block</h3>
      <p class="small muted">Dra inte, ordna med pilarna. Filmrutor och tidtagningar fylls i under passet, i Kör-läget.</p>
      <div class="list" id="blocklista">${p.block.map((b, i) => `<div class="step blockrad" data-i="${i}">
        <span class="num">${i + 1}</span>
        <div style="display:grid;gap:6px">
          <select data-b="typ">${Object.entries(TYP).map(([k, [ic, n]]) => `<option value="${k}" ${b.typ === k ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select>
          <input type="text" data-b="titel" value="${esc(b.titel)}" placeholder="Rubrik">
          <input type="text" data-b="desc" value="${esc(b.desc || '')}" placeholder="Instruktion">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <input type="number" data-b="minuter" value="${b.minuter || 0}" min="0" style="width:70px"> min
            <input type="text" data-b="fardighet" value="${esc(b.fardighet || '')}" placeholder="Färdighet (tagg)" style="flex:1;min-width:120px">
            ${b.typ === 'tid' ? `<label class="small">mål <input type="number" data-b="mal" value="${b.mal || 0}" min="0" style="width:70px"> s</label>` : `<input type="hidden" data-b="mal" value="${b.mal || 0}">`}
          </div>
          ${b.tider?.length ? `<div class="small">⏱ ${b.tider.map(t => fmtSek(t.sek)).join(', ')}</div>` : ''}${b.film ? `<div class="small">🎥 ${esc(b.film.namn || 'film')}</div>` : ''}
        </div>
        <div style="display:grid;gap:4px"><button type="button" class="film" data-action="pass-upp" data-i="${i}">↑</button><button type="button" class="film" data-action="pass-ner" data-i="${i}">↓</button><button type="button" class="film" data-action="pass-bort" data-i="${i}">✕</button></div>
      </div>`).join('')}</div>
      <div class="chips" style="margin-top:10px">${Object.entries(TYP).map(([k, [ic, n]]) => `<button type="button" class="chip" data-action="pass-nytt-block" data-typ="${k}">+ ${ic} ${n}</button>`).join('')}</div>
      <div class="field" style="margin-top:14px"><label for="pant">Anteckning till föräldern</label><textarea id="pant" name="anteckning" placeholder="Det här såg jag i dag, det här tränar ni på hemma…">${esc(p.anteckning || '')}</textarea></div>
      <label class="toggle"><input type="checkbox" name="delad" ${p.delad ? 'checked' : ''}><span><b>Delat med föräldern</b><small>Passet med tider, filmer och anteckning syns under Träna med Haris i förälderns app.</small></span></label>
      <div class="btn-row two" style="margin-top:12px">
        <button class="btn grad" type="submit">Spara</button>
        ${p.id ? `<a class="btn secondary" href="#/admin/pass/${p.id}/kor">▶ Kör passet</a>` : ''}
      </div>
      ${p.id ? `<p class="small"><a data-action="pass-radera" data-id="${p.id}" href="#/admin/pass">Ta bort passet</a></p>` : ''}
    </form>
  </section>`;
}

function lasForm() {
  const p = st.redigerar;
  const fd = new FormData($('#passform'));
  const block = $$('#blocklista .blockrad').map(row => {
    const i = +row.dataset.i, g = p.block[i] || {};
    const v = k => row.querySelector(`[data-b=${k}]`)?.value;
    return { ...g, typ: v('typ'), titel: v('titel'), desc: v('desc'), minuter: +v('minuter') || 0, fardighet: v('fardighet'), mal: +v('mal') || 0 };
  });
  return { ...p, uid: fd.get('uid') || p.uid, barn: fd.get('barn'), titel: fd.get('titel'), datum: fd.get('datum'), anteckning: fd.get('anteckning'), delad: fd.get('delad') === 'on', block };
}

// Kör-läget under träningen: ett block i taget med stora knappar
function passKor(p) {
  const i = Math.min(st.kor?.id === p.id ? st.kor.i : 0, p.block.length - 1);
  st.kor = { id: p.id, i };
  const b = p.block[i];
  if (!b) return `<section><p class="muted">Passet har inga block.</p></section>`;
  const [ic, typ] = TYP[b.typ] || ['', ''];
  let kropp = '';
  if (b.typ === 'tid') {
    const bast = b.tider?.length ? Math.min(...b.tider.map(t => t.sek)) : null;
    kropp = `<div class="panel stopur" data-id="${b.id}">
      <div class="small muted">${b.mal ? `Målet är under <b>${b.mal} s</b>.` : 'Tiden låses när du trycker Lås.'}</div>
      <div class="stopur-klocka" id="stopurKlocka">0.0</div>
      <div class="btn-row two"><button class="btn grad" id="stopurKnapp">Starta</button><button class="btn secondary" id="stopurLas" disabled>Lås tiden</button></div>
      ${b.tider?.length ? `<p class="small" style="margin:10px 0 0">Låsta: ${b.tider.map(t => `<b>${fmtSek(t.sek)}</b>`).join(', ')}${bast != null && b.mal ? (bast <= b.mal ? ' ⭐' : '') : ''}</p>` : ''}
    </div>`;
  } else if (b.typ === 'samtal' || b.typ === 'film') {
    kropp = `<div class="panel brand">
      ${b.film ? `<p class="small">🎥 Inspelad: ${esc(b.film.namn || 'film')}${b.film.url ? ' · uppladdad' : ' · sparas när fillagringen är på'}</p>` : '<p class="small muted">Tryck Filma nu, så öppnas kameran.</p>'}
      <label class="btn ${b.film ? 'secondary' : 'grad'} block" for="passfilm">${b.film ? 'Filma igen' : '🎥 Filma nu'}</label>
      <input type="file" id="passfilm" accept="video/*" capture="environment" hidden data-plan="${p.id}" data-block="${b.id}">
      <div class="progress" hidden id="passbar" style="margin-top:8px"><i style="width:0%"></i></div>
      ${b.film?.url && !b.film.filmId ? `<button class="btn secondary block" style="margin-top:8px" data-action="pass-till-bibliotek" data-block="${b.id}">Spara filmen till Träna själv</button>` : b.film?.filmId ? '<p class="small muted">Finns i Träna själv som utkast. Tagga och publicera under Filmer.</p>' : ''}
    </div>`;
  } else {
    kropp = `<div class="panel"><p class="small muted" style="margin:0">${esc(b.desc || 'Kör övningen och bocka av när ni är klara.')}</p></div>`;
  }
  return `
  <a class="back" href="#/admin/pass/${p.id}">‹ ${esc(p.titel)}</a>
  <section>
    <div class="eyebrow">${ic} ${typ} · block ${i + 1} av ${p.block.length}${p.barn ? ` · ${esc(p.barn)}` : ''}</div>
    <h1>${esc(b.titel)}</h1>
    ${b.desc && b.typ !== 'ovning' && b.typ !== 'text' ? `<p class="muted">${esc(b.desc)}</p>` : ''}
    <div class="progress"><i style="width:${Math.round((i + 1) / p.block.length * 100)}%"></i></div>
  </section>
  <section>${kropp}</section>
  <section class="panel"><div class="field" style="margin:0"><label for="pkom">Kommentar till föräldern</label><textarea id="pkom" data-action="pass-kommentar" data-block="${b.id}" placeholder="Vad såg du?">${esc(b.kommentar || '')}</textarea></div></section>
  <section class="btn-row two">
    <button class="btn secondary" data-action="pass-steg" data-d="-1" ${i === 0 ? 'disabled' : ''}>‹ Förra</button>
    ${i < p.block.length - 1 ? `<button class="btn grad" data-action="pass-steg" data-d="1">${b.klar ? 'Nästa ›' : 'Klar, nästa ›'}</button>` : `<button class="btn grad" data-action="pass-avsluta">Avsluta passet</button>`}
  </section>`;
}

async function sparaPlan(p) {
  const r = p.id ? await api.admin.put(`/admin/plan/${p.id}`, p) : await api.admin.post('/admin/plan', p);
  if (r.ok) { const i = st.planer.findIndex(x => x.id === r.plan.id); if (i >= 0) st.planer[i] = r.plan; else st.planer.unshift(r.plan); }
  return r;
}

export function passStopur() {
  clearInterval(tick);
  const box = $('.stopur'), klocka = $('#stopurKlocka'), knapp = $('#stopurKnapp'), las = $('#stopurLas');
  if (!box || !knapp) return;
  let running = false, start = 0, acc = 0;
  const draw = () => { const t = (acc + (running ? Date.now() - start : 0)) / 1000; klocka.textContent = t.toFixed(1); };
  knapp.onclick = () => { if (running) { acc += Date.now() - start; running = false; knapp.textContent = 'Fortsätt'; las.disabled = acc < 500; } else { start = Date.now(); running = true; knapp.textContent = 'Stoppa'; las.disabled = true; } draw(); };
  las.onclick = async () => {
    if (running || acc < 500) return;
    const p = plan(st.kor.id), b = p.block.find(x => x.id === box.dataset.id);
    (b.tider = b.tider || []).push({ sek: Math.round(acc / 100) / 10, t: new Date().toISOString() }); b.klar = true;
    const r = await sparaPlan(p); ui.toast(r.ok ? `Tiden ${fmtSek(b.tider.at(-1).sek)} är låst` : `Gick inte: ${r.fel}`); ui.route();
  };
  tick = setInterval(draw, 100);
}
export function passStoppa() { clearInterval(tick); }

export async function passFilVald(input) {
  const file = input.files?.[0]; if (!file) return;
  const p = plan(input.dataset.plan), b = p.block.find(x => x.id === input.dataset.block);
  b.film = { namn: file.name.slice(0, 60), t: new Date().toISOString(), url: '', poster: '' }; b.klar = true;
  if (st.r2) {
    const bar = $('#passbar'); if (bar) bar.hidden = false;
    const r = await laddaUppFilm(`plan-${p.id}`, file, k => { if (bar) bar.firstElementChild.style.width = Math.round(k * 100) + '%'; });
    if (r.ok) b.film.url = r.url; else ui.toast(`Uppladdningen misslyckades: ${r.fel}`);
  }
  const r = await sparaPlan(p); ui.toast(r.ok ? 'Filmen är sparad i passet' : `Gick inte: ${r.fel}`); ui.route();
}

export async function passAction(action, el, e) {
  const { toast, route, go } = ui;
  if (action === 'pass-nytt-block') { const p = lasForm(); p.block.push({ typ: el.dataset.typ, titel: TYP[el.dataset.typ][1], desc: '', minuter: 5, mal: el.dataset.typ === 'tid' ? 25 : 0 }); st.redigerar = p; route(); return true; }
  if (action === 'pass-bort') { const p = lasForm(); p.block.splice(+el.dataset.i, 1); st.redigerar = p; route(); return true; }
  if (action === 'pass-upp' || action === 'pass-ner') { const p = lasForm(); const i = +el.dataset.i, j = action === 'pass-upp' ? i - 1 : i + 1; if (p.block[j]) [p.block[i], p.block[j]] = [p.block[j], p.block[i]]; st.redigerar = p; route(); return true; }
  if (action === 'pass-radera') {
    e.preventDefault();
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen för att ta bort'; setTimeout(() => { delete el.dataset.armed; el.textContent = 'Ta bort passet'; }, 4000); return true; }
    const r = await api.admin.del(`/admin/plan/${el.dataset.id}`); if (r.ok) st.planer = st.planer.filter(x => x.id !== el.dataset.id);
    st.redigerar = null; toast(r.ok ? 'Passet är borttaget' : `Gick inte: ${r.fel}`); go('/admin/pass'); return true;
  }
  if (action === 'pass-steg') {
    const p = plan(st.kor.id), b = p.block[st.kor.i];
    const kom = $('#pkom')?.value; if (kom !== undefined && kom !== (b.kommentar || '')) b.kommentar = kom;
    if (Number(el.dataset.d) > 0 && !b.klar) b.klar = true;
    await sparaPlan(p);
    st.kor.i = Math.max(0, Math.min(p.block.length - 1, st.kor.i + Number(el.dataset.d))); route(); return true;
  }
  if (action === 'pass-avsluta') {
    const p = plan(st.kor.id), b = p.block[st.kor.i];
    const kom = $('#pkom')?.value; if (kom !== undefined) b.kommentar = kom; b.klar = true;
    await sparaPlan(p); toast('Passet är klart. Dela det med föräldern i formuläret.'); go(`/admin/pass/${p.id}`); return true;
  }
  if (action === 'pass-till-bibliotek') {
    const p = plan(st.kor.id), b = p.block.find(x => x.id === el.dataset.block);
    const tags = { fardighet: b.fardighet ? [b.fardighet] : [], typ: ['Specifik färdighet'], position: ['Alla'], alder: ['Alla'], niva: ['Alla'] };
    const r = await api.admin.post('/admin/film', { titel: `${b.titel} (${p.barn || 'pass'} ${p.datum})`, beskrivning: b.desc || '', traningMin: b.minuter || 10, status: 'utkast', tags, moment: [], video: { typ: 'r2', url: b.film.url, poster: b.film.poster || '', sek: 0 } });
    if (r.ok) { b.film.filmId = r.film.id; await sparaPlan(p); toast('Sparad som utkast under Filmer'); } else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  return false;
}

export async function passSubmit(kind, f, fd) {
  if (kind !== 'pass-spara') return false;
  const p = lasForm();
  if (!p.uid) { ui.toast('Välj en spelare. Bjud in föräldern först om kontot saknas.'); return true; }
  const r = await sparaPlan(p);
  if (!r.ok) { ui.toast(`Gick inte att spara: ${r.fel}`); return true; }
  st.redigerar = null; ui.toast(p.delad ? 'Sparat och delat med föräldern' : 'Sparat'); ui.go(`/admin/pass/${r.plan.id}`); return true;
}
