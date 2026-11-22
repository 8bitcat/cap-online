// Veckoschema, påminnelse inför passet och kalenderlänken (2026-11-22).
// Haris: "det går inte att sätta olika tider för olika dagar … vissa dagar har jag till 18 och helger har jag endast två
// tider". Khaleds mamma: "kan man få notis inför träningspassen?" Carl: "så att vi lägger det i kalender".
// Kör lokalt (tre processer, testet startar själv en låtsad pushserver på 8799):
//   cd server/cap-api && npx wrangler dev --local --port 8787 --var ADMIN_LOSEN:testlosen --var ADMIN_EPOST:haris@test.se --var APP_BASE:http://127.0.0.1:8808/ --var LANK_BASE:http://127.0.0.1:8787 --var PUSH_BASE:http://127.0.0.1:8799 --var PUSH_HEMLIG:testhemlig --var TEST_LAGE:1
//   python tools/serve.py 8808
//   NODE_PATH=<node_modules med playwright> node tools/schema-test.js
const { chromium, devices } = require('playwright');
const http = require('http');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-444 55 66';

// låtsad cap-push: sparar det som skickas
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
  const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
  const V = veckaOm(1), V2 = veckaOm(2);

  // ---- Haris loggar in (på telefonen), pris, en kund ----
  const a = await nyFlik('haris', devices['iPhone 13']);
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.click('#anv-lage'); await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]');
  await a.waitForURL(/#\/admin\/klienter/, { timeout: 15000 }); await a.waitForTimeout(800);
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (metod, p, data) => fetch(API + p, { method: metod, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined }).then(r => r.json());
  await adm('PUT', '/admin/config/betalning', { swish: '1232852762', pris: 850 });
  await adm('PUT', '/admin/notiser', {});
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === '+46704445566')) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Maria', telefon: TEL, barn: 'Leo', efternamn: 'Exempel', fodd: 2016 });
  const kid = ny.klient.id, kod = ny.kod;
  for (const v of [V, V2]) await adm('PUT', `/admin/vecka/${v}`, { oppen: false, slots: [] });

  // ---- veckoschemat: egna tider per dag ----
  await a.goto(base + 'index.html#/admin/tider'); await a.waitForSelector('.vecka-nav', { timeout: 10000 });
  await a.click('.vecka-nav button[data-action=tid-vecka]:last-child'); await a.waitForSelector('#schema');
  koll('rätt vecka i titeln', norm(await a.$eval('.vecka-titel b', e => e.textContent)) === `Vecka ${Number(V.split('-W')[1])}`);
  const satt = async (d, pa, start, slut) => {
    const cb = await a.$(`input[name=pa${d}]`); if ((await cb.isChecked()) !== pa) await cb.click();
    if (pa) { await a.fill(`input[name=start${d}]`, start); await a.fill(`input[name=slut${d}]`, slut); }
  };
  await satt(1, true, '14:00', '17:00'); await satt(2, true, '14:00', '18:00'); await satt(3, false); await satt(4, true, '14:00', '17:00');
  await satt(5, false); await satt(6, true, '10:00', '12:00'); await satt(7, false);
  await a.selectOption('select[name=langd]', '60'); await a.fill('#schema input[name=plats]', 'Hisings Backa');
  const antal = await a.$$eval('.schema-rad', r => r.map(x => x.querySelector('.schema-antal').textContent));
  koll('antalet pass räknas per dag medan man skriver', antal.join(',') === '3 pass,4 pass,ledig,3 pass,ledig,2 pass,ledig', antal.join(','));
  await a.$eval('#schema', e => e.scrollIntoView()); await a.waitForTimeout(300);
  await (await a.$('#schema')).screenshot({ path: path.join(UT, 'schema-1-veckoschema.png') });
  await a.click('#schema button[type=submit]'); await vantaToast(a, 'inlagda');
  koll('tiderna läggs in', (await toast(a)).includes('12 tider inlagda'), await toast(a));
  let w = (await adm('GET', '/admin/veckor')).veckor.find(x => x.v === V);
  const perDag = d => w.slots.filter(s => s.dag === d).map(s => `${s.start}-${s.slut}`).join(' ');
  koll('måndag 14–17 = tre pass', perDag(1) === '14:00-15:00 15:00-16:00 16:00-17:00', perDag(1));
  koll('tisdag till 18 = fyra pass', perDag(2) === '14:00-15:00 15:00-16:00 16:00-17:00 17:00-18:00', perDag(2));
  koll('lördag bara två tider', perDag(6) === '10:00-11:00 11:00-12:00', perDag(6));
  koll('lediga dagar får inga tider', !perDag(3) && !perDag(5) && !perDag(7));
  koll('platsen på alla tider', w.slots.every(s => s.plats === 'Hisings Backa'));
  await a.waitForTimeout(400);
  await a.screenshot({ path: path.join(UT, 'schema-2-veckan.png'), fullPage: true });

  // schemat sparas och fylls i nästa gång
  await a.reload({ waitUntil: 'networkidle' }); await a.waitForSelector('#schema');
  koll('schemat är kvar efter omladdning', await a.$eval('input[name=slut2]', e => e.value) === '18:00' && !(await a.$eval('input[name=pa3]', e => e.checked)));

  // ---- en bokad tid ligger kvar när schemat byts ----
  const man14 = w.slots.find(s => s.dag === 1 && s.start === '14:00');
  const bk = await adm('POST', `/admin/klient/${kid}/boka`, { v: V, slot: man14.id });
  koll('Haris bokar måndag 14 åt Leo', bk.ok, bk.fel || '');
  await a.goto(base + 'index.html#/admin/klienter'); await a.goto(base + 'index.html#/admin/tider'); await a.waitForSelector('#schema');
  if (norm(await a.$eval('.vecka-titel b', e => e.textContent)) !== `Vecka ${Number(V.split('-W')[1])}`) { await a.click('.vecka-nav button[data-action=tid-vecka]:last-child'); await a.waitForSelector('#schema'); }
  await a.fill('input[name=slut2]', '17:00'); await satt(6, false);
  await a.click('#schema button[type=submit]'); await a.waitForTimeout(300);
  const armad = norm(await a.$eval('#schema button[type=submit]', e => e.textContent));
  koll('att byta lediga tider kräver ett andra tryck', /Tryck igen: \d+ lediga tider/.test(armad), armad);
  await a.click('#schema button[type=submit]'); await vantaToast(a, 'inlagda');
  koll('besked om bytet', /inlagda, 11 gamla borttagna\. Veckan har 9 tider/.test(await toast(a)), await toast(a));
  w = (await adm('GET', '/admin/veckor')).veckor.find(x => x.v === V);
  const bokad = w.slots.find(s => s.bokad);
  koll('den bokade tiden ligger kvar, samma tid och samma bokning', bokad?.id === man14.id && bokad.bokad.uid === kid, JSON.stringify(bokad?.bokad || null).slice(0, 80));
  koll('tisdag nu 14–17, lördag borta', perDag(2) === '14:00-15:00 15:00-16:00 16:00-17:00' && !perDag(6), `${perDag(2)} | ${perDag(6)}`);

  // gamla formatet (äldre appar) fungerar som förut
  const gammal = await adm('POST', `/admin/vecka/${V2}/auto`, { dagar: [1, 3], start: '16:00', slut: '18:00', langd: 60, plats: 'X' });
  koll('gamla autosätt-formatet', gammal.ok && gammal.vecka.slots.length === 4, `${gammal.vecka?.slots.length}`);

  // ---- påminnelsen kvällen före (veckan efter nästa, så att bokningen alltid görs före kvällen före) ----
  const v2man = gammal.vecka.slots.find(s => s.dag === 1 && s.start === '16:00');
  await adm('POST', `/admin/klient/${kid}/boka`, { v: V2, slot: v2man.id });
  const mandagDatum = new Date(Date.parse(`${(await adm('GET', '/admin/veckor')).mandag[V2]}T12:00:00Z`));
  const sondag = new Date(mandagDatum.getTime() - 864e5).toISOString().slice(0, 10);
  pushLogg.length = 0;
  const p1 = await adm('POST', '/admin/paminnelser', { nu: `${sondag}T17:55` });
  koll('ingen påminnelse före kl 18 kvällen före', p1.ok && p1.skickade === 0, JSON.stringify(p1));
  const p2 = await adm('POST', '/admin/paminnelser', { nu: `${sondag}T18:05` });
  const pm = pushLogg.find(x => x.path === '/skicka');
  koll('påminnelsen går ut kl 18 kvällen före', p2.skickade === 1, JSON.stringify(p2).slice(0, 200));
  koll('bara till Leos förälder', JSON.stringify(pm?.till) === JSON.stringify([kid]) && !pm?.foraldrar, JSON.stringify(pm || {}).slice(0, 200));
  koll('texten', pm?.title === 'Träning med Haris i morgon' && /^Leo tränar i morgon, mån \d+ \w+ kl 16:00–17:00, X\. Vi ses!$/.test(pm?.text || ''), pm?.text);
  const p3 = await adm('POST', '/admin/paminnelser', { nu: `${sondag}T18:20` });
  koll('ingen dubbel påminnelse', p3.skickade === 0, JSON.stringify(p3));
  const p4 = await adm('POST', '/admin/paminnelser', { nu: `${mandagDatum.toISOString().slice(0, 10)}T16:30` });
  koll('ingen påminnelse när passet redan börjat', p4.skickade === 0);

  // ---- föräldern: Lägg i kalendern ----
  const f = await nyFlik('förälder', devices['iPhone 13']);
  await f.goto(base + 'index.html#/k/' + kod, { waitUntil: 'networkidle' }); await f.waitForSelector('#losen1', { timeout: 15000 });
  await f.fill('#losen1', 'hemligt1'); await f.fill('#losen2', 'hemligt1'); await f.click('form[data-form=losen] button[type=submit]');
  await f.waitForFunction(() => document.querySelector('#name') || document.querySelector('.greet'), null, { timeout: 15000 });
  if (await f.$('#name')) { await f.selectOption('#fodd', '2016'); await f.click('form[data-form=wiz1] button'); }
  await f.waitForSelector('.greet', { timeout: 15000 });
  await f.goto(base + 'index.html#/boka'); await f.waitForSelector('#mina .bokning', { timeout: 15000 });
  const kal = await f.$eval('#mina .kal-knapp', e => ({ href: e.getAttribute('href'), target: e.target, text: e.textContent })).catch(() => null);
  koll('knappen Lägg i kalendern under Mina bokningar', kal?.text.includes('Lägg i kalendern') && kal.target === '_blank', JSON.stringify(kal));
  koll('rad om påminnelsen', norm(await f.$eval('#mina', e => e.textContent)).includes('påminnelse kvällen före varje pass'));
  await (await f.$('#mina .bokning')).evaluate(e => e.scrollIntoView({ block: 'center' })); await f.waitForTimeout(300);
  await f.screenshot({ path: path.join(UT, 'schema-3-forälder-kalender.png') });
  const ics = await fetch(kal.href);
  const icsText = await ics.text();
  const dagStr = (await adm('GET', '/admin/veckor')).mandag[V].replace(/-/g, '');
  koll('kalenderfilen', ics.status === 200 && (ics.headers.get('content-type') || '').startsWith('text/calendar'), `${ics.status} ${ics.headers.get('content-type')}`);
  koll('rätt tid i UTC (14:00 svensk vintertid = 13:00 UTC)', icsText.includes(`DTSTART:${dagStr}T130000Z`) && icsText.includes(`DTEND:${dagStr}T140000Z`), icsText.split('\r\n').filter(x => /^DT(START|END)/.test(x)).join(' '));
  const ofalt = icsText.replace(/\r\n /g, '');
  koll('rubrik, Backavallen och påminnelse en timme före om att åka', ofalt.includes('SUMMARY:Träning med CAP (Leo)') && ofalt.includes('LOCATION:Hisings Backa\\, Göteborg') && ofalt.includes('TRIGGER:-PT1H') && ofalt.includes('Dags att åka till Backavallen'), ofalt.split('\r\n').filter(x => /^(SUMMARY|LOCATION|DESCRIPTION)/.test(x)).join(' | '));
  koll('inga rader över 75 byte', icsText.split('\r\n').every(r => Buffer.byteLength(r) <= 75));

  // ---- prenumerationerna: familjens och Haris ----
  const mina = await f.evaluate(async api => { const t = JSON.parse(localStorage.getItem('caponline.v3') || '{}').session?.token; return (await fetch(api + '/mina', { headers: { authorization: 'Bearer ' + t } })).json(); }, API);
  koll('knappen Alla era pass i kalendern', (await f.$eval('.kal-feed a', e => e.getAttribute('href')).catch(() => '')).startsWith('webcal://'));
  const famFeed = await (await fetch(API + mina.kalFeed)).text();
  koll('familjens kalender: båda Leos pass', (famFeed.match(/BEGIN:VEVENT/g) || []).length === 2 && famFeed.includes('X-WR-CALNAME:Träning med CAP'), `${(famFeed.match(/BEGIN:VEVENT/g) || []).length} händelser`);
  koll('en ändrad familjelänk fungerar inte', (await fetch(API + mina.kalFeed.replace(/[0-9a-f](\.ics)$/, m => (m[0] === '0' ? '1' : '0') + '.ics'))).status === 403);
  const hk = await adm('GET', '/admin/kalender');
  const harisFeed = (await (await fetch(API + hk.url)).text()).replace(/\r\n /g, '');
  koll('Haris kalender: barnets namn, förälder och telefon', harisFeed.includes('SUMMARY:CAP: Leo') && harisFeed.includes('Förälder: Maria') && harisFeed.includes('+46704445566') && harisFeed.includes('Om en timme: Leo på Backavallen'), harisFeed.split('\r\n').filter(x => /^(SUMMARY|DESCRIPTION)/.test(x)).slice(0, 2).join(' | '));
  koll('Haris kalender uppdateras var 15:e minut', harisFeed.includes('REFRESH-INTERVAL;VALUE=DURATION:PT15M'));
  const hk2 = await adm('POST', '/admin/kalender', { ny: true });
  koll('Byt länk: den gamla slutar fungera', hk2.url !== hk.url && (await fetch(API + hk.url)).status === 403 && (await fetch(API + hk2.url)).status === 200);
  await a.goto(base + 'index.html#/admin/mer'); await a.waitForSelector('#kalender a[href^="webcal://"]', { timeout: 10000 }).catch(() => {});
  koll('Admin → Mer: Lägg till i Kalender', !!(await a.$('#kalender a[href^="webcal://"]')));
  await (await a.$('#kalender')).screenshot({ path: path.join(UT, 'schema-4-haris-kalender.png') });
  const falsk = await fetch(kal.href.replace(/[0-9a-f](\.ics)$/, m => (m[0] === '0' ? '1' : '0') + '.ics'));
  koll('en ändrad länk fungerar inte', falsk.status === 403, String(falsk.status));
  await adm('POST', `/admin/klient/${kid}/avboka`, { v: V, slot: man14.id });
  const efter = await fetch(kal.href);
  koll('avbokad tid ger ingen kalenderfil', efter.status === 404, String(efter.status));

  // ---- Haris kan stänga av påminnelserna ----
  await a.goto(base + 'index.html#/admin/mer'); await a.waitForSelector('form[data-form=admin-notiser]', { timeout: 10000 });
  koll('reglaget Påminnelse om passet under Notiser', norm(await a.$eval('form[data-form=admin-notiser]', e => e.textContent)).includes('Påminnelse om passet'));
  await adm('PUT', '/admin/notiser', { paminnelse: false });
  const p5 = await adm('POST', '/admin/paminnelser', {});
  koll('avstängd: inga påminnelser', p5.av === true && p5.skickade === 0, JSON.stringify(p5));
  await adm('PUT', '/admin/notiser', {});

  // städa
  await adm('DELETE', `/admin/klient/${kid}`);
  for (const v of [V, V2]) await adm('PUT', `/admin/vecka/${v}`, { oppen: false, slots: [] });
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close(); mock.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
