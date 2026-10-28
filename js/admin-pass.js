// Admin → Pass: Haris pass för en klient. Block med övningar, samtal, filmning, tidtagning och bedömningar
// (flera försök med stoppur, medeltiden sparas på spelaren). I kör-läget kan varje block filmas eller spelas
// in som ljud direkt från appen. Passet delas med föräldern. Filmer kan bli delar i Träna själv.
import { api } from './api.js';
import { sparaInspelning, startaLjud, kanSpelaInLjud, lokalUrl, r2Pa, sattR2 } from './media.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const TYP = { samtal: ['💬', 'Samtal på film'], bedomning: ['📊', 'Bedömning med tid'], film: ['🎥', 'Filma momentet'], tid: ['⏱', 'Tidtagning'], ovning: ['⚽', 'Övning'], text: ['📘', 'Anteckning'] };
const fmtSek = s => `${Number(s).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const fmtKlocka = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

let st = { planer: [], anvandare: [], klienter: [], laddat: false, redigerar: null, kor: null, varv: {}, rec: null };
let ui = null;
let tick = null;
export function passInit(deps) { ui = deps; }
export const passLaddat = () => st.laddat;

export async function passLadda(tvinga = false) {
  if (st.laddat && !tvinga) return;
  const r = await api.admin.get('/admin/planer');
  if (r.ok) { st.planer = r.planer; st.anvandare = r.anvandare || []; st.klienter = r.klienter || []; st.laddat = true; }
  const f = await api.admin.get('/admin/filmer'); if (f.ok) sattR2(!!f.r2);
}
export function passGlom() { st.laddat = false; }
const plan = id => st.planer.find(p => p.id === id);
const klient = uid => st.klienter.find(k => k.id === uid);

function mall(barn) {
  const b = barn || 'barnet';
  return [
    { typ: 'samtal', titel: 'Samtal före', desc: `Filma när du pratar med ${b}: hur känns det, vad ska vi jobba på i dag?`, minuter: 3 },
    { typ: 'ovning', titel: 'Uppvärmning med boll', desc: 'Touch på stället, driv, vändningar.', minuter: 10 },
    { typ: 'bedomning', titel: 'Konbana', desc: 'Fem koner, en meter mellan. Tur och retur. Tre försök, medeltiden sparas.', minuter: 6, varv: 3, fardighet: 'Dribbling & finter' },
    { typ: 'film', titel: 'Dagens moment', desc: 'Filma momentet ni jobbar med, så föräldern kan fortsätta hemma.', minuter: 20, fardighet: 'Första touch' },
    { typ: 'ovning', titel: 'Spel med moment', desc: 'Använd dagens moment i spelform.', minuter: 12 },
    { typ: 'samtal', titel: 'Samtal efter', desc: 'Filma: vad gick bra, vad tränar ni på hemma till nästa gång?', minuter: 3 },
  ];
}

export function passView(id, lage) {
  if (!st.laddat) { passLadda().then(() => ui.route()); return `<section class="panel"><p class="muted" style="margin:0">Hämtar pass…</p></section>`; }
  if (id === 'ny') {
    const k = lage ? klient(lage) : null;
    const forslag = { titel: 'Pass med Haris', datum: new Date().toISOString().slice(0, 10), uid: k?.id || '', barn: k?.barn || '', block: mall(k?.barn), delad: false, anteckning: '' };
    return passForm(st.redigerar && !st.redigerar.id && (!lage || st.redigerar.uid === lage) ? st.redigerar : forslag);
  }
  if (id) {
    const p = plan(id);
    if (!p) return `<section><p class="muted">Passet hittades inte.</p><a class="btn secondary" href="#/admin/pass">Alla pass</a></section>`;
    return lage === 'kor' ? passKor(p) : passForm(st.redigerar?.id === id ? st.redigerar : JSON.parse(JSON.stringify(p)));
  }
  return `
  <section>
    <div class="section-head"><h2>Alla pass</h2><a class="btn" href="#/admin/pass/ny">+ Nytt pass</a></div>
    <p class="small muted">Ett pass per träningstillfälle. Enklast: gå in på klienten under Klienter och tryck Planera nytt pass.</p>
    ${st.planer.length ? `<ul class="list">${st.planer.map(p => `<li class="row"><a class="grow" href="#/admin/pass/${p.id}"><b>${esc(p.titel)}</b> · ${esc(p.barn || spelareNamn(p.uid))}<div class="small muted">${esc(p.datum)} · ${p.block.length} block · ${p.block.filter(b => b.klar).length} klara${p.delad ? ' · <span style="color:var(--brand)">delat</span>' : ''}</div></a><a class="film" href="#/admin/pass/${p.id}/kor">▶ Kör</a></li>`).join('')}</ul>` : '<p class="muted">Inga pass än.</p>'}
  </section>`;
}
const spelareNamn = uid => { const k = klient(uid); if (k) return k.barn; const u = st.anvandare.find(x => x.uid === uid); return u ? (u.barn || u.namn || u.email) : ''; };

function passForm(p) {
  st.redigerar = p;
  const tillbaka = p.uid && klient(p.uid) ? `/admin/klient/${p.uid}` : '/admin/pass';
  return `
  <section>
    <a class="back" href="#${tillbaka}">‹ ${p.uid && klient(p.uid) ? esc(klient(p.uid).barn) : 'Alla pass'}</a>
    <h1>${p.id ? 'Redigera pass' : 'Nytt pass'}</h1>
    <form data-form="pass-spara" id="passform">
      <div class="field"><label for="puid">Spelare</label>
        <select id="puid" name="uid">
          ${st.klienter.length ? st.klienter.map(k => `<option value="${k.id}" ${p.uid === k.id ? 'selected' : ''}>${esc(k.barn || '?')} · ${esc(k.foralder || '')} (nivå ${k.niva})</option>`).join('') : ''}
          ${st.anvandare.length ? `<optgroup label="Gamla konton">${st.anvandare.map(u => `<option value="${u.uid}" ${p.uid === u.uid ? 'selected' : ''}>${esc(u.barn || '?')} · ${esc(u.email)}</option>`).join('')}</optgroup>` : ''}
          ${!st.klienter.length && !st.anvandare.length ? '<option value="">Inga klienter än, lägg in en under Klienter först</option>' : ''}
        </select></div>
      <div class="field"><label for="ptitel">Titel</label><input type="text" id="ptitel" name="titel" value="${esc(p.titel)}"></div>
      <div class="field"><label for="pdatum">Datum</label><input type="date" id="pdatum" name="datum" value="${esc(p.datum)}"></div>
      <h3>Block</h3>
      <p class="small muted">Ordna med pilarna. Filmer, ljud, tider och bedömningar fylls i under passet, i Kör-läget. Bedömningen tas med stoppur i flera försök och medeltiden sparas på spelaren.</p>
      <div class="list" id="blocklista">${p.block.map((b, i) => `<div class="step blockrad" data-i="${i}">
        <span class="num">${i + 1}</span>
        <div style="display:grid;gap:6px">
          <select data-b="typ">${Object.entries(TYP).map(([k, [ic, n]]) => `<option value="${k}" ${b.typ === k ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select>
          <input type="text" data-b="titel" value="${esc(b.titel)}" placeholder="${b.typ === 'bedomning' ? 'Vad mäts? T.ex. Konbana' : 'Rubrik'}">
          <input type="text" data-b="desc" value="${esc(b.desc || '')}" placeholder="Instruktion">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <input type="number" data-b="minuter" value="${b.minuter || 0}" min="0" style="width:70px"> min
            <input type="text" data-b="fardighet" value="${esc(b.fardighet || '')}" placeholder="Färdighet (tagg)" style="flex:1;min-width:120px">
            ${b.typ === 'tid' ? `<label class="small">mål <input type="number" data-b="mal" value="${b.mal || 0}" min="0" style="width:70px"> s</label>` : `<input type="hidden" data-b="mal" value="${b.mal || 0}">`}
            ${b.typ === 'bedomning' ? `<label class="small">försök <input type="number" data-b="varv" value="${b.varv || 3}" min="1" max="10" style="width:64px"></label>` : `<input type="hidden" data-b="varv" value="${b.varv || 3}">`}
          </div>
          ${b.tider?.length ? `<div class="small">⏱ ${b.tider.map(t => fmtSek(t.sek)).join(', ')}</div>` : ''}
          ${b.resultat ? `<div class="small">📊 medel <b>${fmtSek(b.resultat.medel)}</b> (${b.resultat.varv.map(fmtSek).join(', ')})</div>` : ''}
          ${b.media?.length ? `<div class="small">${b.media.map(m => `${m.typ === 'audio' ? '🎙' : '🎥'} ${esc(m.namn || m.typ)}`).join(' · ')}</div>` : b.film ? `<div class="small">🎥 ${esc(b.film.namn || 'film')}</div>` : ''}
        </div>
        <div style="display:grid;gap:4px"><button type="button" class="film" data-action="pass-upp" data-i="${i}">↑</button><button type="button" class="film" data-action="pass-ner" data-i="${i}">↓</button><button type="button" class="film" data-action="pass-bort" data-i="${i}">✕</button></div>
      </div>`).join('')}</div>
      <div class="chips" style="margin-top:10px">${Object.entries(TYP).map(([k, [ic, n]]) => `<button type="button" class="chip" data-action="pass-nytt-block" data-typ="${k}">+ ${ic} ${n}</button>`).join('')}</div>
      <div class="field" style="margin-top:14px"><label for="pant">Anteckning till föräldern</label><textarea id="pant" name="anteckning" placeholder="Det här såg jag i dag, det här tränar ni på hemma…">${esc(p.anteckning || '')}</textarea></div>
      <label class="toggle"><input type="checkbox" name="delad" ${p.delad ? 'checked' : ''}><span><b>Delat med föräldern</b><small>Passet med tider, bedömningar, filmer, ljud och anteckning syns i förälderns app under Träna med Haris och Utveckling.</small></span></label>
      <div class="btn-row two" style="margin-top:12px">
        <button class="btn grad" type="submit">Spara</button>
        ${p.id ? `<a class="btn secondary" href="#/admin/pass/${p.id}/kor">▶ Kör passet</a>` : ''}
      </div>
      ${p.id ? `<p class="small"><a data-action="pass-radera" data-id="${p.id}" href="#${tillbaka}">Ta bort passet</a></p>` : ''}
    </form>
  </section>`;
}

function lasForm() {
  const p = st.redigerar;
  const fd = new FormData($('#passform'));
  const block = $$('#blocklista .blockrad').map(row => {
    const i = +row.dataset.i, g = p.block[i] || {};
    const v = k => row.querySelector(`[data-b=${k}]`)?.value;
    return { ...g, typ: v('typ'), titel: v('titel'), desc: v('desc'), minuter: +v('minuter') || 0, fardighet: v('fardighet'), mal: +v('mal') || 0, varv: +v('varv') || 3 };
  });
  const uid = fd.get('uid') || p.uid;
  return { ...p, uid, barn: klient(uid)?.barn || spelareNamn(uid) || p.barn, titel: fd.get('titel'), datum: fd.get('datum'), anteckning: fd.get('anteckning'), delad: fd.get('delad') === 'on', block };
}

/* ---------- kör-läget ---------- */

// Ett block i taget med stora knappar. Varje block kan filmas eller spelas in som ljud.
function passKor(p) {
  const i = Math.min(st.kor?.id === p.id ? st.kor.i : 0, p.block.length - 1);
  st.kor = { id: p.id, i };
  const b = p.block[i];
  if (!b) return `<section><p class="muted">Passet har inga block.</p></section>`;
  const [ic, typ] = TYP[b.typ] || ['', ''];
  let kropp = '';
  if (b.typ === 'tid') {
    const bast = b.tider?.length ? Math.min(...b.tider.map(t => t.sek)) : null;
    kropp = `<div class="panel stopur" data-id="${b.id}" data-lage="en">
      <div class="small muted">${b.mal ? `Målet är under <b>${b.mal} s</b>.` : 'Tiden låses när du trycker Lås.'}</div>
      <div class="stopur-klocka" id="stopurKlocka">0.0</div>
      <div class="btn-row two"><button class="btn grad" id="stopurKnapp">Starta</button><button class="btn secondary" id="stopurLas" disabled>Lås tiden</button></div>
      ${b.tider?.length ? `<p class="small" style="margin:10px 0 0">Låsta: ${b.tider.map(t => `<b>${fmtSek(t.sek)}</b>`).join(', ')}${bast != null && b.mal ? (bast <= b.mal ? ' ⭐' : '') : ''}</p>` : ''}
    </div>`;
  } else if (b.typ === 'bedomning') {
    const varv = st.varv[b.id] || [];
    const medel = varv.length ? varv.reduce((a, x) => a + x, 0) / varv.length : 0;
    kropp = b.resultat ? `<div class="panel brand">
      <div class="eyebrow">Låst bedömning</div>
      <div class="bed-resultat"><b>${fmtSek(b.resultat.medel)}</b><span>medel av ${b.resultat.varv.length} försök · bäst ${fmtSek(b.resultat.bast)}</span></div>
      <p class="small muted" style="margin:6px 0 10px">${b.resultat.varv.map(fmtSek).join(' · ')}${b.resultat.jamfor ? ` · ${esc(b.resultat.jamfor)}` : ''}</p>
      <button class="btn secondary block" data-action="pass-bed-igen" data-block="${b.id}">Mät igen</button>
    </div>` : `<div class="panel stopur" data-id="${b.id}" data-lage="varv">
      <div class="small muted">Försök ${Math.min(varv.length + 1, b.varv || 3)} av ${b.varv || 3}. Starta när ${esc(p.barn || 'spelaren')} går, stoppa i mål. Varje stopp blir ett försök.</div>
      <div class="stopur-klocka" id="stopurKlocka">0.0</div>
      <div class="btn-row two"><button class="btn grad" id="stopurKnapp">Starta</button><button class="btn secondary" id="stopurNoll">Nollställ</button></div>
      <div class="varv-lista">${varv.map((v, n) => `<span class="chip">${n + 1}: ${fmtSek(v)}</span>`).join('') || '<span class="small muted">Inga försök än.</span>'}</div>
      ${varv.length ? `<p class="small" style="margin:6px 0 10px">Medel så länge: <b>${fmtSek(medel)}</b> · bäst ${fmtSek(Math.min(...varv))}</p>` : ''}
      <div class="btn-row two"><button class="btn secondary" data-action="pass-varv-bort" data-block="${b.id}" ${varv.length ? '' : 'disabled'}>Ta bort sista</button><button class="btn grad" data-action="pass-bed-las" data-block="${b.id}" ${varv.length ? '' : 'disabled'}>Lås bedömningen</button></div>
    </div>`;
  } else if (b.typ === 'ovning' || b.typ === 'text') {
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
  ${kropp ? `<section>${kropp}</section>` : ''}
  <section>${inspelningar(p, b)}</section>
  <section class="panel"><div class="field" style="margin:0"><label for="pkom">Kommentar till föräldern</label><textarea id="pkom" data-block="${b.id}" placeholder="Vad såg du?">${esc(b.kommentar || '')}</textarea></div></section>
  <section class="btn-row two">
    <button class="btn secondary" data-action="pass-steg" data-d="-1" ${i === 0 ? 'disabled' : ''}>‹ Förra</button>
    ${i < p.block.length - 1 ? `<button class="btn grad" data-action="pass-steg" data-d="1">${b.klar ? 'Nästa ›' : 'Klar, nästa ›'}</button>` : `<button class="btn grad" data-action="pass-avsluta">Avsluta passet</button>`}
  </section>`;
}

// Filma eller spela in ljud på vilket block som helst. Listan visar det som redan spelats in på blocket.
function inspelningar(p, b) {
  const rec = st.rec?.blockId === b.id ? st.rec : null;
  const media = (b.media || []).slice();
  if (b.film && !media.some(m => m.id === b.film.filmId)) media.unshift({ id: 'film', typ: 'video', namn: b.film.namn, t: b.film.t, url: b.film.url, gammal: true, filmId: b.film.filmId });
  const forsta = b.typ === 'samtal' || b.typ === 'film';
  return `<div class="panel ${forsta ? 'brand' : ''} rec-panel">
    <div class="section-head"><h3>${forsta ? 'Filma nu' : 'Filma eller spela in'}</h3><span class="small muted">${r2Pa() ? 'laddas upp till spelaren' : 'sparas på telefonen'}</span></div>
    <div class="btn-row two" style="margin:8px 0">
      <label class="btn ${forsta && !media.length ? 'grad' : 'secondary'}" for="passfilm">🎥 ${media.some(m => m.typ === 'video') ? 'Filma igen' : 'Filma'}</label>
      <input type="file" id="passfilm" accept="video/*" capture="environment" hidden data-plan="${p.id}" data-block="${b.id}">
      <button class="btn ${rec ? 'rec on' : 'secondary'}" data-action="pass-ljud" data-block="${b.id}" ${kanSpelaInLjud() ? '' : 'disabled title="Mikrofonen stöds inte här"'}>${rec ? `<i class="rec-dot"></i> Stoppa <span id="recTid">0:00</span>` : '🎙 Spela in ljud'}</button>
    </div>
    <div class="progress" hidden id="passbar"><i style="width:0%"></i></div>
    <p class="small muted" id="passhint" style="margin:6px 0 0">${rec ? 'Spelar in… prata på, tryck Stoppa när ni är klara.' : forsta && !media.length ? 'Kameran öppnas direkt. Filmen sparas på spelaren och delas med föräldern.' : ''}</p>
    ${media.length ? `<ul class="list small" style="margin-top:10px">${media.map(m => `<li class="row media-rad" data-mid="${m.id}"><span class="grow"><b>${m.typ === 'audio' ? '🎙' : '🎥'} ${esc(m.namn || m.typ)}</b><div class="muted">${esc((m.t || '').slice(0, 16).replace('T', ' '))} · ${m.url ? 'uppladdad' : 'på den här telefonen'}</div></span>
      ${m.url || m.id !== 'film' ? `<button class="film" data-action="pass-spela" data-mid="${m.id}" data-typ="${m.typ}" data-url="${esc(m.url || '')}">Spela</button>` : ''}
      ${m.typ === 'video' && m.url && !m.filmId ? `<button class="film" data-action="pass-till-bibliotek" data-block="${b.id}" data-mid="${m.id}">Till Träna själv</button>` : m.filmId ? '<span class="small muted">i biblioteket</span>' : ''}</li>`).join('')}</ul>` : ''}
  </div>`;
}

async function sparaPlan(p) {
  const r = p.id ? await api.admin.put(`/admin/plan/${p.id}`, p) : await api.admin.post('/admin/plan', p);
  if (r.ok) { const i = st.planer.findIndex(x => x.id === r.plan.id); if (i >= 0) st.planer[i] = r.plan; else st.planer.unshift(r.plan); }
  return r;
}

// Stoppuret: läge "en" låser en tid (tidtagning), läge "varv" samlar försök till en bedömning.
export function passStopur() {
  clearInterval(tick);
  const box = $('.stopur'), klocka = $('#stopurKlocka'), knapp = $('#stopurKnapp');
  if (!box || !knapp) return;
  const varvLage = box.dataset.lage === 'varv';
  const las = $('#stopurLas'), noll = $('#stopurNoll');
  let running = false, start = 0, acc = 0;
  const draw = () => { const t = (acc + (running ? Date.now() - start : 0)) / 1000; klocka.textContent = t.toFixed(1); };
  knapp.onclick = () => {
    if (running) {
      acc += Date.now() - start; running = false;
      if (varvLage) {
        const id = box.dataset.id; (st.varv[id] = st.varv[id] || []).push(Math.round(acc / 100) / 10); acc = 0;
        ui.route(); return;
      }
      knapp.textContent = 'Fortsätt'; if (las) las.disabled = acc < 500;
    } else { start = Date.now(); running = true; knapp.textContent = 'Stoppa'; if (las) las.disabled = true; }
    draw();
  };
  if (noll) noll.onclick = () => { running = false; acc = 0; knapp.textContent = 'Starta'; draw(); };
  if (las) las.onclick = async () => {
    if (running || acc < 500) return;
    const p = plan(st.kor.id), b = p.block.find(x => x.id === box.dataset.id);
    (b.tider = b.tider || []).push({ sek: Math.round(acc / 100) / 10, t: new Date().toISOString() }); b.klar = true;
    const r = await sparaPlan(p); ui.toast(r.ok ? `Tiden ${fmtSek(b.tider.at(-1).sek)} är låst` : `Gick inte: ${r.fel}`); ui.route();
  };
  tick = setInterval(draw, 100);
  // ljudinspelningens klocka
  if (st.rec) { const t = $('#recTid'); if (t) st.rec.h = setInterval(() => { t.textContent = fmtKlocka(Date.now() - st.rec.start); }, 500); }
}
export function passStoppa() { clearInterval(tick); if (st.rec?.h) clearInterval(st.rec.h); }

// Filmen från kameran: sparas lokalt, laddas upp om R2 är på, hamnar på blocket och på spelaren.
export async function passFilVald(input) {
  const file = input.files?.[0]; if (!file) return;
  const p = plan(input.dataset.plan), b = p.block.find(x => x.id === input.dataset.block);
  const bar = $('#passbar'), hint = $('#passhint'); if (bar) bar.hidden = false; if (hint) hint.textContent = 'Sparar filmen…';
  const m = await sparaInspelning(file, { klientId: p.uid, typ: 'video', namn: file.name.slice(0, 60), titel: `${b.titel} · ${p.barn || ''} ${p.datum}`.trim(), planId: p.id, blockId: b.id }, k => { if (bar) bar.firstElementChild.style.width = Math.round(k * 100) + '%'; });
  (b.media = b.media || []).push({ id: m.id, typ: 'video', url: m.url, namn: m.namn, t: m.t, lokal: m.lokal }); b.klar = true;
  const r = await sparaPlan(p);
  ui.toast(!r.ok ? `Gick inte: ${r.fel}` : m.url ? 'Filmen är uppladdad och sparad på spelaren' : `Filmen är sparad på telefonen${m.fel && r2Pa() ? ` (uppladdningen misslyckades: ${m.fel})` : ''}`);
  ui.route();
}

export async function passAction(action, el, e) {
  const { toast, route, go } = ui;
  if (action === 'pass-nytt-block') { const p = lasForm(); const t = el.dataset.typ; p.block.push({ typ: t, titel: t === 'bedomning' ? 'Konbana' : TYP[t][1], desc: '', minuter: 5, mal: t === 'tid' ? 25 : 0, varv: 3 }); st.redigerar = p; route(); return true; }
  if (action === 'pass-bort') { const p = lasForm(); p.block.splice(+el.dataset.i, 1); st.redigerar = p; route(); return true; }
  if (action === 'pass-upp' || action === 'pass-ner') { const p = lasForm(); const i = +el.dataset.i, j = action === 'pass-upp' ? i - 1 : i + 1; if (p.block[j]) [p.block[i], p.block[j]] = [p.block[j], p.block[i]]; st.redigerar = p; route(); return true; }
  if (action === 'pass-radera') {
    e.preventDefault();
    if (!el.dataset.armed) { el.dataset.armed = '1'; el.textContent = 'Tryck igen för att ta bort'; setTimeout(() => { delete el.dataset.armed; el.textContent = 'Ta bort passet'; }, 4000); return true; }
    const p = plan(el.dataset.id);
    const r = await api.admin.del(`/admin/plan/${el.dataset.id}`); if (r.ok) st.planer = st.planer.filter(x => x.id !== el.dataset.id);
    st.redigerar = null; toast(r.ok ? 'Passet är borttaget' : `Gick inte: ${r.fel}`); ui.klientAndrad?.(); go(p?.uid && klient(p.uid) ? `/admin/klient/${p.uid}` : '/admin/pass'); return true;
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
    await sparaPlan(p); ui.klientAndrad?.(); toast('Passet är klart. Dela det med föräldern i formuläret.'); go(`/admin/pass/${p.id}`); return true;
  }
  if (action === 'pass-varv-bort') { (st.varv[el.dataset.block] || []).pop(); route(); return true; }
  if (action === 'pass-bed-las') {
    const p = plan(st.kor.id), b = p.block.find(x => x.id === el.dataset.block);
    const varv = st.varv[b.id] || []; if (!varv.length) return true;
    el.disabled = true;
    const film = (b.media || []).find(m => m.typ === 'video');
    const r = await api.admin.post(`/admin/klient/${p.uid}/bedomning`, { namn: b.titel, varv, datum: p.datum, kommentar: $('#pkom')?.value || '', planId: p.id, blockId: b.id, mediaId: film?.id || '' });
    if (!r.ok) { el.disabled = false; toast(`Gick inte: ${r.fel}${r.fel?.includes('finns inte') ? ' (passet måste höra till en klient i registret)' : ''}`); return true; }
    const bd = r.bedomning;
    const jamfor = r.tidigare ? `förra gången ${fmtSek(r.tidigare.medel)} (${fmtIso(r.tidigare.datum)}), ${bd.medel < r.tidigare.medel ? `${fmtSek(r.tidigare.medel - bd.medel)} bättre 🎉` : bd.medel > r.tidigare.medel ? `${fmtSek(bd.medel - r.tidigare.medel)} långsammare` : 'samma tid'}` : 'första mätningen';
    b.resultat = { varv: bd.varv, medel: bd.medel, bast: bd.bast, bedId: bd.id, t: bd.t, jamfor }; b.klar = true;
    delete st.varv[b.id];
    await sparaPlan(p); ui.klientAndrad?.();
    toast(`${bd.namn}: ${fmtSek(bd.medel)} sparat på ${p.barn || 'spelaren'} · ${jamfor}`); route(); return true;
  }
  if (action === 'pass-bed-igen') {
    const p = plan(st.kor.id), b = p.block.find(x => x.id === el.dataset.block);
    if (b.resultat?.bedId) await api.admin.del(`/admin/klient/${p.uid}/bedomning/${b.resultat.bedId}`);
    b.resultat = null; await sparaPlan(p); ui.klientAndrad?.(); route(); return true;
  }
  if (action === 'pass-ljud') {
    const p = plan(st.kor.id), b = p.block.find(x => x.id === el.dataset.block);
    if (st.rec) {
      const rec = st.rec; st.rec = null; clearInterval(rec.h); el.disabled = true;
      const blob = await rec.stop();
      const m = await sparaInspelning(blob, { klientId: p.uid, typ: 'audio', namn: `${b.titel.slice(0, 30)} ${new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}.${/webm/.test(blob.type) ? 'webm' : 'm4a'}`, titel: `${b.titel} · ${p.barn || ''} ${p.datum}`.trim(), planId: p.id, blockId: b.id });
      (b.media = b.media || []).push({ id: m.id, typ: 'audio', url: m.url, namn: m.namn, t: m.t, lokal: m.lokal }); b.klar = true;
      const r = await sparaPlan(p); toast(!r.ok ? `Gick inte: ${r.fel}` : m.url ? 'Ljudet är uppladdat och sparat på spelaren' : 'Ljudet är sparat på telefonen');
      route(); return true;
    }
    try { st.rec = { blockId: b.id, ...(await startaLjud()) }; route(); }
    catch (err) { toast(/denied|NotAllowed/i.test(String(err)) ? 'Tillåt mikrofonen för CAP i Inställningar' : `Kunde inte starta mikrofonen: ${err?.message || err}`); }
    return true;
  }
  if (action === 'pass-spela') {
    const url = el.dataset.url || await lokalUrl(el.dataset.mid);
    if (!url) { toast('Hittar inte inspelningen på den här telefonen'); return true; }
    const rad = el.closest('.media-rad');
    const m = document.createElement(el.dataset.typ === 'audio' ? 'audio' : 'video');
    m.controls = true; m.playsInline = true; m.src = url; m.autoplay = true; m.style.cssText = 'grid-column:1/-1;width:100%;max-height:50vh;margin-top:8px;border-radius:10px;background:#000';
    rad.style.display = 'grid'; rad.appendChild(m); el.remove(); return true;
  }
  if (action === 'pass-till-bibliotek') {
    const p = plan(st.kor.id), b = p.block.find(x => x.id === el.dataset.block);
    const m = el.dataset.mid === 'film' ? b.film : (b.media || []).find(x => x.id === el.dataset.mid);
    if (!m?.url) { toast('Filmen är inte uppladdad än'); return true; }
    const tags = { fardighet: b.fardighet ? [b.fardighet] : [], typ: ['Specifik färdighet'], position: ['Alla'], alder: ['Alla'], niva: ['Alla'] };
    const r = await api.admin.post('/admin/film', { titel: `${b.titel} (${p.barn || 'pass'} ${p.datum})`, beskrivning: b.desc || '', traningMin: b.minuter || 10, status: 'utkast', tags, moment: [], video: { typ: 'r2', url: m.url, poster: m.poster || '', sek: 0 } });
    if (r.ok) { m.filmId = r.film.id; await sparaPlan(p); toast('Sparad som utkast under Filmer'); } else toast(`Gick inte: ${r.fel}`);
    route(); return true;
  }
  return false;
}
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const fmtIso = iso => { const [, m, d] = String(iso || '').split('-'); return m ? `${+d} ${MAN[+m - 1]}` : ''; };

export async function passSubmit(kind, f, fd) {
  if (kind !== 'pass-spara') return false;
  const p = lasForm();
  if (!p.uid) { ui.toast('Välj en spelare. Lägg in klienten under Klienter först om den saknas.'); return true; }
  const r = await sparaPlan(p);
  if (!r.ok) { ui.toast(`Gick inte att spara: ${r.fel}`); return true; }
  st.redigerar = null; ui.klientAndrad?.(); ui.toast(p.delad ? 'Sparat och delat med föräldern' : 'Sparat'); ui.go(`/admin/pass/${r.plan.id}`); return true;
}
