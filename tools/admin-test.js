// Inloggningsgrind, admin (film + taggar + moment + inbjudan), kodinloggning, filmen i appen med ▶.
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
  const shot = async n => { await p.waitForTimeout(400); await p.screenshot({ path: path.join(__dirname, 'v5-' + n + '.png'), fullPage: true }); };
  const url = () => p.url().split('#')[1] || '/';

  await p.goto(base, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(base + 'index.html#/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  console.log('utan konto hamnar man på:', url());
  await shot('login');

  // Admin: logga in, skapa film
  await p.goto(base + '#/admin'); await p.waitForTimeout(400);
  await p.fill('#losen', LOSEN); await p.click('form[data-form=admin-login] button'); await p.waitForTimeout(1500);
  console.log('admin inloggad, flik:', await p.$eval('h1', h => h.textContent).catch(() => '-'));
  await p.click('[data-action=admin-ny]'); await p.waitForTimeout(400);
  await p.fill('#titel', 'Exempel: Passningar (upplagd i admin)');
  await p.fill('#beskrivning', 'Testfilm upplagd från adminsidan. Stödfoten, konrutan och tempo.');
  await p.fill('#videoUrl', 'https://8bitcat.github.io/cap-online/media/passningar.mp4');
  for (const [dim, v] of [['alder', '9–10'], ['alder', '11–12'], ['position', 'Alla'], ['omrade', 'Teknik'], ['fardighet', 'Passning insida'], ['fas', 'Huvuddel'], ['utrustning', 'Boll'], ['utrustning', 'Koner']]) {
    await p.click(`.tagval[data-dim="${dim}"] .chip[data-v="${v}"]`);
  }
  await p.click('[data-action=m-ny]'); await p.waitForTimeout(300);
  await p.fill('#momentlista .step[data-i="0"] [data-m=namn]', 'Stödfoten bredvid bollen');
  await p.fill('#momentlista .step[data-i="0"] [data-m=start]', '27');
  await p.fill('#momentlista .step[data-i="0"] [data-m=slut]', '32');
  await p.fill('#momentlista .step[data-i="0"] [data-m=minuter]', '3');
  await p.click('label:has(input[name=status][value=publicerad])');
  await shot('admin-film');
  await p.click('form[data-form=admin-film] button[type=submit]'); await p.waitForTimeout(1500);
  const lista = await p.$$eval('.list li', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)));
  console.log('filmer i admin:', lista);
  await shot('admin-lista');

  // Inbjudan
  await p.click('[data-action=admin-flik][data-flik=inbjudningar]'); await p.waitForTimeout(1200);
  await p.fill('#iemail', 'test.foralder@example.com'); await p.fill('#inamn', 'Anna'); await p.fill('#ibarn', 'Elsa');
  await p.click('form[data-form=admin-inbjudan] button'); await p.waitForTimeout(1500);
  const kod = await p.$eval('.panel.brand div[style*="34px"]', e => e.textContent.trim());
  console.log('kod skapad:', kod);
  await shot('admin-inbjudan');

  // Logga in i appen med koden
  await p.goto(base + '#/login'); await p.waitForTimeout(400);
  await p.fill('#kod', kod); await p.click('form[data-form=kod] button'); await p.waitForTimeout(1500);
  console.log('efter kod:', url());
  await p.click('[data-action=proto][data-proto=bibliotek]'); await p.waitForTimeout(1200);
  const nya = await p.$$eval('h2', hs => hs.map(h => h.textContent));
  console.log('rubriker på hem:', nya.join(' | '));
  await shot('hem-med-film');
  await p.click('a.card[href^="#/film/"]'); await p.waitForTimeout(1200);
  console.log('filmsida:', await p.$eval('h1', h => h.textContent));
  const btn = await p.$('.film[data-action=klipp]');
  if (btn) { await btn.click(); await p.waitForTimeout(3000); console.log('klipp:', await p.evaluate(() => { const v = document.querySelector('video'); const el = document.querySelector('.player'); return { t: Math.round(v.currentTime * 10) / 10, sid: el.dataset.sid, start: el.dataset.clipStart }; })); }
  await shot('filmsida');
  await p.goto(base + '#/bibliotek'); await p.waitForTimeout(500);
  console.log('kontorad:', await p.$eval('p.small.muted', e => e.textContent.trim().slice(0, 80)));
  console.log('pageerrors:', errs.length ? errs : 'inga');
  await b.close();
})().catch(e => { console.error('FEL', e); process.exit(1); });
