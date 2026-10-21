// Prototyp 4, Träningsstigen: startguide med drömspelare, stigen, tidtagning som låses, frågetecken, film till Haris, grind.
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const shot = async n => { await p.waitForTimeout(400); await p.screenshot({ path: path.join(__dirname, 'v6-' + n + '.png'), fullPage: true }); };
  const url = () => p.url().split('#')[1] || '/';
  const states = async () => p.$$eval('.stig-node, .stig-grind', els => els.map(e => (e.querySelector('b')?.textContent || '').slice(0, 22) + ':' + [...e.classList].find(c => ['done', 'next', 'open', 'locked'].includes(c))));

  await p.goto(base, { waitUntil: 'networkidle' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('caponline.v3', JSON.stringify({ guest: true })); });
  await p.goto(base + 'index.html#/prototyper', { waitUntil: 'networkidle' });
  await shot('prototyper');
  await p.click('[data-action=proto][data-proto=stig]'); await p.waitForTimeout(400);
  await p.fill('#name', 'Elsa'); await p.selectOption('#age', '9'); await p.click('button[type=submit]'); await p.waitForTimeout(300);
  await p.click('label:has(input[name=position][value=anf])');
  await p.click('label:has(input[name=drom][value=malskytt])');
  await shot('start2-drom');
  await p.click('button[type=submit]'); await p.waitForTimeout(300);
  await p.click('button[type=submit]'); await p.waitForTimeout(600);
  console.log('efter guiden:', url(), '| h1:', await p.$eval('h1', h => h.textContent));
  console.log('steg:', (await states()).slice(0, 8).join(' | '));
  await shot('stig-hem');

  // Första steget (film) → logga passet → steget klart
  await p.click('.stig-node.next'); await p.waitForTimeout(400);
  console.log('nod 1:', url(), await p.$eval('h1', h => h.textContent));
  await p.goto(base + '#/pass/uppvarmning-bollkontroll/logga'); await p.waitForTimeout(300);
  await p.click('button[type=submit]'); await p.waitForTimeout(500);
  await p.goto(base + '#/stig'); await p.waitForTimeout(400);
  console.log('efter loggat pass:', (await states()).slice(0, 4).join(' | '));

  // Frågetecken (text) → läst
  await p.click('.stig-node.next'); await p.waitForTimeout(300);
  console.log('nod 2:', await p.$eval('h1', h => h.textContent));
  await p.click('[data-action=stig-klar]'); await p.waitForTimeout(400);
  // Första touch: logga
  await p.goto(base + '#/pass/forsta-touch/logga'); await p.waitForTimeout(300); await p.click('button[type=submit]'); await p.waitForTimeout(400);
  // Tidtagning
  await p.goto(base + '#/stig/e1-slalom'); await p.waitForTimeout(400);
  await shot('stig-tid');
  await p.click('#stopurKnapp'); await p.waitForTimeout(2300); await p.click('#stopurKnapp'); await p.waitForTimeout(200);
  console.log('klockan efter stopp:', await p.$eval('#stopurKlocka', e => e.textContent), '| lås aktiv:', !(await p.$eval('#stopurLas', e => e.disabled)));
  await p.click('#stopurLas'); await p.waitForTimeout(500);
  console.log('låsta tider:', await p.$$eval('.list li b', els => els.map(e => e.textContent)));
  await shot('stig-tid-last');
  // Quiz-frågetecken
  await p.goto(base + '#/stig/e1-regler'); await p.waitForTimeout(400);
  await p.click('label:has(input[name=q0][value="0"])'); await p.click('label:has(input[name=q1][value="1"])'); await p.click('label:has(input[name=q2][value="2"])');
  await p.click('form[data-form=quiz] button'); await p.waitForTimeout(500);
  console.log('efter quiz:', url());
  // Block → markera klart
  await p.goto(base + '#/stig/e1-jong'); await p.waitForTimeout(300); await p.click('[data-action=stig-klar]'); await p.waitForTimeout(300);
  // Grind: film till Haris
  await p.goto(base + '#/stig/e1-grind'); await p.waitForTimeout(400);
  await shot('stig-grind');
  await p.setInputFiles('#stigvideo', 'D:/CAPOnline/media/small/passningar.mp4'); await p.waitForTimeout(600);
  console.log('grind efter film:', await p.$eval('.panel.brand p', e => e.textContent.trim().slice(0, 60)));
  await p.goto(base + '#/stig'); await p.waitForTimeout(400);
  console.log('etapp 2 öppen?', (await states()).slice(5, 10).join(' | '));
  console.log('summering:', await p.$eval('.stig-top .xp-row', e => e.textContent.replace(/\s+/g, ' ').trim()));
  await shot('stig-hem-2');
  console.log('pageerrors:', errs.length ? errs : 'inga');
  await b.close();
})().catch(e => { console.error('FEL', e); process.exit(1); });
