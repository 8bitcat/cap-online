// Skärmbilder till App Store (6,9 tum, 1320 × 2868) med påhittad demodata (Carl 2026-11-13: "gör appen redo för att
// släppa ut på App Store"). Alla namn och siffror är påhittade. Körs mot den lokala testmiljön (se tools/pott-test.js):
//   NODE_PATH=<node_modules med playwright> node tools/skarmbilder.js [utmapp]
// Bilderna hamnar i docs/appstore/ (eller utmappen) som 1-hem.png, 2-boka.png …
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.argv[2] || path.join(__dirname, '..', 'docs', 'appstore');
fs.mkdirSync(UT, { recursive: true });
const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
const dagIso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

(async () => {
  const tok = (await (await fetch(API + '/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ losen: 'testlosen' }) })).json()).token;
  const adm = (m, p, d) => fetch(API + p, { method: m, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: d ? JSON.stringify(d) : undefined }).then(r => r.json());
  await adm('PUT', '/admin/config/betalning', { swish: '1232852762', pris: 850, paket: [{ namn: '10 pass', antal: 10, pris: 6900 }, { namn: '20 pass', antal: 20, pris: 12900 }] });
  // demofamiljerna (påhittade)
  const nyKlient = async (d) => {
    for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === d.tel)) await adm('DELETE', `/admin/klient/${k.id}`);
    return adm('POST', '/admin/klient', { foralder: d.foralder, telefon: d.tel, barn: d.barn, efternamn: d.efternamn, fodd: d.fodd, position: d.position, lag: d.lag, niva: d.niva });
  };
  const alva = await nyKlient({ tel: '+46700001101', foralder: 'Sara', barn: 'Alva', efternamn: 'Lind', fodd: 2015, position: 'mitt', lag: 'Hisingsbacka FC F15', niva: 3 });
  const andra = [await nyKlient({ tel: '+46700001102', foralder: 'Johan', barn: 'Elias', efternamn: 'Berg', fodd: 2014, niva: 2 }), await nyKlient({ tel: '+46700001103', foralder: 'Maria', barn: 'Ella', efternamn: 'Nord', fodd: 2016, niva: 2 })];
  const kid = alva.klient.id;
  // en öppen vecka med tider, några bokade av andra
  const vt = veckaOm(1), vf = veckaOm(-2), vf2 = veckaOm(-1);
  const slots = [];
  for (const dag of [1, 2, 3, 4]) for (const start of ['16:00', '17:00', '18:00']) slots.push({ dag, start, slut: `${String(+start.slice(0, 2) + 1).padStart(2, '0')}:00`, plats: 'Hisings Backa IP' });
  await adm('PUT', `/admin/vecka/${vt}`, { oppen: false, slots, notis: false });
  const vs = (await adm('GET', '/admin/veckor')).veckor.find(w => w.v === vt).slots;
  await adm('PUT', `/admin/vecka/${vt}`, { oppen: true, slots: vs, notis: false });
  for (const [i, k] of [[0, andra[0]], [4, andra[1]], [7, andra[0]], [10, andra[1]]]) await adm('POST', `/admin/klient/${k.klient.id}/boka`, { v: vt, slot: vs[i].id });
  // Alva: eget avtal, 600 kr per pass, pott 12 000 kr, sex körda pass och ett bokat
  await adm('PUT', `/admin/klient/${kid}/pris`, { pris: 600 });
  await adm('POST', `/admin/klient/${kid}/pott`, { typ: 'in', belopp: 12000, text: 'Avtal hösten' });
  for (const v of [vf, vf2]) {
    await adm('PUT', `/admin/vecka/${v}`, { oppen: false, slots: [1, 3, 5].map(dag => ({ dag, start: '17:00', slut: '18:00', plats: 'Hisings Backa IP' })), notis: false });
    for (const s of (await adm('GET', '/admin/veckor')).veckor.find(w => w.v === v)?.slots || []) await adm('POST', `/admin/klient/${kid}/boka`, { v, slot: s.id });
  }
  await adm('POST', `/admin/klient/${kid}/boka`, { v: vt, slot: vs[5].id });
  // bedömningar över tid (konbanan och 20 m sprint)
  const kon = [[-70, [34.1, 33.2]], [-49, [32.8, 32.0]], [-28, [31.6, 30.9]], [-14, [30.8, 30.2]], [-3, [29.9, 29.4]]];
  for (const [d, varv] of kon) await adm('POST', `/admin/klient/${kid}/bedomning`, { namn: 'Konbana', varv, datum: dagIso(d), kommentar: d === -3 ? 'Snabbare fötter i vändningarna.' : '' });
  for (const [d, varv] of [[-60, [3.9, 3.8]], [-30, [3.7, 3.7]], [-5, [3.6, 3.5]]]) await adm('POST', `/admin/klient/${kid}/bedomning`, { namn: '20 m sprint', varv, datum: dagIso(d) });
  await adm('POST', `/admin/klient/${kid}/niva`, { niva: 3, kommentar: 'Bra första touch' });

  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'sv-SE',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  await ctx.addInitScript(api => { try { localStorage.setItem('cap_api', api); } catch { /* ok */ } }, API);
  const f = await ctx.newPage();
  await f.goto(base + 'index.html#/k/' + alva.kod, { waitUntil: 'networkidle' });
  await f.waitForFunction(() => document.querySelector('#name') || document.querySelector('.greet'), null, { timeout: 15000 });
  if (await f.$('#name')) { await f.selectOption('#fodd', '2015'); await f.click('form[data-form=wiz1] button'); }
  await f.waitForSelector('.greet', { timeout: 15000 });
  const bild = async (namn, hash, { vanta = 1200, scroll = null, fore = null } = {}) => {
    await f.goto(base + 'index.html#' + hash); await f.waitForTimeout(vanta);
    if (fore) await fore();
    if (scroll) await f.evaluate(s => { const el = document.querySelector(s); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); }, scroll);
    await f.waitForTimeout(500);
    await f.addStyleTag({ content: '#toast, .toast, .celebrate, .confetti { display: none !important; }' });
    await f.screenshot({ path: path.join(UT, namn + '.png') });
    console.log('✓', namn);
  };
  await bild('1-hem', '/');
  await bild('2-boka', `/boka/${vt}`, { vanta: 2000 });
  await bild('3-valj-betalning', `/boka/${vt}`, { vanta: 1500, fore: async () => { await (await f.$$('.tid:not([disabled]):not(.min)'))[2].click(); await f.waitForSelector('.hall'); await f.waitForTimeout(400); await f.evaluate(() => document.querySelector('.hall').scrollIntoView({ block: 'end' })); await f.waitForTimeout(300); } });
  await f.click('[data-action=boka-slapp]').catch(() => {}); await f.waitForTimeout(600);
  await bild('4-mina-pass', '/mina-pass', { vanta: 2000 });
  await bild('5-utveckling', '/utveckling', { vanta: 2500 });
  await bild('6-trana-sjalv', '/stig', { vanta: 1500 });
  await b.close();
  console.log('Bilderna ligger i', UT);
  // städa demodatan
  for (const v of [vt, vf, vf2]) await adm('PUT', `/admin/vecka/${v}`, { oppen: false, slots: [], notis: false });
  for (const k of [alva, ...andra]) await adm('DELETE', `/admin/klient/${k.klient.id}`);
})().catch(e => { console.error('FEL', e); process.exit(1); });
