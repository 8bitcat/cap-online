// Flödestest + skärmdumpar för v0.2: prototypval, startguide, planera, spelarkort, utbildningsvägen.
const { chromium, devices } = require('playwright');
const path = require('path');
const out = __dirname;
const base = 'http://127.0.0.1:8808/';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/404|401/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(out, 'v2-' + name + '.png'), fullPage: true }); console.log('shot', name, location(page)); };
  const location = p => p.url().replace(base, '');

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + '#/', { waitUntil: 'networkidle' });
  await shot('prototyper');

  // Prototyp 2
  await page.click('[data-action=proto][data-proto=spelare]');
  await page.waitForTimeout(300);
  await shot('start1');
  await page.fill('#name', 'Elsa');
  await page.selectOption('#age', '9');
  await page.click('button[type=submit]');
  await page.waitForTimeout(300);
  await page.check('input[name=position][value=anf]');
  await shot('start2');
  await page.click('button[type=submit]');
  await page.waitForTimeout(300);
  await page.check('input[name=difficulties][value=touch]');
  await page.check('input[name=difficulties][value=sjalvfortroende]');
  await page.fill('#goal', 'våga mer i match');
  await page.click('button[type=submit]');
  await page.waitForTimeout(500);
  await shot('hem-spelare');

  await page.click('a[href="#/planera"]');
  await page.waitForTimeout(300);
  await shot('planera');
  await page.click('button[type=submit]');
  await page.waitForTimeout(400);
  await shot('plan');
  await page.click('a.btn.grad');
  await page.waitForTimeout(400);
  await page.check('input[data-step="0"]');
  await page.check('input[data-step="2"]');
  const films = await page.$$('.film');
  if (films[1]) await films[1].click();
  await shot('plan-kor');
  await page.click('a[href$="/logga"]');
  await page.waitForTimeout(300);
  await page.fill('#note', 'Första touch med höger sitter nu.');
  await page.click('button[type=submit]');
  await page.waitForTimeout(500);
  await shot('plan-loggad');
  await page.goto(base + '#/spelarkort');
  await shot('spelarkort');
  await page.goto(base + '#/');
  await shot('hem-spelare-2');

  // Prototyp 3
  await page.goto(base + '#/prototyper');
  await page.click('[data-action=proto][data-proto=utbildning]');
  await page.waitForTimeout(400);
  await shot('hem-utbildning');
  await page.goto(base + '#/utbildning');
  await shot('utbildning');
  await page.click('[data-action=demo][data-v="1"]');
  await page.waitForTimeout(300);
  await shot('utbildning-demo1');
  await page.goto(base + '#/modul/n2-titta-upp');
  await shot('modul-kunskap');
  await page.check('input[name=q0][value="0"]');
  await page.check('input[name=q1][value="1"]');
  await page.check('input[name=q2][value="2"]');
  await page.click('form[data-form=quiz] button[type=submit]');
  await page.waitForTimeout(400);
  await shot('modul-kunskap-klar');
  await page.goto(base + '#/modul/n2-anf-jobb');
  await shot('modul-position');
  await page.goto(base + '#/modul/n1-prov');
  await shot('modul-prov');

  // Prototyp 1
  await page.goto(base + '#/prototyper');
  await page.click('[data-action=proto][data-proto=bibliotek]');
  await page.waitForTimeout(400);
  await shot('hem-bibliotek');

  const d = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dp = await d.newPage();
  await dp.goto(base + '#/prototyper', { waitUntil: 'networkidle' });
  await dp.evaluate(() => localStorage.clear());
  await dp.reload({ waitUntil: 'networkidle' });
  await dp.waitForTimeout(300);
  await dp.screenshot({ path: path.join(out, 'v2-prototyper-desktop.png') });
  console.log('console errors:', errors.length ? errors : 'inga');
  await browser.close();
})().catch(e => { console.error('FEL', e); process.exit(1); });
