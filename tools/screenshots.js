// Skärmdumpar av CAP i telefonformat. Körs med NODE_PATH mot snabbfilens node_modules.
const { chromium, devices } = require('playwright');
const path = require('path');
const out = __dirname;
const base = 'http://127.0.0.1:8808/';
const pages = [
  ['hem', '#/'],
  ['pass', '#/pass/forsta-touch'],
  ['kor', '#/pass/forsta-touch/kor'],
  ['logga', '#/pass/forsta-touch/logga'],
  ['valj', '#/valj'],
  ['foralder', '#/foralder'],
  ['kapitel', '#/foralder/feedback'],
  ['bibliotek', '#/bibliotek'],
];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  for (const [name, hash] of pages) {
    await page.goto(base + hash, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
    console.log('shot', name, await page.title());
  }
  // Flöde: lägg till i bibliotek -> logga -> bibliotek
  await page.goto(base + '#/pass/passningar', { waitUntil: 'networkidle' });
  await page.click('[data-action=add]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'pass-i-bibliotek.png'), fullPage: true });
  await page.goto(base + '#/pass/passningar/logga');
  await page.fill('#note', 'Insidan med höger sitter, vänster är svår.');
  await page.click('button[type=submit]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'pass-loggat.png'), fullPage: true });
  await page.goto(base + '#/valj');
  await page.fill('#name', 'Elsa');
  await page.selectOption('#age', '9');
  await page.check('input[name=difficulties][value=touch]');
  await page.check('input[name=difficulties][value=sjalvfortroende]');
  await page.click('button[type=submit]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, 'valj-forslag.png'), fullPage: true });
  await page.goto(base + '#/bibliotek');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'bibliotek-fyllt.png'), fullPage: true });
  // Desktop-bredd
  const d = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dp = await d.newPage();
  await dp.goto(base + '#/', { waitUntil: 'networkidle' });
  await dp.screenshot({ path: path.join(out, 'hem-desktop.png'), fullPage: false });
  console.log('console errors:', errors.length ? errors : 'inga');
  await browser.close();
})();
