import { store, today } from './store.js';
import { VERSION } from './version.js';

const view = document.getElementById('view');
let C = null;           // innehållet från data/content.json
let timerHandle = null; // stoppuret i "Kör passet"
// Artefakten på claude.ai får inte bädda in andra sajter; där länkar vi till Drive i stället.
const IS_ARTIFACT = document.querySelector('meta[name="cap-env"]')?.content === 'artifact';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const session = id => C.sessions.find(s => s.id === id);
const pillar = id => C.pillars.find(p => p.id === id);
const chapter = id => C.guide.chapters.find(c => c.id === id);

function fmtLen(sec) {
  if (!sec) return '';
  const m = Math.round(sec / 60);
  return m < 1 ? `${sec} s` : `${m} min`;
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 2400);
}
function go(hash) { location.hash = hash; }

/* ---------- Router ---------- */

const routes = [
  [/^\/?$/, home],
  [/^\/pass\/([\w-]+)\/kor$/, run],
  [/^\/pass\/([\w-]+)\/logga$/, logForm],
  [/^\/pass\/([\w-]+)$/, sessionPage],
  [/^\/pelare\/([\w-]+)$/, pillarPage],
  [/^\/bibliotek$/, library],
  [/^\/valj$/, choose],
  [/^\/foralder$/, guide],
  [/^\/foralder\/([\w-]+)$/, guideChapter],
  [/^\/nasta-steg$/, nextStep],
];

function route() {
  clearInterval(timerHandle);
  const path = location.hash.replace(/^#/, '') || '/';
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      const html = fn(...m.slice(1));
      if (html === undefined) return; // vyn skötte redirect själv
      view.innerHTML = html;
      window.scrollTo(0, 0);
      afterRender(path);
      return;
    }
  }
  go('/');
}

function afterRender(path) {
  const tab = path.startsWith('/bibliotek') || path.startsWith('/nasta-steg') ? 'bibliotek'
    : path.startsWith('/valj') ? 'valj'
    : path.startsWith('/foralder') ? 'foralder' : 'hem';
  $$('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  $$('[data-action]', view).forEach(el => el.addEventListener('click', onAction));
  $$('form[data-form]', view).forEach(f => f.addEventListener('submit', onSubmit));
  $$('.player', view).forEach(wirePlayer);
  $$('.step input[type=checkbox]', view).forEach(cb => cb.addEventListener('change', onStepToggle));
  if ($('.timer', view)) startTimer();
}

/* ---------- Gemensamma delar ---------- */

function poster(s, cls = '') {
  return `<div class="card-media ${cls}">
    <img src="${esc(s.video.poster)}" alt="" loading="lazy" onerror="this.style.display='none'">
    <div class="fallback" style="z-index:-1"><img src="assets/cap-ball-270.png" alt=""></div>
    <span class="tag">${esc(pillar(s.pillar).name)}</span>
    ${s.videoSeconds ? `<span class="len">▶ ${fmtLen(s.videoSeconds)}</span>` : ''}
  </div>`;
}

function sessionCard(s) {
  const logs = store.logs(s.id).length;
  const status = store.has(s.id)
    ? (logs ? `✓ I biblioteket · ${logs} pass loggade` : '✓ I biblioteket')
    : '';
  return `<a class="card" href="#/pass/${s.id}">
    ${poster(s)}
    <div class="card-body">
      <h3>${esc(s.title)}</h3>
      <p class="desc">${esc(s.summary)}</p>
      <div class="meta">
        <span>⏱ <b>ca ${s.trainingMinutes} min</b></span>
        <span>🎒 ${esc(s.equipment.join(', '))}</span>
      </div>
      ${status ? `<div class="status">${status}</div>` : ''}
    </div>
  </a>`;
}

function player(s) {
  return `<div class="player ${s.video.portrait ? 'portrait' : ''}" data-local="${esc(s.video.local)}" data-drive="${esc(s.video.driveId)}" data-poster="${esc(s.video.poster)}"></div>`;
}

// Spelar lokal mp4 om den finns, annars Google Drive-förhandsvisning.
function wirePlayer(el) {
  const { local, drive, poster: p } = el.dataset;
  const v = document.createElement('video');
  v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.poster = p;
  const src = document.createElement('source');
  src.src = local; src.type = 'video/mp4';
  src.addEventListener('error', () => {
    const url = `https://drive.google.com/file/d/${esc(drive)}/view`;
    el.innerHTML = IS_ARTIFACT
      ? `<div class="missing"><img src="${esc(p)}" alt=""><span>Filmen kunde inte laddas här.</span><a class="btn" href="${url}" target="_blank" rel="noopener">Öppna filmen på Google Drive</a></div>`
      : `<iframe src="https://drive.google.com/file/d/${esc(drive)}/preview" allow="autoplay; fullscreen" allowfullscreen title="Film"></iframe>
      <div class="note">Visas via Google Drive i prototypen. Kräver ett Google-konto som fått filmen delad.</div>`;
  });
  v.appendChild(src);
  el.appendChild(v);
}

/* ---------- Vyer ---------- */

function home() {
  const b = C.brand;
  return `
  <section class="hero">
    <img class="hero-logo" src="assets/cap-logo.png" alt="CAP – Complete Athletic Performance">
    <h1>Träna ditt barn i fotboll</h1>
    <p class="lead">${esc(b.tagline)}</p>
    <div class="hero-img">
      <img src="assets/posters/passningar.jpg" alt="" onerror="this.src='assets/hero-gym.jpg'">
      <div class="caption">Färdiga pass för barn ${esc(b.ages)}. Boll, koner och en förälder räcker.</div>
    </div>
    <div class="pillars">
      ${C.pillars.map(p => `<a class="pillar" href="#/pelare/${p.id}"><i></i><b>${esc(p.name)}</b><span>${esc(p.short)}</span></a>`).join('')}
    </div>
  </section>

  <section>
    <div class="section-head"><h2>Färdiga pass</h2><span class="small muted">${C.sessions.length} pass</span></div>
    <p class="muted small">Kompletta pass på ungefär en timme. CAP planerar passet, ni genomför det.</p>
    <div class="cards">${C.sessions.map(sessionCard).join('')}</div>
  </section>

  <section class="cards">
    <a class="card" href="#/valj"><div class="card-body">
      <div class="eyebrow">Osäker på var ni ska börja?</div>
      <h3>${esc(C.choose.title)}</h3>
      <p class="desc">Svara på några frågor om ditt barn så föreslår vi ett upplägg. Haki läser också svaren.</p>
    </div></a>
    <a class="card" href="#/foralder"><div class="card-body">
      <div class="eyebrow">För dig som förälder</div>
      <h3>${esc(C.guide.title)}</h3>
      <p class="desc">${esc(C.guide.intro)}</p>
    </div></a>
  </section>

  <div class="footer"><img src="assets/cap-logo.png" alt="">${esc(b.company)} · CAP Online v${VERSION} · prototyp</div>`;
}

function pillarPage(id) {
  const p = pillar(id);
  if (!p) return go('/');
  const list = C.sessions.filter(s => s.pillar === id);
  return `
  <a class="back" href="#/">‹ Hem</a>
  <section>
    <div class="eyebrow">Träningsmodell</div>
    <h1>${esc(p.name)}</h1>
    <p class="muted">${esc(p.desc)}</p>
    <div class="chips">${p.short.split('·').map(x => `<span class="chip">${esc(x.trim())}</span>`).join('')}</div>
  </section>
  <section>
    <h2>Pass inom ${esc(p.name).toLowerCase()}</h2>
    <div class="cards">${list.map(sessionCard).join('') || '<p class="muted">Inga pass ännu.</p>'}</div>
  </section>`;
}

function sessionPage(id) {
  const s = session(id);
  if (!s) return go('/');
  const inLib = store.has(id);
  const logs = store.logs(id);
  const total = s.plan.weeks * s.plan.perWeek;
  const pct = Math.min(100, Math.round(logs.length / total * 100));
  return `
  <a class="back" href="#/">‹ Alla pass</a>
  <section>
    <div class="eyebrow">${esc(pillar(s.pillar).name)} · ${esc(s.level)}</div>
    <h1>${esc(s.title)}</h1>
    ${player(s)}
    <p>${esc(s.summary)}</p>
    <div class="meta">
      <span>⏱ Träningstid <b>ca ${s.trainingMinutes} min</b></span>
      ${s.videoSeconds ? `<span>▶ Film <b>${fmtLen(s.videoSeconds)}</b></span>` : ''}
      <span>👧 <b>${esc(C.brand.ages)}</b></span>
    </div>
  </section>

  <section class="btn-row two">
    ${inLib
      ? `<a class="btn grad" href="#/pass/${s.id}/kor">▶ Starta passet</a>
         <a class="btn secondary" href="#/pass/${s.id}/logga">Logga ett genomfört pass</a>`
      : `<button class="btn grad" data-action="add" data-id="${s.id}">Lägg till i mitt bibliotek</button>
         <a class="btn secondary" href="#/pass/${s.id}/kor">Titta på passet</a>`}
  </section>

  ${inLib ? `
  <section class="panel">
    <div class="section-head"><h3>Er plan</h3><span class="small muted">${logs.length} av ${total} pass</span></div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <p class="small muted" style="margin:10px 0 0">${s.plan.perWeek} pass i veckan i ${s.plan.weeks} veckor. ${esc(s.plan.note)}</p>
    ${pct >= 100 ? `<a class="btn ghost block" href="#/nasta-steg" style="margin-top:12px">Planen är klar – be Haki om nästa steg</a>` : ''}
  </section>` : ''}

  <section>
    <h2>Det här tränar ni</h2>
    <ul class="checks">${s.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
  </section>

  <section>
    <h2>Det här behöver ni</h2>
    <div class="chips">${s.equipment.map(e => `<span class="chip brand">${esc(e)}</span>`).join('')}</div>
    <p class="muted small">${esc(s.space)}</p>
  </section>

  <section>
    <h2>Passets delar</h2>
    ${s.steps.length
      ? `<div class="list">${s.steps.map((st, i) => `<div class="step"><span class="num">${i + 1}</span><div><b>${esc(st.name)}</b><div class="small muted">${esc(st.desc || '')}</div></div><span class="min">${st.minutes ? st.minutes + ' min' : ''}</span></div>`).join('')}</div>`
      : `<p class="muted">Haki visar hela passet i filmen. Momenten listas här när filmen delats upp i delar.</p>`}
  </section>

  ${logs.length ? `
  <section>
    <h2>Loggade pass</h2>
    <ul class="list">${logs.slice().reverse().map(l => `<li class="row"><span class="grow"><b>${fmtDate(l.date)}</b> · ${esc(ratingLabel(l.rating))}${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ''}</span></li>`).join('')}</ul>
  </section>` : ''}

  ${inLib ? `<p class="small"><a data-action="remove" data-id="${s.id}" href="#/pass/${s.id}">Ta bort från biblioteket</a></p>` : ''}`;
}

function ratingLabel(r) { return { latt: 'Lätt', lagom: 'Lagom', svart: 'Svårt' }[r] || r; }

function run(id) {
  const s = session(id);
  if (!s) return go('/');
  const done = new Set(store.stepsDone(id));
  return `
  <a class="back" href="#/pass/${s.id}">‹ ${esc(s.title)}</a>
  <section>
    <div class="eyebrow">Kör passet</div>
    <h1>${esc(s.title)}</h1>
    ${player(s)}
    <div class="timer">
      <div><div class="small muted">Träningstid</div><div class="clock" id="clock">00:00</div></div>
      <button class="btn secondary" data-action="timer">Starta</button>
    </div>
  </section>
  <section>
    <h2>Moment</h2>
    ${s.steps.length
      ? `<div class="list">${s.steps.map((st, i) => `<div class="step ${done.has(i) ? 'done' : ''}">
          <span class="num">${i + 1}</span>
          <label><input type="checkbox" data-step="${i}" ${done.has(i) ? 'checked' : ''}><span><b>${esc(st.name)}</b><div class="small muted">${esc(st.desc || '')}</div></span></label>
          <span class="min">${st.minutes ? st.minutes + ' min' : ''}</span></div>`).join('')}</div>`
      : `<p class="muted">Följ filmen från början till slut. Pausa gärna efter varje övning och gör den tills barnet känner sig säker innan ni går vidare.</p>`}
  </section>
  <section class="btn-row">
    <a class="btn grad" href="#/pass/${s.id}/logga">Vi är klara – logga passet</a>
  </section>`;
}

function startTimer() {
  const clock = $('#clock');
  const btn = $('[data-action=timer]');
  let running = false, start = 0, acc = 0;
  const draw = () => {
    const t = Math.floor((acc + (running ? Date.now() - start : 0)) / 1000);
    clock.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };
  btn.onclick = () => {
    if (running) { acc += Date.now() - start; running = false; btn.textContent = 'Fortsätt'; }
    else { start = Date.now(); running = true; btn.textContent = 'Pausa'; }
    draw();
  };
  timerHandle = setInterval(draw, 500);
}

function onStepToggle(e) {
  const id = location.hash.match(/\/pass\/([\w-]+)/)[1];
  store.setStepDone(id, Number(e.target.dataset.step), e.target.checked);
  e.target.closest('.step').classList.toggle('done', e.target.checked);
}

function logForm(id) {
  const s = session(id);
  if (!s) return go('/');
  return `
  <a class="back" href="#/pass/${s.id}">‹ ${esc(s.title)}</a>
  <section>
    <div class="eyebrow">Logga passet</div>
    <h1>Hur gick det?</h1>
    <form data-form="log" data-id="${s.id}">
      <div class="field">
        <span class="label">Svårighetsgrad för barnet</span>
        <div class="options rating">
          <label><input type="radio" name="rating" value="latt" required>😀 Lätt</label>
          <label><input type="radio" name="rating" value="lagom" checked>🙂 Lagom</label>
          <label><input type="radio" name="rating" value="svart">😅 Svårt</label>
        </div>
      </div>
      <div class="field">
        <label for="note">Vad fungerade och vad var svårt?</label>
        <textarea id="note" name="note" placeholder="T.ex. Driven med höger fot sitter, men vänster är fortfarande svår."></textarea>
        <span class="hint">Det du skriver här blir underlaget när ni ber Haki om nästa steg.</span>
      </div>
      <div class="field">
        <label for="date">Datum</label>
        <input type="date" id="date" name="date" value="${today()}" max="${today()}">
      </div>
      <button class="btn grad block" type="submit">Spara passet</button>
    </form>
  </section>`;
}

function library() {
  const ids = store.library;
  const list = ids.map(session).filter(Boolean);
  const logs = store.logs();
  const p = store.profile;
  const reqs = store.requests;
  return `
  <section>
    <div class="eyebrow">Mitt bibliotek</div>
    <h1>${p?.name ? esc(p.name) + 's träning' : 'Vår träning'}</h1>
    ${logs.length ? `<div class="chips"><span class="chip brand">${logs.length} pass loggade</span><span class="chip">${list.length} i biblioteket</span></div>` : ''}
  </section>

  ${list.length ? `
  <section>
    <h2>Fortsätt träna</h2>
    <div class="cards">${list.map(sessionCard).join('')}</div>
  </section>` : `
  <section class="empty panel">
    <h3>Biblioteket är tomt</h3>
    <p>Lägg till ett pass så hamnar det här, med er plan och loggade pass.</p>
    <a class="btn grad" href="#/">Se alla pass</a>
    <a class="btn ghost" href="#/valj">Hjälp mig välja</a>
  </section>`}

  <section class="panel brand">
    <h3>Nästa steg</h3>
    <p class="muted small">Har ni tränat ett tag? Berätta för Haki vad som fungerar och vad som fortfarande är svårt, så får ni en rekommendation på nästa produkt eller en justering.</p>
    <a class="btn block" href="#/nasta-steg">Be Haki om nästa steg</a>
    ${reqs.length ? `<ul class="list" style="margin-top:12px">${reqs.slice().reverse().map(r => `<li><b>${fmtDate(r.date)}</b> · ${esc(r.kind === 'valj' ? 'Hjälp mig välja' : 'Nästa steg')} · <span class="muted">${esc(r.status)}</span>${r.text ? `<div class="small muted">${esc(r.text)}</div>` : ''}</li>`).join('')}</ul>` : ''}
  </section>

  ${p ? `
  <section class="panel">
    <div class="section-head"><h3>Barnprofil</h3><a class="small" href="#/valj">Ändra</a></div>
    <div class="meta">
      <span><b>${esc(p.name || 'Barnet')}</b></span><span>${esc(p.age)} år</span><span>${esc(p.experience)}</span><span>${esc(p.freq)} extrapass/vecka</span>
    </div>
  </section>` : ''}

  <p class="small muted" style="text-align:center;margin-top:30px">Prototyp: allt sparas bara på den här enheten. <a data-action="reset" href="#/bibliotek">Nollställ</a></p>`;
}

function choose() {
  const p = store.profile || {};
  const diff = new Set(p.difficulties || []);
  const ages = Array.from({ length: 8 }, (_, i) => 7 + i);
  return `
  <section>
    <div class="eyebrow">Hjälp mig välja</div>
    <h1>Berätta om ditt barn</h1>
    <p class="muted">${esc(C.choose.intro)}</p>
    <form data-form="choose">
      <div class="field"><label for="name">Barnets förnamn eller smeknamn</label><input type="text" id="name" name="name" value="${esc(p.name || '')}" placeholder="T.ex. Elsa" autocomplete="off"></div>
      <div class="field"><label for="age">Ålder</label>
        <select id="age" name="age">${ages.map(a => `<option value="${a}" ${String(p.age) === String(a) ? 'selected' : ''}>${a} år</option>`).join('')}</select></div>
      <div class="field"><span class="label">Erfarenhet</span>
        <div class="options">
          ${['Nybörjare', 'Spelat 1–2 år', 'Spelat 3 år eller mer'].map(x => `<label><input type="radio" name="experience" value="${esc(x)}" ${p.experience === x || (!p.experience && x === 'Spelat 1–2 år') ? 'checked' : ''}>${esc(x)}</label>`).join('')}
        </div></div>
      <div class="field"><span class="label">Vad är svårt just nu? Välj en eller flera.</span>
        <div class="options">
          ${C.choose.difficulties.map(d => `<label><input type="checkbox" name="difficulties" value="${d.id}" ${diff.has(d.id) ? 'checked' : ''}>${esc(d.label)}</label>`).join('')}
        </div></div>
      <div class="field"><label for="strengths">Vad är barnet bra på?</label><input type="text" id="strengths" name="strengths" value="${esc(p.strengths || '')}" placeholder="T.ex. snabb, gillar att dribbla"></div>
      <div class="field"><label for="goal">Vad vill ni uppnå?</label><input type="text" id="goal" name="goal" value="${esc(p.goal || '')}" placeholder="T.ex. våga mer med bollen i match"></div>
      <div class="field"><span class="label">Hur ofta kan ni extraträna?</span>
        <div class="options rating">
          ${['1', '2', '3+'].map(f => `<label><input type="radio" name="freq" value="${f}" ${p.freq === f || (!p.freq && f === '2') ? 'checked' : ''}>${f} / vecka</label>`).join('')}
        </div></div>
      <button class="btn grad block" type="submit">Visa förslag</button>
    </form>
  </section>
  ${p.name !== undefined && p.recommended ? recommendation(p) : ''}`;
}

// Enkel regel i prototypen. Haki rekommenderar manuellt i V1, detta ger föräldern något direkt.
function recommend(p) {
  const picks = [];
  const add = id => { if (!picks.includes(id)) picks.push(id); };
  const young = Number(p.age) <= 9 || p.experience === 'Nybörjare';
  if (young) add('uppvarmning-bollkontroll');
  for (const d of p.difficulties || []) {
    const def = C.choose.difficulties.find(x => x.id === d);
    def?.sessions.forEach(add);
  }
  if (!picks.length) { add('uppvarmning-bollkontroll'); add('forsta-touch'); }
  if (picks.length < 2) add(young ? 'forsta-touch' : 'passningar');
  const guides = [...new Set((p.difficulties || []).flatMap(d => C.choose.difficulties.find(x => x.id === d)?.guide || []))];
  return { sessions: picks.slice(0, 3), guides };
}

function recommendation(p) {
  const r = p.recommended;
  return `
  <section class="panel brand" id="forslag">
    <div class="eyebrow">Vårt förslag</div>
    <h3>Börja här${p.name ? `, ${esc(p.name)}` : ''}</h3>
    <p class="muted small">Utifrån ålder, erfarenhet och det ni tycker är svårt. Haki läser dina svar och återkommer om han vill justera.</p>
    <div class="cards">${r.sessions.map(id => session(id)).filter(Boolean).map(sessionCard).join('')}</div>
    ${r.guides.length ? `<p class="small" style="margin-top:14px"><b>Ur Föräldraguiden:</b> ${r.guides.map(g => `<a href="#/foralder/${g}">${esc(chapter(g)?.title)}</a>`).join(' · ')}</p>` : ''}
  </section>`;
}

function guide() {
  return `
  <section>
    <div class="eyebrow">För dig som förälder</div>
    <h1>${esc(C.guide.title)}</h1>
    <p class="muted">${esc(C.guide.intro)}</p>
  </section>
  <section class="cards">
    ${C.guide.chapters.map(c => `<a class="card" href="#/foralder/${c.id}"><div class="card-body"><h3>${esc(c.title)}</h3><p class="desc">${esc(c.teaser)}</p></div></a>`).join('')}
  </section>`;
}

function guideChapter(id) {
  const c = chapter(id);
  if (!c) return go('/foralder');
  const i = C.guide.chapters.indexOf(c);
  const next = C.guide.chapters[i + 1];
  return `
  <a class="back" href="#/foralder">‹ ${esc(C.guide.title)}</a>
  <section>
    <div class="eyebrow">Kapitel ${i + 1} av ${C.guide.chapters.length}</div>
    <h1>${esc(c.title)}</h1>
    ${c.body.map(t => `<p>${esc(t)}</p>`).join('')}
  </section>
  ${next ? `<a class="btn secondary block" href="#/foralder/${next.id}">Nästa: ${esc(next.title)} ›</a>` : ''}`;
}

function nextStep() {
  const list = store.library.map(session).filter(Boolean);
  const all = list.length ? list : C.sessions;
  return `
  <a class="back" href="#/bibliotek">‹ Mitt bibliotek</a>
  <section>
    <div class="eyebrow">Återkoppling till Haki</div>
    <h1>Nästa steg</h1>
    <p class="muted">Berätta hur det gått. Haki svarar med en rekommendation på nästa pass eller en justering av det ni redan har.</p>
    <form data-form="next">
      <div class="field"><label for="session">Vad har ni tränat på?</label>
        <select id="session" name="session">${all.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select></div>
      <div class="field"><label for="weeks">Hur länge?</label>
        <select id="weeks" name="weeks">${['1 vecka', '2 veckor', '3 veckor', '4 veckor eller mer'].map((w, i) => `<option ${i === 2 ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
      <div class="field"><label for="text">Det här fungerar, men barnet har fortfarande svårt med…</label>
        <textarea id="text" name="text" required placeholder="T.ex. Första touchen med höger sitter, men bollen studsar iväg när den kommer på vänster."></textarea></div>
      <button class="btn grad block" type="submit">Skicka till Haki</button>
      <p class="small muted" style="margin-top:10px">Prototyp: sparas på den här enheten. Riktig inkorg för Haki kommer med kontot.</p>
    </form>
  </section>`;
}

/* ---------- Händelser ---------- */

// Farliga val kräver två tryck (confirm() finns inte i alla miljöer).
function armed(el, label) {
  if (el.dataset.armed) return true;
  el.dataset.armed = '1';
  el.classList.add('armed');
  el.textContent = label;
  setTimeout(() => { delete el.dataset.armed; el.classList.remove('armed'); }, 4000);
  return false;
}

function onAction(e) {
  const el = e.currentTarget;
  const { action, id } = el.dataset;
  if (action === 'add') { store.add(id); toast('Tillagt i ditt bibliotek'); route(); }
  else if (action === 'remove') {
    e.preventDefault();
    if (armed(el, 'Tryck igen för att ta bort. Loggade pass finns kvar.')) { store.remove(id); route(); }
  } else if (action === 'reset') {
    e.preventDefault();
    if (armed(el, 'Tryck igen för att nollställa allt')) store.reset();
  }
}

function onSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const fd = new FormData(f);
  const kind = f.dataset.form;
  if (kind === 'log') {
    const id = f.dataset.id;
    store.addLog({ sessionId: id, rating: fd.get('rating'), note: (fd.get('note') || '').trim(), date: fd.get('date') || today() });
    store.clearSteps(id);
    if (!store.has(id)) store.add(id);
    toast('Passet är loggat 💪');
    go(`/pass/${id}`);
  } else if (kind === 'choose') {
    const p = {
      name: (fd.get('name') || '').trim(), age: fd.get('age'), experience: fd.get('experience'),
      difficulties: fd.getAll('difficulties'), strengths: (fd.get('strengths') || '').trim(),
      goal: (fd.get('goal') || '').trim(), freq: fd.get('freq'),
    };
    p.recommended = recommend(p);
    store.profile = p;
    store.addRequest({ kind: 'valj', text: `${p.name || 'Barnet'}, ${p.age} år, ${p.experience}. Svårt: ${p.difficulties.join(', ') || '–'}. Mål: ${p.goal || '–'}` });
    route();
    setTimeout(() => $('#forslag')?.scrollIntoView({ behavior: 'smooth' }), 50);
  } else if (kind === 'next') {
    const s = session(fd.get('session'));
    store.addRequest({ kind: 'next', session: s?.id, text: `${s?.title} i ${fd.get('weeks')}: ${(fd.get('text') || '').trim()}` });
    toast('Skickat till Haki');
    go('/bibliotek');
  }
}

/* ---------- Start ---------- */

async function boot() {
  const res = await fetch('data/content.json', { cache: 'no-cache' });
  C = await res.json();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.ai$/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot().catch(err => { view.innerHTML = `<p class="pad">Kunde inte ladda innehållet: ${esc(err.message)}</p>`; });
