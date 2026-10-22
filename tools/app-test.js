// Appflödet: Välkommen → Förälder (kod) → startguide → startsida → Träna med Haris (kalender, håll, boka, avboka)
// → Träna själv. Admin: Tider (autosätt, öppna), Pass (nytt, kör med stoppur), Stigen, Mer.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const LOSEN = fs.readFileSync('C:/Users/palss/.secrets/cap-admin-losen.txt', 'utf8').trim();
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const shot = async n => { await p.waitForTimeout(400); await p.screenshot({ path: path.join(__dirname, 'v7-' + n + '.png'), fullPage: true }); };
  const url = () => p.url().split('#')[1] || '/';
  const tabs = async () => p.$$eval('.tabs a', a => a.map(x => x.textContent.trim() + (x.classList.contains('active') ? '*' : '')).join(' '));

  await p.goto(base, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(base + 'index.html#/', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  console.log('start:', url(), '| h1:', await p.$eval('h1', h => h.textContent));
  await shot('valkommen');

  // Förälder med kod
  await p.click('a.start-card[href="#/login"]'); await p.waitForTimeout(300);
  await p.fill('#kod', 'VZV-JEM'); await p.click('form[data-form=kod] button'); await p.waitForTimeout(1500);
  console.log('efter kod:', url(), '| h1:', await p.$eval('h1', h => h.textContent));
  await p.fill('#name', 'Elsa'); await p.selectOption('#age', '9'); await p.click('button[type=submit]'); await p.waitForTimeout(300);
  await p.click('label:has(input[name=position][value=anf])'); await p.click('label:has(input[name=drom][value=malskytt])'); await p.click('button[type=submit]'); await p.waitForTimeout(300);
  await p.click('button[type=submit]'); await p.waitForTimeout(800);
  console.log('startsida:', url(), '| tabs:', await tabs());
  await shot('startsida');

  // Träna med Haris
  await p.click('.tabs a[data-tab="/boka"]'); await p.waitForTimeout(1500);
  console.log('boka:', url(), '| h1:', await p.$eval('h1', h => h.textContent), '| tider:', (await p.$$('.tid')).length, '| bakåt avstängd:', await p.$eval('.vecka-nav a', a => a.classList.contains('disabled')));
  await shot('boka');
  const ledig = await p.$('.tid:not([disabled])');
  await ledig.click(); await p.waitForTimeout(1200);
  console.log('håller:', !!(await p.$('.hall')), '| sek:', await p.$eval('#hallSek', e => e.textContent).catch(() => '-'));
  await shot('boka-haller');
  await p.click('[data-action=boka-bekrafta]'); await p.waitForTimeout(1500);
  console.log('mina tider:', await p.$$eval('.tid.min', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim())));
  await p.waitForTimeout(1200);
  console.log('mina bokningar:', await p.$$eval('#mina .list li', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 60))));
  await shot('boka-bokad');
  // framåt en vecka och tillbaka
  await p.click('.vecka-nav a:last-child'); await p.waitForTimeout(500);
  console.log('nästa vecka:', url(), '| bakåt möjlig:', !(await p.$eval('.vecka-nav a', a => a.classList.contains('disabled'))));
  // avboka
  await p.goto(base + '#/boka'); await p.waitForTimeout(1500);
  const av = await p.$('#mina [data-action=boka-avboka]'); await av.click(); await p.waitForTimeout(200); await av.click(); await p.waitForTimeout(1500);
  console.log('efter avbokning, mina:', (await p.$$('#mina .list li')).length);

  // Träna själv + Mer
  await p.click('.tabs a[data-tab="/stig"]'); await p.waitForTimeout(500);
  console.log('träna själv:', url(), '| h1:', await p.$eval('h1', h => h.textContent), '| tabs:', await tabs());
  await p.click('.tabs a[data-tab="/mer"]'); await p.waitForTimeout(400);
  console.log('mer:', url(), '| kort:', (await p.$$('.card')).length);
  await shot('mer');

  // Admin
  await p.goto(base + '#/valkommen'); await p.waitForTimeout(300);
  await p.click('a.start-card[href="#/admin"]'); await p.waitForTimeout(400);
  await p.fill('#losen', LOSEN); await p.click('form[data-form=admin-login] button'); await p.waitForTimeout(2000);
  console.log('admin:', url(), '| tabs:', await tabs());
  await shot('admin-tider');
  await p.click('.tabs a[data-tab="/admin/pass"]'); await p.waitForTimeout(1500);
  await p.click('a[href="#/admin/pass/ny"]'); await p.waitForTimeout(500);
  await p.fill('#pbarn', 'Elsa');
  await p.click('form[data-form=pass-spara] button[type=submit]'); await p.waitForTimeout(1500);
  console.log('pass sparat:', url());
  await shot('admin-pass');
  await p.click('a[href$="/kor"]'); await p.waitForTimeout(500);
  console.log('kör:', await p.$eval('h1', h => h.textContent));
  await p.click('[data-action=pass-steg][data-d="1"]'); await p.waitForTimeout(800);
  await p.click('[data-action=pass-steg][data-d="1"]'); await p.waitForTimeout(800);
  console.log('block 3:', await p.$eval('h1', h => h.textContent));
  await p.click('#stopurKnapp'); await p.waitForTimeout(1600); await p.click('#stopurKnapp'); await p.waitForTimeout(200); await p.click('#stopurLas'); await p.waitForTimeout(1200);
  console.log('låst tid:', await p.$eval('.stopur p', e => e.textContent.trim()).catch(() => '-'));
  await shot('admin-kor');
  await p.click('.tabs a[data-tab="/admin/stigen"]'); await p.waitForTimeout(1500);
  console.log('stigen admin: drömmar', (await p.$$('.dromrad')).length, 'steg i etapp 1', (await p.$$('.nodrad')).length);
  await shot('admin-stigen');
  await p.click('.tabs a[data-tab="/admin/mer"]'); await p.waitForTimeout(1200);
  console.log('mer admin h2:', await p.$$eval('h2', hs => hs.map(h => h.textContent).join(' | ')));
  console.log('pageerrors:', errs.length ? errs : 'inga');
  await b.close();
})().catch(e => { console.error('FEL', e); process.exit(1); });
