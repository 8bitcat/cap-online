// Paket på barnet (Carl 2026-10-28): 850 kr per pass, 10 pass 6 900 kr, 20 pass 12 900 kr. Föräldern köper ett
// paket i appen och swishar, bokningarna dras från paketet, Haris bockar av och kan lägga på paket själv.
// Kör mot API:t lokalt (samma som swish-test.js):
//   cd server/cap-api && npx wrangler dev --local --port 8787 --var ADMIN_LOSEN:testlosen --var APP_BASE:http://127.0.0.1:8808/ --var LANK_BASE:http://127.0.0.1:8787
//   python tools/serve.py 8808
//   NODE_PATH=<node_modules med playwright> node tools/paket-test.js
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-555 66 77';
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
  const toast = p => p.$eval('#toast', e => e.textContent).catch(() => '');
  const vantaText = (p, sel, t) => p.waitForFunction(([s, t]) => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').includes(t), [sel, t], { timeout: 10000 }).then(() => true, () => false);
  const text = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };

  // ---- Haris: priser, en kund och en öppen vecka ----
  const a = await nyFlik('haris', { viewport: { width: 1280, height: 900 } });
  await a.goto(base + 'index.html#/admin', { waitUntil: 'networkidle' });
  await a.fill('#losen', 'testlosen'); await a.click('form[data-form=admin-login] button');
  await a.waitForURL(/#\/admin\/klienter/, { timeout: 15000 }); await a.waitForTimeout(1000);
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (metod, p, data) => fetch(API + p, { method: metod, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined }).then(r => r.json());
  const cfg = (await adm('PUT', '/admin/config/betalning', { swish: '1232852762', pris: 850, paket: [{ namn: '10 pass', antal: 10, pris: 6900 }, { namn: '20 pass', antal: 20, pris: 12900 }] })).config;
  koll('priserna sparade', cfg.pris === 850 && cfg.paket.length === 2);
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === '+46705556677')) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Lisa', telefon: TEL, barn: 'Ida', efternamn: 'Berg', fodd: 2016 });
  const kid = ny.klient.id, kod = ny.kod;
  const vt = veckaOm(10);
  const slots = [1, 2, 3, 4, 5].map(dag => ({ dag, start: '17:00', slut: '18:00' }));
  await adm('PUT', `/admin/vecka/${vt}`, { oppen: false, slots, notis: false });
  const opp = await adm('PUT', `/admin/vecka/${vt}`, { oppen: true, slots: (await adm('GET', '/admin/veckor')).veckor.find(w => w.v === vt).slots, notis: false });
  koll('veckan öppen', opp.ok && opp.vecka.oppen, opp.fel);

  // ---- föräldern: loggar in och bokar ett enstaka pass ----
  const f = await nyFlik('förälder', devices['iPhone 13']);
  await f.goto(base + 'index.html#/k/' + kod, { waitUntil: 'networkidle' });
  await f.waitForFunction(() => document.querySelector('#name') || document.querySelector('.greet'), null, { timeout: 15000 });
  if (await f.$('#name')) { await f.selectOption('#fodd', '2016'); await f.click('form[data-form=wiz1] button'); }
  await f.waitForSelector('.greet', { timeout: 15000 });
  await f.goto(base + `index.html#/boka/${vt}`); await f.waitForSelector('.tid', { timeout: 10000 });
  koll('bokningssidan nämner paketen', (await text(f, 'section p.muted.small')).includes('Paket med fler pass finns längre ner'));
  const boka = async (i) => {
    await (await f.$$('.tid:not([disabled]):not(.min)'))[i].click(); await f.waitForSelector('.hall', { timeout: 8000 });
    const hall = await text(f, '.hall');
    await f.click('[data-action=boka-bekrafta]'); await f.waitForSelector('.nyss-bokad', { timeout: 10000 }); await f.waitForTimeout(400);
    return hall;
  };
  await boka(0);
  koll('första passet: rutan Betala 850 kr med Swish', (await text(f, '.betal-ark a.btn.swish')) === 'Betala 850 kr med Swish');
  await f.click('[data-action=boka-ark-stang]'); await f.waitForTimeout(300);
  koll('Betala senare stänger rutan, Swish finns kvar', !(await f.$('.betal-ark')) && (await text(f, '.nyss-bokad a.btn.swish')) === 'Betala 850 kr med Swish');
  await f.waitForSelector('#mina .kop', { timeout: 10000 });
  koll('köp-rutorna med pris per pass', (await text(f, '#mina .kop-lista')).includes('690 kr per pass') && (await text(f, '#mina .kop-lista')).includes('645 kr per pass'), await text(f, '#mina .kop-lista'));

  // ---- föräldern köper 10 pass: bokningen flyttas in, Swish för paketet ----
  await f.click('[data-action=boka-paket-kop][data-namn="10 pass"]');
  koll('köp kräver två tryck', (await text(f, '[data-action=boka-paket-kop][data-namn="10 pass"]')) === 'Tryck igen för att köpa');
  await f.click('[data-action=boka-paket-kop][data-namn="10 pass"]'); await vantaToast(f, 'är ert');
  koll('köpt, bokade tiden ingår', (await toast(f)).includes('En bokad tid ingår nu i paketet'), await toast(f));
  await f.waitForSelector('.paket-kort', { timeout: 10000 });
  koll('paketkortet: 9 av 10 kvar', (await text(f, '.paket-kort .pk-kvar')) === '9 av 10 pass kvar', await text(f, '.paket-kort .pk-kvar'));
  const href = await f.$eval('.paket-kort a.btn.swish', e => e.getAttribute('href')).catch(() => '');
  const q = href ? new URL(href).searchParams : new URLSearchParams();
  koll('Swish för paketet: 6 900 kr och meddelandet', q.get('amt') === '6900.00' && q.get('msg') === 'CAP Ida Berg paket 10 pass' && q.get('sw') === '1232852762', href);
  koll('första bokningen ingår i paketet', (await text(f, '#mina li.row.bokning')).includes('Ingår i paketet 10 pass'));
  await f.click('[data-action=boka-paket-kop][data-namn="20 pass"]'); await f.click('[data-action=boka-paket-kop][data-namn="20 pass"]'); await vantaToast(f, 'betala paketet');
  koll('ett obetalt paket i taget', (await toast(f)).includes('betala paketet du redan köpt först'), await toast(f));
  await f.screenshot({ path: path.join(UT, 'paket-foralder.png'), fullPage: true });

  // ---- nästa bokning dras från paketet ----
  await f.goto(base + `index.html#/boka/${vt}`); await f.waitForSelector('.tid', { timeout: 10000 }); await f.waitForTimeout(500);
  koll('texten säger att bokningarna dras från paketet', (await text(f, 'section p.muted.small')).includes('Du har 9 pass kvar i ditt paket'));
  const hall2 = await boka(0);
  koll('platsen som hålls: dras från paketet', hall2.includes('dras från ditt paket (9 kvar)'), hall2);
  koll('bokad: passet dras från paketet, 8 kvar, ingen betalruta', (await text(f, '.nyss-bokad')).includes('Passet dras från paketet, 8 kvar') && !(await f.$('.nyss-bokad a.btn.swish')) && !(await f.$('.betal-ark')), await text(f, '.nyss-bokad'));
  await f.click('.paket-kort [data-action=boka-paket-swishad]'); await vantaToast(f, 'Tack!');
  koll('Jag har swishat för paketet', await vantaText(f, '.paket-kort', 'Swishad'));

  // ---- Haris: klientsidan ----
  await a.goto(base + `index.html#/admin/klient/${kid}`); await a.waitForSelector('form[data-form=klient-paket]', { timeout: 10000 });
  const panel = () => a.$eval('form[data-form=klient-paket]', e => e.closest('section').textContent.replace(/\s+/g, ' '));
  koll('Haris ser paketet: 8 av 10, swishad', (await panel()).includes('8 av 10 kvar') && (await panel()).includes('Swishad enligt föräldern'), (await panel()).slice(0, 160));
  await a.click('[data-action=klient-paket-betald]'); await vantaToast(a, 'markerat betalt');
  koll('Markera betald på paketet', await vantaText(a, '.lagg-paket', '') && await a.waitForFunction(() => document.querySelector('form[data-form=klient-paket]')?.closest('section').textContent.includes('Betald ✓'), null, { timeout: 8000 }).then(() => true, () => false));
  const rader = async () => a.$$eval('li.row.bokning', l => l.map(x => x.textContent.replace(/\s+/g, ' ')));
  koll('tiderna ingår i paket', (await rader()).length === 2 && (await rader()).every(r => r.includes('Ingår i paket')), (await rader()).join(' || ').slice(0, 200));
  await a.click('li.row.bokning [data-action=klient-tidpaket]'); await vantaToast(a, 'styckvis'); await a.waitForFunction(() => document.querySelector('li.row.bokning')?.textContent.includes('Dra från paketet'), null, { timeout: 8000 }).catch(() => {});
  koll('Betala styckvis i stället', (await rader())[0].includes('850 kr') && (await rader())[0].includes('Dra från paketet') && (await panel()).includes('9 av 10 kvar'), (await rader())[0]);
  await a.click('li.row.bokning [data-action=klient-tidpaket][data-paket="1"]'); await vantaToast(a, 'dras från paketet'); await a.waitForFunction(() => !document.querySelector('li.row.bokning')?.textContent.includes('Dra från paketet'), null, { timeout: 8000 }).catch(() => {});
  koll('Dra från paketet', (await rader())[0].includes('Ingår i paket') && (await panel()).includes('8 av 10 kvar'));
  // Haris lägger på 20 pass, redan betalt
  await a.selectOption('form[data-form=klient-paket] select[name=mall]', { label: '20 pass · 12 900 kr' });
  await a.check('form[data-form=klient-paket] input[name=betald]'); await a.click('form[data-form=klient-paket] button[type=submit]'); await vantaToast(a, 'är lagt på'); await a.waitForFunction(() => document.querySelector('form[data-form=klient-paket]')?.closest('section').textContent.includes('20 av 20'), null, { timeout: 8000 }).catch(() => {});
  koll('Haris lägger på 20 pass, betalt', (await panel()).includes('20 av 20 kvar') && (await panel()).includes('28 pass kvar'), (await panel()).slice(0, 120));
  await a.screenshot({ path: path.join(UT, 'paket-haris.png'), fullPage: true });
  const del = (await a.$$('[data-action=klient-paket-bort]'))[0];
  await del.click(); await del.click(); await vantaToast(a, 'borttaget'); await a.waitForFunction(() => !document.querySelector('form[data-form=klient-paket]')?.closest('section').textContent.includes('20 av 20'), null, { timeout: 8000 }).catch(() => {});
  koll('ta bort paketet', !(await panel()).includes('20 av 20'));
  // Tider: ingen Markera betald på en paketbokning
  await a.goto(base + 'index.html#/admin/tider'); await a.waitForSelector('.vecka-titel');
  for (let i = 0; i < 14 && !(await text(a, '.vecka-titel b')).endsWith(` ${Number(vt.split('-W')[1])}`); i++) { await a.click('[data-action=tid-vecka]:last-of-type'); await a.waitForTimeout(200); }
  const tr = await a.$$eval('.slotrad.bokad .betal-rad-admin', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  koll('Tider: paketbokningar utan Markera betald', tr.length === 2 && tr.every(x => x.includes('Ingår i paket') && !x.includes('Markera betald')), tr.join(' | '));

  // ---- avbokning ger tillbaka passet ----
  await f.goto(base + `index.html#/boka/${vt}`); await f.waitForSelector('#mina li.row.bokning', { timeout: 10000 });
  const av = (await f.$$('#mina [data-action=boka-avboka]'))[0];
  await av.click(); await av.click(); await vantaToast(f, 'Avbokad'); await vantaText(f, '.paket-kort .pk-kvar', '9 av 10');
  koll('avbokat: passet tillbaka (9 av 10)', (await text(f, '.paket-kort .pk-kvar')) === '9 av 10 pass kvar', await text(f, '.paket-kort .pk-kvar'));

  // städa
  await adm('PUT', `/admin/vecka/${vt}`, { oppen: false, slots: [], notis: false }).catch(() => {});
  await adm('DELETE', `/admin/klient/${kid}`);
  console.log(fel ? `\n${fel} FEL` : '\nALLT GRÖNT');
  console.log('sidfel:', errs.length ? errs : 'inga');
  await b.close();
  process.exit(fel || errs.length ? 1 : 0);
})().catch(e => { console.error('TESTFEL', e); process.exit(1); });
