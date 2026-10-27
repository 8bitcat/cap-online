// Betala med Swish (Carl 2026-10-27): Haris skriver Swish-nummer och pris i Admin → Mer. Föräldern bokar och får en
// Swish-länk med nummer, belopp och meddelande ifyllt, trycker "Jag har swishat", och Haris bockar av betalningen.
// Kör mot API:t lokalt (samma som app-lank-test.js):
//   cd server/cap-api && npx wrangler dev --local --port 8787 --var ADMIN_LOSEN:testlosen --var APP_BASE:http://127.0.0.1:8808/ --var LANK_BASE:http://127.0.0.1:8787
//   python tools/serve.py 8808
//   NODE_PATH=<node_modules med playwright> node tools/swish-test.js
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-333 44 55';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const nyFlik = async (namn, enhet) => {
    const ctx = await b.newContext({ ...enhet, locale: 'sv-SE' });
    await ctx.addInitScript(api => { try { localStorage.setItem('cap_api', api); } catch { /* ok */ } }, API);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(namn + ': ' + e.message)); return p;
  };
  const shot = async (p, n, full = true) => { await p.waitForTimeout(350); await p.screenshot({ path: path.join(UT, 'swish-' + n + '.png'), fullPage: full }); };
  const toast = p => p.$eval('#toast', e => e.textContent).catch(() => '');
  // den lokala servern kan vara seg: vänta tills meddelandet kommer i stället för en fast paus
  const vantaToast = (p, text) => p.waitForFunction(t => (document.querySelector('#toast')?.textContent || '').includes(t), text, { timeout: 10000 }).then(() => true, () => false);
  const url = p => p.url().split('#')[1] || '/';

  // ---- meddelandet och länken (modulen direkt) ----
  const a = await nyFlik('admin', { viewport: { width: 1280, height: 900 } });
  await a.goto(base + 'index.html#/admin', { waitUntil: 'networkidle' });
  const u = await a.evaluate(async () => {
    const s = await import('./js/swish.js');
    return {
      lank: s.swishLank('1232852762', 300, 'CAP Alva Lind 3 nov kl 17.00'),
      konstig: s.swishMeddelande("Zoë O'Brien – 3/11 kl 17:00 ⚽ & mer text som gör meddelandet alldeles för långt"),
      visa: s.visaSwish('1232852762'),
      bok: s.bokningsMeddelande({ barn: 'Åsa', datum: '2026-11-03', start: '17:00' }, 'Öberg'),
    };
  });
  koll('länken följer Swish specifikation', u.lank === 'https://app.swish.nu/1/p/sw/?sw=1232852762&amt=300.00&msg=CAP%20Alva%20Lind%203%20nov%20kl%2017.00', u.lank);
  koll('meddelandet rensas till Swish tecken och högst 50', /^[a-zA-Z0-9åäöÅÄÖ !?(),.:;-]{1,50}$/.test(u.konstig), `"${u.konstig}" (${u.konstig.length})`);
  koll('numret visas som på Swish skyltar', u.visa === '123 285 27 62', u.visa);
  koll('bokningens meddelande', u.bok === 'CAP Åsa Öberg 3 nov kl 17.00', u.bok);

  // ---- Haris: Swish-nummer och pris i Admin → Mer ----
  await a.fill('#losen', 'testlosen'); await a.click('form[data-form=admin-login] button');
  await a.waitForURL(/#\/admin\/klienter/, { timeout: 15000 }); await a.waitForTimeout(1500);
  await a.goto(base + 'index.html#/admin/mer'); await a.waitForSelector('form[data-form=admin-betalning]', { timeout: 10000 });
  await a.fill('form[data-form=admin-betalning] input[name=swish]', '12345'); await a.fill('form[data-form=admin-betalning] input[name=pris]', '300');
  await a.click('form[data-form=admin-betalning] button'); await vantaToast(a, 'ser fel ut');
  koll('fel nummer stoppas', (await toast(a)).includes('ser fel ut'), await toast(a));
  await a.fill('form[data-form=admin-betalning] input[name=swish]', '123-285 27 62');
  await a.click('form[data-form=admin-betalning] button'); await vantaToast(a, 'Föräldrarna ser'); await a.waitForTimeout(300);
  koll('sparat', (await toast(a)).includes('Föräldrarna ser Swish-knappen'), await toast(a));
  const prova = await a.$eval('a[href^="https://app.swish.nu"]', e => e.getAttribute('href')).catch(() => '');
  koll('prova-länken i admin', prova === 'https://app.swish.nu/1/p/sw/?sw=1232852762&amt=300.00&msg=CAP%20test', prova);
  koll('numret visas formaterat', await a.$eval('form[data-form=admin-betalning] input[name=swish]', e => e.value) === '123 285 27 62');
  const panel = await a.$('form[data-form=admin-betalning]');
  await panel.evaluate(e => e.closest('section').scrollIntoView());
  await (await panel.evaluateHandle(e => e.closest('section'))).asElement().screenshot({ path: path.join(UT, 'swish-admin-mer.png') });

  // ---- Haris: ny kund och lediga tider nästa vecka ----
  await a.goto(base + 'index.html#/admin/klienter'); await a.waitForTimeout(1200);
  for (const kort of await a.$$('.klient-card')) { if ((await kort.textContent()).includes(TEL)) { await kort.click(); await a.waitForTimeout(1200); await a.click('[data-action=klient-radera]'); await a.click('[data-action=klient-radera]'); await a.waitForTimeout(1200); break; } }
  await a.goto(base + 'index.html#/admin/klient/ny'); await a.waitForTimeout(500);
  await a.fill('#kforalder', 'Sara'); await a.fill('#ktel', TEL);
  await a.click('form[data-form=klient-ny] button[type=submit]');
  await a.waitForURL(/#\/admin\/klient\/k[a-z0-9]+$/, { timeout: 15000 }); await a.waitForSelector('.sms-steg .msg', { state: 'attached', timeout: 10000 });
  const kid = url(a).split('/').pop();
  const loggaText = await a.$$eval('.sms-steg', ss => ss.map(s => s.querySelector('.msg')?.textContent || '').join('\n'));
  const kod = (loggaText.match(/\/k\/([A-Z0-9]+)/) || [])[1];
  koll('kund med inloggningslänk', !!kod, kod);
  await a.goto(base + 'index.html#/admin/tider'); await a.waitForSelector('.vecka-titel', { timeout: 10000 });
  await a.click('[data-action=tid-vecka]:last-of-type'); await a.waitForTimeout(400);
  const vecka = await a.$eval('.vecka-titel b', e => e.textContent);
  if (!(await a.$('.slotrad'))) { await a.click('form[data-form=tid-auto] button[type=submit]'); await a.waitForSelector('.slotrad', { timeout: 10000 }); }
  if (!(await a.$eval('[data-action=tid-oppen]', e => e.checked))) { await a.click('[data-action=tid-oppen]'); await vantaToast(a, 'öppen för bokning'); }
  koll('nästa vecka öppen med tider', (await a.$$('.slotrad')).length > 0, `${vecka}, ${(await a.$$('.slotrad')).length} tider`);

  // ---- föräldern: loggar in, barnets namn, bokar ----
  const f = await nyFlik('förälder', devices['iPhone 13']);
  await f.goto(base + 'index.html#/k/' + kod, { waitUntil: 'networkidle' }); await f.waitForSelector('#name', { timeout: 15000 });
  await f.fill('#name', 'Alva'); await f.fill('#efternamn', 'Lind'); await f.selectOption('#fodd', String(new Date().getFullYear() - 10));
  await f.click('form[data-form=wiz1] button'); await f.waitForTimeout(1500);
  await f.goto(base + 'index.html#/boka'); await f.waitForSelector('.tid', { timeout: 10000 });
  koll('priset står på bokningssidan', (await f.$eval('section p.muted.small', e => e.textContent)).includes('300 kr och betalas med Swish'));
  const tid = await f.$('.tid:not([disabled])');
  const tidInfo = await tid.evaluate(e => ({ dag: e.dataset.dag, start: e.dataset.start }));
  await tid.click();
  await f.waitForSelector('.hall', { timeout: 8000 }).catch(async () => console.log('  ingen hållning, toast:', await toast(f)));
  koll('priset står när platsen hålls', (await f.$eval('.hall', e => e.textContent)).includes('300 kr, betalas med Swish'));
  await f.click('[data-action=boka-bekrafta]'); await f.waitForSelector('.nyss-bokad', { timeout: 10000 }).catch(() => {}); await f.waitForTimeout(500);
  const nyss = await f.$('.nyss-bokad');
  koll('panelen "Tiden är bokad" visas', !!nyss);
  const href = await f.$eval('.nyss-bokad a.btn.swish', e => e.getAttribute('href')).catch(() => '');
  const knapp = await f.$eval('.nyss-bokad a.btn.swish', e => e.textContent).catch(() => '');
  koll('Swish-knappen', knapp === 'Betala 300 kr med Swish', knapp);
  const q = href ? new URL(href).searchParams : new URLSearchParams();
  koll('länken har Haris nummer och priset', href.startsWith('https://app.swish.nu/1/p/sw/?') && q.get('sw') === '1232852762' && q.get('amt') === '300.00' && !q.has('cur') && !q.has('edit'), href);
  koll('meddelandet har barnet, datumet och tiden', new RegExp(`^CAP Alva Lind \\d{1,2} [a-z]{3} kl ${tidInfo.start.replace(':', '\\.')}$`).test(q.get('msg') || ''), q.get('msg'));
  await shot(f, 'foralder-bokad', false);
  await f.click('.nyss-bokad [data-action=boka-swishad]'); await vantaToast(f, 'Tack!'); await f.waitForTimeout(500);
  koll('Jag har swishat', (await f.$eval('.nyss-bokad .betalrad', e => e.textContent)).includes('Swishad'), await toast(f));

  // ---- Haris ser det under Tider och bockar av ----
  await a.reload({ waitUntil: 'networkidle' }); await a.goto(base + 'index.html#/admin/tider'); await a.waitForSelector('.vecka-titel', { timeout: 10000 });
  await a.click('[data-action=tid-vecka]:last-of-type'); await a.waitForSelector('.slotrad.bokad', { timeout: 10000 });
  const rad = await a.$('.slotrad.bokad');
  koll('Haris ser "Swishad enligt föräldern"', rad && (await rad.textContent()).includes('Swishad enligt föräldern'), rad ? (await rad.$eval('.betal-rad-admin', e => e.textContent)).trim() : '-');
  await rad.scrollIntoViewIfNeeded(); await rad.screenshot({ path: path.join(UT, 'swish-admin-tider.png') });
  await a.click('.slotrad.bokad [data-action=tid-betald]'); await vantaToast(a, 'Markerad som betald'); await a.waitForTimeout(300);
  koll('markerad betald', (await toast(a)).includes('Markerad som betald') && (await a.$eval('.slotrad.bokad .betal-rad-admin', e => e.textContent)).includes('Betald ✓'), await toast(a));

  // ---- föräldern ser Betald ✓ ----
  await f.goto(base + 'index.html#/'); await f.waitForTimeout(300);
  await f.evaluate(() => { location.hash = '#/boka'; }); await f.waitForTimeout(2000);
  await f.reload({ waitUntil: 'networkidle' }); await f.waitForSelector('#mina li', { timeout: 10000 }).catch(() => {});
  const mina = await f.$eval('#mina', e => e.textContent).catch(() => '');
  koll('föräldern ser Betald ✓ och ingen Swish-knapp', mina.includes('Betald ✓') && !(await f.$('#mina a.btn.swish')), mina.replace(/\s+/g, ' ').slice(0, 120));

  // ---- klientens sida: betalstatus och ångra ----
  await a.goto(base + 'index.html#/admin/klient/' + kid); await a.waitForSelector('li.row.bokning', { timeout: 10000 }).catch(() => {});
  koll('klientsidan visar Betald ✓', (await a.$eval('li.row.bokning', e => e.textContent).catch(() => '')).includes('Betald ✓'));
  await a.click('li.row.bokning [data-action=klient-betald]'); await vantaToast(a, 'ångrad'); await a.waitForTimeout(300);
  koll('ångra från klientsidan', (await toast(a)).includes('ångrad') && (await a.$eval('li.row.bokning', e => e.textContent)).includes('Swishad enligt föräldern'), await toast(a));
  await a.goto(base + 'index.html#/admin/tider'); await a.waitForSelector('.vecka-titel', { timeout: 10000 });
  if ((await a.$eval('.vecka-titel b', e => e.textContent)) !== vecka) { await a.click('[data-action=tid-vecka]:last-of-type'); await a.waitForTimeout(400); }
  koll('Tider är uppdaterad efter ångra', !(await a.$eval('.slotrad.bokad .betal-rad-admin', e => e.textContent)).includes('Betald ✓'));

  // ---- utan pris visas ingen Swish-knapp ----
  await a.goto(base + 'index.html#/admin/mer'); await a.waitForSelector('form[data-form=admin-betalning]', { timeout: 10000 });
  await a.fill('form[data-form=admin-betalning] input[name=pris]', ''); await a.click('form[data-form=admin-betalning] button'); await vantaToast(a, 'när både nummer och pris');
  await f.reload({ waitUntil: 'networkidle' }); await f.waitForSelector('#mina li', { timeout: 10000 }).catch(() => {});
  koll('utan pris: ingen Swish-knapp', !(await f.$('a.btn.swish')) && !(await f.$eval('section p.muted.small', e => e.textContent)).includes('kr och betalas'));
  // återställ priset så att en manuell titt ser knappen
  await a.fill('form[data-form=admin-betalning] input[name=pris]', '300'); await a.click('form[data-form=admin-betalning] button'); await vantaToast(a, 'Föräldrarna ser');

  console.log(fel ? `\n${fel} FEL` : '\nALLT GRÖNT');
  console.log('sidfel:', errs.length ? errs : 'inga');
  await b.close();
  process.exit(fel || errs.length ? 1 : 0);
})().catch(e => { console.error('TESTFEL', e); process.exit(1); });
