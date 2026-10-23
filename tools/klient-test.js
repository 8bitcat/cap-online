// Hela kundflödet: admin lägger in kund → länk → förälder väljer kod → loggar in med nummer → admin bokar, planerar pass,
// kör bedömning med stoppur, filmar (fil) och spelar in ljud (fejkad mikrofon) → diagram hos admin och förälder.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const LOSEN = fs.readFileSync('C:/Users/palss/.secrets/cap-admin-losen.txt', 'utf8').trim();
const TEL = '070-000 00 02';
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const errs = [];
  const nyFlik = async (namn) => { const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE', permissions: ['microphone'] }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(namn + ': ' + e.message)); return p; };
  const shot = async (p, n) => { await p.waitForTimeout(350); await p.screenshot({ path: path.join(__dirname, 'v9-' + n + '.png'), fullPage: true }); };
  const toast = p => p.$eval('#toast', e => e.textContent).catch(() => '');
  const url = p => p.url().split('#')[1] || '/';

  // ---- admin: logga in, städa ev. gammal testkund, ny kund ----
  const a = await nyFlik('admin');
  await a.goto(base, { waitUntil: 'networkidle' }); await a.evaluate(() => localStorage.clear());
  await a.goto(base + 'index.html#/admin', { waitUntil: 'networkidle' }); await a.waitForTimeout(300);
  await a.fill('#losen', LOSEN); await a.click('form[data-form=admin-login] button'); await a.waitForTimeout(2500);
  console.log('admin efter login:', url(a), '| rubrik:', await a.$eval('h1', h => h.textContent));
  for (const kort of await a.$$('.klient-card')) { const t = await kort.textContent(); if (t.includes('Testbarn') || t.includes('070-000 00 02')) { await kort.click(); await a.waitForTimeout(1500); await a.click('[data-action=klient-radera]'); await a.click('[data-action=klient-radera]'); await a.waitForTimeout(1500); break; } }
  await shot(a, 'admin-klienter');
  await a.click('a[href="#/admin/klient/ny"]'); await a.waitForTimeout(400);
  await a.fill('#kbarn', 'Testbarn'); await a.selectOption('select[name=fodd]', String(new Date().getFullYear() - 9)); await a.selectOption('select[name=position]', 'mitt');
  await a.fill('#klag', 'KBK F2017'); await a.selectOption('#kniva', '2'); await a.fill('#kforalder', 'Testförälder'); await a.fill('#ktel', TEL); await a.fill('#kant', 'Snabb, behöver jobba på vänsterfoten.');
  await shot(a, 'admin-ny-kund');
  await a.click('form[data-form=klient-ny] button[type=submit]'); await a.waitForTimeout(2500);
  console.log('efter ny kund:', url(a), '| toast:', await toast(a));
  const lank = await a.$eval('.msg', e => (e.textContent.match(/https?:\S+/) || [''])[0]);
  const smsHref = await a.$eval('a[href^="sms:"]', e => e.getAttribute('href'));
  console.log('länk:', lank, '| sms-länk börjar:', smsHref.slice(0, 40));
  await shot(a, 'admin-klient-ny');
  const kid = url(a).split('/').pop();

  // ---- förälder: öppna länken, välj kod ----
  const f = await nyFlik('förälder');
  await f.goto(base, { waitUntil: 'networkidle' }); await f.evaluate(() => localStorage.clear());
  await f.goto(base + 'index.html#' + lank.split('#')[1], { waitUntil: 'networkidle' }); await f.waitForTimeout(2500);
  console.log('förälder efter länk:', url(f), '| h1:', await f.$eval('h1', h => h.textContent));
  await shot(f, 'foralder-pin');
  await f.fill('#pin1', '1234'); await f.fill('#pin2', '1235'); await f.click('form[data-form=pin] button'); await f.waitForTimeout(800);
  console.log('olika koder →', await f.$eval('.note', e => e.textContent).catch(() => '-'));
  await f.fill('#pin1', '1234'); await f.fill('#pin2', '1234'); await f.click('form[data-form=pin] button'); await f.waitForTimeout(2000);
  console.log('efter kodval:', url(f), '| namn förifyllt:', await f.$eval('#name', e => e.value).catch(() => '-'), '| ålder:', await f.$eval('#age', e => e.value).catch(() => '-'));
  await f.click('form[data-form=wiz1] button'); await f.waitForTimeout(300);
  console.log('position förvald:', await f.$eval('input[name=position]:checked', e => e.value));
  await f.click('form[data-form=wiz2] button[type=submit]'); await f.waitForTimeout(300);
  await f.click('form[data-form=wiz3] button[type=submit]'); await f.waitForTimeout(2500);
  console.log('startsidan:', url(f), '| kort:', (await f.$$eval('.start-card b', es => es.map(e => e.textContent))).join(' / '));
  await shot(f, 'foralder-hem');
  await f.goto(base + 'index.html#/mer'); await f.waitForTimeout(400); await f.click('[data-action=logga-ut]'); await f.waitForTimeout(800);
  console.log('utloggad →', url(f));
  await f.fill('#ltel', '0700000002'); await f.fill('#lpin', '9999'); await f.click('form[data-form=login-tel] button'); await f.waitForTimeout(1500);
  console.log('fel kod →', await f.$eval('.note', e => e.textContent).catch(() => '-'));
  await shot(f, 'foralder-login');
  await f.fill('#lpin', '1234'); await f.click('form[data-form=login-tel] button'); await f.waitForTimeout(2000);
  console.log('rätt kod →', url(f), '| toast:', await toast(f));

  // ---- admin: boka tid åt kunden, planera pass, kör ----
  await a.goto(base + 'index.html#/admin/klient/' + kid + '/boka'); await a.waitForTimeout(2000);
  for (let i = 0; i < 6 && !(await a.$('.tid:not([disabled])')); i++) { await a.click('[data-action=klient-boka-vecka]:last-of-type'); await a.waitForTimeout(600); }
  const vecka = await a.$eval('.vecka-titel b', e => e.textContent);
  await shot(a, 'admin-boka');
  await a.click('.tid:not([disabled])'); await a.waitForTimeout(2000);
  console.log('admin bokade i', vecka, '→', url(a), '| toast:', await toast(a));
  await shot(a, 'admin-klient');
  await f.goto(base + 'index.html#/boka'); await f.waitForTimeout(2000);
  for (let i = 0; i < 6 && (await f.$eval('.vecka-titel b', e => e.textContent)) !== vecka; i++) { await f.click('a.btn[href^="#/boka/"]:last-of-type'); await f.waitForTimeout(800); }
  console.log('förälder ser:', (await f.$$eval('.tid', es => es.map(e => e.className.replace('tid', '').trim() + ':' + e.querySelector('small').textContent.split(' ·')[0]))).join(', '));
  await shot(f, 'foralder-kalender');
  await a.goto(base + 'index.html#/admin/pass/ny/' + kid); await a.waitForTimeout(1500);
  console.log('nytt pass: spelare förvald =', await a.$eval('#puid', e => e.selectedOptions[0] && e.selectedOptions[0].textContent), '| block:', (await a.$$('.blockrad')).length);
  await a.click('label.toggle');
  await a.click('form[data-form=pass-spara] button[type=submit]'); await a.waitForTimeout(2000);
  const passUrl = url(a); console.log('pass sparat →', passUrl, '| toast:', await toast(a));
  await a.goto(base + 'index.html#' + passUrl + '/kor'); await a.waitForTimeout(1200);
  console.log('block 1:', await a.$eval('h1', h => h.textContent), '| ljudknapp aktiv:', !(await a.$eval('[data-action=pass-ljud]', e => e.disabled)));
  await a.click('[data-action=pass-ljud]'); await a.waitForTimeout(2500);
  console.log('spelar in:', await a.$eval('[data-action=pass-ljud]', e => e.textContent.trim()));
  await shot(a, 'admin-kor-ljud');
  await a.click('[data-action=pass-ljud]'); await a.waitForTimeout(2500);
  console.log('efter stopp toast:', await toast(a), '| inspelningar:', (await a.$$eval('.media-rad', es => es.map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)))).join(' | '));
  await a.setInputFiles('#passfilm', 'D:/CAPOnline/media/small/koordination.mp4'); await a.waitForTimeout(3000);
  console.log('efter film toast:', await toast(a), '| inspelningar:', (await a.$$('.media-rad')).length);
  await a.click('[data-action=pass-spela]'); await a.waitForTimeout(800);
  console.log('spelar lokalt:', !!(await a.$('.media-rad audio, .media-rad video')));
  await shot(a, 'admin-kor-inspelningar');
  await a.click('[data-action=pass-steg][data-d="1"]'); await a.waitForTimeout(1200);
  await a.click('[data-action=pass-steg][data-d="1"]'); await a.waitForTimeout(1200);
  console.log('block 3:', await a.$eval('h1', h => h.textContent), '| stoppur-läge:', await a.$eval('.stopur', e => e.dataset.lage));
  for (const ms of [1300, 900]) { await a.click('#stopurKnapp'); await a.waitForTimeout(ms); await a.click('#stopurKnapp'); await a.waitForTimeout(500); }
  console.log('försök:', (await a.$$eval('.varv-lista .chip', es => es.map(e => e.textContent))).join(', '));
  await shot(a, 'admin-kor-bedomning');
  await a.click('[data-action=pass-bed-las]'); await a.waitForTimeout(2500);
  console.log('låst →', await toast(a), '| resultat:', await a.$eval('.bed-resultat b', e => e.textContent).catch(() => '-'));
  await shot(a, 'admin-kor-bedomning-last');
  await a.goto(base + 'index.html#/admin/klient/' + kid); await a.waitForTimeout(2500);
  console.log('klientsida: diagram:', !!(await a.$('svg.diagram')), '| bedömningsrader:', (await a.$$('.bed-typ .list li')).length, '| lokala inspelningar:', (await a.$$('.media-item.lokal')).length, '| rubriker:', (await a.$$eval('section h2', es => es.map(e => e.textContent))).join('/'));
  await a.click('[data-action=klient-bed-ny]'); await a.waitForTimeout(300);
  await a.fill('#bnamn', 'Konbana'); await a.fill('#bvarv', '33,2 31,5 30,9'); await a.fill('input[name=datum]', '2026-10-01'); await a.fill('#bkom', 'Första mätningen');
  await a.click('form[data-form=klient-bed] button[type=submit]'); await a.waitForTimeout(2000);
  console.log('manuell bedömning →', await toast(a), '| punkter i diagrammet:', (await a.$$('svg.diagram circle')).length);
  await a.click('[data-action=klient-niva][data-d="1"]'); await a.waitForTimeout(1500);
  console.log('nivå +1 →', await toast(a), '| visar:', await a.$eval('.niva-tal b', e => e.textContent));
  await shot(a, 'admin-klient-full');
  const d = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'sv-SE' })).newPage();
  await d.goto(base + 'index.html#/admin', { waitUntil: 'networkidle' }); await d.waitForTimeout(300);
  await d.fill('#losen', LOSEN); await d.click('form[data-form=admin-login] button'); await d.waitForTimeout(2500);
  await d.goto(base + 'index.html#/admin/klient/' + kid); await d.waitForTimeout(2500);
  await d.screenshot({ path: path.join(__dirname, 'v9-desktop-klient.png'), fullPage: true });
  console.log('desktop: spalter =', await d.$eval('.admin-grid', e => getComputedStyle(e).gridTemplateColumns.split(' ').length));

  // ---- admin: Tider-fliken visar bokade röda och kan boka åt en kund ----
  await a.goto(base + 'index.html#/admin/tider'); await a.waitForTimeout(2500);
  for (let i = 0; i < 6 && (await a.$eval('.vecka-titel b', e => e.textContent)) !== vecka; i++) { await a.click('[data-action=tid-vecka][data-v]:last-of-type'); await a.waitForTimeout(500); }
  console.log('tider: bokade rader =', (await a.$$('.slotrad.bokad')).length, '| bokad-text:', await a.$eval('.slotrad.bokad .small', e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 70)).catch(() => '-'));
  await a.click('.slotrad:not(.bokad) [data-action=tid-boka]'); await a.waitForTimeout(300);
  await a.selectOption('[data-boka-klient]', { label: 'Testbarn · Testförälder' }); await a.click('[data-action=tid-boka-klient]'); await a.waitForTimeout(2000);
  console.log('boka från Tider →', await toast(a), '| bokade rader nu =', (await a.$$('.slotrad.bokad')).length);
  await shot(a, 'admin-tider-bokad');

  // ---- förälder: utveckling + passet ----
  await f.goto(base + 'index.html#/'); await f.waitForTimeout(2500);
  console.log('förälderns hem-kort:', (await f.$$eval('.start-card small', es => es.map(e => e.textContent.slice(0, 50)))).join(' / '));
  await f.goto(base + 'index.html#/utveckling'); await f.waitForTimeout(2500);
  console.log('utveckling: h1', await f.$eval('h1', h => h.textContent), '| nivå', await f.$eval('.niva-tal b', e => e.textContent).catch(() => '-'), '| diagram:', !!(await f.$('svg.diagram')), '| sammanfattning:', await f.$eval('.bed-typ p.small', e => e.textContent).catch(() => '-'));
  await shot(f, 'foralder-utveckling');
  await f.click('.cards a.card'); await f.waitForTimeout(1500);
  console.log('passet hos föräldern:', await f.$eval('h1', h => h.textContent), '| resultat:', await f.$eval('.step .small', e => e.textContent).catch(() => '-'));
  await shot(f, 'foralder-passet');
  await f.goto(base + 'index.html#/mer'); await f.waitForTimeout(400); await f.click('[data-action=logga-ut]'); await f.waitForTimeout(800);
  await f.click('a[href="#/login/glomt"]'); await f.waitForTimeout(400);
  await f.fill('#gtel', '0700000002'); await f.click('form[data-form=glomt] button'); await f.waitForTimeout(2000);
  console.log('glömt →', await f.$eval('.note', e => e.textContent).catch(() => '-'));
  await a.goto(base + 'index.html#/admin/klienter'); await a.waitForTimeout(2500);
  console.log('admin ser flaggan:', (await a.$$('.klient-card.flagg')).length, '| varning:', await a.$eval('.note.warn', e => e.textContent.slice(0, 60)).catch(() => '-'));
  await shot(a, 'admin-klienter-flagg');
  console.log('pageerrors:', errs.length ? errs : 'inga');
  await b.close();
})().catch(e => { console.error('TESTFEL', e); process.exit(1); });
