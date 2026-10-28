// Träna med Haris (Carl 2026-10-22): veckokalender med tider som Haris satt i admin. Man kan gå framåt i
// veckorna men inte bakåt. Bokning som på bio: tryck på tiden så hålls platsen i 60 sekunder, bekräfta
// innan tiden går ut, annars släpps den. Här finns också mina bokningar och pass som Haris delat.
// Betalning (Carl 2026-10-27): efter bokningen öppnar "Betala med Swish" Swish med Haris nummer, priset och ett
// meddelande ifyllt. Föräldern kan trycka "Jag har swishat", och Haris bockar av betalningen i admin.
// Paket (Carl 2026-10-28): föräldern köper t.ex. 10 pass i appen och betalar med Swish. Så länge paketet har pass
// kvar dras bokningarna från det, och en avbokning ger tillbaka passet.
import { store } from './store.js';
import { api } from './api.js';
import { swishLank, visaSwish, bokningsMeddelande, paketMeddelande, kr } from './swish.js';
import { notisStod, pushSatt } from './notiser.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAG = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

let data = { nu: null, veckor: [], betalning: null, hamtat: 0 };
let mina = { bokningar: [], planer: [], betalning: null, hamtat: 0 };
let hall = null;      // { v, slot, tills }
let klar = null;      // { v, slot } nyss bokad: visar Swish-knappen under tiderna
let betala = null;    // { v, slot } rutan Betala passet direkt efter bokningen
let tick = null;
let ui = null;

export function bokaInit(deps) { ui = deps; }
// Carl 2026-10-28: "när man trycker boka scrollas man högst upp i stället för längst ner till tiden".
// Bokningens knappar ritar om sidan utan att hoppa upp; platsen som hålls ligger kvar längst ner på skärmen.
function ritaKvar() { const y = window.scrollY; ui.route(); window.scrollTo(0, y); requestAnimationFrame(() => window.scrollTo(0, y)); }
const token = () => store.session?.token;

export async function hamtaVeckor(tvinga = false) {
  if (!token()) return data;
  if (!tvinga && Date.now() - data.hamtat < 15000) return data;
  const r = await api.get('/veckor', token());
  if (r.ok) data = { nu: r.nu, veckor: r.veckor, betalning: r.betalning || null, paket: r.paket || [], hamtat: Date.now() };
  return data;
}
export async function hamtaMina(tvinga = false) {
  if (!token()) return mina;
  if (!tvinga && Date.now() - mina.hamtat < 15000) return mina;
  const r = await api.get('/mina', token());
  if (r.ok) mina = { bokningar: r.bokningar, planer: r.planer, klient: r.klient || null, bedomningar: r.bedomningar || [], media: r.media || [], betalning: r.betalning || null, paket: r.paket || [], hamtat: Date.now() };
  return mina;
}
export const minaNu = () => mina;
// ⇄ till föräldern: hämta tiderna och bokningarna på nytt, Haris kan just ha öppnat en vecka
export function veckorGlom() { data.hamtat = 0; mina.hamtat = 0; }

// Paketet som bokningarna dras från just nu (det första med pass kvar)
const aktivtPaket = () => (data.paket || []).find(p => p.kvar > 0) || null;
const barnNamn = () => [mina.klient?.barn || store.profile?.name, mina.klient?.efternamn || store.profile?.efternamn];

// Betalraden under en bokning: Swish-knappen, "Jag har swishat", eller Betald ✓ när Haris bockat av
function betalRad(b) {
  if (b.paket) { const p = [...(mina.paket || []), ...(data.paket || [])].find(x => x.id === b.paket); return `<div class="betalrad"><span class="i-paket">Ingår i paketet${p ? ` ${esc(p.namn)}` : ''}</span></div>`; }
  const bet = mina.betalning || data.betalning;
  if (b.betald) return `<div class="betalrad"><span class="betald">Betald ✓</span></div>`;
  if (!bet) return '';
  const pris = b.pris || bet.pris;
  const msg = bokningsMeddelande(b, mina.klient?.efternamn || store.profile?.efternamn || '');
  if (b.swishad) return `<div class="betalrad"><span class="small"><span class="swishad">Swishad</span> · Haris bekräftar när pengarna kommit.</span> <button class="film" data-action="boka-swishad" data-v="${b.v}" data-slot="${b.id}" data-angra="1">Ångra</button></div>`;
  return `<div class="betalrad">
    <a class="btn swish" href="${esc(swishLank(bet.swish, pris, msg))}">Betala ${esc(kr(pris))} med Swish</a>
    <button class="film" data-action="boka-swishad" data-v="${b.v}" data-slot="${b.id}">Jag har swishat</button>
    <div class="small muted">Swish ${esc(visaSwish(bet.swish))} · meddelande "${esc(msg)}"</div>
  </div>`;
}

// ISO-vecka → måndagens datum (lokalt), för rubrikerna
function mandag(v) {
  const [ar, w] = v.split('-W').map(Number);
  const j4 = new Date(ar, 0, 4);
  const m = new Date(j4); m.setDate(j4.getDate() - ((j4.getDay() + 6) % 7) + (w - 1) * 7);
  return m;
}
const datumFor = (v, dag) => { const d = new Date(mandag(v)); d.setDate(d.getDate() + dag - 1); return d; };
const fmtDatum = d => `${d.getDate()} ${MAN[d.getMonth()]}`;
function veckaPlus(v, n) {
  const d = new Date(mandag(v)); d.setDate(d.getDate() + n * 7 + 3);
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const forsta = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const vn = 1 + Math.round(((x - forsta) / 864e5 - 3 + ((forsta.getUTCDay() + 6) % 7)) / 7);
  return `${x.getUTCFullYear()}-W${String(vn).padStart(2, '0')}`;
}

export function bokaPage(v) {
  if (!token()) return `
  <section class="hero" style="padding-top:30px"><div class="eyebrow">Träna med Haris</div><h1>Boka en tid</h1>
    <p class="lead">Bokningen kräver ett konto hos Haris. Logga in med ditt mobilnummer.</p>
    <a class="btn grad" href="#/login">Logga in</a></section>`;
  if (!data.nu) { hamtaVeckor().then(ui.kvar()); return `<section class="empty"><p class="muted">Hämtar Haris tider…</p></section>`; }
  // Carl 2026-10-28: Haris öppnade veckan, men efter ⇄ såg föräldern den gamla kopian. Hämta om i bakgrunden
  // när kopian är äldre än 15 s, och rita om bara om något ändrats.
  if (Date.now() - data.hamtat > 15000) {
    const fore = JSON.stringify([data.veckor, data.betalning]), om = ui.kvar();
    data.hamtat = Date.now();
    hamtaVeckor(true).then(d => { if (JSON.stringify([d.veckor, d.betalning]) !== fore) { const y = window.scrollY; om(); window.scrollTo(0, y); } });
  }
  const oppna = data.veckor.map(w => w.v);
  const nu = data.nu;
  v = v && v >= nu ? v : (oppna.find(x => x >= nu) || nu);
  const vecka = data.veckor.find(w => w.v === v);
  const foreg = veckaPlus(v, -1), nasta = veckaPlus(v, 1);
  const kanBak = v > nu;
  const m = mandag(v), s = datumFor(v, 7);
  const barn = store.profile?.name || store.session?.user?.barn || '';
  let dagar = '';
  if (vecka && vecka.slots.length) {
    for (let d = 1; d <= 7; d++) {
      const slots = vecka.slots.filter(x => x.dag === d);
      if (!slots.length) continue;
      const datum = datumFor(v, d);
      const passerad = datum < new Date(new Date().toDateString());
      dagar += `<div class="dag"><div class="dag-rubrik"><b>${DAG[d]}</b> <span class="muted small">${fmtDatum(datum)}</span></div>
        <div class="tider">${slots.map(x => slotKnapp(v, x, passerad)).join('')}</div></div>`;
    }
  }
  const h = hall && hall.v === v ? hall : null;
  const bet = data.betalning;
  const nyss = klar && mina.bokningar.find(b => b.v === klar.v && b.id === klar.slot);
  return `
  <section>
    <div class="eyebrow">Träna med Haris</div>
    <h1>Boka en tid</h1>
    ${notisStod() && !store.notiser.push && !store.notiser.bokaNej ? `<div class="panel notis-fraga">
      <b>🔔 Få en notis när Haris öppnar nya tider</b>
      <p class="small muted" style="margin:2px 0 10px">Då ser du direkt när det går att boka.</p>
      <div class="btn-row two" style="margin:0"><button class="btn grad" data-action="boka-notis">Slå på notiser</button><button class="btn secondary" data-action="boka-notis-nej">Inte nu</button></div>
    </div>` : ''}
    ${(data.paket || []).length ? `<a class="saldo-ruta" href="#/mina-pass"><span><b>${(data.paket || []).reduce((n, p) => n + p.kvar, 0)}</b> pass kvar</span><span class="small">Mina pass och historik ›</span></a>` : ''}
    <p class="muted small">Tryck på en ledig tid så hålls den i 60 sekunder åt dig. Bekräfta innan tiden går ut. Röda tider är redan bokade.${aktivtPaket() ? ' När du bokar väljer du om du använder ett av dina pass eller swishar för passet.' : bet ? ` Ett pass kostar ${esc(kr(bet.pris))} och betalas med Swish.${bet.paket?.length ? ' Paket med fler pass finns längre ner.' : ''}` : ''}</p>
    <div class="vecka-nav">
      <a class="btn secondary ${kanBak ? '' : 'disabled'}" href="#/boka/${foreg}" ${kanBak ? '' : 'aria-disabled="true" tabindex="-1"'}>‹</a>
      <div class="vecka-titel"><b>Vecka ${Number(v.split('-W')[1])}</b><div class="small muted">${fmtDatum(m)} – ${fmtDatum(s)}${v === nu ? ' · denna vecka' : ''}</div></div>
      <a class="btn secondary" href="#/boka/${nasta}">›</a>
    </div>
    ${vecka && vecka.slots.length ? dagar : `<div class="panel empty"><h3>Inga tider den här veckan</h3><p class="small muted" style="margin:0">${oppna.length ? `Öppna veckor: ${oppna.map(x => `<a href="#/boka/${x}">v. ${Number(x.split('-W')[1])}</a>`).join(', ')}.` : 'Haris har inte öppnat några tider än. Titta igen snart, eller fråga honom.'}</p></div>`}
  </section>
  ${nyss ? `<section class="panel brand nyss-bokad">
    <div class="section-head"><div class="eyebrow">Tiden är bokad</div><button class="film" data-action="boka-klar-stang" aria-label="Stäng">✕</button></div>
    <h3 style="margin:0 0 4px">${esc(DAG[nyss.dag])} ${fmtDatum(datumFor(nyss.v, nyss.dag))} · ${esc(nyss.start)}–${esc(nyss.slut)}</h3>
    <p class="small muted" style="margin:0">${nyss.plats ? `${esc(nyss.plats)} · ` : ''}${esc(nyss.barn || barn)}${nyss.paket ? `. Passet dras från paketet${(data.paket || []).find(p => p.id === nyss.paket) ? `, ${(data.paket || []).find(p => p.id === nyss.paket).kvar} kvar` : ''}. Vi ses!` : nyss.betald ? '' : bet ? '. Betala med Swish, så är allt klart.' : '. Vi ses!'}</p>
    ${betalRad(nyss)}
  </section>` : ''}
  ${h ? `<section class="panel brand hall" data-tills="${h.tills}">
    <div class="eyebrow">Platsen hålls åt dig</div>
    <h3 style="margin:0">${esc(DAG[h.dag])} ${esc(h.start)}–${esc(h.slut)}${h.plats ? ` · ${esc(h.plats)}` : ''}</h3>
    <div class="xp-row" style="margin-top:8px"><span class="small muted">Bekräfta inom <b id="hallSek">60</b> s${aktivtPaket() ? ' · välj hur passet betalas' : bet ? ` · ${esc(kr(bet.pris))}, betalas med Swish efter bokningen` : ''}</span></div>
    <div class="progress" style="margin-top:6px"><i id="hallBar" style="width:100%"></i></div>
    ${aktivtPaket() ? `<div class="val-knappar">
      <button class="btn grad" data-action="boka-bekrafta" data-betalning="paket">Använd ett av dina pass (${aktivtPaket().kvar} kvar)</button>
      ${bet ? `<button class="btn secondary" data-action="boka-bekrafta" data-betalning="swish">Swisha ${esc(kr(bet.pris))} i stället, spara passen</button>` : ''}
      <button class="film" data-action="boka-slapp">Ångra</button>
    </div>` : `<div class="btn-row two"><button class="btn grad" data-action="boka-bekrafta">Boka för ${esc(barn || 'oss')}</button><button class="btn secondary" data-action="boka-slapp">Ångra</button></div>`}
  </section>` : ''}
  <section id="mina"></section>
  ${betalArk()}`;
}

function slotKnapp(v, x, passerad) {
  const cls = { ledig: '', min: 'min', upptagen: 'upptagen', hall: 'upptagen', haller: 'haller' }[x.status] || '';
  const text = { ledig: 'Ledig', min: 'Din tid', upptagen: 'Upptagen', hall: 'Hålls', haller: 'Hålls åt dig' }[x.status];
  const dis = passerad || x.status === 'upptagen' || x.status === 'hall';
  return `<button class="tid ${cls}" ${dis ? 'disabled' : ''} data-action="${x.status === 'min' ? 'boka-avboka' : 'boka-hall'}" data-v="${v}" data-slot="${x.id}" data-dag="${x.dag}" data-start="${x.start}" data-slut="${x.slut}" data-plats="${esc(x.plats || '')}">
    <b>${esc(x.start)}–${esc(x.slut)}</b><small>${esc(text)}${x.plats ? ` · ${esc(x.plats)}` : ''}</small></button>`;
}

// Mina bokningar + pass Haris delat (fylls på efter att kalendern ritats)
export async function fyllMina(el) {
  if (!el) return;
  const m = await hamtaMina();
  const idag = new Date().toISOString().slice(0, 10);
  // kommande tider, plus tidigare som inte är betalda än
  const bok = m.bokningar.filter(b => !b.datum || b.datum >= idag || (m.betalning && !b.betald && !b.paket)).map(b => `<li class="row bokning"><span class="grow"><b>${esc(DAG[b.dag])} ${fmtDatum(datumFor(b.v, b.dag))}</b> · ${esc(b.start)}–${esc(b.slut)}${b.plats ? ` · ${esc(b.plats)}` : ''}<div class="small muted">v. ${Number(b.v.split('-W')[1])}${b.barn ? ` · ${esc(b.barn)}` : ''}${b.av === 'haris' ? ' · bokad av Haris' : ''}</div>${betalRad(b)}</span>${b.datum >= idag ? `<button class="film" data-action="boka-avboka" data-v="${b.v}" data-slot="${b.id}">Avboka</button>` : ''}</li>`).join('');
  const planer = m.planer.map(p => `<a class="card" href="#/med-haris/${p.id}"><div class="card-body"><div class="eyebrow">${esc(p.datum)}</div><h3>${esc(p.titel)}</h3><p class="desc">${p.block.length} moment · ${p.block.filter(b => b.resultat || b.tider?.length).length} ${p.block.filter(b => b.resultat).length ? 'bedömningar' : 'tidtagningar'} · ${p.block.reduce((n, b) => n + (b.media?.length || 0) + (b.film ? 1 : 0), 0)} inspelningar</p></div></a>`).join('');
  const paket = (m.paket || []).filter(p => p.kvar > 0 || !p.betald).reverse();
  el.innerHTML = `
    ${paket.length ? `<h2>Ditt paket</h2>${paket.map(paketKort).join('')}` : ''}
    <h2 ${paket.length ? 'style="margin-top:22px"' : ''}>Mina bokningar</h2>
    ${bok ? `<ul class="list">${bok}</ul>` : '<p class="muted small">Inga bokade tider än.</p>'}
    ${kopPaket(m)}
    <h2 style="margin-top:22px">Pass med Haris</h2>
    ${planer ? `<div class="cards">${planer}</div>` : '<p class="muted small">När Haris delat ett pass med er syns det här, med tider, filmer och hans kommentarer.</p>'}
    ${m.klient ? `<p class="small" style="margin-top:14px"><a href="#/utveckling">📈 ${esc(m.klient.barn || 'Spelaren')}s utveckling: nivå, bedömningar och filmer ›</a></p>` : ''}`;
  el.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', ui.onAction));
}

// Carl 2026-10-28: "när man bokat så skulle man hamna direkt i Swish-appen eller få upp en ruta betala för passet".
// Rutan kommer upp direkt efter bokningen när passet ska betalas; Betala senare stänger den och Swish-knappen finns
// kvar under Mina bokningar.
function betalArk() {
  const b = betala && mina.bokningar.find(x => x.v === betala.v && x.id === betala.slot);
  const bet = mina.betalning || data.betalning;
  if (!b || b.paket || b.betald || b.swishad || !bet) return '';
  const pris = b.pris || bet.pris;
  const msg = bokningsMeddelande(b, mina.klient?.efternamn || store.profile?.efternamn || '');
  return `<div class="betal-ark" role="dialog" aria-modal="true" aria-labelledby="betalArkRubrik">
    <div class="betal-ark-box">
      <div class="eyebrow" style="color:var(--ok)">✓ Tiden är bokad</div>
      <h2 id="betalArkRubrik" style="margin:6px 0 2px">Betala passet</h2>
      <p class="small muted" style="margin:0 0 14px">${esc(DAG[b.dag])} ${fmtDatum(datumFor(b.v, b.dag))} · ${esc(b.start)}–${esc(b.slut)}${b.plats ? ` · ${esc(b.plats)}` : ''}${b.barn ? ` · ${esc(b.barn)}` : ''}</p>
      <a class="btn swish block stor" href="${esc(swishLank(bet.swish, pris, msg))}">Betala ${esc(kr(pris))} med Swish</a>
      <p class="small muted" style="margin:10px 0 14px">Swish öppnas med Haris nummer ${esc(visaSwish(bet.swish))}, ${esc(kr(pris))} och meddelandet "${esc(msg)}" ifyllt. Kom sedan tillbaka hit och tryck Jag har swishat.</p>
      <div class="btn-row two" style="margin:0"><button class="btn grad" data-action="boka-swishad" data-v="${b.v}" data-slot="${b.id}">Jag har swishat</button><button class="btn secondary" data-action="boka-ark-stang">Betala senare</button></div>
    </div>
  </div>`;
}

// Ett paket på barnet: hur många pass som är kvar (fyllda prickar), Swish tills Haris bockat av
function paketKort(p) {
  const bet = mina.betalning;
  const [barn, efter] = barnNamn();
  const prickar = p.antal <= 24 ? `<div class="hal" aria-hidden="true">${Array.from({ length: p.antal }, (_, i) => `<i class="${i < p.anvanda ? 'anv' : ''}"></i>`).join('')}</div>` : '';
  const kopt = new Date(p.kopt);
  let rad = '';
  if (p.betald) rad = '<span class="betald">Betald ✓</span>';
  else if (p.swishad) rad = `<span class="small"><span class="swishad">Swishad</span> · Haris bekräftar när pengarna kommit.</span> <button class="film" data-action="boka-paket-swishad" data-id="${p.id}" data-angra="1">Ångra</button>`;
  else if (bet) {
    const msg = paketMeddelande(p, barn, efter);
    rad = `<a class="btn swish" href="${esc(swishLank(bet.swish, p.pris, msg))}">Betala ${esc(kr(p.pris))} med Swish</a>
      <button class="film" data-action="boka-paket-swishad" data-id="${p.id}">Jag har swishat</button>
      ${p.av === 'foralder' ? `<button class="film" data-action="boka-paket-angra" data-id="${p.id}">Ångra köpet</button>` : ''}
      <div class="small muted">Swish ${esc(visaSwish(bet.swish))} · meddelande "${esc(msg)}"</div>`;
  }
  return `<div class="paket-kort ${p.betald ? '' : 'obetalt'}" id="paket-${p.id}">
    <div class="pk-rad"><b>${esc(p.namn)}</b><span class="pk-kvar">${p.kvar} av ${p.antal} pass kvar</span></div>
    ${prickar}
    <div class="small muted">${p.av === 'foralder' ? 'Köpt' : 'Från Haris'} ${kopt.getDate()} ${MAN[kopt.getMonth()]} · ${p.utanfor ? `betalda utanför appen, ${p.tidigare || 0} använda innan` : esc(kr(p.pris))}</div>
    <div class="betalrad">${rad}</div>
  </div>`;
}
// Paketen Haris säljer, med pris per pass jämfört med enstaka pass
function kopPaket(m) {
  const bet = m.betalning, mallar = bet?.paket || [];
  if (!mallar.length || !m.klient) return '';
  return `<h2 style="margin-top:22px">Köp ett paket</h2>
    <p class="small muted">Betala en gång med Swish. Sedan dras varje bokning från paketet, och avbokar du får du tillbaka passet.</p>
    <div class="kop-lista">${mallar.map(x => { const spar = bet.pris * x.antal - x.pris; return `<div class="kop">
      <div><b>${esc(x.namn)}</b><div class="small muted">${esc(kr(Math.round(x.pris / x.antal)))} per pass${spar > 0 ? ` · ${esc(kr(spar))} billigare än ${x.antal} enstaka pass` : ''}</div></div>
      <div class="kop-pris">${esc(kr(x.pris))}</div>
      <button class="btn secondary block" data-action="boka-paket-kop" data-mall="${x.id}" data-namn="${esc(x.namn)}">Köp ${esc(x.namn)}</button></div>`; }).join('')}</div>`;
}

export function startHallTimer() {
  clearInterval(tick);
  const box = document.querySelector('.hall');
  if (!box) return;
  const tills = Number(box.dataset.tills);
  const draw = () => {
    const kvar = Math.max(0, Math.ceil((tills - Date.now()) / 1000));
    const sek = document.getElementById('hallSek'), bar = document.getElementById('hallBar');
    if (sek) sek.textContent = kvar;
    if (bar) bar.style.width = (kvar / 60 * 100) + '%';
    if (kvar <= 0) { clearInterval(tick); hall = null; ui.toast('Tiden gick ut, platsen är släppt'); hamtaVeckor(true).then(() => { if (location.hash.startsWith('#/boka')) ritaKvar(); }); }
  };
  draw();
  tick = setInterval(draw, 500);
}
export function stoppaHallTimer() { clearInterval(tick); }

export async function bokaAction(action, el) {
  const { toast, route } = ui;
  const { v, slot } = el.dataset;
  if (action === 'boka-hall') {
    const r = await api.post('/boka/hall', { v, slot }, token());
    if (!r.ok) { toast(r.fel || 'Gick inte att hålla platsen'); await hamtaVeckor(true); ritaKvar(); return true; }
    hall = { v, slot, tills: r.tills, dag: Number(el.dataset.dag), start: el.dataset.start, slut: el.dataset.slut, plats: el.dataset.plats };
    await hamtaVeckor(true); ritaKvar(); return true;
  }
  if (action === 'boka-bekrafta') {
    if (!hall) return true;
    const r = await api.post('/boka/bekrafta', { v: hall.v, slot: hall.slot, barn: store.profile?.name || '', betalning: el.dataset.betalning || undefined }, token());
    klar = r.ok ? { v: hall.v, slot: hall.slot } : null;
    hall = null; clearInterval(tick);
    await Promise.all([hamtaVeckor(true), hamtaMina(true)]);
    const b = klar && mina.bokningar.find(x => x.v === klar.v && x.id === klar.slot);
    const pk = b?.paket && (data.paket || []).find(x => x.id === b.paket);
    // ska passet betalas kommer rutan Betala passet upp direkt, annars ett kort besked
    betala = b && !b.paket && !b.betald && (mina.betalning || data.betalning) ? klar : null;
    if (!r.ok) toast(r.fel || 'Gick inte att boka');
    else if (!betala) toast(pk ? `Tiden är bokad. Passet dras från paketet, ${pk.kvar} kvar.` : 'Tiden är bokad. Vi ses!');
    ritaKvar();
    if (klar && !betala) document.querySelector('.nyss-bokad')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return true;
  }
  if (action === 'boka-klar-stang') { klar = null; ritaKvar(); return true; }
  if (action === 'boka-ark-stang') { betala = null; ritaKvar(); toast('Du kan betala senare under Mina bokningar.'); return true; }
  // Carl 2026-10-28: notisen när Haris öppnar en vecka når bara telefoner med notiser på
  if (action === 'boka-notis') {
    const r = await pushSatt(true);
    toast(r.ok ? 'Klart! Du får en notis när Haris öppnar nya tider.' : r.fel === 'nekad' ? 'Tillåt notiser för CAP i Inställningar' : `Gick inte: ${r.fel}`);
    route(); return true;
  }
  if (action === 'boka-notis-nej') { store.notiser = { ...store.notiser, bokaNej: true }; route(); return true; }
  if (action === 'boka-swishad') {
    const r = await api.post('/boka/swishad', { v, slot, angra: !!el.dataset.angra }, token());
    toast(r.ok ? (el.dataset.angra ? 'Ångrat' : 'Tack! Haris bekräftar när pengarna kommit.') : (r.fel || 'Gick inte'));
    if (r.ok && betala?.v === v && betala?.slot === slot) betala = null;
    await hamtaMina(true); ritaKvar(); return true;
  }
  // Paket: köp (tryck två gånger), Jag har swishat, ångra köpet
  if (action === 'boka-paket-kop') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; const t = el.textContent; el.textContent = 'Tryck igen för att köpa'; el.classList.add('armed'); setTimeout(() => { delete el.dataset.armed; el.textContent = t; el.classList.remove('armed'); }, 4000); return true; }
    const r = await api.post('/mina/paket', { mall: el.dataset.mall }, token());
    toast(r.ok ? `${el.dataset.namn} är ert. Betala med Swish i rutan Ditt paket.${r.flyttade ? ` ${r.flyttade === 1 ? 'En bokad tid' : `${r.flyttade} bokade tider`} ingår nu i paketet.` : ''}` : (r.fel || 'Gick inte'));
    await Promise.all([hamtaVeckor(true), hamtaMina(true)]); ritaKvar();
    if (r.ok) document.getElementById(`paket-${r.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }
  if (action === 'boka-paket-swishad') {
    const r = await api.post('/mina/paket/swishad', { id: el.dataset.id, angra: !!el.dataset.angra }, token());
    toast(r.ok ? (el.dataset.angra ? 'Ångrat' : 'Tack! Haris bekräftar när pengarna kommit.') : (r.fel || 'Gick inte'));
    await hamtaMina(true); ritaKvar(); return true;
  }
  if (action === 'boka-paket-angra') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; const t = el.textContent; el.textContent = 'Tryck igen för att ångra'; el.classList.add('armed'); setTimeout(() => { delete el.dataset.armed; el.textContent = t; el.classList.remove('armed'); }, 4000); return true; }
    const r = await api.post('/mina/paket/angra', { id: el.dataset.id }, token());
    toast(r.ok ? 'Köpet är ångrat' : (r.fel || 'Gick inte'));
    await Promise.all([hamtaVeckor(true), hamtaMina(true)]); ritaKvar(); return true;
  }
  if (action === 'boka-slapp') {
    if (hall) await api.post('/boka/avboka', { v: hall.v, slot: hall.slot }, token());
    hall = null; clearInterval(tick);
    await hamtaVeckor(true); ritaKvar(); return true;
  }
  if (action === 'boka-avboka') {
    if (!el.dataset.armed) { el.dataset.armed = '1'; const t = el.textContent; el.textContent = 'Tryck igen för att avboka'; el.classList.add('armed'); setTimeout(() => { delete el.dataset.armed; el.textContent = t; el.classList.remove('armed'); }, 4000); return true; }
    const r = await api.post('/boka/avboka', { v, slot }, token());
    toast(r.ok ? 'Avbokad' : (r.fel || 'Gick inte'));
    await Promise.all([hamtaVeckor(true), hamtaMina(true)]); ritaKvar(); return true;
  }
  return false;
}

// Ett pass Haris delat: block med tider, filmer och kommentarer
const fmtLogg = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getDate()} ${MAN[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const loggLista = rader => `<ul class="logg">${rader.map(r => `<li><span class="logg-dat">${fmtLogg(r.t)}</span><span class="logg-text">${esc(r.text)}</span>${r.antal ? `<span class="logg-antal ${r.antal > 0 ? 'plus' : 'minus'}">${r.antal > 0 ? '+' : '−'}${Math.abs(r.antal)}</span>` : '<span></span>'}</li>`).join('')}</ul>`;

// Mina pass (Carl 2026-10-28): saldot, paketen och en logg över alla pass – när Haris lagt in eller tagit bort pass,
// varje bokning och avbokning, med datum. En bokning som betalas styckvis står bara som bokningen.
export function minaPassPage() {
  if (!token()) return `<section class="empty"><p class="muted">Logga in för att se dina pass.</p><a class="btn grad" href="#/login">Logga in</a></section>`;
  if (!mina.hamtat) { hamtaMina().then(ui.kvar()); return `<section class="empty"><p class="muted">Hämtar dina pass…</p></section>`; }
  if (Date.now() - mina.hamtat > 15000) { const om = ui.kvar(); hamtaMina(true).then(om); }
  const k = mina.klient, paket = mina.paket || [], logg = (k?.passLogg || []).slice().reverse();
  const kvar = paket.reduce((n, p) => n + p.kvar, 0);
  return `
  <a class="back" href="#/boka">‹ Med Haris</a>
  <section>
    <div class="eyebrow">Mina pass${k?.barn ? ` · ${esc(k.barn)}` : ''}</div>
    <h1>${kvar} ${kvar === 1 ? 'pass' : 'pass'} kvar</h1>
    <p class="small muted">${mina.betalning?.pris ? `Ett pass kostar ${esc(kr(mina.betalning.pris))}${k?.pris ? ' (ditt pris hos Haris)' : ''}. ` : ''}Här ser du passen som Haris lagt in eller som du köpt, och varje bokning och avbokning.</p>
  </section>
  ${paket.length ? `<section>${paket.slice().reverse().map(paketKort).join('')}</section>` : ''}
  <section><h2>Historik</h2>${logg.length ? loggLista(logg) : '<p class="small muted">Inget har hänt än. När Haris lägger in pass eller du bokar syns det här.</p>'}</section>`;
}

export function medHarisPage(id) {
  const p = mina.planer.find(x => x.id === id);
  if (!p) {
    if (medHarisPage._forsokt === id) return `<a class="back" href="#/boka">‹ Tillbaka</a><section class="empty"><p class="muted">Passet hittades inte. Haris kanske inte delat det än.</p></section>`;
    medHarisPage._forsokt = id;
    hamtaMina(true).then(ui.kvar()); return `<a class="back" href="#/boka">‹ Tillbaka</a><section class="empty"><p class="muted">Hämtar passet…</p></section>`;
  }
  medHarisPage._forsokt = null;
  const fmtSek = s => `${Number(s).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  return `
  <a class="back" href="#/boka">‹ Träna med Haris</a>
  <section>
    <div class="eyebrow">${esc(p.datum)}${p.barn ? ` · ${esc(p.barn)}` : ''}</div>
    <h1>${esc(p.titel)}</h1>
    ${p.anteckning ? `<p>${esc(p.anteckning)}</p>` : ''}
  </section>
  <section><div class="list">${p.block.map((b, i) => `<div class="step"><span class="num">${i + 1}</span><div style="min-width:0">
    <b>${{ samtal: '💬 ', film: '🎥 ', tid: '⏱ ', ovning: '⚽ ', text: '📘 ', bedomning: '📊 ' }[b.typ] || ''}${esc(b.titel)}</b>
    ${b.desc ? `<div class="small muted">${esc(b.desc)}</div>` : ''}
    ${b.tider?.length ? `<div class="small">Tider: ${b.tider.map(t => `<b>${fmtSek(t.sek)}</b>`).join(', ')}${b.mal ? ` · mål ${b.mal} s` : ''}</div>` : ''}
    ${b.resultat ? `<div class="small">Resultat: medel <b>${fmtSek(b.resultat.medel)}</b> av ${b.resultat.varv.length} försök (${b.resultat.varv.map(fmtSek).join(', ')})${b.resultat.jamfor ? ` · ${esc(b.resultat.jamfor)}` : ''}</div>` : ''}
    ${b.film ? (b.film.url ? `<div class="player portrait" data-sid="plan:${p.id}:${b.id}" data-local="${esc(b.film.url)}" data-drive="" data-poster="${esc(b.film.poster || '')}" style="max-height:50vh;margin:8px 0"></div>` : `<div class="small">🎥 Film inspelad${b.film.t ? ` ${esc(b.film.t.slice(0, 10))}` : ''} (kommer när Haris laddat upp den)</div>`) : ''}
    ${(b.media || []).map(m => m.url ? (m.typ === 'audio' ? `<div class="small" style="margin-top:6px">🎙 ${esc(m.namn || 'Ljud')}</div><audio controls preload="none" src="${esc(m.url)}" style="width:100%"></audio>` : `<div class="player portrait manuell" style="max-height:50vh;margin:8px 0"><video controls playsinline preload="metadata" src="${esc(m.url)}" poster="${esc(m.poster || '')}"></video></div>`) : `<div class="small muted">${m.typ === 'audio' ? '🎙 Ljud' : '🎥 Film'} inspelad ${esc((m.t || '').slice(0, 10))} (kommer när Haris laddat upp den)</div>`).join('')}
    ${b.kommentar ? `<div class="note small">${esc(b.kommentar)}</div>` : ''}
  </div><span class="min">${b.minuter ? b.minuter + ' min' : ''}</span></div>`).join('')}</div></section>
  <p class="small" style="text-align:center"><a href="#/utveckling">📈 Se utvecklingen över tid ›</a></p>`;
}
