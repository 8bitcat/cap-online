import { store, today, weekIndex } from './store.js';
import { VERSION } from './version.js';

const view = document.getElementById('view');
const nav = document.querySelector('.tabs');
const badge = document.getElementById('proto-badge');
let C = null;           // innehållet från data/content.json
let MODS = [];          // alla utbildningsmoduler, plattade
let timerHandle = null; // stoppuret i "Kör passet"
// Artefakten på claude.ai får inte bädda in andra sajter; där länkar vi till Drive i stället.
const IS_ARTIFACT = document.querySelector('meta[name="cap-env"]')?.content === 'artifact';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const session = id => C.sessions.find(s => s.id === id);
const pillar = id => C.pillars.find(p => p.id === id);
const chapter = id => C.guide.chapters.find(c => c.id === id);
const position = id => C.positions.find(p => p.id === id) || C.positions[C.positions.length - 1];
const module = id => MODS.find(m => m.id === id);
const levelDef = n => C.game.levels.find(L => L.n === n);
const GEN = { mv: 'målvaktens', back: 'backens', mitt: 'mittfältarens', anf: 'anfallarens' };
let loopClip = true; // upprepa momentets filmdel tills man byter

const fmtT = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtClip = c => c ? `${fmtT(c.start)}–${fmtT(c.end)}` : '';
function stepById(id) {
  for (const s of C.sessions) { const st = s.steps.find(x => x.id === id); if (st) return { s, st }; }
  return null;
}
// Hela CAP-passet: delarnas moment i ordning, med film och klipp per moment.
function program() {
  const P = C.program;
  const parts = P.parts.map(session);
  return {
    id: P.id, kind: 'program', title: P.title, subtitle: P.subtitle, summary: P.summary, parts,
    minutes: parts.reduce((a, s) => a + s.trainingMinutes, 0),
    pillars: [...new Set(parts.map(s => s.pillar))],
    steps: parts.flatMap((s, pi) => s.steps.map(st => ({ ...st, sessionId: s.id, pillar: s.pillar, phase: `Del ${pi + 1} · ${s.title} · ${s.trainingMinutes} min` }))),
  };
}

const PROTOS = {
  bibliotek: { n: 1, name: 'Träna mitt barn' },
  spelare: { n: 2, name: 'Spelarkortet' },
  utbildning: { n: 3, name: 'Utbildningsvägen' },
};
const ICON = {
  home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  book: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
  compass: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.5 6.5-2 5-5 2 2-5z"/>',
  heart: '<path d="M12 21s-7-4.6-9.3-8.6C.8 9 2.4 5 6.3 5c2 0 3.3 1 4.2 2.3h3C14.4 6 15.7 5 17.7 5c3.9 0 5.5 4 3.6 7.4C19 16.4 12 21 12 21z"/>',
  brain: '<path d="M11 3a3.5 3.5 0 0 0-3.4 2.7A3.5 3.5 0 0 0 5 9.2a3.5 3.5 0 0 0 .4 5.4A3.5 3.5 0 0 0 8.7 20H11zm2 0v17h2.3a3.5 3.5 0 0 0 3.3-5.4 3.5 3.5 0 0 0 .4-5.4 3.5 3.5 0 0 0-2.6-3.5A3.5 3.5 0 0 0 13 3z"/>',
  card: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3.5 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4 17h7c0-2-1.6-3-3.5-3S4 15 4 17zm9-7h7v2h-7zm0 4h7v2h-7z"/>',
  cap: '<path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3zm-7 9.5V17c0 1.7 3.1 4 7 4s7-2.3 7-4v-4.5l-7 3.8-7-3.8z"/>',
};
const TABS = {
  bibliotek: [['/', 'Hem', ICON.home], ['/bibliotek', 'Bibliotek', ICON.book], ['/valj', 'Välj', ICON.compass], ['/foralder', 'Förälder', ICON.heart]],
  spelare: [['/', 'Hem', ICON.home], ['/planera', 'Planera', ICON.brain], ['/spelarkort', 'Spelarkort', ICON.card], ['/bibliotek', 'Bibliotek', ICON.book]],
  utbildning: [['/', 'Hem', ICON.home], ['/utbildning', 'Utbildning', ICON.cap], ['/spelarkort', 'Spelarkort', ICON.card], ['/bibliotek', 'Bibliotek', ICON.book]],
};

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
  toast._h = setTimeout(() => t.classList.remove('show'), 2600);
}
function go(hash) { location.hash = hash; }

/* ---------- Router ---------- */

const routes = [
  [/^\/?$/, home],
  [/^\/prototyper$/, prototyper],
  [/^\/start\/(\d)$/, start],
  [/^\/profil$/, () => go('/start/1')],
  [/^\/pass\/([\w-]+)\/kor$/, id => run('pass', id)],
  [/^\/pass\/([\w-]+)\/logga$/, id => logForm('pass', id)],
  [/^\/pass\/([\w-]+)$/, sessionPage],
  [/^\/pelare\/([\w-]+)$/, pillarPage],
  [/^\/passet$/, programPage],
  [/^\/passet\/kor$/, () => run('program', C.program.id)],
  [/^\/passet\/logga$/, () => logForm('program', C.program.id)],
  [/^\/planera$/, planera],
  [/^\/plan\/([\w-]+)\/kor$/, id => run('plan', id)],
  [/^\/plan\/([\w-]+)\/logga$/, id => logForm('plan', id)],
  [/^\/plan\/([\w-]+)$/, planPage],
  [/^\/spelarkort$/, spelarkort],
  [/^\/bibliotek$/, library],
  [/^\/valj$/, choose],
  [/^\/utbildning$/, () => utbildning()],
  [/^\/utbildning\/([\w-]+)$/, utbildning],
  [/^\/modul\/([\w-]+)$/, modulPage],
  [/^\/foralder$/, guide],
  [/^\/foralder\/([\w-]+)$/, guideChapter],
  [/^\/nasta-steg$/, nextStep],
];

function route() {
  clearInterval(timerHandle);
  const path = location.hash.replace(/^#/, '') || '/';
  if (!store.proto && path !== '/prototyper') return go('/prototyper');
  if (store.proto !== 'bibliotek' && !store.profile && path === '/') return go('/start/1');
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

function renderTabs() {
  const tabs = TABS[store.proto];
  document.body.classList.toggle('no-tabs', !tabs);
  if (!tabs) { nav.innerHTML = ''; badge.hidden = true; return; }
  nav.innerHTML = tabs.map(([href, label, icon]) =>
    `<a href="#${href}" data-tab="${href}"><svg viewBox="0 0 24 24">${icon}</svg><span>${label}</span></a>`).join('');
  badge.hidden = false;
  badge.textContent = `PROTOTYP ${PROTOS[store.proto].n}`;
  badge.title = `${PROTOS[store.proto].name}. Tryck för att byta prototyp.`;
}

function activeTab(path) {
  const alias = { '/plan': '/planera', '/modul': '/utbildning', '/nasta-steg': '/bibliotek', '/spelarkort': '/spelarkort', '/passet': '/' };
  for (const k in alias) if (path.startsWith(k)) return alias[k];
  const tabs = TABS[store.proto] || [];
  const hit = tabs.map(t => t[0]).filter(h => h !== '/' && path.startsWith(h)).sort((a, b) => b.length - a.length)[0];
  return hit || '/';
}

function afterRender(path) {
  renderTabs();
  const active = activeTab(path);
  $$('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === active));
  $$('[data-action]', view).forEach(el => el.addEventListener('click', onAction));
  $$('form[data-form]', view).forEach(f => f.addEventListener('submit', onSubmit));
  $$('.player', view).forEach(wirePlayer);
  $$('.step input[type=checkbox]', view).forEach(cb => cb.addEventListener('change', onStepToggle));
  if ($('.timer', view)) startTimer();
}

/* ---------- Spelstatus (härleds ur sparad data) ---------- */

function demoSet() {
  const d = store.demo;
  const set = new Set();
  if (!d) return set;
  const pos = store.profile?.position || 'anf';
  for (const m of MODS) {
    if (m.track !== 'general' && m.track !== pos) continue;
    if (d === 1 && m.level === 1) set.add(m.id);
    if (d === 2 && (m.level <= 2 || (m.level === 3 && m.track === 'general' && m.index < 2))) set.add(m.id);
  }
  return set;
}
function sessionTrained(sid) {
  let n = store.logs(sid).length;
  for (const l of store.logs()) {
    if (l.kind === 'program' && l.parts?.includes(sid)) n++;
    if (l.kind !== 'plan') continue;
    const p = store.plan(l.sessionId);
    if (p?.steps.some(s => s.sessionId === sid && s.phase === 'Huvuddel')) n++;
  }
  return n;
}
function moduleDone(m) {
  if (typeof m === 'string') m = module(m);
  if (!m) return false;
  if (store.modules[m.id]?.done) return true;
  if (demoSet().has(m.id)) return true;
  if (m.kind === 'traning' && m.session && sessionTrained(m.session) > 0) return true;
  return false;
}
function moduleStatus(m) {
  if (moduleDone(m)) return 'done';
  if (m.kind === 'prov' && store.modules[m.id]?.sent) return 'sent';
  return 'open';
}
function xp() {
  const X = C.game.xp;
  let total = 0;
  for (const l of store.logs()) total += X.pass * (l.parts?.length || 1) + X.moment * (l.checked || 0);
  for (const m of MODS) if (moduleDone(m)) total += X[m.kind] || 0;
  return total;
}
function level(x = xp()) { return [...C.game.levels].reverse().find(L => x >= L.xp); }
function nextLevel(x = xp()) { return C.game.levels.find(L => L.xp > x); }
function streakWeeks() {
  const weeks = {};
  for (const l of store.logs()) { const w = weekIndex(l.date); weeks[w] = (weeks[w] || 0) + 1; }
  let w = weekIndex(today());
  if ((weeks[w] || 0) < 2) w -= 1;
  let n = 0;
  while ((weeks[w] || 0) >= 2) { n++; w -= 1; }
  return n;
}
function ratings() {
  const p = store.profile || {};
  const base = { 'Nybörjare': 42, 'Spelat 1–2 år': 50, 'Spelat 3 år eller mer': 58 }[p.experience] || 46;
  const r = { bollkontroll: base, teknik: base, koordination: base };
  for (const l of store.logs()) {
    const pillars = l.pillars || [session(l.sessionId)?.pillar];
    for (const pl of pillars) if (r[pl] != null) r[pl] += 3;
  }
  for (const m of MODS) if (r[m.pillar] != null && moduleDone(m)) r[m.pillar] += 4;
  for (const k in r) r[k] = Math.min(99, r[k]);
  r.ovr = Math.round((r.bollkontroll + r.teknik + r.koordination) / 3);
  return r;
}
function earnedBadges() {
  const logs = store.logs();
  const byWeek = {};
  logs.forEach(l => { const w = weekIndex(l.date); byWeek[w] = (byWeek[w] || 0) + 1; });
  const done = MODS.filter(moduleDone);
  const has = {
    'spelarkort': !!store.profile,
    'forsta-passet': logs.length >= 1,
    'planerare': store.plans().length >= 1,
    'tre-pass': logs.length >= 3,
    'veckoplan': Object.values(byWeek).some(n => n >= 2),
    'bada-fotter': sessionTrained('passningar') >= 3,
    'teknikern': sessionTrained('passningar') >= 1 && sessionTrained('dribblingar') >= 1,
    'koordinator': sessionTrained('koordination') >= 2,
    'kunskapstorst': done.filter(m => m.kind === 'kunskap').length >= 2,
    'nivaprov': done.some(m => m.kind === 'prov') || Object.values(store.modules).some(m => m.sent),
    'hela-biblioteket': store.library.length >= C.sessions.length,
  };
  return C.game.badges.map(b => ({ ...b, earned: !!has[b.id] }));
}
function snapshot() {
  return { xp: xp(), level: level().n, badges: earnedBadges().filter(b => b.earned).map(b => b.id) };
}
// Visar det roligaste som hände sedan ögonblicksbilden togs.
function celebrate(before, fallback) {
  const now = snapshot();
  const fresh = now.badges.filter(b => !before.badges.includes(b));
  if (now.level > before.level) toast(`🎉 Nivå ${now.level}: ${level().name}!`);
  else if (fresh.length) toast(`🏅 Nytt märke: ${C.game.badges.find(b => b.id === fresh[0]).name}`);
  else if (now.xp > before.xp) toast(`+${now.xp - before.xp} XP${fallback ? ' · ' + fallback : ''}`);
  else if (fallback) toast(fallback);
}
function modulesFor(L, pos) {
  return [...L.general, ...((pos && L.positions[pos]) || [])].map(m => module(m.id));
}
function levelUnlocked(n, pos) {
  if (n === 1) return true;
  const prev = C.curriculum.levels.find(L => L.n === n - 1);
  return modulesFor(prev, pos).every(moduleDone);
}
function nextModule(pos) {
  for (const L of C.curriculum.levels) {
    if (!levelUnlocked(L.n, pos)) return null;
    const m = modulesFor(L, pos).find(x => !moduleDone(x));
    if (m) return m;
  }
  return null;
}

/* ---------- Passplaneraren ---------- */

function planSession({ minutes, focus }) {
  const p = store.profile || {};
  const pos = p.position || 'okand';
  const pick = id => { const { s, st } = stepById(id); return { name: st.name, desc: st.desc, base: st.minutes, sessionId: s.id, clip: st.clip, pillar: s.pillar }; };
  const warm = [pick('ub1'), pick('ub2')];
  const byFocus = {
    bollkontroll: [pick('ft1'), pick('ft2'), pick('ub3'), pick('ft3')],
    teknik: [pick('pa2'), pick('dr2'), pick('pa3'), pick('dr3')],
    koordination: [pick('ko2'), pick('ko3'), pick('ko4'), pick('ko1')],
  };
  const byPos = {
    anf: [pick('dr3'), pick('ft2'), pick('pa3'), pick('dr2')],
    back: [pick('pa3'), pick('ko2'), pick('ft3'), pick('pa2')],
    mitt: [pick('ft2'), pick('pa2'), pick('dr2'), pick('ko4')],
    mv: [pick('ko2'), pick('ft4'), pick('ko1'), pick('pa1')],
  };
  const name = p.name || 'Barnet';
  let main, why, label;
  if (focus === 'position' && byPos[pos]) {
    main = byPos[pos]; label = position(pos).name;
    why = `Momenten är valda för ${GEN[pos]} roll: ${position(pos).desc.toLowerCase()}`;
  } else if (byFocus[focus]) {
    main = byFocus[focus]; label = pillar(focus).name;
    why = `Du valde fokus på ${label.toLowerCase()}. Momenten går från lugnt till fart.`;
  } else {
    const diffs = (p.difficulties || []).map(d => C.choose.difficulties.find(x => x.id === d)).filter(Boolean);
    let pl = diffs[0]?.pillar;
    if (!pl) { const r = ratings(); pl = ['bollkontroll', 'teknik', 'koordination'].sort((a, b) => r[a] - r[b])[0]; }
    main = byFocus[pl]; label = pillar(pl).name;
    why = diffs[0]
      ? `${name} tycker att ${diffs[0].label.toLowerCase()} är svårt, så passet lägger tyngden på ${label.toLowerCase()}.`
      : `${label} är det område ${name} tränat minst, så passet börjar där.`;
    if (byPos[pos]) { main = [...main.slice(0, 3), byPos[pos][0]]; why += ` Sista momentet är hämtat från ${GEN[pos]} väg.`; }
  }
  const count = minutes <= 20 ? 2 : minutes <= 45 ? 3 : 4;
  main = main.slice(0, count);
  const cool = C.planner.cooldowns[store.plans().length % C.planner.cooldowns.length];
  const warmT = Math.max(4, Math.round(minutes * 0.2));
  const coolT = Math.max(3, Math.round(minutes * 0.15));
  const mainT = minutes - warmT - coolT;
  const sum = main.reduce((a, b) => a + b.base, 0);
  const steps = [
    ...warm.map(b => ({ ...b, phase: 'Uppvärmning', minutes: Math.max(2, Math.round(warmT / warm.length)) })),
    ...main.map(b => ({ ...b, phase: 'Huvuddel', minutes: Math.max(3, Math.round(mainT * b.base / sum)) })),
    { name: cool.name, desc: cool.desc, sessionId: cool.sessionId, clip: stepById(cool.step)?.st.clip, pillar: cool.pillar, phase: 'Avslut', minutes: coolT },
  ];
  return {
    id: 'plan-' + Date.now().toString(36), title: `${p.name ? p.name + 's' : 'Dagens'} pass`, minutes, focus: label, why,
    pillars: [...new Set(main.map(b => b.pillar))], steps, date: today(),
  };
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
  const n = sessionTrained(s.id);
  const status = store.has(s.id) ? (n ? `✓ I biblioteket · tränat ${n} gånger` : '✓ I biblioteket') : (n ? `Tränat ${n} gånger` : '');
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
  return `<div class="player ${s.video.portrait ? 'portrait' : ''}" data-sid="${s.id}" data-local="${esc(s.video.local)}" data-drive="${esc(s.video.driveId)}" data-poster="${esc(s.video.poster)}"></div>
  <div class="now" id="now"><span class="muted small">Hela filmen · ${esc(s.title)}</span></div>`;
}

// Hoppar till ett moments filmdel och upprepar den. Byter film om momentet hör till en annan del.
function playClip(sid, clip, label) {
  const el = $('.player', view);
  const s = session(sid);
  if (!el || !s) return;
  if (el.dataset.sid !== sid) {
    Object.assign(el.dataset, { sid, local: s.video.local, drive: s.video.driveId, poster: s.video.poster });
    el.classList.toggle('portrait', !!s.video.portrait);
    wirePlayer(el);
  }
  el.dataset.clipStart = clip ? clip.start : '';
  el.dataset.clipEnd = clip ? clip.end : '';
  const v = $('video', el);
  if (v) {
    const start = clip ? clip.start : 0;
    const seek = () => {
      v.currentTime = start;
      v.play().catch(() => {});
      // Vissa webbläsare tappar spolningen om den sker innan data finns; rätta när filmen väl rullar.
      v.addEventListener('playing', () => { if (Math.abs(v.currentTime - start) > 1.5) v.currentTime = start; }, { once: true });
    };
    v.readyState >= 1 ? seek() : v.addEventListener('loadedmetadata', seek, { once: true });
  }
  const now = $('#now');
  if (now) {
    now.innerHTML = clip
      ? `<span>▶ <b>${esc(label)}</b> <span class="muted">${esc(s.title)} ${fmtClip(clip)}</span></span>
         <span class="now-btns"><button class="film ${loopClip ? 'current' : ''}" data-action="loop">🔁 Upprepa</button><button class="film" data-action="hela" data-sid="${sid}">Hela filmen</button></span>`
      : `<span class="muted small">Hela filmen · ${esc(s.title)}</span>`;
    $$('[data-action]', now).forEach(b => b.addEventListener('click', onAction));
  }
  $$('.film[data-action=klipp]', view).forEach(b => b.classList.toggle('current', b.dataset.sid === sid && b.dataset.start === String(clip ? clip.start : '')));
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function clipButton(sid, clip, label) {
  if (!clip) return '';
  return `<button class="film" data-action="klipp" data-sid="${sid}" data-start="${clip.start}" data-end="${clip.end}" data-label="${esc(label)}">▶ ${fmtClip(clip)}</button>`;
}

// Spelar lokal mp4 om den finns, annars Google Drive-förhandsvisning.
function wirePlayer(el) {
  const { local, drive, poster: p } = el.dataset;
  el.innerHTML = '';
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
  const restart = () => { v.currentTime = Number(el.dataset.clipStart) || 0; v.play().catch(() => {}); };
  v.addEventListener('timeupdate', () => {
    const end = Number(el.dataset.clipEnd);
    if (!end || v.currentTime < end) return;
    if (loopClip) restart();
    else v.pause();
  });
  // Klipp som slutar där filmen slutar: filmen tar slut innan timeupdate hinner se det.
  v.addEventListener('ended', () => { if (loopClip && el.dataset.clipStart !== '' && el.dataset.clipStart != null) restart(); });
  v.appendChild(src);
  el.appendChild(v);
}

function playerCard(p, cls = '') {
  const r = ratings();
  const L = level();
  const pos = position(p.position);
  return `<a class="pcard ${cls}" href="#/spelarkort" aria-label="Spelarkort">
    <div class="pcard-top">
      <div><span class="pcard-ovr">${r.ovr}</span><span class="pcard-pos">${esc(pos.short)}</span></div>
      <img src="assets/cap-ball-270.png" alt="">
    </div>
    <div class="pcard-name">${esc((p.name || 'Spelare').toUpperCase())}</div>
    <div class="pcard-lvl">Nivå ${L.n} · ${esc(L.name)} · ${esc(p.age)} år${p.foot ? ` · ${esc(p.foot)}fot` : ''}</div>
    <div class="pcard-stats">
      <div><b>${r.bollkontroll}</b><span>BOL</span></div>
      <div><b>${r.teknik}</b><span>TEK</span></div>
      <div><b>${r.koordination}</b><span>KOO</span></div>
    </div>
  </a>`;
}

function xpBar() {
  const x = xp(), L = level(x), N = nextLevel(x);
  const pct = N ? Math.round((x - L.xp) / (N.xp - L.xp) * 100) : 100;
  const sw = streakWeeks();
  return `<div class="xp">
    <div class="xp-row"><span><b>${x} XP</b>${N ? ` · ${N.xp - x} kvar till nivå ${N.n} ${esc(N.name)}` : ' · högsta nivån'}</span>${sw ? `<span class="chip brand">🔥 ${sw} ${sw === 1 ? 'vecka' : 'veckor'} i rad</span>` : ''}</div>
    <div class="progress"><i style="width:${pct}%"></i></div>
  </div>`;
}

const KIND = { traning: ['▶', 'Träning'], kunskap: ['📘', 'Kunskap'], prov: ['🏆', 'Nivåprov'] };
function moduleCard(m) {
  const st = moduleStatus(m);
  const [ic, kind] = KIND[m.kind];
  const track = m.track === 'general' ? 'Allmänt' : position(m.track).name;
  return `<a class="card mod ${st}" href="#/modul/${m.id}"><div class="card-body">
    <div class="eyebrow">${ic} ${kind} · Nivå ${m.level} · ${esc(track)}</div>
    <h3>${esc(m.title)}</h3>
    <p class="desc">${esc(m.desc)}</p>
    <div class="status">${st === 'done' ? '✓ Klar' : st === 'sent' ? '⏳ Skickad till Haris' : m.session || m.quiz ? 'Öppna' : 'Kommer snart'}</div>
  </div></a>`;
}

/* ---------- Prototypval ---------- */

function prototyper() {
  const cards = [
    ['bibliotek', 'Träna mitt barn', 'Biblioteket med Haris fem pass, Hjälp mig välja och Föräldraguiden. Produkt för produkt enligt konceptets V1.',
      ['Färdiga pass med film och moment', 'Logga pass och be Haris om nästa steg', 'Föräldraguiden']],
    ['spelare', 'Spelarkortet', 'Föräldern beskriver barnet, appen planerar dagens pass och barnet samlar XP, nivåer och märken.',
      ['Startguide: namn, ålder, position, fot', 'Planera ett pass på 20 till 60 minuter', 'Spelarkort med betyg, märken och svit']],
    ['utbildning', 'Utbildningsvägen', 'En hel utbildning i fem nivåer: träning, allmän fotbollskunskap och det som är särskilt för positionen. Nivåproven bedöms av Haris.',
      ['Fem nivåer från Bollkompis till Matchvinnare', 'Allmänt plus Målvakt, Back, Mittfältare, Anfallare', 'Kunskapsquiz och förhandsvisning av progression']],
  ];
  return `
  <section class="hero">
    <img class="hero-logo" src="assets/cap-logo.png" alt="CAP – Complete Athletic Performance">
    <div class="eyebrow">CAP Online · prototyper</div>
    <h1>Välj spår</h1>
    <p class="lead">Tre sätt att visa konceptet. De delar innehåll och det som sparas på den här enheten, så du kan byta när som helst.</p>
  </section>
  <section class="protos">
    ${cards.map(([id, title, desc, points]) => `
    <div class="proto ${store.proto === id ? 'current' : ''}">
      <div class="proto-n">${PROTOS[id].n}</div>
      <div class="proto-body">
        <h2>${esc(title)}</h2>
        <p class="muted">${esc(desc)}</p>
        <ul class="checks">${points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <button class="btn ${store.proto === id ? 'secondary' : 'grad'} block" data-action="proto" data-proto="${id}">${store.proto === id ? 'Fortsätt här' : 'Öppna prototypen'}</button>
      </div>
    </div>`).join('')}
  </section>
  <p class="small muted" style="text-align:center">Allt sparas bara i den här webbläsaren. <a data-action="reset" href="#/prototyper">Nollställ</a> om du vill börja om från tomt.</p>
  <div class="footer"><img src="assets/cap-logo.png" alt="">${esc(C.brand.company)} · CAP Online v${VERSION}</div>`;
}

/* ---------- Startguiden ---------- */

function start(step) {
  step = Number(step) || 1;
  const d = Object.assign({}, store.profile || {}, store.draft);
  const ages = Array.from({ length: 8 }, (_, i) => 7 + i);
  const head = (n, title, lead) => `
    <div class="eyebrow">Steg ${n} av 3</div>
    <h1>${title}</h1>
    <p class="muted">${lead}</p>
    <div class="progress wiz-progress"><i style="width:${Math.round(n / 3 * 100)}%"></i></div>`;
  if (step === 1) return `
  <section class="wiz">
    <img class="hero-logo" src="assets/cap-logo.png" alt="">
    ${head(1, 'Vem ska vi träna?', 'Passen, planeringen och utbildningsvägen anpassas efter ditt barn.')}
    <form data-form="wiz1">
      <div class="field"><label for="name">Barnets förnamn eller smeknamn</label><input type="text" id="name" name="name" value="${esc(d.name || '')}" placeholder="T.ex. Elsa" autocomplete="off" required></div>
      <div class="field"><label for="age">Ålder</label>
        <select id="age" name="age">${ages.map(a => `<option value="${a}" ${String(d.age) === String(a) ? 'selected' : ''}>${a} år</option>`).join('')}</select></div>
      <button class="btn grad block" type="submit">Nästa ›</button>
    </form>
    <p class="small" style="margin-top:14px"><a href="#/prototyper">‹ Byt prototyp</a></p>
  </section>`;
  if (step === 2) return `
  <section class="wiz">
    ${head(2, `Var spelar ${esc(d.name || 'barnet')}?`, 'Positionen styr de specifika momenten. Grunderna är samma för alla.')}
    <form data-form="wiz2">
      <div class="field"><span class="label">Position</span>
        <div class="options pos-options">
          ${C.positions.map(p => `<label><input type="radio" name="position" value="${p.id}" ${(d.position || 'okand') === p.id ? 'checked' : ''}><span><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></span></label>`).join('')}
        </div></div>
      <div class="field"><span class="label">Bästa fot</span>
        <div class="options rating">${C.feet.map(f => `<label><input type="radio" name="foot" value="${esc(f)}" ${(d.foot || 'Höger') === f ? 'checked' : ''}>${esc(f)}</label>`).join('')}</div></div>
      <div class="field"><span class="label">Erfarenhet</span>
        <div class="options">${C.experiences.map(x => `<label><input type="radio" name="experience" value="${esc(x)}" ${(d.experience || 'Spelat 1–2 år') === x ? 'checked' : ''}>${esc(x)}</label>`).join('')}</div></div>
      <div class="btn-row two"><a class="btn secondary" href="#/start/1">‹ Tillbaka</a><button class="btn grad" type="submit">Nästa ›</button></div>
    </form>
  </section>`;
  const diff = new Set(d.difficulties || []);
  return `
  <section class="wiz">
    ${head(3, 'Vad vill ni jobba med?', 'Välj det som känns svårt just nu. Det styr förslagen och dagens pass.')}
    <form data-form="wiz3">
      <div class="field"><span class="label">Svårt just nu, välj en eller flera</span>
        <div class="options">${C.choose.difficulties.map(x => `<label><input type="checkbox" name="difficulties" value="${x.id}" ${diff.has(x.id) ? 'checked' : ''}>${esc(x.label)}</label>`).join('')}</div></div>
      <div class="field"><label for="strengths">Vad är ${esc(d.name || 'barnet')} bra på?</label><input type="text" id="strengths" name="strengths" value="${esc(d.strengths || '')}" placeholder="T.ex. snabb, gillar att dribbla"></div>
      <div class="field"><label for="goal">Mål</label><input type="text" id="goal" name="goal" value="${esc(d.goal || '')}" placeholder="T.ex. våga mer med bollen i match"></div>
      <div class="field"><span class="label">Hur ofta kan ni extraträna?</span>
        <div class="options rating">${['1', '2', '3+'].map(f => `<label><input type="radio" name="freq" value="${f}" ${(d.freq || '2') === f ? 'checked' : ''}>${f} / vecka</label>`).join('')}</div></div>
      <div class="btn-row two"><a class="btn secondary" href="#/start/2">‹ Tillbaka</a><button class="btn grad" type="submit">${store.profile ? 'Spara' : 'Skapa spelarkortet'}</button></div>
    </form>
  </section>`;
}

/* ---------- Hem ---------- */

function home() {
  if (store.proto === 'bibliotek' || !store.profile) return homeLibrary();
  if (store.proto === 'utbildning') return homeUtbildning();
  return homePlayer();
}

function homeLibrary() {
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
  ${passSections()}
  <section class="cards">
    <a class="card" href="#/valj"><div class="card-body">
      <div class="eyebrow">Osäker på var ni ska börja?</div>
      <h3>${esc(C.choose.title)}</h3>
      <p class="desc">Svara på några frågor om ditt barn så föreslår vi ett upplägg. Haris läser också svaren.</p>
    </div></a>
    <a class="card" href="#/foralder"><div class="card-body">
      <div class="eyebrow">För dig som förälder</div>
      <h3>${esc(C.guide.title)}</h3>
      <p class="desc">${esc(C.guide.intro)}</p>
    </div></a>
  </section>
  ${footer()}`;
}

function homePlayer() {
  const p = store.profile;
  const L = level();
  const last = store.logs().slice(-1)[0];
  const plans = store.plans().slice(-1)[0];
  return `
  <section class="greet">
    <div class="eyebrow">Nivå ${L.n} · ${esc(L.name)}</div>
    <h1>Hej ${esc(p.name)}!</h1>
    ${playerCard(p, 'compact')}
    ${xpBar()}
  </section>
  <section class="btn-row two">
    <a class="btn grad" href="#/planera">🧠 Planera dagens pass</a>
    ${plans ? `<a class="btn secondary" href="#/plan/${plans.id}">Senaste planen: ${esc(plans.minutes)} min</a>` : `<a class="btn secondary" href="#/spelarkort">Spelarkortet</a>`}
  </section>
  ${last ? `<section class="panel">
    <div class="section-head"><h3>Senast tränat</h3><span class="small muted">${fmtDate(last.date)}</span></div>
    <p class="small muted" style="margin:0">${esc(itemOf(last.kind || 'pass', last.sessionId)?.title)} · ${esc(ratingLabel(last.rating))}${last.note ? ` · ${esc(last.note)}` : ''}</p>
  </section>` : `<section class="panel brand"><h3>Första passet väntar</h3><p class="small muted" style="margin:0">Låt appen planera ett pass på den tid ni har, kör det och logga. Då börjar XP och märkena ticka.</p></section>`}
  ${passSections()}
  <section class="cards">
    <a class="card" href="#/foralder"><div class="card-body"><div class="eyebrow">För dig som förälder</div><h3>${esc(C.guide.title)}</h3><p class="desc">${esc(C.guide.intro)}</p></div></a>
    <a class="card" href="#/start/1"><div class="card-body"><div class="eyebrow">Profil</div><h3>Ändra ${esc(p.name)}s uppgifter</h3><p class="desc">Position ${esc(position(p.position).name.toLowerCase())}, ${esc(p.experience.toLowerCase())}, ${esc(p.freq)} pass i veckan.</p></div></a>
  </section>
  ${footer()}`;
}

function homeUtbildning() {
  const p = store.profile;
  const L = level();
  const nm = nextModule(p.position);
  const total = C.curriculum.levels.flatMap(x => modulesFor(x, p.position));
  const done = total.filter(moduleDone).length;
  return `
  <section class="greet">
    <div class="eyebrow">Nivå ${L.n} · ${esc(L.name)}</div>
    <h1>Hej ${esc(p.name)}!</h1>
    ${playerCard(p, 'compact')}
    ${xpBar()}
  </section>
  <section class="panel brand">
    <div class="section-head"><h3>Utbildningsvägen</h3><span class="small muted">${done} av ${total.length} moduler</span></div>
    <div class="progress"><i style="width:${Math.round(done / total.length * 100)}%"></i></div>
    <p class="small muted" style="margin:10px 0 0">${esc(C.curriculum.intro)}</p>
  </section>
  ${nm ? `<section><div class="section-head"><h2>Nästa steg</h2><a class="small" href="#/utbildning">Hela vägen ›</a></div>${moduleCard(nm)}</section>`
       : `<section class="panel"><h3>Allt klart på öppnade nivåer</h3><p class="small muted" style="margin:0">Skicka in nivåprovet så låser Haris upp nästa nivå.</p></section>`}
  <section class="btn-row two">
    <a class="btn grad" href="#/utbildning">Visa utbildningsvägen</a>
    <a class="btn secondary" href="#/planera">Planera dagens pass</a>
  </section>
  <section class="cards">
    <a class="card" href="#/foralder"><div class="card-body"><div class="eyebrow">För dig som förälder</div><h3>${esc(C.guide.title)}</h3><p class="desc">${esc(C.guide.intro)}</p></div></a>
    <a class="card" href="#/start/1"><div class="card-body"><div class="eyebrow">Profil</div><h3>Ändra ${esc(p.name)}s uppgifter</h3><p class="desc">Position ${esc(position(p.position).name.toLowerCase())}, ${esc(p.experience.toLowerCase())}.</p></div></a>
  </section>
  ${footer()}`;
}

function passSections() {
  const P = program();
  return `
  <section>
    <div class="section-head"><h2>Färdiga pass</h2><span class="small muted">CAP planerar, ni genomför</span></div>
    ${programCard(P)}
  </section>
  <section>
    <div class="section-head"><h2>Träna något specifikt</h2><span class="small muted">${C.sessions.length} delar</span></div>
    <p class="muted small">Delarna ur passet var för sig, med film och moment.</p>
    <div class="cards">${C.sessions.map(sessionCard).join('')}</div>
  </section>`;
}

function programCard(P) {
  const n = store.logs(P.id).length;
  return `<a class="card program" href="#/passet">
    <div class="card-media"><img src="${esc(C.program.poster)}" alt="" onerror="this.style.display='none'"><span class="tag">Hela passet</span><span class="len">⏱ ${P.minutes} min</span></div>
    <div class="card-body">
      <h3>${esc(P.title)} · ${esc(P.subtitle)}</h3>
      <p class="desc">${esc(P.summary)}</p>
      <div class="meta"><span><b>${P.parts.length} delar</b></span><span>${P.steps.length} moment med film</span><span>🎒 ${esc(C.program.equipment.join(', '))}</span></div>
      ${n ? `<div class="status">✓ Genomfört ${n} gånger</div>` : ''}
    </div>
  </a>`;
}

function programPage() {
  const P = program();
  const logs = store.logs(P.id);
  return `
  <a class="back" href="#/">‹ Hem</a>
  <section>
    <div class="eyebrow">Hela passet · ${P.minutes} min</div>
    <h1>${esc(P.title)}</h1>
    <p class="muted">${esc(P.subtitle)}. ${esc(P.summary)}</p>
    <div class="chips"><span class="chip brand">⏱ ${P.minutes} min</span><span class="chip">${P.parts.length} delar</span><span class="chip">${P.steps.length} moment</span>${C.program.equipment.map(e => `<span class="chip">${esc(e)}</span>`).join('')}</div>
  </section>
  <section class="btn-row two">
    <a class="btn grad" href="#/passet/kor">▶ Kör hela passet</a>
    <a class="btn secondary" href="#/passet/logga">Logga ett genomfört pass</a>
  </section>
  <section>
    <h2>Delarna i ordning</h2>
    <ul class="list">${P.parts.map((s, i) => `<li class="row"><span class="num">${i + 1}</span><a class="grow" href="#/pass/${s.id}"><b>${esc(s.title)}</b><div class="small muted">${s.steps.length} moment · ${esc(pillar(s.pillar).name)}</div></a><span class="small muted">${s.trainingMinutes} min</span></li>`).join('')}</ul>
  </section>
  ${logs.length ? `<section><h2>Genomfört</h2><ul class="list">${logs.slice().reverse().map(l => `<li><b>${fmtDate(l.date)}</b> · ${esc(ratingLabel(l.rating))}${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ''}</li>`).join('')}</ul></section>` : ''}`;
}

function footer() {
  return `<div class="footer"><img src="assets/cap-logo.png" alt="">${esc(C.brand.company)} · CAP Online v${VERSION} · <a href="#/prototyper">byt prototyp</a></div>`;
}

/* ---------- Pass ---------- */

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
    <div class="eyebrow">Del ${C.program.parts.indexOf(s.id) + 1} av ${C.program.parts.length} i <a href="#/passet">${esc(C.program.title)}</a> · ${esc(pillar(s.pillar).name)}</div>
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
    ${pct >= 100 ? `<a class="btn ghost block" href="#/nasta-steg" style="margin-top:12px">Planen är klar – be Haris om nästa steg</a>` : ''}
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
    <div class="section-head"><h2>Moment</h2><span class="small muted">▶ hoppar till rätt del av filmen</span></div>
    <div class="list">${s.steps.map((st, i) => `<div class="step"><span class="num">${i + 1}</span><div><b>${esc(st.name)}</b><div class="small muted">${esc(st.desc || '')}</div>${clipButton(s.id, st.clip, st.name)}</div><span class="min">${st.minutes ? st.minutes + ' min' : ''}</span></div>`).join('')}</div>
  </section>
  ${logs.length ? `
  <section>
    <h2>Loggade pass</h2>
    <ul class="list">${logs.slice().reverse().map(l => `<li class="row"><span class="grow"><b>${fmtDate(l.date)}</b> · ${esc(ratingLabel(l.rating))}${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ''}</span></li>`).join('')}</ul>
  </section>` : ''}
  ${inLib ? `<p class="small"><a data-action="remove" data-id="${s.id}" href="#/pass/${s.id}">Ta bort från biblioteket</a></p>` : ''}`;
}

function ratingLabel(r) { return { latt: 'Lätt', lagom: 'Lagom', svart: 'Svårt' }[r] || r; }

function itemOf(kind, id) { return kind === 'plan' ? store.plan(id) : kind === 'program' ? program() : session(id); }

function run(kind, id) {
  const item = itemOf(kind, id);
  if (!item) return go('/');
  const backHref = kind === 'plan' ? `#/plan/${id}` : kind === 'program' ? '#/passet' : `#/pass/${id}`;
  const done = new Set(store.stepsDone(id));
  const first = item.steps.find(s => s.phase === 'Huvuddel') || item.steps[0];
  const vid = kind === 'pass' ? item : session(first.sessionId);
  const total = kind === 'pass' ? item.trainingMinutes : item.minutes;
  let phase = '';
  const rows = item.steps.map((st, i) => {
    const sid = st.sessionId || item.id;
    const head = st.phase && st.phase !== phase ? `<div class="eyebrow phase">${esc(phase = st.phase)}</div>` : '';
    return `${head}<div class="step ${done.has(i) ? 'done' : ''}">
      <span class="num">${i + 1}</span>
      <label><input type="checkbox" data-step="${i}" ${done.has(i) ? 'checked' : ''}><span><b>${esc(st.name)}</b><div class="small muted">${esc(st.desc || '')}</div></span></label>
      <span class="min">${st.minutes ? st.minutes + ' min' : ''}</span>
      <div class="step-film">${clipButton(sid, st.clip, st.name)}${kind !== 'pass' ? `<span class="small muted">ur ${esc(session(sid).title)}</span>` : ''}</div></div>`;
  }).join('');
  return `
  <a class="back" href="${backHref}">‹ ${esc(item.title)}</a>
  <section>
    <div class="eyebrow">Kör passet${kind === 'program' ? ` · ${item.parts.length} delar` : ''}</div>
    <h1>${esc(item.title)}</h1>
    ${player(vid)}
    <div class="timer">
      <div><div class="small muted">Träningstid · mål ${total} min</div><div class="clock" id="clock">00:00</div></div>
      <button class="btn secondary" data-action="timer">Starta</button>
    </div>
  </section>
  <section>
    <h2>Moment</h2>
    <p class="small muted">Tryck ▶ så hoppar filmen till momentet och upprepar det. Bocka av när ni är klara, varje avbockat moment ger XP.</p>
    <div class="list" data-item="${esc(item.id)}">${rows}</div>
  </section>
  <section class="btn-row">
    <a class="btn grad" href="${backHref}/logga">Vi är klara – logga passet</a>
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
  const id = e.target.closest('.list').dataset.item;
  store.setStepDone(id, Number(e.target.dataset.step), e.target.checked);
  e.target.closest('.step').classList.toggle('done', e.target.checked);
}

function logForm(kind, id) {
  const item = itemOf(kind, id);
  if (!item) return go('/');
  const backHref = kind === 'plan' ? `#/plan/${id}` : kind === 'program' ? '#/passet' : `#/pass/${id}`;
  const checked = store.stepsDone(id).length;
  return `
  <a class="back" href="${backHref}">‹ ${esc(item.title)}</a>
  <section>
    <div class="eyebrow">Logga passet</div>
    <h1>Hur gick det?</h1>
    <form data-form="log" data-kind="${kind}" data-id="${id}">
      <div class="field">
        <span class="label">Svårighetsgrad för barnet</span>
        <div class="options rating">
          <label><input type="radio" name="rating" value="latt">😀 Lätt</label>
          <label><input type="radio" name="rating" value="lagom" checked>🙂 Lagom</label>
          <label><input type="radio" name="rating" value="svart">😅 Svårt</label>
        </div>
      </div>
      <div class="field">
        <label for="note">Vad fungerade och vad var svårt?</label>
        <textarea id="note" name="note" placeholder="T.ex. Driven med höger fot sitter, men vänster är fortfarande svår."></textarea>
        <span class="hint">Det du skriver här blir underlaget när ni ber Haris om nästa steg.</span>
      </div>
      <div class="field">
        <label for="date">Datum</label>
        <input type="date" id="date" name="date" value="${today()}" max="${today()}">
      </div>
      <p class="small muted">Ger ${C.game.xp.pass * (kind === 'program' ? item.parts.length : 1)} XP${checked ? ` + ${checked * C.game.xp.moment} XP för ${checked} avbockade moment` : ''}.</p>
      <button class="btn grad block" type="submit">Spara passet</button>
    </form>
  </section>`;
}

/* ---------- Planera ---------- */

function planera() {
  const p = store.profile;
  if (!p) return go('/start/1');
  const pos = position(p.position);
  return `
  <section>
    <div class="eyebrow">Passplaneraren</div>
    <h1>Planera dagens pass</h1>
    <p class="muted">Appen sätter ihop uppvärmning, huvuddel och avslut ur Haris moment, anpassat efter ${esc(p.name)} och den tid ni har.</p>
    <form data-form="planera">
      <div class="field"><span class="label">Hur lång tid har ni?</span>
        <div class="options rating four">${C.planner.durations.map(m => `<label><input type="radio" name="minutes" value="${m}" ${m === 30 ? 'checked' : ''}>${m} min</label>`).join('')}</div></div>
      <div class="field"><span class="label">Fokus</span>
        <div class="options">
          <label><input type="radio" name="focus" value="auto" checked><span><b>Låt appen välja</b><small>Utifrån det ${esc(p.name)} tycker är svårt och spelarkortets betyg</small></span></label>
          ${C.pillars.map(x => `<label><input type="radio" name="focus" value="${x.id}"><span><b>${esc(x.name)}</b><small>${esc(x.short)}</small></span></label>`).join('')}
          ${p.position && p.position !== 'okand' ? `<label><input type="radio" name="focus" value="position"><span><b>Position: ${esc(pos.name)}</b><small>${esc(pos.desc)}</small></span></label>` : ''}
        </div></div>
      <button class="btn grad block" type="submit">🧠 Planera passet</button>
    </form>
  </section>
  ${store.plans().length ? `<section><h2>Tidigare planer</h2><ul class="list">${store.plans().slice().reverse().slice(0, 5).map(pl => `<li class="row"><a class="grow" href="#/plan/${pl.id}"><b>${esc(pl.title)}</b> · ${pl.minutes} min · ${esc(pl.focus)}<div class="small muted">${fmtDate(pl.date)}${store.logs(pl.id).length ? ' · genomfört' : ''}</div></a></li>`).join('')}</ul></section>` : ''}`;
}

function planPage(id) {
  const pl = store.plan(id);
  if (!pl) return go('/planera');
  const logs = store.logs(id);
  let phase = '';
  return `
  <a class="back" href="#/planera">‹ Planera</a>
  <section>
    <div class="eyebrow">${fmtDate(pl.date)} · fokus ${esc(pl.focus)}</div>
    <h1>${esc(pl.title)}</h1>
    <div class="chips"><span class="chip brand">⏱ ${pl.minutes} min</span>${pl.pillars.map(x => `<span class="chip">${esc(pillar(x).name)}</span>`).join('')}<span class="chip">${pl.steps.length} moment</span></div>
    <p>${esc(pl.why)}</p>
  </section>
  <section class="btn-row two">
    <a class="btn grad" href="#/plan/${pl.id}/kor">▶ Starta passet</a>
    <a class="btn secondary" href="#/plan/${pl.id}/logga">Logga ett genomfört pass</a>
  </section>
  <section>
    <h2>Upplägg</h2>
    <div class="list">${pl.steps.map((st, i) => {
      const head = st.phase !== phase ? `<div class="eyebrow phase">${esc(phase = st.phase)}</div>` : '';
      return `${head}<div class="step"><span class="num">${i + 1}</span><div><b>${esc(st.name)}</b><div class="small muted">${esc(st.desc)}</div><span class="small muted">Ur <a href="#/pass/${st.sessionId}">${esc(session(st.sessionId).title)}</a>${st.clip ? ` · ${fmtClip(st.clip)}` : ''}</span></div><span class="min">${st.minutes} min</span></div>`;
    }).join('')}</div>
  </section>
  ${logs.length ? `<section><h2>Genomfört</h2><ul class="list">${logs.slice().reverse().map(l => `<li><b>${fmtDate(l.date)}</b> · ${esc(ratingLabel(l.rating))}${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ''}</li>`).join('')}</ul></section>` : ''}
  <p class="small"><a href="#/planera">Planera ett nytt pass</a></p>`;
}

/* ---------- Spelarkort ---------- */

function spelarkort() {
  const p = store.profile;
  if (!p) return go('/start/1');
  const r = ratings();
  const badges = earnedBadges();
  const logs = store.logs();
  const done = MODS.filter(moduleDone).length;
  return `
  <section>
    <div class="eyebrow">Spelarkort</div>
    <h1>${esc(p.name)}</h1>
    ${playerCard(p, 'big')}
    ${xpBar()}
  </section>
  <section class="stats">
    <div class="stat"><b>${logs.length}</b><span>pass loggade</span></div>
    <div class="stat"><b>${store.plans().length}</b><span>planerade pass</span></div>
    <div class="stat"><b>${done}</b><span>moduler klara</span></div>
    <div class="stat"><b>${badges.filter(b => b.earned).length}/${badges.length}</b><span>märken</span></div>
  </section>
  <section>
    <h2>Betygen</h2>
    <ul class="list">
      ${C.pillars.map(x => `<li class="row"><span class="grow"><b>${esc(x.name)}</b><div class="small muted">${esc(x.short)}</div></span><b class="big">${r[x.id]}</b></li>`).join('')}
    </ul>
    <p class="small muted">Betygen börjar på erfarenhetsnivån och växer med varje loggat pass och varje klar modul inom området.</p>
  </section>
  <section>
    <h2>Märken</h2>
    <div class="badges">${badges.map(b => `<div class="badge ${b.earned ? 'earned' : ''}" title="${esc(b.desc)}"><span class="ic">${b.icon}</span><b>${esc(b.name)}</b><span class="small">${esc(b.desc)}</span></div>`).join('')}</div>
  </section>
  <section class="btn-row two">
    <a class="btn grad" href="#/planera">Planera dagens pass</a>
    <a class="btn secondary" href="#/start/1">Ändra profilen</a>
  </section>`;
}

/* ---------- Bibliotek ---------- */

function library() {
  const ids = store.library;
  const list = ids.map(session).filter(Boolean);
  const logs = store.logs();
  const p = store.profile;
  const reqs = store.requests;
  const plans = store.plans();
  return `
  <section>
    <div class="eyebrow">Mitt bibliotek</div>
    <h1>${p?.name ? esc(p.name) + 's träning' : 'Vår träning'}</h1>
    ${logs.length ? `<div class="chips"><span class="chip brand">${logs.length} pass loggade</span><span class="chip">${list.length} i biblioteket</span>${plans.length ? `<span class="chip">${plans.length} planerade</span>` : ''}</div>` : ''}
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
    ${store.proto === 'bibliotek' ? `<a class="btn ghost" href="#/valj">Hjälp mig välja</a>` : `<a class="btn ghost" href="#/planera">Planera ett pass</a>`}
  </section>`}
  ${plans.length ? `<section><div class="section-head"><h2>Planerade pass</h2><a class="small" href="#/planera">Nytt ›</a></div><ul class="list">${plans.slice().reverse().slice(0, 5).map(pl => `<li class="row"><a class="grow" href="#/plan/${pl.id}"><b>${esc(pl.title)}</b> · ${pl.minutes} min · ${esc(pl.focus)}<div class="small muted">${fmtDate(pl.date)}${store.logs(pl.id).length ? ' · genomfört' : ''}</div></a></li>`).join('')}</ul></section>` : ''}
  <section class="panel brand">
    <h3>Nästa steg</h3>
    <p class="muted small">Har ni tränat ett tag? Berätta för Haris vad som fungerar och vad som fortfarande är svårt, så får ni en rekommendation på nästa produkt eller en justering.</p>
    <a class="btn block" href="#/nasta-steg">Be Haris om nästa steg</a>
    ${reqs.length ? `<ul class="list" style="margin-top:12px">${reqs.slice().reverse().map(r => `<li><b>${fmtDate(r.date)}</b> · ${esc(r.kind === 'valj' ? 'Hjälp mig välja' : 'Nästa steg')} · <span class="muted">${esc(r.status)}</span>${r.text ? `<div class="small muted">${esc(r.text)}</div>` : ''}</li>`).join('')}</ul>` : ''}
  </section>
  ${p ? `
  <section class="panel">
    <div class="section-head"><h3>Barnprofil</h3><a class="small" href="#/start/1">Ändra</a></div>
    <div class="meta">
      <span><b>${esc(p.name || 'Barnet')}</b></span><span>${esc(p.age)} år</span>${p.position ? `<span>${esc(position(p.position).name)}</span>` : ''}<span>${esc(p.experience)}</span><span>${esc(p.freq)} extrapass/vecka</span>
    </div>
  </section>` : ''}
  <p class="small muted" style="text-align:center;margin-top:30px">Prototyp: allt sparas bara på den här enheten. <a data-action="reset" href="#/bibliotek">Nollställ</a></p>`;
}

/* ---------- Hjälp mig välja (prototyp 1) ---------- */

function choose() {
  if (store.proto !== 'bibliotek') return go('/start/1');
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
        <div class="options">${C.experiences.map(x => `<label><input type="radio" name="experience" value="${esc(x)}" ${(p.experience || 'Spelat 1–2 år') === x ? 'checked' : ''}>${esc(x)}</label>`).join('')}</div></div>
      <div class="field"><span class="label">Vad är svårt just nu? Välj en eller flera.</span>
        <div class="options">${C.choose.difficulties.map(d => `<label><input type="checkbox" name="difficulties" value="${d.id}" ${diff.has(d.id) ? 'checked' : ''}>${esc(d.label)}</label>`).join('')}</div></div>
      <div class="field"><label for="strengths">Vad är barnet bra på?</label><input type="text" id="strengths" name="strengths" value="${esc(p.strengths || '')}" placeholder="T.ex. snabb, gillar att dribbla"></div>
      <div class="field"><label for="goal">Vad vill ni uppnå?</label><input type="text" id="goal" name="goal" value="${esc(p.goal || '')}" placeholder="T.ex. våga mer med bollen i match"></div>
      <div class="field"><span class="label">Hur ofta kan ni extraträna?</span>
        <div class="options rating">${['1', '2', '3+'].map(f => `<label><input type="radio" name="freq" value="${f}" ${(p.freq || '2') === f ? 'checked' : ''}>${f} / vecka</label>`).join('')}</div></div>
      <button class="btn grad block" type="submit">Visa förslag</button>
    </form>
  </section>
  ${p.recommended ? recommendation(p) : ''}`;
}

// Enkel regel i prototypen. Haris rekommenderar manuellt i V1, detta ger föräldern något direkt.
function recommend(p) {
  const picks = [];
  const add = id => { if (!picks.includes(id)) picks.push(id); };
  const young = Number(p.age) <= 9 || p.experience === 'Nybörjare';
  if (young) add('uppvarmning-bollkontroll');
  for (const d of p.difficulties || []) C.choose.difficulties.find(x => x.id === d)?.sessions.forEach(add);
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
    <p class="muted small">Utifrån ålder, erfarenhet och det ni tycker är svårt. Haris läser dina svar och återkommer om han vill justera.</p>
    <div class="cards">${r.sessions.map(id => session(id)).filter(Boolean).map(sessionCard).join('')}</div>
    ${r.guides.length ? `<p class="small" style="margin-top:14px"><b>Ur Föräldraguiden:</b> ${r.guides.map(g => `<a href="#/foralder/${g}">${esc(chapter(g)?.title)}</a>`).join(' · ')}</p>` : ''}
  </section>`;
}

/* ---------- Utbildningsvägen (prototyp 3) ---------- */

function utbildning(posParam) {
  const p = store.profile;
  const pos = posParam || (p?.position && p.position !== 'okand' ? p.position : 'anf');
  const x = xp(), L = level(x);
  const total = C.curriculum.levels.flatMap(lv => modulesFor(lv, pos));
  const done = total.filter(moduleDone).length;
  const demo = store.demo;
  let nextId = nextModule(pos)?.id;
  const node = (m, unlocked) => {
    const st = moduleDone(m) ? 'done' : !unlocked ? 'locked' : m.id === nextId ? 'next' : moduleStatus(m) === 'sent' ? 'sent' : 'open';
    const [ic, kind] = KIND[m.kind];
    const label = { done: '✓ Klar', locked: '🔒 Låst', next: '▶ Nästa', sent: '⏳ Hos Haris', open: m.session || m.quiz ? 'Öppen' : 'Kommer' }[st];
    return `<a class="node ${st}" href="#/modul/${m.id}">
      <span class="node-ic">${ic}</span>
      <span class="node-body"><b>${esc(m.title)}</b><span class="small muted">${kind} · ${esc(m.desc)}</span></span>
      <span class="node-st">${label}</span>
    </a>`;
  };
  return `
  <section>
    <div class="eyebrow">Utbildningsvägen</div>
    <h1>Från bollkompis till matchvinnare</h1>
    <p class="muted">${esc(C.curriculum.intro)}</p>
    <div class="panel">
      <div class="section-head"><b>Nivå ${L.n} · ${esc(L.name)}</b><span class="small muted">${done} av ${total.length} moduler</span></div>
      <div class="progress" style="margin-top:8px"><i style="width:${Math.round(done / total.length * 100)}%"></i></div>
    </div>
  </section>
  <section class="demo-bar">
    <span class="small"><b>Förhandsvisa progression</b> <span class="muted">(bara för demon)</span></span>
    <div class="chips">
      ${[['0', 'Verklig'], ['1', 'Nivå 1 klar'], ['2', 'Halvvägs']].map(([v, t]) => `<button class="chip ${demo === Number(v) ? 'brand on' : ''}" data-action="demo" data-v="${v}">${t}</button>`).join('')}
    </div>
  </section>
  <section>
    <div class="eyebrow">Positionens väg</div>
    <div class="chips">${C.positions.filter(q => q.id !== 'okand').map(q => `<a class="chip ${q.id === pos ? 'brand on' : ''}" href="#/utbildning/${q.id}">${esc(q.name)}</a>`).join('')}</div>
    <p class="small muted">Allmänna moduler gäller alla. Positionens moduler börjar på nivå 2, när grunden sitter.</p>
  </section>
  <section class="ladder">
    ${C.curriculum.levels.map(lv => {
      const unlocked = levelUnlocked(lv.n, pos);
      const mods = modulesFor(lv, pos);
      const d = mods.filter(moduleDone).length;
      const def = levelDef(lv.n);
      return `<div class="lvl ${unlocked ? '' : 'locked'} ${d === mods.length ? 'complete' : ''}">
        <div class="lvl-head"><span class="lvl-n">${lv.n}</span><div><b>Nivå ${lv.n} · ${esc(def.name)}</b><div class="small muted">${esc(def.tagline)}</div></div><span class="chip">${d}/${mods.length}</span></div>
        <div class="lvl-track"><span class="eyebrow">Allmänt</span>${lv.general.map(m => node(module(m.id), unlocked)).join('')}</div>
        ${lv.positions[pos] ? `<div class="lvl-track pos"><span class="eyebrow">${esc(position(pos).name)}</span>${lv.positions[pos].map(m => node(module(m.id), unlocked)).join('')}</div>` : ''}
      </div>`;
    }).join('')}
  </section>
  <section class="panel">
    <h3>Kunskap: allmän och specifik</h3>
    <p class="small muted" style="margin:0">Allmän fotbollskunskap (regler, titta upp, mat och sömn, lagkamrat, mental träning) ligger i varje nivås allmänna spår. Det specifika (positionens jobb, löpvägar, positionering) ligger i positionens spår och byts om barnet byter position.</p>
  </section>`;
}

function modulPage(id) {
  const m = module(id);
  if (!m) return go('/utbildning');
  const p = store.profile || {};
  const pos = m.track === 'general' ? (p.position && p.position !== 'okand' ? p.position : 'anf') : m.track;
  const unlocked = levelUnlocked(m.level, pos);
  const st = moduleStatus(m);
  const done = st === 'done';
  const [ic, kind] = KIND[m.kind];
  const def = levelDef(m.level);
  const rec = store.modules[m.id] || {};
  let body = '';
  if (m.kind === 'traning') {
    const s = m.session && session(m.session);
    body = s
      ? `<section><h2>Passet</h2><div class="cards">${sessionCard(s)}</div><p class="small muted">Modulen räknas som klar när passet, eller ett planerat pass med moment ur det, är loggat.</p>
         <div class="btn-row two"><a class="btn grad" href="#/pass/${s.id}/kor">▶ Starta passet</a><a class="btn secondary" href="#/planera">Planera ett pass med fokus</a></div></section>`
      : `<section class="panel"><h3>🎬 Filmen spelas in av Haris</h3><p class="small muted">Här kommer instruktionsfilmen och momenten, på samma sätt som för de fem passen som redan finns. Rutan visar bara var modulen hamnar i vägen.</p>
         ${done ? '<p class="small">✓ Markerad som klar.</p>' : `<button class="btn secondary block" data-action="modul-klar" data-id="${m.id}">Markera klar (prototyp)</button>`}</section>`;
  } else if (m.kind === 'kunskap') {
    body = `<section>${(m.body || ['Texten skrivs av Haris. Rutan visar var kunskapsmodulen hamnar i vägen.']).map(t => `<p>${esc(t)}</p>`).join('')}</section>`;
    if (m.quiz) {
      body += done
        ? `<section class="panel"><h3>✓ Klar${rec.score != null ? ` · ${rec.score} av ${m.quiz.length} rätt` : ''}</h3><p class="small muted" style="margin:0">Du kan göra quizet igen när som helst.</p><button class="btn secondary block" data-action="quiz-igen" data-id="${m.id}" style="margin-top:10px">Gör quizet igen</button></section>`
        : `<section><h2>Quiz</h2><form data-form="quiz" data-id="${m.id}">
            ${m.quiz.map((q, qi) => `<div class="field quiz-q"><span class="label">${qi + 1}. ${esc(q.q)}</span><div class="options">${q.a.map((a, ai) => `<label><input type="radio" name="q${qi}" value="${ai}" required>${esc(a)}</label>`).join('')}</div></div>`).join('')}
            <button class="btn grad block" type="submit">Rätta</button>
            <p class="small muted" style="margin-top:8px">Minst ${Math.ceil(m.quiz.length * 2 / 3)} rätt ger modulen och ${C.game.xp.kunskap} XP.</p>
          </form></section>`;
    } else {
      body += done ? '' : `<section><button class="btn secondary block" data-action="modul-klar" data-id="${m.id}">Markera som läst (prototyp)</button></section>`;
    }
  } else {
    body = `<section class="panel">
      <h3>Så går provet till</h3>
      <p class="small muted">Filma barnet med mobilen och skicka in. Haris tittar, ger återkoppling och godkänner. Ett godkänt prov ger ${C.game.xp.prov} XP och öppnar nästa nivå.</p>
      ${done ? '<p class="small">✓ Godkänt av Haris.</p>' : st === 'sent' ? `<p class="small">⏳ Skickat ${fmtDate(rec.date)}. Haris återkommer.</p><button class="btn secondary block" data-action="prov-godkann" data-id="${m.id}">Simulera: Haris godkänner (prototyp)</button>` : `<button class="btn grad block" data-action="prov-skicka" data-id="${m.id}">📹 Skicka film till Haris (prototyp)</button>`}
    </section>`;
  }
  return `
  <a class="back" href="#/utbildning${m.track !== 'general' ? '/' + m.track : ''}">‹ Utbildningsvägen</a>
  <section>
    <div class="eyebrow">${ic} ${kind} · Nivå ${m.level} ${esc(def.name)} · ${m.track === 'general' ? 'Allmänt' : esc(position(m.track).name)}</div>
    <h1>${esc(m.title)}</h1>
    <p class="muted">${esc(m.desc)}</p>
    <div class="chips"><span class="chip ${done ? 'brand' : ''}">${done ? '✓ Klar' : st === 'sent' ? '⏳ Hos Haris' : unlocked ? 'Öppen' : '🔒 Nivån är låst, men du kan titta'}</span>${m.pillar !== 'kunskap' ? `<span class="chip">${esc(pillar(m.pillar).name)}</span>` : '<span class="chip">Fotbollskunskap</span>'}</div>
  </section>
  ${body}`;
}

/* ---------- Föräldraguiden och Nästa steg ---------- */

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
    <div class="eyebrow">Återkoppling till Haris</div>
    <h1>Nästa steg</h1>
    <p class="muted">Berätta hur det gått. Haris svarar med en rekommendation på nästa pass eller en justering av det ni redan har.</p>
    <form data-form="next">
      <div class="field"><label for="session">Vad har ni tränat på?</label>
        <select id="session" name="session">${all.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select></div>
      <div class="field"><label for="weeks">Hur länge?</label>
        <select id="weeks" name="weeks">${['1 vecka', '2 veckor', '3 veckor', '4 veckor eller mer'].map((w, i) => `<option ${i === 2 ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
      <div class="field"><label for="text">Det här fungerar, men barnet har fortfarande svårt med…</label>
        <textarea id="text" name="text" required placeholder="T.ex. Första touchen med höger sitter, men bollen studsar iväg när den kommer på vänster."></textarea></div>
      <button class="btn grad block" type="submit">Skicka till Haris</button>
      <p class="small muted" style="margin-top:10px">Prototyp: sparas på den här enheten. Riktig inkorg för Haris kommer med kontot.</p>
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
  if (action === 'proto') { store.proto = el.dataset.proto; go('/'); route(); }
  else if (action === 'add') { const b = snapshot(); store.add(id); celebrate(b, 'Tillagt i ditt bibliotek'); route(); }
  else if (action === 'remove') {
    e.preventDefault();
    if (armed(el, 'Tryck igen för att ta bort. Loggade pass finns kvar.')) { store.remove(id); route(); }
  } else if (action === 'reset') {
    e.preventDefault();
    if (armed(el, 'Tryck igen för att nollställa allt')) store.reset();
  } else if (action === 'klipp') { e.preventDefault(); playClip(el.dataset.sid, { start: Number(el.dataset.start), end: Number(el.dataset.end) }, el.dataset.label); }
  else if (action === 'hela') { e.preventDefault(); playClip(el.dataset.sid, null, ''); }
  else if (action === 'loop') { e.preventDefault(); loopClip = !loopClip; el.classList.toggle('current', loopClip); toast(loopClip ? 'Upprepar momentet' : 'Spelar vidare efter momentet'); }
  else if (action === 'demo') { store.demo = Number(el.dataset.v); toast(store.demo ? 'Förhandsvisning på' : 'Visar verklig progression'); route(); }
  else if (action === 'modul-klar') { const b = snapshot(); store.setModule(id, { done: true }); celebrate(b, 'Modulen är klar'); route(); }
  else if (action === 'quiz-igen') { store.setModule(id, { done: false, score: null }); route(); }
  else if (action === 'prov-skicka') { const b = snapshot(); store.setModule(id, { sent: true }); celebrate(b, 'Skickat till Haris'); route(); }
  else if (action === 'prov-godkann') { const b = snapshot(); store.setModule(id, { done: true }); celebrate(b, 'Haris godkände provet'); route(); }
}

function onSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const fd = new FormData(f);
  const kind = f.dataset.form;
  const before = snapshot();
  if (kind === 'log') {
    const id = f.dataset.id;
    const kindOf = f.dataset.kind;
    const item = itemOf(kindOf, id);
    store.addLog({
      sessionId: id, kind: kindOf, pillars: kindOf === 'pass' ? undefined : item?.pillars,
      parts: kindOf === 'program' ? C.program.parts : undefined, rating: fd.get('rating'),
      note: (fd.get('note') || '').trim(), date: fd.get('date') || today(), checked: store.stepsDone(id).length,
    });
    store.clearSteps(id);
    if (kindOf === 'pass' && !store.has(id)) store.add(id);
    celebrate(before, 'Passet är loggat 💪');
    go(kindOf === 'plan' ? `/plan/${id}` : kindOf === 'program' ? '/passet' : `/pass/${id}`);
  } else if (kind === 'wiz1') {
    store.draft = { ...store.draft, name: (fd.get('name') || '').trim(), age: fd.get('age') };
    go('/start/2');
  } else if (kind === 'wiz2') {
    store.draft = { ...store.draft, position: fd.get('position'), foot: fd.get('foot'), experience: fd.get('experience') };
    go('/start/3');
  } else if (kind === 'wiz3') {
    const isNew = !store.profile;
    const p = {
      ...(store.profile || {}), ...store.draft,
      difficulties: fd.getAll('difficulties'), strengths: (fd.get('strengths') || '').trim(),
      goal: (fd.get('goal') || '').trim(), freq: fd.get('freq'),
    };
    p.recommended = recommend(p);
    store.profile = p;
    store.draft = {};
    if (isNew) store.addRequest({ kind: 'valj', text: `${p.name}, ${p.age} år, ${position(p.position).name}, ${p.experience}. Svårt: ${p.difficulties.join(', ') || '–'}. Mål: ${p.goal || '–'}` });
    celebrate(before, isNew ? 'Spelarkortet är klart' : 'Profilen är sparad');
    go('/');
  } else if (kind === 'planera') {
    const plan = planSession({ minutes: Number(fd.get('minutes')), focus: fd.get('focus') });
    store.addPlan(plan);
    celebrate(before, 'Passet är planerat');
    go(`/plan/${plan.id}`);
  } else if (kind === 'quiz') {
    const m = module(f.dataset.id);
    const score = m.quiz.reduce((n, q, i) => n + (Number(fd.get('q' + i)) === q.correct ? 1 : 0), 0);
    const need = Math.ceil(m.quiz.length * 2 / 3);
    if (score >= need) { store.setModule(m.id, { done: true, score }); celebrate(before, `${score} av ${m.quiz.length} rätt`); }
    else toast(`${score} av ${m.quiz.length} rätt. Läs texten en gång till och försök igen.`);
    route();
  } else if (kind === 'choose') {
    const p = {
      ...(store.profile || {}),
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
    toast('Skickat till Haris');
    go('/bibliotek');
  }
}

/* ---------- Start ---------- */

async function boot() {
  const res = await fetch('data/content.json', { cache: 'no-cache' });
  C = await res.json();
  MODS = C.curriculum.levels.flatMap(L => [
    ...L.general.map((m, i) => ({ ...m, level: L.n, track: 'general', index: i })),
    ...Object.entries(L.positions).flatMap(([pos, ms]) => ms.map((m, i) => ({ ...m, level: L.n, track: pos, index: i }))),
  ]);
  badge.addEventListener('click', () => go('/prototyper'));
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.ai$/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot().catch(err => { view.innerHTML = `<p class="pad">Kunde inte ladda innehållet: ${esc(err.message)}</p>`; });
