// Syskon (Haris 2026-11-22: "en klient som lämnar sina tvillingar till mig … en förälder har två barn").
// Carl: samma tid, en bokning, ett pris för passet. Varje barn har egen nivå, egna bedömningar och filmer.
// Kör lokalt som schema-test.js (wrangler dev med TEST_LAGE:1 och PUSH_BASE:http://127.0.0.1:8799, serve.py 8808).
const { chromium, devices } = require('playwright');
const http = require('http');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-444 55 77', TELN = '+46704445577';

const pushLogg = [];
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.method === 'POST') { try { pushLogg.push({ path: req.url, ...JSON.parse(body) }); } catch { /* ok */ } }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.method === 'POST' ? { ok: true, skickade: 1 } : { ok: true, telefoner: 1, inloggade: 1, haris: 0 }));
  });
});

(async () => {
  await new Promise(r => mock.listen(8799, '127.0.0.1', r));
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const nyFlik = async (namn, enhet) => {
    const ctx = await b.newContext({ ...enhet, locale: 'sv-SE' });
    await ctx.addInitScript(api => { try { localStorage.setItem('cap_api', api); } catch { /* ok */ } }, API);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(namn + ': ' + e.message)); return p;
  };
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
  const vantaToast = (p, t) => p.waitForFunction(t => (document.querySelector('#toast')?.textContent || '').replace(/\s+/g, ' ').includes(t), t, { timeout: 10000 }).then(() => true, () => false);
  const toast = p => p.$eval('#toast', e => e.textContent).then(norm).catch(() => '');
  const text = (p, sel) => p.$eval(sel, e => e.textContent).then(norm).catch(() => '');
  const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
  const V = veckaOm(2);

  // ---- Haris: Leo, och en vecka med tider ----
  const a = await nyFlik('haris', devices['iPhone 13']);
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.click('#anv-lage');
  for (let i = 0; i < 4 && !/admin\/(idag|klienter)/.test(a.url()); i++) { await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]'); await a.waitForURL(/#\/admin\/(idag|klienter)/, { timeout: 8000 }).catch(() => {}); } await a.waitForTimeout(800);
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (metod, p, data) => fetch(API + p, { method: metod, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined }).then(r => r.json());
  await adm('PUT', '/admin/config/betalning', { swish: '1232852762', pris: 850 });
  await adm('PUT', '/admin/notiser', {});
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN).sort((x, y) => (y.huvud ? 1 : 0) - (x.huvud ? 1 : 0))) await adm('DELETE', `/admin/klient/${k.id}`);
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN)) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Sara', telefon: TEL, barn: 'Leo', efternamn: 'Exempel', fodd: 2016 });
  const leo = ny.klient.id, kod = ny.kod;
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  const auto = await adm('POST', `/admin/vecka/${V}/auto`, { schema: [{ dag: 1, pa: true, start: '16:00', slut: '18:00' }, { dag: 2, pa: true, start: '16:00', slut: '17:00' }], langd: 60, plats: 'Hisings Backa', ersatt: true });
  await adm('PUT', `/admin/vecka/${V}`, { oppen: true, slots: auto.vecka.slots, notis: false });
  const slot = (dag, start) => auto.vecka.slots.find(s => s.dag === dag && s.start === start).id;

  // ---- samma nummer på Ny kund leder till Lägg till syskon ----
  await a.goto(base + 'index.html#/admin/klient/ny'); await a.waitForSelector('form[data-form=klient-ny]');
  await a.fill('#ktel', TEL); await a.click('form[data-form=klient-ny] button[type=submit]');
  await a.waitForURL(new RegExp(`#/admin/klient/${leo}$`), { timeout: 10000 }).catch(() => {});
  await a.waitForSelector('form[data-form=klient-syskon]', { timeout: 10000 }).catch(() => {});
  koll('samma nummer: Leos sida öppnas med Lägg till syskon framme', a.url().endsWith(`/admin/klient/${leo}`) && !!(await a.$('form[data-form=klient-syskon]')), a.url());
  await a.fill('#sysbarn', 'Mia');
  koll('efternamnet är förifyllt', await a.$eval('#sysefter', e => e.value) === 'Exempel');
  await a.click('form[data-form=klient-syskon] button[type=submit]'); await vantaToast(a, 'är inlagd som syskon');
  koll('Mia inlagd som syskon', (await toast(a)).includes('Mia är inlagd som syskon'), await toast(a));
  const lista = (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN);
  const mia = lista.find(x => x.barn === 'Mia')?.id;
  koll('två klienter med samma nummer, Mia syskon till Leo', lista.length === 2 && lista.find(x => x.id === mia)?.syskonTill === 'Leo' && lista.find(x => x.id === leo)?.syskonNamn?.join() === 'Mia');
  await (await a.$('#syskon')).scrollIntoViewIfNeeded(); await a.waitForTimeout(300);
  await (await a.$('#syskon')).screenshot({ path: path.join(UT, 'syskon-1-panel.png') });

  // ---- Haris bokar en tid åt båda (standard), en tid åt bara Leo ----
  await a.goto(base + `index.html#/admin/klient/${leo}/boka`); await a.waitForSelector('.barn-val');
  koll('bokningsvyn: Leo och Mia förvalda', norm(await text(a, 'h1')) === 'Boka en tid åt Leo och Mia', await text(a, 'h1'));
  await a.click(`.vecka-nav button[data-action=klient-boka-vecka]:last-child`); await a.waitForTimeout(400);
  await a.click(`.vecka-nav button[data-action=klient-boka-vecka]:last-child`); await a.waitForSelector(`button.tid[data-slot="${slot(1, '16:00')}"]`, { timeout: 10000 });
  await a.screenshot({ path: path.join(UT, 'syskon-2-haris-boka.png') });
  await a.click(`button.tid[data-slot="${slot(1, '16:00')}"]`); await vantaToast(a, 'Tiden är bokad');
  koll('besked: bokad åt Leo och Mia', (await toast(a)).includes('Leo och Mia'), await toast(a));
  let w = (await adm('GET', '/admin/veckor')).veckor.find(x => x.v === V);
  let s1 = w.slots.find(s => s.id === slot(1, '16:00'));
  koll('en bokning, båda barnen, ett pris', s1.bokad?.uid === leo && s1.bokad.barnIds?.join() === [leo, mia].join() && s1.bokad.barn === 'Leo och Mia' && s1.bokad.pris === 850, JSON.stringify(s1.bokad).slice(0, 160));

  // Mias sida: tiden syns, betalningen sköts på Leos sida
  const miaSida = await adm('GET', `/admin/klient/${mia}`);
  koll('Mias sida visar familjens tid', miaSida.bokningar.some(x => x.id === s1.id && x.barnIds.includes(mia)));
  await a.goto(base + `index.html#/admin/klient/${mia}`); await a.waitForSelector('#syskon');
  const miaText = norm(await a.$eval('main, #app, body', e => e.textContent));
  koll('Mias sida: familjens inloggning, pott och paket som på Leos sida (Haris 11-24)', !!(await a.$('#inloggning')) && miaText.includes('gäller hela familjen (Leo och Mia)') && miaText.includes('Priset sätts på Leos sida'), miaText.slice(0, 200));
  koll('tiden står som Leo och Mia tillsammans', miaText.includes('Leo och Mia tillsammans'));
  // stryk Mia från tiden: Leo tränar kvar, samma pris
  await a.click(`button[data-action=klient-avboka][data-slot="${s1.id}"]`); await a.waitForTimeout(200);
  await a.click(`button[data-action=klient-avboka][data-slot="${s1.id}"]`); await vantaToast(a, 'struken');
  w = (await adm('GET', '/admin/veckor')).veckor.find(x => x.v === V); s1 = w.slots.find(s => s.id === s1.id);
  koll('Mia struken, Leo kvar på tiden', s1.bokad?.barnIds?.join() === leo && s1.bokad.barn === 'Leo' && s1.bokad.pris === 850, JSON.stringify(s1.bokad?.barnIds));
  // och tillbaka från Tider: "Leo och Mia tillsammans" i listan (lägger till Mia på tiden)
  const tillbaka = await adm('POST', `/admin/klient/${mia}/boka`, { v: V, slot: s1.id });
  koll('Mia tillagd igen på familjens tid', tillbaka.ok && tillbaka.vecka.slots.find(s => s.id === s1.id).bokad.barn === 'Leo och Mia', tillbaka.fel || '');
  await a.goto(base + 'index.html#/admin/tider'); await a.waitForSelector('.vecka-nav');
  await a.click('.vecka-nav button[data-action=tid-vecka]:last-child'); await a.waitForTimeout(300); await a.click('.vecka-nav button[data-action=tid-vecka]:last-child');
  await a.waitForSelector(`button[data-action=tid-boka][data-id="${slot(1, '17:00')}"]`, { timeout: 10000 });
  await a.click(`button[data-action=tid-boka][data-id="${slot(1, '17:00')}"]`); await a.waitForSelector('[data-boka-klient]');
  const val = await a.$$eval('[data-boka-klient] option', o => o.map(x => x.textContent));
  koll('Tider: valet Leo och Mia tillsammans', val.some(x => x.includes('Leo och Mia tillsammans')), val.filter(x => /Leo|Mia/.test(x)).join(' | '));
  await a.click('button[data-action=tid-boka][data-id=""]');

  // ---- föräldern: en inloggning, Vem tränar?, ett pris ----
  const f = await nyFlik('förälder', devices['iPhone 13']);
  await f.goto(base + 'index.html#/k/' + kod, { waitUntil: 'networkidle' }); await f.waitForSelector('#losen1', { timeout: 15000 });
  await f.fill('#losen1', 'hemligt1'); await f.fill('#losen2', 'hemligt1'); await f.click('form[data-form=losen] button[type=submit]');
  await f.waitForFunction(() => document.querySelector('#name') || document.querySelector('.greet'), null, { timeout: 15000 });
  if (await f.$('#name')) { await f.selectOption('#fodd', '2016'); await f.click('form[data-form=wiz1] button'); await f.waitForURL(/kom-igang/, { timeout: 10000 }); await f.evaluate(() => { location.hash = '#/'; }); } // Sista steget testas i intro-test.js
  await f.waitForSelector('.greet', { timeout: 15000 });
  await f.goto(base + `index.html#/boka/${V}`); await f.waitForSelector(`button.tid[data-slot="${slot(2, '16:00')}"]`, { timeout: 15000 });
  await f.click(`button.tid[data-slot="${slot(2, '16:00')}"]`); await f.waitForSelector('.hall .barn-val', { timeout: 10000 });
  const chips = await f.$$eval('.hall .barn-val .chip', c => c.map(x => `${x.textContent.trim()}:${x.classList.contains('on')}`));
  koll('Vem tränar? Leo och Mia förvalda', chips.join() === '✓ Leo:true,✓ Mia:true', chips.join());
  koll('knappen Boka för Leo och Mia', (await text(f, '.hall [data-action=boka-bekrafta]')).includes('Leo och Mia'), await text(f, '.hall [data-action=boka-bekrafta]'));
  await (await f.$('.hall')).evaluate(e => e.scrollIntoView({ block: 'center' })); await f.waitForTimeout(250);
  await f.screenshot({ path: path.join(UT, 'syskon-3-forälder-vem.png') });
  await f.click('.hall [data-action=boka-bekrafta]'); await f.waitForSelector('.betal-ark, .nyss-bokad', { timeout: 10000 });
  w = (await adm('GET', '/admin/veckor')).veckor.find(x => x.v === V);
  const s2 = w.slots.find(s => s.id === slot(2, '16:00'));
  koll('förälderns bokning: båda barnen, ett pris', s2.bokad?.uid === leo && s2.bokad.barnIds?.length === 2 && s2.bokad.barn === 'Leo och Mia' && s2.bokad.pris === 850 && s2.bokad.av === 'foralder', JSON.stringify(s2.bokad).slice(0, 160));
  const swish = await f.$eval('.betal-ark a.btn.swish', e => e.getAttribute('href')).catch(() => '');
  koll('Swish: ett pass, 850 kr', swish.includes('amt=850.00') && decodeURIComponent(swish).includes('Leo och Mia'), decodeURIComponent(swish).slice(-60));
  if (await f.$('[data-action=boka-ark-stang]')) await f.click('[data-action=boka-ark-stang]');
  // bara Leo nästa gång
  await f.click(`button.tid[data-slot="${slot(1, '17:00')}"]`); await f.waitForSelector('.hall .barn-val', { timeout: 10000 });
  await f.click('.hall .barn-val .chip:nth-child(2)'); await f.waitForTimeout(200);
  koll('Mia avbockad: Boka för Leo', (await text(f, '.hall [data-action=boka-bekrafta]')).includes('Boka för Leo') && !(await text(f, '.hall [data-action=boka-bekrafta]')).includes('Mia'), await text(f, '.hall [data-action=boka-bekrafta]'));
  await f.click('.hall [data-action=boka-bekrafta]'); await f.waitForTimeout(1200);
  w = (await adm('GET', '/admin/veckor')).veckor.find(x => x.v === V);
  koll('bokning bara för Leo', w.slots.find(s => s.id === slot(1, '17:00')).bokad?.barnIds?.join() === leo);

  // ---- utveckling per barn ----
  await adm('POST', `/admin/klient/${mia}/bedomning`, { namn: 'Konbana', varv: [31.2, 30.4] });
  await adm('POST', `/admin/klient/${mia}/niva`, { niva: 3, kommentar: 'Bra vänsterfot' });
  await f.goto(base + 'index.html#/utveckling'); await f.reload({ waitUntil: 'networkidle' }); await f.waitForSelector('.barn-val', { timeout: 15000 });
  koll('utveckling: Leo först, ingen bedömning', norm(await text(f, 'h1')) === 'Leo' && !(norm(await f.$eval('body', e => e.textContent))).includes('Konbana'));
  await f.click('.barn-val a.chip:nth-child(2)'); await f.waitForFunction(() => document.querySelector('h1')?.textContent.trim() === 'Mia', null, { timeout: 10000 }).catch(() => {});
  const miaU = norm(await f.$eval('body', e => e.textContent));
  koll('Mia: egen nivå 3 och egen konbana', norm(await text(f, 'h1')) === 'Mia' && miaU.includes('Konbana') && (await text(f, '.niva-tal b')) === '3', `${await text(f, 'h1')} nivå ${await text(f, '.niva-tal b')}`);
  await f.screenshot({ path: path.join(UT, 'syskon-4-utveckling.png') });

  // ---- påminnelsen nämner båda ----
  const man = (await adm('GET', '/admin/veckor')).mandag[V];
  pushLogg.length = 0;
  const sondag = new Date(Date.parse(`${man}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  await adm('POST', '/admin/paminnelser', { nu: `${sondag}T18:05` });
  const pm = pushLogg.filter(x => x.till?.[0] === leo);
  koll('påminnelsen: Leo och Mia, till förälderns telefon', pm.some(x => x.text.startsWith('Leo och Mia tränar i morgon')), pm.map(x => x.text).join(' | '));

  // ---- borttagning ----
  const tl = await adm('DELETE', `/admin/klient/${leo}`);
  koll('Leo går inte att ta bort medan Mia finns', !tl.ok && /syskonen/.test(tl.fel || ''), tl.fel);
  const tm = await adm('DELETE', `/admin/klient/${mia}`);
  w = (await adm('GET', '/admin/veckor')).veckor.find(x => x.v === V);
  koll('Mia borttagen: Leo tränar kvar på tiderna', tm.ok && w.slots.find(s => s.id === slot(1, '16:00')).bokad?.barnIds?.join() === leo && w.slots.find(s => s.id === slot(2, '16:00')).bokad?.barnIds?.join() === leo);
  const login = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ anvandare: TEL, losen: 'hemligt1' }) }).then(r => r.json());
  koll('föräldern kan fortfarande logga in (numret ligger kvar på Leo)', !!login.token, JSON.stringify(login).slice(0, 80));
  await adm('DELETE', `/admin/klient/${leo}`);
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });

  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close(); mock.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
