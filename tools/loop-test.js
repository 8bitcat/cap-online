// Riktat test: upprepning av ett moment mitt i filmen och vid filmens slut, samt avstängd upprepning.
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8808/';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const vid = () => page.evaluate(() => { const v = document.querySelector('video'); const el = document.querySelector('.player'); return { t: Math.round(v.currentTime * 10) / 10, paused: v.paused, ended: v.ended, sid: el.dataset.sid, start: el.dataset.clipStart, end: el.dataset.clipEnd }; });
  const jumpNearEnd = () => page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = Number(document.querySelector('.player').dataset.clipEnd) - 0.4; });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('caponline.v3', JSON.stringify({ proto: 'bibliotek' })); });

  // Koordination ko2 11–16 (mitt i filmen)
  await page.goto(base + 'index.html#/pass/koordination', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const b = await page.$$('.film[data-action=klipp]');
  await b[1].click();
  await page.waitForTimeout(1200);
  console.log('ko2 start:', await vid());
  await jumpNearEnd(); await page.waitForTimeout(1500);
  console.log('ko2 efter loop (ska vara ~11–13, spelar):', await vid());
  await page.click('[data-action=loop]');
  await jumpNearEnd(); await page.waitForTimeout(1500);
  console.log('ko2 utan loop (ska vara pausad vid ~16):', await vid());

  // Passningar pa1 27–32 (slutar där filmen slutar)
  await page.goto(base + '#/pass/passningar');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.evaluate(() => {}); // loopClip är modulvariabel; sidladdning nollar den till true
  const b2 = await page.$$('.film[data-action=klipp]');
  await b2[0].click();
  await page.waitForTimeout(1000);
  console.log('pa1 start:', await vid());
  await jumpNearEnd(); await page.waitForTimeout(2000);
  console.log('pa1 efter filmens slut (ska vara ~27–29, spelar):', await vid());
  await browser.close();
})().catch(e => { console.error('FEL', e); process.exit(1); });
