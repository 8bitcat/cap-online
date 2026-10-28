// De två sms:en utan sms-tjänst (Carl 2026-10-26): Haris skickar från sin telefon. Sms 1 hämtar appen, sms 2 har en
// länk som öppnar appen och loggar in. Kör mot API:t lokalt:
//   cd server/cap-api && npx wrangler dev --local --port 8787 --var ADMIN_LOSEN:testlosen --var APP_BASE:http://127.0.0.1:8808/ --var LANK_BASE:http://127.0.0.1:8787
//   python tools/serve.py 8808
//   NODE_PATH=<node_modules med playwright> node tools/app-lank-test.js
// Appen simuleras med en Capacitor-stubbe (isNativePlatform + App-pluginet med getLaunchUrl = caponline://k/KOD).
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const nyFlik = async (namn, enhet, init) => {
    const ctx = await b.newContext({ ...enhet, locale: 'sv-SE' });
    await ctx.addInitScript(api => { try { localStorage.setItem('cap_api', api); } catch { /* ok */ } }, API);
    if (init) await ctx.addInitScript(init.fn, init.arg);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(namn + ': ' + e.message)); return p;
  };
  const shot = async (p, n) => { await p.waitForTimeout(350); await p.screenshot({ path: path.join(UT, 'lank-' + n + '.png'), fullPage: true }); };
  const toast = p => p.$eval('#toast', e => e.textContent).catch(() => '');
  const url = p => p.url().split('#')[1] || '/';

  // ---- Haris lägger in kunden och ser sms 1 och 2 ----
  const a = await nyFlik('admin', { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  await a.goto(base + 'index.html#/admin', { waitUntil: 'networkidle' }); await a.waitForTimeout(300);
  await a.fill('#losen', 'testlosen'); await a.click('form[data-form=admin-login] button'); await a.waitForTimeout(1500);
  for (const kort of await a.$$('.klient-card')) { if ((await kort.textContent()).includes('070-222 33 44')) { await kort.click(); await a.waitForTimeout(1200); await a.click('[data-action=klient-radera]'); await a.click('[data-action=klient-radera]'); await a.waitForTimeout(1200); break; } }
  await a.click('a[href="#/admin/klient/ny"]'); await a.waitForTimeout(300);
  console.log('ny kund-text:', await a.$eval('section p.small.muted', e => e.textContent.slice(0, 90)));
  await a.fill('#kforalder', 'Jonas'); await a.fill('#ktel', '070-222 33 44');
  await a.click('form[data-form=klient-ny] button[type=submit]'); await a.waitForTimeout(1800);
  console.log('ny kund →', await toast(a));
  const kid = url(a).split('/').pop();
  const steg = await a.$$eval('.sms-steg', ss => ss.map(s => ({ rubrik: s.querySelector('b').textContent, href: s.querySelector('a.btn')?.getAttribute('href') || '', text: s.querySelector('.msg')?.textContent || '' })));
  for (const s of steg) console.log(`\n[${s.rubrik}] sms-länken börjar: ${s.href.slice(0, 32)}…\n${s.text}`);
  await shot(a, 'admin-tva-sms');
  const loggaLank = (steg[1].text.match(/https?:\/\/\S+\/k\/[A-Z0-9]+/) || [''])[0];
  const kod = loggaLank.split('/').pop();
  const hamtaLank = (steg[0].text.match(/https?:\/\/\S+\/app/) || [''])[0];

  // ---- Sms 1 på iPhone: /app ----
  const r1 = await fetch(hamtaLank, { redirect: 'manual', headers: { 'user-agent': devices['iPhone 13'].userAgent } });
  console.log('\nsms 1 på iPhone →', r1.status, r1.headers.get('location'));
  // ---- Sms 2 i Safari på iPhone: sidan med Öppna CAP ----
  const s = await nyFlik('safari', devices['iPhone 13']);
  await s.goto(loggaLank, { waitUntil: 'load' }); await s.waitForTimeout(500);
  console.log('sms 2 i Safari:', await s.$eval('h1', h => h.textContent), '| knapp:', await s.$eval('#oppna', e => e.getAttribute('href')), '| kod på sidan:', await s.$eval('.kod', e => e.textContent));
  await shot(s, 'safari-landning');
  const gammal = await (await fetch(API + '/k/ZZZZZZ')).text();
  console.log('okänd kod →', /gått ut/.test(gammal) ? 'Länken har gått ut' : gammal.slice(0, 60));
  const aasa = await (await fetch(API + '/.well-known/apple-app-site-association')).json();
  console.log('AASA:', JSON.stringify(aasa));

  // ---- Sms 2 på Android: rakt in i webbappen ----
  const an = await nyFlik('android', devices['Pixel 7']);
  await an.goto(loggaLank, { waitUntil: 'networkidle' }); await an.waitForTimeout(2000);
  console.log('\nsms 2 på Android →', url(an), '| h1:', await an.$eval('h1', h => h.textContent));

  // ---- Sms 2 i appen: caponline://k/KOD när appen startar ----
  const stub = { fn: k => {
    window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'App', getPlatform: () => 'ios',
      Plugins: { App: { addListener: () => Promise.resolve({ remove() {} }), getLaunchUrl: () => Promise.resolve({ url: 'caponline://k/' + k }) } } };
  }, arg: kod };
  const app = await nyFlik('app', devices['iPhone 13'], stub);
  await app.goto(base + 'index.html', { waitUntil: 'networkidle' }); await app.waitForTimeout(2500);
  console.log('appen öppnad via länken →', url(app), '| h1:', await app.$eval('h1', h => h.textContent), '| toast:', await toast(app));
  await shot(app, 'app-efter-lank');
  await app.fill('#name', 'Ellen'); await app.fill('#efternamn', 'Berg'); await app.selectOption('#fodd', String(new Date().getFullYear() - 8));
  await app.click('form[data-form=wiz1] button'); await app.waitForTimeout(1000);
  await app.click('form[data-form=wiz2] button[type=submit]'); await app.waitForTimeout(400);
  await app.click('form[data-form=wiz3] button[type=submit]'); await app.waitForTimeout(1500);
  console.log('appens startsida:', await app.$eval('h1', h => h.textContent));

  // ---- Inloggningssidan i appen utan länk: koden från sms:et ----
  const app2 = await nyFlik('app2', devices['iPhone 13'], { fn: () => { window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => false, getPlatform: () => 'ios', Plugins: {} }; } });
  await app2.goto(base + 'index.html#/login', { waitUntil: 'networkidle' }); await app2.waitForTimeout(1200);
  console.log('\ninloggningssidan i appen:', await app2.$eval('h1', h => h.textContent), '| fält:', await app2.$eval('form[data-form] label', e => e.textContent));
  await shot(app2, 'app-login');
  await app2.fill('#kod', kod.slice(0, 3).toLowerCase() + '-' + kod.slice(3).toLowerCase()); await app2.click('form[data-form=kod] button'); await app2.waitForTimeout(2000);
  console.log('koden med gemener och bindestreck →', url(app2), '| h1:', await app2.$eval('h1', h => h.textContent));

  // ---- Haris ser att föräldern är inne i appen ----
  await a.goto(base + 'index.html#/admin/klienter'); await a.waitForTimeout(1800);
  console.log('\nklientlistan:', await a.$eval('.klient-card', e => e.innerText.replace(/\s+/g, ' ')));
  await a.goto(base + 'index.html#/admin/klient/' + kid); await a.waitForTimeout(1800);
  console.log('klientsidan:', await a.$eval('.panel .section-head + p', e => e.textContent));
  await a.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  await shot(a, 'admin-i-appen');
  await a.click('[data-action=klient-lank][data-ny]'); await a.waitForTimeout(1500);
  console.log('ny länk →', await toast(a));
  const r2 = await (await fetch(API + '/auth/kod', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kod }) })).json();
  console.log('gamla koden efter ny länk →', r2.fel);
  console.log('pageerrors:', errs.length ? errs : 'inga');
  await b.close();
})().catch(e => { console.error('TESTFEL', e); process.exit(1); });
