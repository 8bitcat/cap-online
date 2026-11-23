// Träningsblocken (köp i appen, Carl 2026-11-23) och frågorna om lov i app 1.3. Låtsad iOS-app med NativePurchases,
// signerade transaktioner från en egen testkedja (tools/.testkedja, servern startas med TEST_ROT = dess rot), så att
// servern kontrollerar signaturen precis som mot Apple. Kör lokalt:
//   wrangler dev --local --port 8787 … --var TEST_LAGE:1 --var TEST_ROT:$(cat tools/.testkedja/test.rot) --var PUSH_BASE:http://127.0.0.1:8799
//   python tools/serve.py 8808
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const base = 'http://127.0.0.1:8808/', API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const KED = path.join(__dirname, '.testkedja');
const b64u = b => Buffer.from(b).toString('base64url');
const x5c = ['lov.der', 'mell.der', 'rot.der'].map(n => fs.readFileSync(path.join(KED, n)).toString('base64'));
let txNr = Date.now() * 10;
function jws(produkt, extra = {}) {
  const head = b64u(JSON.stringify({ alg: 'ES256', x5c }));
  const id = String(++txNr);
  const body = b64u(JSON.stringify({ transactionId: id, originalTransactionId: id, productId: `se.completeathletic.caponline.block.${produkt}`, bundleId: 'se.completeathletic.caponline', environment: 'Sandbox', ...extra }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: fs.readFileSync(path.join(KED, 'lov.p8')), dsaEncoding: 'ieee-p1363' });
  return { transactionId: id, productIdentifier: `se.completeathletic.caponline.block.${produkt}`, jwsRepresentation: `${head}.${body}.${b64u(sig)}` };
}
const pushLogg = [];
const mock = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => { if (req.method === 'POST') { try { pushLogg.push(JSON.parse(body)); } catch {} } res.setHeader('content-type', 'application/json'); res.end('{"ok":true,"skickade":1}'); }); });

(async () => {
  await new Promise(r => mock.listen(8799, '127.0.0.1', r));
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const txLista = {};
  const nyFlik = async (namn, { app = true, version = '1.3', lagring = null, ejSalj = [] } = {}) => {
    const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
    await ctx.addInitScript(e => { window.__ejSalj = e; }, ejSalj);
    await ctx.exposeFunction('__tx', p => { const t = jws(p); (txLista[namn] ||= []).push(t); return t; });
    await ctx.addInitScript(([api, app, version, lagring]) => {
      try { localStorage.setItem('cap_api', api); if (lagring && !sessionStorage.getItem('lagrat')) { for (const [k, v] of Object.entries(lagring)) localStorage.setItem(k, v); sessionStorage.setItem('lagrat', '1'); } } catch {}
      if (!app) return;
      window.__fragor = [];
      const lage = { push: 'prompt', kal: 'fraga', kamera: 'fraga', mikrofon: 'fraga' };
      const lyssn = { remove() {} };
      const kopta = [];
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => ['PushNotifications', 'LocalNotifications', 'App', 'CapKalender', 'NativePurchases'].includes(n), Plugins: {
        PushNotifications: { checkPermissions: async () => ({ receive: lage.push }), requestPermissions: async () => { window.__fragor.push('notiser'); lage.push = 'granted'; return { receive: 'granted' }; }, addListener: async () => lyssn, register: async () => {} },
        LocalNotifications: { checkPermissions: async () => ({ display: lage.push }), requestPermissions: async () => ({ display: 'granted' }), getPending: async () => ({ notifications: [] }), cancel: async () => {}, schedule: async () => { window.__fragor.push('trana'); } },
        CapKalender: { status: async () => ({ behorighet: lage.kal }), synka: async ({ fraga }) => { if (lage.kal === 'fraga' && fraga) { window.__fragor.push('kalender'); lage.kal = 'ja'; } return { ok: lage.kal === 'ja', behorighet: lage.kal }; }, avsluta: async () => ({ ok: true }),
          media: async () => ({ kamera: lage.kamera, mikrofon: lage.mikrofon }), mediaFraga: async ({ typ }) => { window.__fragor.push(typ); lage[typ] = 'ja'; return { ok: true, behorighet: 'ja' }; } },
        App: { getInfo: async () => ({ version }), addListener: () => ({ catch() {} }), getLaunchUrl: async () => ({}) },
        NativePurchases: {
          getProducts: async ({ productIdentifiers }) => ({ products: productIdentifiers.filter(id => !(window.__ejSalj || []).includes(id.split('.').pop())).map(id => ({ identifier: id, priceString: ({ niva2: '129,00 kr', niva3: '149,00 kr', matchfart: '199,00 kr', position: '249,00 kr', stigen: '499,00 kr', plus: '999,00 kr' })[id.split('.').pop()] })) }),
          purchaseProduct: async ({ productIdentifier }) => { const t = await window.__tx(productIdentifier.split('.').pop()); kopta.push(t); return t; },
          restorePurchases: async () => {}, getPurchases: async () => ({ purchases: kopta.concat(window.__andraKop || []) }), addListener: async () => lyssn,
        },
      } };
    }, [API, app, version, lagring]);
    await ctx.route(/itunes\.apple\.com/, r => r.fulfill({ contentType: 'application/json', body: '{"resultCount":0,"results":[]}' }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(namn + ': ' + e.message)); return p;
  };

  // Haris
  const a = await nyFlik('haris', { app: false });
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.click('#anv-lage');
  for (let i = 0; i < 4 && !/admin\/klienter/.test(a.url()); i++) { await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]'); await a.waitForURL(/#\/admin\/klienter/, { timeout: 8000 }).catch(() => {}); }
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (m, p, d) => fetch(API + p, { method: m, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: d ? JSON.stringify(d) : undefined }).then(r => r.json());
  await adm('PUT', '/admin/config/stig', { drommar: [], etapper: [] });
  const nyKlient = async (tel, teln, barn) => {
    for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === teln)) await adm('DELETE', `/admin/klient/${k.id}`);
    return adm('POST', '/admin/klient', { foralder: 'Nora', telefon: tel, barn, efternamn: 'Exempel', fodd: 2017, position: 'anf' });
  };
  const genomKonto = async (f, kod) => {
    await f.goto(base + 'index.html#/k/' + kod, { waitUntil: 'networkidle' }); await f.waitForSelector('#losen1');
    await f.fill('#losen1', 'hemligt1'); await f.fill('#losen2', 'hemligt1'); await f.click('form[data-form=losen] button[type=submit]');
    await f.waitForSelector('#name', { timeout: 15000 });
    await f.selectOption('#fodd', '2017'); await f.click('form[data-form=wiz1] button');
    await f.waitForURL(/#\/kom-igang/, { timeout: 10000 }); await f.waitForTimeout(1500);
  };

  // 1) nytt konto i 1.3: Sista steget med kamera och mikrofon, Slå på allt frågar om allt
  const ny = await nyKlient('070-444 55 41', '+46704445541', 'Vide');
  const f = await nyFlik('app');
  await genomKonto(f, ny.kod);
  const rub = await f.$$eval('.inst-rad b', r => r.map(x => x.textContent));
  koll('Sista steget: Notiser, Kalendern, Kamera och mikrofon, Träna hemma', ['Notiser', 'Kalendern', 'Kamera och mikrofon', 'Träna hemma'].every(n => rub.includes(n)), rub.join(','));
  await f.click('button[data-action=inst-allt]');
  await f.waitForFunction(() => window.__fragor.includes('trana'), null, { timeout: 10000 }).catch(() => {}); await f.waitForTimeout(1800);
  const fr = await f.evaluate(() => window.__fragor);
  koll('Slå på allt: notiser, kalendern, kamera, mikrofon, träna hemma', ['notiser', 'kalender', 'kamera', 'mikrofon', 'trana'].every(x => fr.includes(x)), JSON.stringify(fr));
  await f.screenshot({ path: path.join(UT, 'block-intro.png'), fullPage: true });
  await f.click('button[data-action=inst-klar]'); await f.waitForSelector('.greet', { timeout: 10000 });

  // 2) stigen: etapp 1 öppen, etapp 2 låst bakom Nivå 2
  await f.goto(base + 'index.html#/stig'); await f.waitForSelector('.stig-node', { timeout: 10000 }); await f.waitForTimeout(800);
  const kopNoder = await f.$$eval('.stig-node.ejkopt', r => r.length);
  const forsta = await f.$$eval('.stig-node:not(.ejkopt)', r => r.length);
  koll('stigen: etapp 1 öppen, resten låst', forsta >= 6 && kopNoder >= 10, `${forsta} öppna, ${kopNoder} låsta`);
  await f.screenshot({ path: path.join(UT, 'block-stig.png'), fullPage: true });

  // 2b) ett köp som Apple inte säljer än (inte godkänt): ingen köpknapp, «Kommer snart»
  const ej = await nyFlik('ejsalj', { ejSalj: ['niva3'], lagring: await f.evaluate(() => Object.fromEntries(Object.entries(localStorage))) });
  await ej.goto(base + 'index.html#/block', { waitUntil: 'networkidle' }); await ej.waitForSelector('[data-action=block-kop]'); await ej.waitForTimeout(800);
  koll('ej godkänt köp: Kommer snart, övriga har knapp', !(await ej.$('[data-action=block-kop][data-id=niva3]')) && (await ej.$eval('#block-niva3', e => e.textContent)).includes('Kommer snart') && !!(await ej.$('[data-action=block-kop][data-id=niva2]')));
  await ej.context().close();

  // 3) butiken: sex block med Apples priser, köp Nivå 2
  await f.goto(base + 'index.html#/block'); await f.waitForSelector('.block-kort'); await f.waitForTimeout(800);
  const knappar = await f.$$eval('[data-action=block-kop]', r => r.map(x => x.textContent.trim()));
  koll('sex block med priser från Apple', knappar.length === 6 && knappar[0] === 'Köp 129,00 kr' && knappar[5] === 'Köp 999,00 kr', knappar.join(' | '));
  koll('Återställ köp finns', !!(await f.$('[data-action=block-aterstall]')));
  await f.screenshot({ path: path.join(UT, 'block-butik.png'), fullPage: true });
  pushLogg.length = 0;
  await f.click('[data-action=block-kop][data-id=niva2]'); await f.waitForTimeout(2000);
  koll('köpt: Nivå 2 är Ert', (await f.$eval('#block-niva2', e => e.textContent)).includes('✓ Ert'));
  const kl = (await adm('GET', `/admin/klient/${ny.klient.id}`)).klient;
  koll('servern: köpet på kontot (signaturen godkänd)', (kl.kop || []).some(x => x.id === 'niva2' && x.miljo === 'test'), JSON.stringify(kl.kop));
  koll('Haris fick en notis om köpet', pushLogg.some(x => x.admin && /köpte Nivå 2/.test(x.title)), JSON.stringify(pushLogg.map(x => x.title)));
  await f.goto(base + 'index.html#/stig'); await f.waitForSelector('.stig-node'); await f.waitForTimeout(600);
  const kopEfter = await f.$$eval('.stig-node.ejkopt', r => r.length);
  koll('stigen: etapp 2 öppen efter köpet', kopEfter < kopNoder && kopEfter > 0, `${kopNoder} → ${kopEfter} låsta`);

  // 4) Haris ser köpet på kunden
  await a.goto(base + `index.html#/admin/klient/${ny.klient.id}`); await a.waitForTimeout(2000);
  koll('Haris: Köpt i appen på kundsidan', (await a.textContent('main')).includes('Köpt i appen'));

  // 5) samma köp kan inte kopplas till ett annat konto, och en ändrad transaktion nekas
  const ny2 = await nyKlient('070-444 55 42', '+46704445542', 'Tove');
  const g = await nyFlik('app2');
  await genomKonto(g, ny2.kod);
  const gTok = await g.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').session?.token);
  const forstaTx = txLista.app[0];
  const r409 = await fetch(API + '/mina/kop', { method: 'POST', headers: { authorization: 'Bearer ' + gTok, 'content-type': 'application/json' }, body: JSON.stringify({ jws: forstaTx.jwsRepresentation }) }).then(async r => ({ s: r.status, j: await r.json() }));
  koll('samma köp på ett annat konto nekas', r409.s === 409, JSON.stringify(r409));
  const [h, , sg] = forstaTx.jwsRepresentation.split('.');
  const falsk = `${h}.${b64u(JSON.stringify({ transactionId: '99', originalTransactionId: '99', productId: 'se.completeathletic.caponline.block.plus', bundleId: 'se.completeathletic.caponline' }))}.${sg}`;
  const rFalsk = await fetch(API + '/mina/kop', { method: 'POST', headers: { authorization: 'Bearer ' + gTok, 'content-type': 'application/json' }, body: JSON.stringify({ jws: falsk }) }).then(r => r.json());
  koll('ändrad transaktion nekas', !rFalsk.ok && /signaturen/.test(rFalsk.fel), JSON.stringify(rFalsk));

  // 6) Återställ köp på en ny telefon (samma konto): blocket kommer tillbaka
  await f.evaluate(() => { localStorage.removeItem('cap_block'); });
  await f.goto(base + 'index.html#/block'); await f.waitForSelector('.block-kort');
  await f.click('[data-action=block-aterstall]'); await f.waitForTimeout(1500);
  koll('Återställ köp: Nivå 2 tillbaka', (await f.$eval('#block-niva2', e => e.textContent)).includes('✓ Ert'));

  // 7) Hemma Plus: allt öppet
  await f.click('[data-action=block-kop][data-id=plus]'); await f.waitForTimeout(2000);
  await f.goto(base + 'index.html#/stig'); await f.waitForSelector('.stig-node'); await f.waitForTimeout(600);
  koll('Hemma Plus: inga låsta steg', !(await f.$('.stig-node.ejkopt')));

  // 8) den som redan har appen: en gång till Inställningar när appen fått en ny version
  const lagring = await f.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  const st = JSON.parse(lagring['caponline.v3']); st.notiser = { paminn: false, push: false }; lagring['caponline.v3'] = JSON.stringify(st);
  delete lagring.cap_kalender;
  const gam = await nyFlik('gammal', { lagring });
  await gam.goto(base + 'index.html#/', { waitUntil: 'networkidle' });
  await gam.waitForURL(/#\/installningar/, { timeout: 8000 }).catch(() => {});
  koll('befintlig användare: till Inställningar', /#\/installningar$/.test(gam.url()), gam.url());
  await gam.waitForTimeout(800);
  koll('Inställningar: Nytt i appen + Slå på allt', (await gam.textContent('main')).includes('Nytt i appen') && !!(await gam.$('button[data-action=inst-allt]')));
  await gam.screenshot({ path: path.join(UT, 'block-installningar.png'), fullPage: true });
  await gam.goto(base + 'index.html#/stig'); await gam.waitForTimeout(500); await gam.goto(base + 'index.html#/'); await gam.waitForTimeout(1500);
  koll('bara en gång', !/installningar/.test(gam.url()), gam.url());

  await adm('DELETE', `/admin/klient/${ny.klient.id}`); await adm('DELETE', `/admin/klient/${ny2.klient.id}`);
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close(); mock.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
