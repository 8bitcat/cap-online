// Övningsbanken i appen (Carl 2026-11-25: "ett ställe där Haris kan lägga upp nya och ta bort övningar likt artefakten
// och lägga till filmer till övningarna"; "man ska alltid välja fler"). Kör lokalt med R2:
// wrangler dev -c wrangler.test.toml … och python tools/serve.py 8808.
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const FILM = path.join(__dirname, '..', 'media', 'small', 'uppvarmning-bollkontroll.mp4');

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
  const stada = async () => {
    const r = await adm('GET', '/admin/ovningsbank');
    for (const id of Object.keys(r.ovningar || {})) await adm('DELETE', `/admin/ovningsbank/${id}?egen=1`);
    for (const id of r.borta || []) await adm('POST', `/admin/ovningsbank/${id}/tillbaka`);
  };
  await stada();

  await a.goto(base + 'index.html#/admin/ovningar', { waitUntil: 'networkidle' }); await a.waitForSelector('.ovf-kort', { timeout: 10000 }).catch(() => {});
  koll('Övningar: kortet «Ändra övningsbanken»', /Ändra övningsbanken/.test(await a.textContent('.ovf-kort').catch(() => '')));
  await a.click('.ovf-kort'); await a.waitForSelector('a[href="#/admin/fragor/ub1"]', { timeout: 10000 });
  koll('listan: 59 övningar', (await a.$$('a[href^="#/admin/fragor/"]')).length === 59);

  // ändra den första: namn, flera nivåer, åldrar, byt film och klipp
  await a.click('a[href="#/admin/fragor/ub1"]'); await a.waitForSelector('#ovfFalt', { timeout: 8000 });
  await a.waitForFunction(() => document.querySelectorAll('#ovfFilmVal option').length >= 3, null, { timeout: 8000 }).catch(() => {});
  koll('filmen och filmvalet', (await a.$eval('#ovfVid', v => v.getAttribute('src'))) === 'media/uppvarmning-bollkontroll.mp4' && (await a.$$('#ovfFilmVal option')).length >= 3);
  await a.fill('#ovf-namn', 'Bollkänsla och driv');
  const tryck = async (falt, v) => { await a.click(`#ovfFalt [data-falt="${falt}"][data-v="${v}"]`); await a.waitForTimeout(120); };
  await tryck('niva', '2'); await tryck('niva', '3'); await tryck('alder', '17+'); await tryck('fas', 'Huvuddel');
  const ny = await a.$$eval('#ovfFilmVal option', o => o.map(x => x.value).find(v => v && v !== 'media/uppvarmning-bollkontroll.mp4'));
  await a.selectOption('#ovfFilmVal', ny); await a.waitForTimeout(500);
  koll('bytt film', (await a.$eval('#ovfVid', v => v.getAttribute('src'))) === ny && (await a.$eval('#ovf-namn', e => e.value)) === 'Bollkänsla och driv', ny);
  await a.fill('#ovf-start', '5'); await a.fill('#ovf-slut', '15');
  await a.screenshot({ path: path.join(UT, 'obank-1-andra.png'), fullPage: true });
  await a.click('[data-action=ovf-nasta]');
  await a.waitForURL(/#\/admin\/fragor\/(?!ub1)/, { timeout: 8000 }).catch(() => {});
  const o1 = (await adm('GET', '/admin/ovningsbank')).ovningar?.ub1;
  koll('servern: ändringen med listor och klipp', o1?.namn === 'Bollkänsla och driv' && o1.nivor.join() === '1,2,3' && o1.niva === 1 && o1.alder.includes('17+') && o1.faser.join() === 'Uppvärmning,Huvuddel' && o1.film?.url === ny && o1.film.start === 5 && o1.film.slut === 15, JSON.stringify(o1).slice(0, 220));

  // syns i Övningar och i filtret nivå 3
  await a.goto(base + 'index.html#/admin/ovningar'); await a.waitForTimeout(800);
  koll('Övningar: det nya namnet syns', (await a.textContent('main')).includes('Bollkänsla och driv'));

  // ny övning med uppladdad film
  await a.goto(base + 'index.html#/admin/fragor'); await a.waitForSelector('[data-action=ovf-flik][data-flik=ny]');
  await a.click('[data-action=ovf-flik][data-flik=ny]'); await a.waitForSelector('#ovf-namn');
  await a.fill('#ovf-namn', 'Kontrollsprint'); await a.click('#ovfFalt [data-falt="typ"][data-v="Tidtagning"]'); await a.waitForTimeout(150);
  await a.fill('#ovf-maltid', '12');
  await a.click('[data-action=ovf-sparany]');
  await a.waitForURL(/#\/admin\/fragor\/n[a-z0-9]+$/, { timeout: 8000 }).catch(() => {});
  const nyId = a.url().split('/').pop();
  koll('ny övning: tillagd och öppen för film', /^n[a-z0-9]+$/.test(nyId) && !!(await a.$('#ovfFil')), a.url());
  await a.setInputFiles('#ovfFil', FILM);
  await a.waitForFunction(() => /Filmen är uppladdad/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  koll('filmen uppladdad till lagringen', /\/media\/film\/ov-/.test(await a.$eval('#ovfVid', v => v.getAttribute('src')).catch(() => '')));
  await a.click('[data-action=ovf-spara]'); await a.waitForTimeout(800);
  const on = (await adm('GET', '/admin/ovningsbank')).ovningar?.[nyId];
  koll('servern: egen övning med typ, måltid och film', on?.egen && on.typer.join() === 'Övning,Tidtagning' && on.maltid === 12 && /\/media\/film\/ov-/.test(on.film?.url || ''), JSON.stringify(on).slice(0, 200));

  // ta bort en ur grunden, och den egna
  await a.goto(base + 'index.html#/admin/fragor/ub2'); await a.waitForSelector('[data-action=ovf-bort]');
  await a.click('[data-action=ovf-bort]'); await a.click('[data-action=ovf-bort]'); await a.waitForURL(/#\/admin\/fragor$/, { timeout: 8000 }).catch(() => {});
  const bk = await adm('GET', '/admin/ovningsbank');
  koll('ta bort: ub2 borta', bk.borta.includes('ub2') && !(await a.$('a[href="#/admin/fragor/ub2"]')));
  await a.goto(base + `index.html#/admin/fragor/${nyId}`); await a.waitForSelector('[data-action=ovf-bort]');
  await a.click('[data-action=ovf-bort]'); await a.click('[data-action=ovf-bort]'); await a.waitForTimeout(800);
  koll('den egna borttagen helt', !(await adm('GET', '/admin/ovningsbank')).ovningar?.[nyId]);

  // ångra ändringen på ub1
  await a.goto(base + 'index.html#/admin/fragor/ub1'); await a.waitForSelector('[data-action=ovf-aterstall]');
  await a.click('[data-action=ovf-aterstall]'); await a.waitForTimeout(1000);
  koll('ångra: tillbaka till originalet', !(await adm('GET', '/admin/ovningsbank')).ovningar?.ub1 && (await a.$eval('#ovf-namn', e => e.value)) === 'Bollkänsla och första driv');

  await stada();
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
