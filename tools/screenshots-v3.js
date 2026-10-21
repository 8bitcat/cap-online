// v0.2.1: hela passet, ▶ per moment (klipp + upprepning + filmbyte), planerare med klipp.
const { chromium, devices } = require('playwright');
const path = require('path');
const out = __dirname;
const base = 'http://127.0.0.1:8808/';
(async () => {
  // Riktiga Chrome har H.264; Playwrights Chromium kan inte spola i mp4-filmerna.
  let browser;
  try { browser = await chromium.launch({ channel: 'chrome' }); console.log('browser: chrome'); }
  catch { browser = await chromium.launch(); console.log('browser: chromium (ingen H.264)'); }
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/404|401/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(out, 'v3-' + name + '.png'), fullPage: true }); console.log('shot', name, page.url().replace(base, '')); };
  const vid = () => page.evaluate(() => { const v = document.querySelector('video'); const el = document.querySelector('.player'); return v ? { t: Math.round(v.currentTime * 10) / 10, paused: v.paused, sid: el.dataset.sid, start: el.dataset.clipStart, end: el.dataset.clipEnd } : null; });

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('caponline.v3', JSON.stringify({ guest: true })); });
  await page.goto(base + 'index.html#/prototyper', { waitUntil: 'networkidle' });
  await page.click('[data-action=proto][data-proto=bibliotek]');
  await page.waitForTimeout(300);
  await shot('hem-bibliotek');

  // Hela passet
  await page.click('a.card.program');
  await page.waitForTimeout(300);
  await shot('passet');
  await page.click('a[href="#/passet/kor"]');
  await page.waitForTimeout(600);
  await shot('passet-kor-topp');
  const btns = await page.$$('.film[data-action=klipp]');
  console.log('klippknappar i hela passet:', btns.length);
  // Moment 1 (uppvärmning ub1: 1–11 s)
  await btns[0].click();
  await page.waitForTimeout(900);
  console.log('efter klipp 1:', await vid());
  // Moment i del 3 (passningar) → filmbyte
  await btns[8].click();
  await page.waitForTimeout(1200);
  console.log('efter klipp 9 (byte av film):', await vid());
  await shot('passet-kor-klipp');
  // Upprepning: spola nära slutet och vänta
  await page.evaluate(() => { const v = document.querySelector('video'); const end = Number(document.querySelector('.player').dataset.clipEnd); v.currentTime = end - 0.5; });
  await page.waitForTimeout(1500);
  console.log('efter loop:', await vid());
  // Stäng av upprepning, spola nära slutet igen
  await page.click('[data-action=loop]');
  await page.evaluate(() => { const v = document.querySelector('video'); const end = Number(document.querySelector('.player').dataset.clipEnd); v.currentTime = end - 0.5; });
  await page.waitForTimeout(1500);
  console.log('utan loop (ska vara pausad vid slutet):', await vid());
  await page.click('[data-action=hela]');
  await page.waitForTimeout(500);
  console.log('hela filmen:', await vid());
  // Bocka av två moment och logga hela passet
  await page.check('input[data-step="0"]');
  await page.check('input[data-step="5"]');
  await page.click('a[href="#/passet/logga"]');
  await page.waitForTimeout(300);
  await shot('passet-logga');
  await page.click('button[type=submit]');
  await page.waitForTimeout(500);
  await shot('passet-loggat');

  // Delsida med ▶ per moment
  await page.goto(base + '#/pass/passningar');
  await page.waitForTimeout(400);
  await page.click('.film[data-action=klipp]');
  await page.waitForTimeout(900);
  console.log('delsida passningar klipp 1 (pa1 27–32):', await vid());
  await shot('del-passningar');

  // Prototyp 2: planera → kör med klipp
  await page.goto(base + '#/prototyper');
  await page.click('[data-action=proto][data-proto=spelare]');
  await page.waitForTimeout(300);
  await page.fill('#name', 'Elsa'); await page.selectOption('#age', '9'); await page.click('button[type=submit]');
  await page.waitForTimeout(300);
  await page.check('input[name=position][value=mitt]'); await page.click('button[type=submit]');
  await page.waitForTimeout(300);
  await page.check('input[name=difficulties][value=passning]'); await page.click('button[type=submit]');
  await page.waitForTimeout(500);
  await shot('hem-spelare');
  await page.goto(base + '#/planera');
  await page.click('label:has(input[name=minutes][value="45"])');
  await page.click('label:has(input[name=focus][value=position])');
  await page.click('button[type=submit]');
  await page.waitForTimeout(400);
  await shot('plan-position');
  await page.click('a.btn.grad');
  await page.waitForTimeout(500);
  const pb = await page.$$('.film[data-action=klipp]');
  console.log('klippknappar i planen:', pb.length);
  await pb[2].click();
  await page.waitForTimeout(1000);
  console.log('plan klipp 3:', await vid());
  await shot('plan-kor');
  await page.goto(base + '#/spelarkort');
  await shot('spelarkort');

  console.log('console errors:', errors.length ? errors : 'inga');
  await browser.close();
})().catch(e => { console.error('FEL', e); process.exit(1); });
