// Frågor om övningarna i appen (Carl 2026-11-25: "skapa det inne i appen"; "man ska alltid välja fler").
// Kör lokalt som passfilm-test.js (wrangler dev, serve.py 8808).
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = []; let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  await ctx.addInitScript(api => { try { localStorage.setItem('cap_api', api); } catch { /* ok */ } }, API);
  const a = await ctx.newPage(); a.on('pageerror', e => errs.push(e.message));
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.click('#anv-lage');
  for (let i = 0; i < 4 && !/admin\/(idag|klienter)/.test(a.url()); i++) { await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]'); await a.waitForURL(/#\/admin\/(idag|klienter)/, { timeout: 8000 }).catch(() => {}); }
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (m, p, d) => fetch(API + p, { method: m, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: d ? JSON.stringify(d) : undefined }).then(r => r.json());
  // städa tidigare körningar
  const fore = await adm('GET', '/admin/ovfragor');
  for (const id of Object.keys(fore.svar || {})) await adm('DELETE', `/admin/ovfragor/svar/${id}`);
  for (const id of Object.keys(fore.nya || {})) await adm('DELETE', `/admin/ovfragor/nya/${id}`);
  await adm('DELETE', '/admin/ovfragor/allmant');

  // kortet under Övningar
  await a.goto(base + 'index.html#/admin/ovningar', { waitUntil: 'networkidle' }); await a.waitForSelector('.ovf-kort', { timeout: 10000 }).catch(() => {});
  await a.waitForFunction(() => /0 av 59 klara/.test(document.querySelector('.ovf-kort')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  koll('Övningar: kortet «Frågor om övningarna» med 0 av 59', /0 av 59 klara/.test(await a.textContent('.ovf-kort').catch(() => '')), await a.textContent('.ovf-kort').catch(() => ''));
  await a.click('.ovf-kort'); await a.waitForSelector('a[href="#/admin/fragor/ub1"]', { timeout: 10000 });
  koll('listan: grupperna och 59 övningar', (await a.$$('a[href^="#/admin/fragor/"]')).length === 59);
  await a.screenshot({ path: path.join(UT, 'ovf-1-lista.png'), fullPage: false });

  // svara på den första
  await a.click('a[href="#/admin/fragor/ub1"]'); await a.waitForSelector('#ovfFalt', { timeout: 8000 });
  koll('filmen från appen', (await a.$eval('#ovfVid', v => v.getAttribute('src')).catch(() => '')) === 'media/uppvarmning-bollkontroll.mp4');
  const tryck = async (falt, v) => { await a.click(`#ovfFalt [data-falt="${falt}"][data-v="${v}"]`); await a.waitForTimeout(120); };
  await tryck('beslut', 'Ja');
  await tryck('var', 'Träna hemma (stigen)'); await tryck('var', 'Pass med Haris');
  await tryck('niva', '2'); await tryck('niva', '3');
  await tryck('alder', '15–16'); await tryck('alder', '17+');
  await tryck('fas', 'Huvuddel');
  await tryck('yta', 'Stor (halvplan)');
  const pa = await a.$$eval('#ovfFalt .chip.on', r => r.map(x => `${x.dataset.falt}=${x.dataset.v}`));
  koll('flera val: nivå 1–3, två användningar, två åldrar, två faser', ['niva=1', 'niva=2', 'niva=3', 'var=Träna hemma (stigen)', 'var=Pass med Haris', 'alder=15–16', 'alder=17+', 'fas=Uppvärmning', 'fas=Huvuddel'].every(x => pa.includes(x)), pa.join(','));
  koll('vart den hamnar: etapp 1 (lägsta nivån) och pass', /Etapp 1, gratis för alla/.test(await a.textContent('#ovfLands')) && /nivå 1, 2, 3/.test(await a.textContent('#ovfLands')), await a.textContent('#ovfLands'));
  await a.fill('#ovf-kommentar', 'Bra som start.');
  await a.screenshot({ path: path.join(UT, 'ovf-2-fragor.png'), fullPage: true });
  await a.click('[data-action=ovf-nasta]');
  await a.waitForURL(/#\/admin\/fragor\/(?!ub1)[a-z0-9-]+$/, { timeout: 8000 }).catch(() => {});
  koll('Spara och nästa: nästa övning', /#\/admin\/fragor\/(?!ub1)/.test(a.url()), a.url());
  const s1 = (await adm('GET', '/admin/ovfragor')).svar?.ub1;
  koll('servern: svaret med listorna', s1?.beslut === 'ja' && s1.niva.join() === '1,2,3' && s1.alder.join() === '15–16,17+' && s1.fas.join() === 'Uppvärmning,Huvuddel' && s1.kommentar === 'Bra som start.', JSON.stringify(s1).slice(0, 200));

  // listan: 1 klar
  await a.goto(base + 'index.html#/admin/fragor'); await a.waitForTimeout(600);
  koll('listan: 1 av 59 klara, Klar på övningen', /1 av 59/.test(await a.textContent('main')) && (await a.$$eval('.ovf-pill.klar', r => r.length)) === 1);

  // ny övning
  await a.click('[data-action=ovf-flik][data-flik=ny]'); await a.waitForSelector('#ovf-namn');
  await a.fill('#ovf-namn', 'Kontrollsprint'); await a.click('#ovfFalt [data-falt="typ"][data-v="Tidtagning"]'); await a.waitForTimeout(150);
  koll('ny övning: Tidtagning visar måltiden', !!(await a.$('#ovf-maltid')));
  await a.fill('#ovf-maltid', '12');
  await a.click('[data-action=ovf-sparany]'); await a.waitForTimeout(600);
  const nya = Object.values((await adm('GET', '/admin/ovfragor')).nya || {});
  koll('ny övning sparad', nya.length === 1 && nya[0].namn === 'Kontrollsprint' && nya[0].typ.join() === 'Övning,Tidtagning' && nya[0].maltid === 12, JSON.stringify(nya[0] || {}).slice(0, 160));

  // allmänna frågor, flera val
  await a.click('[data-action=ovf-flik][data-flik=allmant]'); await a.waitForSelector('[data-action=ovf-allm]');
  await a.click('[data-action=ovf-allm][data-k=passlangd][data-v="20 min"]'); await a.waitForTimeout(150);
  await a.click('[data-action=ovf-allm][data-k=passlangd][data-v="30 min"]'); await a.waitForTimeout(150);
  await a.click('[data-action=ovf-sparaallm]'); await a.waitForTimeout(600);
  const al = (await adm('GET', '/admin/ovfragor')).allmant;
  koll('allmänna frågor: två svar på passlängden', al?.passlangd?.join() === '20 min,30 min', JSON.stringify(al));

  // städa
  await adm('DELETE', '/admin/ovfragor/svar/ub1');
  for (const id of Object.keys((await adm('GET', '/admin/ovfragor')).nya || {})) await adm('DELETE', `/admin/ovfragor/nya/${id}`);
  await adm('DELETE', '/admin/ovfragor/allmant');
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
