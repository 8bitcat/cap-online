// Pott med pengar + notiser till rätt telefon (Carl 2026-11-13).
// "om ett pass är 500 kr och man satt in 20 000 kr … när vi är på 15 500 kr och ändrar priset uppåt ska det visas att
// det blir färre pass kvar" + "skicka notiser när Haris gör olika saker" + "vi har olika login på telefonerna".
// Kör lokalt (fyra processer):
//   node tools/apns-mock.js 8791
//   cd server/cap-push && npx wrangler dev --local --port 8790 --inspector-port 9330 --var ADMIN_HEMLIG:pushtest --var APNS_HOST:http://127.0.0.1:8791 --var APNS_KEY:<pkcs8 base64> --var APNS_KEY_ID:TEST --var TEAM_ID:TEST
//   cd server/cap-api && npx wrangler dev --local --port 8787 --var ADMIN_LOSEN:testlosen --var APP_BASE:http://127.0.0.1:8808/ --var LANK_BASE:http://127.0.0.1:8787 --var PUSH_BASE:http://127.0.0.1:8790 --var PUSH_HEMLIG:pushtest
//   python tools/serve.py 8808
//   NODE_PATH=<node_modules med playwright> node tools/pott-test.js
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787', PUSH = 'http://127.0.0.1:8790', APNS = 'http://127.0.0.1:8791';
const UT = process.env.UT || __dirname;
const TEL = '070-555 44 33';
const TOK_FORALDER = 'a'.repeat(64), TOK_HARIS = 'b'.repeat(64), TOK_ANNAN = 'c'.repeat(64);
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
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
  const vantaToast = (p, t) => p.waitForFunction(t => (document.querySelector('#toast')?.textContent || '').replace(/\s+/g, ' ').includes(t), t, { timeout: 10000 }).then(() => true, () => false);
  const toast = p => p.$eval('#toast', e => e.textContent).then(norm).catch(() => '');
  const vantaText = (p, sel, t) => p.waitForFunction(([s, t]) => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').includes(t), [sel, t], { timeout: 10000 }).then(() => true, () => false);
  const text = (p, sel) => p.$eval(sel, e => e.textContent).then(norm).catch(() => '');
  const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
  const apns = () => fetch(APNS + '/logg').then(r => r.json()).then(l => l.map(x => ({ ...x, text: norm(x.text) })));
  const apnsTom = () => fetch(APNS + '/logg', { method: 'DELETE' });
  const vantaPush = async (fn, ms = 6000) => { const t0 = Date.now(); let l = []; while (Date.now() - t0 < ms) { l = await apns(); if (fn(l)) return l; await new Promise(r => setTimeout(r, 250)); } return l; };
  const till = (l, tok) => l.filter(x => x.token === tok);

  // ---- Haris: pris, en kund med eget pris 500 kr ----
  const a = await nyFlik('haris', { viewport: { width: 1280, height: 900 } });
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]');
  await a.waitForURL(/#\/admin\/klienter/, { timeout: 15000 }); await a.waitForTimeout(800);
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (metod, p, data) => fetch(API + p, { method: metod, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined }).then(r => r.json());
  await adm('PUT', '/admin/config/betalning', { swish: '1232852762', pris: 850, paket: [{ namn: '10 pass', antal: 10, pris: 6900 }] });
  await adm('PUT', '/admin/notiser', {});
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === '+46705554433')) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Sara', telefon: TEL, barn: 'Alva', efternamn: 'Lind', fodd: 2015 });
  const kid = ny.klient.id, kod = ny.kod;
  await adm('PUT', `/admin/klient/${kid}/pris`, { pris: 500 });

  // ---- föräldern loggar in; telefonerna kopplas: föräldern, Haris och en annan förälder utan inloggning ----
  const f = await nyFlik('förälder', devices['iPhone 13']);
  await f.goto(base + 'index.html#/k/' + kod, { waitUntil: 'networkidle' }); await f.waitForSelector('#losen1', { timeout: 15000 }); await f.fill('#losen1', 'hemligt1'); await f.fill('#losen2', 'hemligt1'); await f.click('form[data-form=losen] button[type=submit]');
  await f.waitForFunction(() => document.querySelector('#name') || document.querySelector('.greet'), null, { timeout: 15000 });
  if (await f.$('#name')) { await f.selectOption('#fodd', '2015'); await f.click('form[data-form=wiz1] button'); }
  await f.waitForSelector('.greet', { timeout: 15000 });
  const ftok = await f.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').session?.token);
  const r1 = await fetch(API + '/mina/push', { method: 'POST', headers: { authorization: 'Bearer ' + ftok, 'content-type': 'application/json' }, body: JSON.stringify({ token: TOK_FORALDER }) }).then(r => r.json());
  const r2 = await adm('POST', '/admin/push', { token: TOK_HARIS });
  const r3 = await fetch(PUSH + '/registrera', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: TOK_ANNAN, namn: 'X', kid: 'forfalskad' }) }).then(r => r.json());
  const st = await fetch(PUSH + '/').then(r => r.json());
  koll('telefonerna registrerade: en kopplad förälder, en Haris, en okopplad', r1.ok && r2.ok && r3.ok && st.inloggade >= 1 && st.haris >= 1, JSON.stringify(st));
  await apnsTom();

  // ---- Haris startar potten med 20 000 kr ----
  await a.goto(base + `index.html#/admin/klient/${kid}`); await a.waitForSelector('form[data-form=klient-pott]', { timeout: 10000 });
  koll('pottpanelen: starta en pott, 500 kr per pass', (await text(a, '#pott')).includes('500 kr varje gång ett pass har körts'), (await text(a, '#pott')).slice(0, 160));
  await a.fill('form[data-form=klient-pott] input[name=belopp]', '20000'); await a.fill('form[data-form=klient-pott] input[name=text]', 'Avtal hösten');
  await a.click('form[data-form=klient-pott] button[type=submit]'); await vantaToast(a, 'i potten');
  koll('20 000 kr insatt, räcker till 40 pass', (await toast(a)).includes('20 000 kr i potten, räcker till 40 pass'), await toast(a));
  let pl = await vantaPush(l => l.length >= 1);
  koll('notisen om potten går BARA till förälderns telefon', till(pl, TOK_FORALDER).some(x => x.title === 'Pengar i potten' && x.text.includes('20 000 kr')) && !till(pl, TOK_HARIS).length && !till(pl, TOK_ANNAN).length, JSON.stringify(pl).slice(0, 200));

  // ---- nio körda pass à 500 kr (förra veckan): 15 500 kr kvar ----
  const vf = veckaOm(-1);
  const forra = [[1, '16:00'], [1, '17:00'], [2, '16:00'], [2, '17:00'], [3, '16:00'], [3, '17:00'], [4, '16:00'], [4, '17:00'], [5, '16:00']].map(([dag, start]) => ({ dag, start, slut: `${String(+start.slice(0, 2) + 1).padStart(2, '0')}:00` }));
  await adm('PUT', `/admin/vecka/${vf}`, { oppen: false, slots: forra, notis: false });
  const vfSlots = (await adm('GET', '/admin/veckor')).veckor.find(w => w.v === vf).slots;
  for (const s of vfSlots) await adm('POST', `/admin/klient/${kid}/boka`, { v: vf, slot: s.id });
  let kl = await adm('GET', `/admin/klient/${kid}`);
  koll('nio körda pass dragna: 15 500 kr kvar, 31 pass', kl.pott?.saldo === 15500 && kl.pott?.passKvar === 31 && kl.pott?.antalKorda === 9, JSON.stringify({ s: kl.pott?.saldo, k: kl.pott?.passKvar, n: kl.pott?.antalKorda }));
  koll('alla nio bokningar betalas ur potten', kl.bokningar.filter(x => x.v === vf && x.pott && x.pris === 500).length === 9);

  // ---- priset höjs till 600 kr: färre pass kvar ----
  await apnsTom();
  await a.reload({ waitUntil: 'networkidle' }); await a.waitForSelector('form[data-form=klient-pris]', { timeout: 10000 });
  await a.fill('form[data-form=klient-pris] input[name=pris]', '600'); await a.click('form[data-form=klient-pris] button[type=submit]'); await vantaToast(a, 'Eget pris sparat');
  koll('pris 600 kr: potten räcker till 25 pass', (await toast(a)).includes('Potten räcker till 25 pass'), await toast(a));
  await vantaText(a, '#pott', '25 pass kvar');
  koll('pottpanelen: 15 500 kr, 25 pass à 600 kr', (await text(a, '#pott')).includes('15 500 kr') && (await text(a, '#pott')).includes('25 pass kvar à 600 kr'), (await text(a, '#pott')).slice(0, 140));
  koll('historiken: insättning och körda pass med saldo', (await text(a, '#pott .pott-logg')).includes('Avtal hösten') && (await text(a, '#pott .pott-logg')).includes('saldo 15 500 kr'), (await text(a, '#pott .pott-logg')).slice(0, 160));
  pl = await vantaPush(l => l.length >= 1);
  koll('notis Nytt pris med pass kvar, till föräldern', till(pl, TOK_FORALDER).some(x => x.title === 'Nytt pris' && x.text.includes('räcker till 25 pass')), JSON.stringify(pl).slice(0, 200));
  await a.screenshot({ path: path.join(UT, 'pott-haris.png'), fullPage: true });

  // ---- en vecka öppnas: notisen till föräldrar, inte till Haris telefon ----
  const vt = veckaOm(9);
  await apnsTom();
  await adm('PUT', `/admin/vecka/${vt}`, { oppen: false, slots: [1, 2, 3, 4].map(dag => ({ dag, start: '17:00', slut: '18:00' })), notis: false });
  const opp = await adm('PUT', `/admin/vecka/${vt}`, { oppen: true, slots: (await adm('GET', '/admin/veckor')).veckor.find(w => w.v === vt).slots });
  pl = await vantaPush(l => l.length >= 2);
  koll('veckan öppnad: notis till båda föräldrarna, inte Haris', opp.ok && till(pl, TOK_FORALDER).some(x => x.title === 'Nya tider hos Haris' && x.hash === `/boka/${vt}`) && till(pl, TOK_ANNAN).length === 1 && !till(pl, TOK_HARIS).length, JSON.stringify(pl).slice(0, 220));

  // ---- föräldern bokar ur potten ----
  await apnsTom();
  await f.goto(base + `index.html#/boka/${vt}`); await f.reload({ waitUntil: 'networkidle' }); await f.waitForSelector('.tid', { timeout: 10000 });
  koll('bokningssidan: 15 500 kr i potten, 25 pass', (await text(f, '.saldo-ruta')).includes('15 500 kr i potten · 25 pass kvar'), await text(f, '.saldo-ruta'));
  await (await f.$$('.tid:not([disabled]):not(.min)'))[0].click(); await f.waitForSelector('.hall', { timeout: 8000 });
  const hall = await text(f, '.hall');
  koll('valet: ur potten eller Swish', hall.includes('Betala 600 kr ur potten (15 500 kr kvar)') && hall.includes('Swisha 600 kr i stället, spara potten'), hall);
  await f.click('[data-action=boka-bekrafta][data-betalning=pott]'); await f.waitForSelector('.hall', { state: 'detached', timeout: 10000 }); await f.waitForSelector('.nyss-bokad', { timeout: 10000 }); await f.waitForTimeout(400);
  koll('bokad ur potten, ingen Swish-ruta', (await text(f, '.nyss-bokad')).includes('600 kr dras ur potten när passet körts, sedan räcker den till 24 pass') && !(await f.$('.betal-ark')), await text(f, '.nyss-bokad'));
  koll('Mina bokningar: Ur potten', await vantaText(f, '#mina li.row.bokning', 'Ur potten · 600 kr'), await text(f, '#mina li.row.bokning'));
  pl = await vantaPush(l => l.length >= 1);
  koll('Haris telefon får Ny bokning (potten), föräldern inte', till(pl, TOK_HARIS).some(x => x.title === 'Ny bokning' && x.text.includes('Alva Lind') && x.text.includes('(potten)')) && !till(pl, TOK_FORALDER).length, JSON.stringify(pl).slice(0, 200));
  await f.screenshot({ path: path.join(UT, 'pott-boka.png'), fullPage: true });

  // ---- Mina pass: potten och historiken ----
  await f.goto(base + 'index.html#/mina-pass'); await f.waitForSelector('.pott-logg', { timeout: 10000 });
  const mp = await text(f, '#view');
  koll('Mina pass: 15 500 kr i potten, bokat och körda pass', mp.includes('15 500 kr i potten') && mp.includes('24 pass kvar à 600 kr') && mp.includes('Bokat, dras när passet körts') && mp.includes('−500 kr') && mp.includes('+20 000 kr'), mp.slice(0, 260));
  await f.screenshot({ path: path.join(UT, 'pott-minapass.png'), fullPage: true });

  // ---- Haris: byter betalsätt, drar av och tar bort en rad ----
  await a.goto(base + `index.html#/admin/klient/${kid}`); await a.reload({ waitUntil: 'networkidle' }); await a.waitForSelector('#pott', { timeout: 10000 });
  const rad = () => a.$$eval('li.row.bokning', l => l.map(x => x.textContent.replace(/\s+/g, ' ')));
  koll('Haris ser tiden som Ur potten', (await rad())[0].includes('Ur potten') && (await rad())[0].includes('Betala styckvis i stället'), (await rad())[0]);
  await a.click('li.row.bokning [data-satt=styck]'); await vantaToast(a, 'styckvis');
  await a.waitForFunction(() => document.querySelector('li.row.bokning')?.textContent.includes('Dra från potten'), null, { timeout: 8000 }).catch(() => {});
  koll('styckvis: Dra från potten finns, 25 pass igen', (await rad())[0].includes('Dra från potten') && (await text(a, '#pott')).includes('25 pass kvar'), (await rad())[0]);
  await a.click('li.row.bokning [data-satt=pott]'); await vantaToast(a, 'ur potten');
  await vantaText(a, '#pott', '24 pass kvar');
  koll('tillbaka ur potten: 24 pass', (await text(a, '#pott')).includes('24 pass kvar'));
  await a.selectOption('form[data-form=klient-pott] select[name=typ]', 'ut');
  await a.fill('form[data-form=klient-pott] input[name=belopp]', '1000'); await a.fill('form[data-form=klient-pott] input[name=text]', 'Återbetalning');
  await a.click('form[data-form=klient-pott] button[type=submit]'); await vantaToast(a, 'Draget');
  koll('dra av 1 000 kr: 14 500 kr', (await toast(a)).includes('14 500 kr i potten'), await toast(a));
  await vantaText(a, '#pott .pott-logg', 'Återbetalning');
  const bort = await a.$('[data-action=klient-pott-bort]');
  await bort.click(); await bort.click(); await vantaToast(a, 'borttagen');
  await vantaText(a, '#pott .pk-kvar', '15 500 kr');
  koll('felskriven rad borttagen: 15 500 kr igen', (await text(a, '#pott .pk-kvar')) === '15 500 kr', await text(a, '#pott .pk-kvar'));
  await a.goto(base + 'index.html#/admin/klienter'); await a.waitForTimeout(1200);
  koll('klientlistan visar potten', (await text(a, '#view')).includes('💰 15 500 kr (24 pass)'), (await text(a, '#view')).slice(0, 120));

  // ---- Tider: skicka notis om lediga tider igen ----
  await apnsTom();
  const nn = await adm('POST', `/admin/vecka/${vt}/notis`, {});
  pl = await vantaPush(l => l.length >= 2);
  koll('Skicka notis igen: 3 lediga tider, till föräldrarna', nn.ok && till(pl, TOK_ANNAN).some(x => x.text.startsWith('3 lediga tider')) && till(pl, TOK_FORALDER).length === 1 && !till(pl, TOK_HARIS).length, JSON.stringify(pl).slice(0, 200));

  // ---- Haris stänger av notistypen pass: notisen sparas ändå i appen ----
  await adm('PUT', '/admin/notiser', { pass: false });
  await apnsTom();
  await adm('POST', `/admin/klient/${kid}/pott`, { typ: 'in', belopp: 500, text: 'Bonus' });
  await new Promise(r => setTimeout(r, 1500));
  koll('typen pass avstängd: ingen push', !till(await apns(), TOK_FORALDER).length);
  await adm('PUT', '/admin/notiser', {});

  // ---- föräldern: 🔔 visar det Haris gjort ----
  await f.goto(base + 'index.html#/notiser'); await f.reload({ waitUntil: 'networkidle' }); await f.waitForSelector('.notis-lista', { timeout: 10000 });
  const nl = await text(f, '.notis-lista');
  koll('notissidan: senaste från Haris', nl.includes('Pengar i potten') && nl.includes('Nytt pris') && nl.includes('räcker till 25 pass'), nl.slice(0, 200));
  koll('inga testknappar för föräldrar', !(await f.$('[data-action=notis-testa]')) && !(await text(f, '#view')).includes('tools\\notis.py'));
  await f.screenshot({ path: path.join(UT, 'pott-notiser.png'), fullPage: true });

  // ---- radera mitt konto ----
  await apnsTom();
  await f.goto(base + 'index.html#/mer'); await f.waitForTimeout(600);
  koll('Mer: Radera mitt konto, integritet och hjälp', (await text(f, '#view')).includes('Radera mitt konto') && !!(await f.$('a[href="integritet.html"]')) && !!(await f.$('a[href="support.html"]')));
  await f.goto(base + 'index.html#/radera'); await f.waitForSelector('[data-action=konto-radera]');
  koll('raderasidan varnar för pengarna i potten', (await text(f, '#view')).includes('16 000 kr kvar i potten'), (await text(f, '#view')).slice(0, 300));
  await f.click('[data-action=konto-radera]'); await f.click('[data-action=konto-radera]');
  await f.waitForURL(/#\/login/, { timeout: 10000 }).catch(() => {});
  koll('kontot raderat, tillbaka till inloggningen', /login/.test(f.url()));
  pl = await vantaPush(l => l.length >= 1);
  koll('Haris får notis om raderingen med potten', till(pl, TOK_HARIS).some(x => x.title === 'Konto raderat' && x.text.includes('16 000 kr kvar i potten')), JSON.stringify(pl).slice(0, 200));
  const lista = await adm('GET', '/admin/klienter');
  koll('klienten borta, raderad i listan', !lista.klienter.some(x => x.id === kid) && lista.raderade.some(x => x.namn === 'Alva L.'), JSON.stringify(lista.raderade).slice(0, 120));
  const gammal = await fetch(API + '/mina', { headers: { authorization: 'Bearer ' + ftok } }).then(r => r.status);
  koll('den gamla inloggningen gäller inte', gammal === 401, String(gammal));

  // städa
  await adm('PUT', `/admin/vecka/${vt}`, { oppen: false, slots: [], notis: false }).catch(() => {});
  await adm('PUT', `/admin/vecka/${vf}`, { oppen: false, slots: [], notis: false }).catch(() => {});
  for (const t of [TOK_FORALDER, TOK_HARIS, TOK_ANNAN]) await fetch(PUSH + '/avregistrera', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: t }) });
  console.log(fel ? `\n${fel} FEL` : '\nALLT GRÖNT');
  console.log('sidfel:', errs.length ? errs : 'inga');
  await b.close();
  process.exit(fel || errs.length ? 1 : 0);
})().catch(e => { console.error('TESTFEL', e); process.exit(1); });
