// Övningsbanken i admin + ⇄-växlingen mellan föräldravyn och Haris (Carl 2026-10-28).
// Kör mot API:t lokalt (samma som swish-test.js):
//   cd server/cap-api && npx wrangler dev --local --port 8787 --var ADMIN_LOSEN:testlosen --var APP_BASE:http://127.0.0.1:8808/ --var LANK_BASE:http://127.0.0.1:8787
//   python tools/serve.py 8808
//   NODE_PATH=<node_modules med playwright> node tools/ovningar-test.js
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-444 55 66';
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
  const vantaToast = (p, text) => p.waitForFunction(t => (document.querySelector('#toast')?.textContent || '').includes(t), text, { timeout: 10000 }).then(() => true, () => false);
  const url = p => p.url().split('#')[1] || '/';
  const flikar = p => p.$$eval('.tabs a span', s => s.map(x => x.textContent));
  // länken ur sms 2, sedan barnets namn och födelseår, tills startsidan syns
  let kod = '';
  const loggaInForalder = async p => {
    await p.goto(base + 'index.html#/k/' + kod, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => /^#\/(start\/1)?$/.test(location.hash) && (document.querySelector('#name') || document.querySelector('.greet')), null, { timeout: 15000 });
    if (await p.$('#name')) {
      await p.fill('#name', 'Ida'); await p.fill('#efternamn', 'Berg'); await p.selectOption('#fodd', String(new Date().getFullYear() - 9));
      await p.click('form[data-form=wiz1] button');
    }
    await p.waitForSelector('.greet', { timeout: 15000 }).catch(async () => console.log('  (startsidan kom inte:', url(p), (await p.$eval('#view', e => e.textContent)).replace(/\s+/g, ' ').slice(0, 160), ')'));
  };

  // ---- Haris loggar in på telefonen ----
  const a = await nyFlik('haris', devices['iPhone 13']);
  await a.goto(base + 'index.html#/admin', { waitUntil: 'networkidle' });
  await a.fill('#losen', 'testlosen'); await a.click('form[data-form=admin-login] button');
  await a.waitForURL(/#\/admin\/klienter/, { timeout: 15000 }); await a.waitForTimeout(1200);
  koll('Haris meny längst ner har Övningar', (await flikar(a)).join(',') === 'Klienter,Tider,Övningar,Filmer,Stigen,Mer', (await flikar(a)).join(','));
  koll('⇄ syns i admin och leder till föräldern', await a.$eval('#vaxla', e => !e.hidden && e.textContent.trim() === 'Förälder'));

  // en klient att planera åt
  for (const kort of await a.$$('.klient-card')) { if ((await kort.textContent()).includes(TEL)) { await kort.click(); await a.waitForTimeout(1000); await a.click('[data-action=klient-radera]'); await a.click('[data-action=klient-radera]'); await a.waitForTimeout(1200); break; } }
  await a.goto(base + 'index.html#/admin/klient/ny'); await a.waitForSelector('#kforalder');
  await a.fill('#kbarn', 'Ida'); await a.fill('#kefter', 'Berg'); await a.fill('#kforalder', 'Lisa'); await a.fill('#ktel', TEL);
  await a.click('form[data-form=klient-ny] button[type=submit]');
  await a.waitForURL(/#\/admin\/klient\/k[a-z0-9]+$/, { timeout: 15000 }); await a.waitForSelector('.sms-steg .msg', { state: 'attached', timeout: 10000 });
  const kid = url(a).split('/').pop();
  kod = ((await a.$$eval('.sms-steg .msg', m => m.map(x => x.textContent).join('\n'))).match(/\/k\/([A-Z0-9]+)/) || [])[1];

  // ---- övningsbanken ----
  await a.click('.tabs a[data-tab="/admin/ovningar"]'); await a.waitForSelector('.ov-kort', { timeout: 10000 });
  const alla = (await a.$$('.ov-kort')).length;
  koll('alla övningar visas', alla === 59, `${alla}`);
  await a.click('[data-action=ov-filter][data-falt=film]'); await a.waitForTimeout(200);
  koll('filter Med film', (await a.$$('.ov-kort')).length === 19, `${(await a.$$('.ov-kort')).length}`);
  await a.fill('#ovsok', 'passning'); await a.waitForTimeout(200);
  const sok = (await a.$$('.ov-kort')).length;
  koll('sök inom filtret', sok > 0 && sok < 19, `${sok}`);
  await a.click('[data-action=ov-nollstall]'); await a.waitForTimeout(200);
  koll('visa alla nollställer', (await a.$$('.ov-kort')).length === 59 && (await a.$eval('#ovsok', e => e.value)) === '');
  // filmklippet
  await a.click('.ov-kort [data-action=ov-film]'); await a.waitForSelector('.ov-klipp video', { timeout: 5000 }).catch(() => {});
  const klipp = await a.$eval('.ov-klipp video', v => ({ src: v.getAttribute('src'), start: v.dataset.start })).catch(() => null);
  koll('filmklippet visas med start och slut', !!klipp && /media\/.+\.mp4#t=\d+,\d+$/.test(klipp.src), klipp && klipp.src);
  // välj tre, sidan hoppar inte upp
  const namn = [], hopp = [];
  for (const i of [0, 5, 12]) {
    const knapp = (await a.$$('[data-action=ov-valj]'))[i];
    namn.push(await knapp.evaluate(e => e.closest('.ov-kort').querySelector('b').textContent));
    await knapp.scrollIntoViewIfNeeded(); const fore = await a.evaluate(() => scrollY);
    await knapp.click(); await a.waitForTimeout(150);
    hopp.push(Math.abs((await a.evaluate(() => scrollY)) - fore));
  }
  koll('sidan står kvar när man väljer', hopp.every(h => h < 60), hopp.join(', '));
  koll('raden med valda', (await a.$eval('.ov-bar', e => e.textContent)).includes('3 valda övningar'));
  await a.screenshot({ path: path.join(UT, 'ovningar-bank.png') });
  await a.selectOption('#ovkid', kid);
  await a.click('[data-action=ov-planera]'); await a.waitForURL(new RegExp(`#/admin/pass/ny/${kid}$`), { timeout: 10000 }); await a.waitForSelector('.blockrad', { timeout: 10000 });
  const titlar = await a.$$eval('.blockrad [data-b=titel]', i => i.map(x => x.value));
  koll('passet: samtal före, de tre övningarna, samtal efter', titlar.length === 5 && titlar[0] === 'Samtal före' && titlar.at(-1) === 'Samtal efter' && namn.every((n, i) => titlar[i + 1] === n), titlar.join(' | '));
  koll('spelaren är vald', await a.$eval('#puid', e => e.value) === kid);
  // fler ur banken från passet
  await a.click('[data-action=pass-bank]'); await a.waitForURL(/#\/admin\/ovningar$/); await a.waitForSelector('.ov-kort');
  koll('banken vet vilket pass', (await a.$eval('.note', e => e.textContent)).includes('Pass med Haris'));
  await (await a.$$('[data-action=ov-valj]'))[20].click(); await a.waitForTimeout(150);
  await a.click('[data-action=ov-lagg]'); await a.waitForURL(new RegExp(`#/admin/pass/ny/${kid}$`)); await a.waitForSelector('.blockrad');
  koll('övningen lades till i samma pass', (await a.$$('.blockrad')).length === 6, `${(await a.$$('.blockrad')).length}`);
  await a.click('form[data-form=pass-spara] button[type=submit]'); await a.waitForURL(/#\/admin\/pass\/p[a-z0-9]+$/, { timeout: 10000 });
  const pid = url(a).split('/').pop();
  const plan = await a.evaluate(async ({ API, pid }) => (await (await fetch(`${API}/admin/plan/${pid}`, { headers: { authorization: 'Bearer ' + JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin } })).json()), { API, pid }).catch(() => null);
  const ovIds = (plan?.plan?.block || []).map(x => x.ovningId).filter(Boolean);
  koll('servern sparar vilken övning blocket kom från', ovIds.length === 4, ovIds.join(','));
  // kör passet: filmklippet på övningen
  await a.goto(base + `index.html#/admin/pass/${pid}/kor`); await a.waitForSelector('[data-action=pass-steg]', { timeout: 10000 });
  await a.click('[data-action=pass-steg][data-d="1"]'); await a.waitForTimeout(800);
  koll('kör-läget visar filmklippet', !!(await a.$('.ov-klipp video')), await a.$eval('h1', e => e.textContent));
  await a.screenshot({ path: path.join(UT, 'ovningar-kor.png') });

  // ---- ⇄ mellan Haris och föräldern ----
  await a.goto(base + 'index.html#/admin/tider'); await a.waitForSelector('.vecka-titel', { timeout: 10000 });
  await loggaInForalder(a);
  koll('föräldravyn: startsidan med förälderns meny', url(a) === '/' && (await flikar(a)).join(',') === 'Hem,Träna själv,Med Haris,Mer', `${url(a)} ${(await flikar(a)).join(',')}`);
  koll('⇄ syns och leder till Haris', await a.$eval('#vaxla', e => !e.hidden && e.textContent.trim() === 'Haris'));
  await a.screenshot({ path: path.join(UT, 'ovningar-foralder.png') });
  await a.click('#vaxla'); await a.waitForTimeout(800);
  koll('⇄ tillbaka till där Haris var (Tider)', url(a) === '/admin/tider' && (await flikar(a))[0] === 'Klienter', url(a));
  await a.screenshot({ path: path.join(UT, 'ovningar-haris.png') });
  await a.click('#vaxla'); await a.waitForTimeout(800);
  koll('⇄ tillbaka till föräldern', url(a) === '/' && !!(await a.$('.greet')) && (await flikar(a))[0] === 'Hem', url(a));

  // ---- prototyperna är borta ----
  await a.goto(base + 'index.html#/mer'); await a.waitForTimeout(800);
  const mer = await a.$eval('#view', e => e.textContent);
  koll('Mer utan prototyperna', !mer.includes('Prototyperna') && !mer.includes('byt prototyp'));
  await a.goto(base + 'index.html#/prototyper'); await a.waitForTimeout(600);
  koll('gamla adressen /prototyper går till Mer', url(a) === '/mer', url(a));

  // ---- en förälder utan admin ser ingen växling ----
  const f = await nyFlik('förälder', devices['iPhone 13']);
  await loggaInForalder(f);
  await f.goto(base + 'index.html#/mer'); await f.waitForTimeout(800);
  koll('förälder utan admin: ingen ⇄', await f.$eval('#vaxla', e => e.hidden));
  koll('Mer har länken Admin för Haris', (await f.$eval('#view', e => e.textContent)).includes('för Haris'));

  console.log(fel ? `\n${fel} FEL` : '\nALLT GRÖNT');
  console.log('sidfel:', errs.length ? errs : 'inga');
  await b.close();
  process.exit(fel || errs.length ? 1 : 0);
})().catch(e => { console.error('TESTFEL', e); process.exit(1); });
