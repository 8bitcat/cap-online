// Sms-inloggningen hela vägen, mot API:t lokalt i testläge (sms hamnar i en utkorg i stället för att skickas):
//   cd server/cap-api && npx wrangler dev --local --port 8787 --var SMS_TEST:1 --var ADMIN_LOSEN:testlosen --var APP_BASE:http://127.0.0.1:8808/
//   python tools/serve.py 8808
//   NODE_PATH=<node_modules med playwright> node tools/sms-test.js
// Haris lägger in en kund med bara nummer → länken som sms → föräldern öppnar länken (Hämta appen) → barnets
// för- och efternamn + födelseår först → loggar ut → mobilnummer + sms-kod → förblir inloggad vid omstart.
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const LOSEN = 'testlosen';
const TEL = '070-111 22 33';
const UT = process.env.UT || __dirname;
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const nyFlik = async (namn, enhet = devices['iPhone 13']) => {
    const ctx = await b.newContext({ ...enhet, locale: 'sv-SE' });
    await ctx.addInitScript(api => { try { localStorage.setItem('cap_api', api); } catch { /* ok */ } }, API);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(namn + ': ' + e.message)); return p;
  };
  const shot = async (p, n) => { await p.waitForTimeout(350); await p.screenshot({ path: path.join(UT, 'sms-' + n + '.png'), fullPage: true }); };
  const toast = p => p.$eval('#toast', e => e.textContent).catch(() => '');
  const url = p => p.url().split('#')[1] || '/';
  const adminTok = async p => p.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const utkorg = async (p, tok) => (await (await fetch(API + '/admin/smsut', { headers: { authorization: 'Bearer ' + tok } })).json()).ut || [];

  // ---- Haris: ny kund med bara mobilnummer och förälder, länken som sms ----
  const a = await nyFlik('admin', { viewport: { width: 1280, height: 900 } });
  await a.goto(base + 'index.html#/admin', { waitUntil: 'networkidle' }); await a.waitForTimeout(300);
  await a.fill('#losen', LOSEN); await a.click('form[data-form=admin-login] button'); await a.waitForTimeout(1500);
  const tok = await adminTok(a);
  console.log('admin inloggad:', url(a), '| sms-rad:', await a.$eval('.klient-lista, section p.small', () => document.body.innerText.match(/Sms i dag.*/)?.[0] || '-'));
  for (const kort of await a.$$('.klient-card')) { if ((await kort.textContent()).includes('070-111 22 33')) { await kort.click(); await a.waitForTimeout(1200); await a.click('[data-action=klient-radera]'); await a.click('[data-action=klient-radera]'); await a.waitForTimeout(1200); break; } }
  await a.click('a[href="#/admin/klient/ny"]'); await a.waitForTimeout(300);
  await a.fill('#kforalder', 'Sara'); await a.fill('#ktel', TEL);
  console.log('"Skicka länken som sms direkt" ikryssad:', await a.$eval('input[name=skicka]', e => e.checked));
  await shot(a, 'admin-ny-kund');
  await a.click('form[data-form=klient-ny] button[type=submit]'); await a.waitForTimeout(1800);
  console.log('ny kund →', url(a), '| toast:', await toast(a));
  let ut = await utkorg(a, tok);
  const lankSms = ut.filter(m => m.till === '+46701112233').at(-1);
  console.log('sms i utkorgen till', lankSms?.till, '| tecken:', lankSms?.text.length, '\n--- sms ---\n' + lankSms?.text + '\n-----------');
  const lank = (lankSms?.text.match(/https?:\/\/\S+#\/k\/[A-Z0-9]+/) || [''])[0];
  await shot(a, 'admin-klient');
  const kid = url(a).split('/').pop();

  // ---- Föräldern: öppnar länken på iPhone ----
  const f = await nyFlik('förälder');
  await f.goto(base + 'index.html#' + lank.split('#')[1], { waitUntil: 'networkidle' }); await f.waitForTimeout(1800);
  console.log('länken →', url(f), '| h1:', await f.$eval('h1', h => h.textContent), '| instruktion:', await f.$eval('.steg-lista', e => e.innerText.replace(/\s+/g, ' ').slice(0, 80)).catch(() => '-'));
  await shot(f, 'foralder-hamta-appen');
  await f.click('a.btn[href="#/"]'); await f.waitForTimeout(1200);
  console.log('fortsätt →', url(f), '| h1:', await f.$eval('h1', h => h.textContent), '| fält:', (await f.$$eval('form[data-form=wiz1] label', ls => ls.map(l => l.textContent))).join(', '));
  await shot(f, 'foralder-barnet');
  await f.click('form[data-form=wiz1] button'); await f.waitForTimeout(300);
  console.log('tomt formulär stannar kvar:', url(f));
  await f.fill('#name', 'Alva'); await f.fill('#efternamn', 'Lind'); await f.selectOption('#fodd', String(new Date().getFullYear() - 10));
  await f.click('form[data-form=wiz1] button'); await f.waitForTimeout(1200);
  console.log('steg 1 klart →', url(f));
  await f.click('form[data-form=wiz2] button[type=submit]'); await f.waitForTimeout(400);
  await f.click('form[data-form=wiz3] button[type=submit]'); await f.waitForTimeout(1800);
  console.log('startsidan:', url(f), '| hälsning:', await f.$eval('h1', h => h.textContent));
  // ligger namnet hos Haris?
  await a.goto(base + 'index.html#/admin/klienter'); await a.waitForTimeout(400);
  await a.goto(base + 'index.html#/admin/klient/' + kid); await a.waitForTimeout(1500);
  console.log('hos Haris nu:', await a.$eval('h1', h => h.textContent), '|', await a.$eval('h1 + p, h1 ~ p.muted', e => e.textContent.trim().split('\n')[0]).catch(() => '-'));

  // ---- Förblir inloggad: stäng och öppna utan adress ----
  await f.goto(base + 'index.html', { waitUntil: 'networkidle' }); await f.waitForTimeout(1500);
  console.log('omstart utan adress →', url(f), '| h1:', await f.$eval('h1', h => h.textContent));

  // ---- Logga ut, in igen med mobilnummer + sms-kod ----
  await f.goto(base + 'index.html#/mer'); await f.waitForTimeout(400); await f.click('[data-action=logga-ut]'); await f.waitForTimeout(800);
  console.log('utloggad →', url(f), '| formulär:', await f.$eval('form[data-form]', e => e.dataset.form), '| nummer förifyllt:', await f.$eval('#stel', e => e.value));
  await shot(f, 'foralder-login');
  await f.fill('#stel', '0701112233'); await f.click('form[data-form=sms-skicka] button'); await f.waitForTimeout(1500);
  console.log('kod skickad →', await f.$eval('h1', h => h.textContent), '| ny kod-knapp låst:', await f.$eval('#smsNy', e => e.disabled + ' ' + e.textContent.trim()));
  await shot(f, 'foralder-skriv-koden');
  ut = await utkorg(a, tok);
  const kodSms = ut.filter(m => m.till === '+46701112233').at(-1);
  const kod = (kodSms?.text.match(/\d{6}/) || [''])[0];
  console.log('kod-sms:', JSON.stringify(kodSms?.text));
  const fel = kod === '000000' ? '111111' : '000000';
  await f.fill('#smskod', fel); await f.waitForTimeout(1500);
  console.log('fel kod →', await f.$eval('.note', e => e.textContent).catch(() => '-'));
  await f.fill('#smskod', kod); await f.waitForTimeout(2000);
  console.log('rätt kod (skickas själv vid sex siffror) →', url(f), '| toast:', await toast(f), '| h1:', await f.$eval('h1', h => h.textContent));
  // spärr: ny kod inom 45 s
  const r = await (await fetch(API + '/auth/sms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ telefon: TEL }) })).json();
  console.log('ny kod direkt igen →', r.fel);
  const okant = await (await fetch(API + '/auth/sms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ telefon: '070-999 99 99' }) })).json();
  console.log('okänt nummer →', okant.fel);

  // ---- Haris ser sms-loggen och kan skicka länken igen ----
  await a.goto(base + 'index.html#/admin/klienter'); await a.waitForTimeout(400);
  await a.goto(base + 'index.html#/admin/klient/' + kid); await a.waitForTimeout(1500);
  console.log('sms-logg hos Haris:', (await a.$$eval('.sms-logg li', ls => ls.map(l => l.textContent))).join(' | '));
  await a.click('[data-action=klient-lank][data-skicka]'); await a.waitForTimeout(1500);
  console.log('skicka länken igen →', await toast(a));
  await shot(a, 'admin-klient-efter');
  await a.goto(base + 'index.html#/admin/mer'); await a.waitForTimeout(1200);
  console.log('Mer → tjänster:', await a.$eval('.checks li', e => e.textContent.replace(/\s+/g, ' ')));
  console.log('pageerrors:', errs.length ? errs : 'inga');
  await b.close();
})().catch(e => { console.error('TESTFEL', e); process.exit(1); });
