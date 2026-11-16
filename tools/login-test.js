// Inloggningen (Carl 2026-11-16): en inloggningssida för alla. Mobilnummer + koden ur sms:et första gången → välj
// lösenord → sedan mobilnummer + lösenord. Haris loggar in med e-post och får adminvyn. Glömt lösenordet = ny kod.
// Kör mot den lokala testmiljön (se tools/pott-test.js, cap-api med --var ADMIN_EPOST:haris@test.se).
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-555 12 34';
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
  const url = p => p.url().split('#')[1] || '/';
  const text = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const logga = async (p, anv, losen) => { await p.fill('#anv', anv); await p.fill('#losen', losen); await p.click('form[data-form=login] button[type=submit]'); await p.waitForTimeout(200); await p.waitForFunction(() => !document.querySelector('form[data-form=login] button[disabled]'), null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(500); };

  // ---- Haris: e-post + lösenord ger adminvyn ----
  const a = await nyFlik('haris', devices['iPhone 13']);
  await a.goto(base + 'index.html', { waitUntil: 'networkidle' });
  koll('första sidan är inloggningen', url(a) === '/login' && !!(await a.$('.login-kort #anv')) && !(await a.$('.tabs a')), url(a));
  await a.screenshot({ path: path.join(UT, 'login-forsta.png') });
  await logga(a, 'fel@test.se', 'testlosen');
  koll('okänd e-post nekas', (await text(a, '.login-kort')).includes('fel e-post eller lösenord'));
  await logga(a, 'Haris@Test.se', 'testlosen');
  await a.waitForURL(/#\/admin\/klienter/, { timeout: 10000 }).catch(() => {});
  koll('Haris e-post ger adminvyn', url(a) === '/admin/klienter', url(a));
  koll('bara Haris inloggad: ingen ⇄ och föräldravyn är stängd', await a.$eval('#vaxla', e => e.hidden));
  await a.goto(base + 'index.html#/boka'); await a.waitForTimeout(600);
  koll('Haris skickas tillbaka till adminvyn', url(a) === '/admin/klienter', url(a));

  // ---- Haris lägger in Jennifer (ett sms med koden) ----
  await a.goto(base + 'index.html#/admin/klienter'); await a.waitForTimeout(1200);
  for (const kort of await a.$$('.klient-card')) { if ((await kort.textContent()).includes('555 12 34')) { await kort.click(); await a.waitForTimeout(1200); await a.click('[data-action=klient-radera]'); await a.click('[data-action=klient-radera]'); await a.waitForTimeout(1200); break; } }
  await a.goto(base + 'index.html#/admin/klient/ny'); await a.waitForSelector('#ktel');
  await a.fill('#ktel', TEL); await a.click('form[data-form=klient-ny] button[type=submit]');
  await a.waitForSelector('#inloggning .kod-stor b', { timeout: 15000 });
  const kod = (await text(a, '#inloggning .kod-stor b')).replace(/\D/g, '');
  const sms = await a.$eval('#inloggning .msg', e => e.textContent);
  koll('sex siffror i koden', /^\d{6}$/.test(kod), kod);
  koll('sms:et: hämta appen, mobilnummer, kod, välj lösenord', sms.includes('Hämta appen') && sms.includes('070-555 12 34') && sms.includes(`${kod.slice(0, 3)}-${kod.slice(3)}`) && sms.includes('lösenord'), sms);
  const sl = await a.$eval('#inloggning a.btn.grad', e => e.getAttribute('href'));
  koll('Skicka sms från min telefon öppnar Meddelanden', sl.startsWith('sms:'), sl.slice(0, 40));
  await a.screenshot({ path: path.join(UT, 'login-haris-sms.png'), fullPage: true });

  // ---- Jennifer: mobilnummer + koden → välj lösenord → barnets namn ----
  const f = await nyFlik('jennifer', devices['iPhone 13']);
  await f.goto(base + 'index.html', { waitUntil: 'networkidle' });
  await logga(f, TEL, '000000');
  koll('fel kod nekas', (await text(f, '.login-kort')).includes('fel kod'), await text(f, '.note'));
  await logga(f, TEL, `${kod.slice(0, 3)}-${kod.slice(3)}`);
  koll('koden loggar in och leder till Välj ditt lösenord', url(f) === '/losen' && (await text(f, 'h1')) === 'Välj ditt lösenord', url(f) + ' ' + await text(f, '.note'));
  await f.screenshot({ path: path.join(UT, 'login-valj-losen.png') });
  await f.goto(base + 'index.html#/'); await f.waitForTimeout(500);
  koll('inget annat går innan lösenordet är valt', url(f) === '/losen', url(f));
  await f.fill('#losen1', 'kort'); await f.fill('#losen2', 'kort'); await f.click('form[data-form=losen] button[type=submit]'); await f.waitForTimeout(800);
  koll('för kort lösenord nekas', url(f) === '/losen' && ((await text(f, '.login-kort')).includes('minst sex tecken') || await f.$eval('#losen1', e => !e.checkValidity())));
  await f.fill('#losen1', 'Elijah2016'); await f.fill('#losen2', 'Elijah2016'); await f.click('form[data-form=losen] button[type=submit]');
  await f.waitForSelector('#name', { timeout: 10000 }).catch(() => {});
  koll('lösenordet sparat, sedan barnets namn', url(f) === '/start/1', url(f));
  await f.fill('#name', 'Elijah'); await f.fill('#efternamn', 'Demir'); await f.selectOption('#fodd', '2016');
  await f.click('form[data-form=wiz1] button'); await f.waitForSelector('.greet', { timeout: 10000 }).catch(() => {});
  koll('startsidan med Elijah', (await text(f, '.greet')).includes('Elijah'), await text(f, '.greet'));

  // ---- logga ut, in med lösenordet; koden gäller inte längre ----
  await f.goto(base + 'index.html#/mer'); await f.waitForTimeout(600);
  await f.click('[data-action=logga-ut]'); await f.waitForTimeout(800);
  koll('utloggad: inloggningen', url(f) === '/login');
  await logga(f, TEL, kod);
  koll('koden slutar gälla när lösenordet är valt', (await text(f, '.login-kort')).includes('fel lösenord'), await text(f, '.note'));
  await logga(f, TEL, 'Elijah2016');
  koll('mobilnummer + lösenord loggar in', url(f) === '/', url(f));

  // ---- glömt lösenordet: Haris ser det och skickar en ny kod ----
  await f.click('[data-action=logga-ut]').catch(async () => { await f.goto(base + 'index.html#/mer'); await f.waitForTimeout(500); await f.click('[data-action=logga-ut]'); });
  await f.waitForTimeout(600);
  await f.goto(base + 'index.html#/login/glomt'); await f.waitForSelector('#gtel');
  await f.fill('#gtel', TEL); await f.click('form[data-form=glomt] button[type=submit]'); await f.waitForTimeout(1000);
  koll('glömt: besked om att Haris skickar en ny kod', (await text(f, '.login-kort')).includes('Haris'), await text(f, '.note'));
  await a.reload({ waitUntil: 'networkidle' }); await a.waitForSelector('#inloggning', { timeout: 10000 });
  koll('Haris ser att föräldern glömt lösenordet, med en ny kod', (await text(a, '#inloggning')).includes('glömt lösenordet') && !!(await a.$('#inloggning .kod-stor b')), (await text(a, '#inloggning')).slice(0, 120));
  const kod2 = (await text(a, '#inloggning .kod-stor b')).replace(/\D/g, '');
  await logga(f, TEL, kod2);
  koll('nya koden: välj nytt lösenord', url(f) === '/losen', url(f));

  // ---- en telefon med både Haris och förälder: ⇄ syns ----
  await f.fill('#losen1', 'Elijah2017'); await f.fill('#losen2', 'Elijah2017'); await f.click('form[data-form=losen] button[type=submit]'); await f.waitForTimeout(1000);
  koll('nytt lösenord sparat', url(f) === '/', url(f));
  // städa
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const lista = await fetch(API + '/admin/klienter', { headers: { authorization: 'Bearer ' + tok } }).then(r => r.json());
  for (const k of lista.klienter.filter(x => x.telefon === '+46705551234')) await fetch(API + `/admin/klient/${k.id}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + tok } });
  console.log(fel ? `\n${fel} FEL` : '\nALLT GRÖNT');
  console.log('sidfel:', errs.length ? errs : 'inga');
  await b.close();
  process.exit(fel || errs.length ? 1 : 0);
})().catch(e => { console.error('TESTFEL', e); process.exit(1); });
