// Inställningssidan (Carl 2026-11-22: "en inställningssida … justera alla tillåtelser"). Låtsad iOS-app där notiserna
// är nekade och kalendern tillåten, och vanlig webb. Påminnelsen kvällen före går att stänga av och skickas då inte.
// Kör lokalt som schema-test.js (wrangler dev med TEST_LAGE:1 och PUSH_BASE:http://127.0.0.1:8799, serve.py 8808).
const { chromium, devices } = require('playwright');
const http = require('http');
const path = require('path');
const base = 'http://127.0.0.1:8808/', API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-444 55 22', TELN = '+46704445522';
const pushLogg = [];
const mock = http.createServer((req, res) => { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => { if (req.method === 'POST') { try { pushLogg.push(JSON.parse(body)); } catch {} } res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, skickade: 1 })); }); });
(async () => {
  await new Promise(r => mock.listen(8799, '127.0.0.1', r));
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
  const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
  const V = veckaOm(2);
  const nyFlik = async (namn, app) => {
    const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
    await ctx.addInitScript(([api, app]) => {
      try { localStorage.setItem('cap_api', api); } catch {}
      if (!app) return;
      const lyssn = { remove() {} };
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => ['CapKalender', 'PushNotifications', 'LocalNotifications', 'App'].includes(n), Plugins: {
        PushNotifications: { checkPermissions: async () => ({ receive: 'denied' }), requestPermissions: async () => ({ receive: 'denied' }), addListener: async () => lyssn, register: async () => {} },
        LocalNotifications: { checkPermissions: async () => ({ display: 'denied' }), requestPermissions: async () => ({ display: 'denied' }), getPending: async () => ({ notifications: [] }), cancel: async () => {}, schedule: async () => {} },
        CapKalender: { status: async () => ({ behorighet: 'ja' }), synka: async () => ({ ok: true, behorighet: 'ja', skapade: 0 }), avsluta: async () => ({ ok: true }) },
        App: { getInfo: async () => ({ version: '1.2' }), addListener: () => ({ catch() {} }), getLaunchUrl: async () => ({}) },
      } };
    }, [API, app]);
    await ctx.route(/itunes\.apple\.com/, r => r.fulfill({ contentType: 'application/json', body: '{"resultCount":0,"results":[]}' }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(namn + ': ' + e.message)); return p;
  };

  const a = await nyFlik('haris', false);
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.click('#anv-lage');
  for (let i = 0; i < 4 && !/admin\/klienter/.test(a.url()); i++) { await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]'); await a.waitForURL(/#\/admin\/klienter/, { timeout: 8000 }).catch(() => {}); }
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (m, p, d) => fetch(API + p, { method: m, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: d ? JSON.stringify(d) : undefined }).then(r => r.json());
  await adm('PUT', '/admin/config/betalning', { swish: '1232852762', pris: 850 }); await adm('PUT', '/admin/notiser', {});
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN)) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Sara', telefon: TEL, barn: 'Leo', efternamn: 'Exempel', fodd: 2016 });
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  const auto = await adm('POST', `/admin/vecka/${V}/auto`, { schema: [{ dag: 1, pa: true, start: '16:00', slut: '17:00' }], langd: 60, plats: 'Backavallen, Gratts Arena', ersatt: true });
  await adm('POST', `/admin/klient/${ny.klient.id}/boka`, { v: V, slot: auto.vecka.slots[0].id });

  const f = await nyFlik('app', true);
  await f.goto(base + 'index.html#/k/' + ny.kod, { waitUntil: 'networkidle' }); await f.waitForSelector('#losen1');
  await f.fill('#losen1', 'hemligt1'); await f.fill('#losen2', 'hemligt1'); await f.click('form[data-form=losen] button[type=submit]');
  await f.waitForFunction(() => document.querySelector('#name') || document.querySelector('.greet'), null, { timeout: 15000 });
  if (await f.$('#name')) { await f.selectOption('#fodd', '2016'); await f.click('form[data-form=wiz1] button'); }
  // nytt konto: Sista steget först (intro-test.js testar sidan)
  await f.waitForSelector('button[data-action=inst-klar]', { timeout: 10000 }); await f.click('button[data-action=inst-klar]');
  await f.waitForSelector('.greet');
  await f.goto(base + 'index.html#/mer'); await f.waitForSelector('a[href="#/installningar"]', { timeout: 10000 }).catch(() => {});
  koll('Mer: raden Inställningar', !!(await f.$('a[href="#/installningar"]')));
  await f.click('a[href="#/installningar"]'); await f.waitForSelector('.inst-rad'); await f.waitForTimeout(1200);
  const rader = await f.$$eval('.inst-rad', r => r.map(x => [x.querySelector('b').textContent, x.querySelector('.inst-chip')?.textContent || '', x.querySelector('.inst-hoger a, .inst-hoger button')?.textContent || '']));
  koll('notiser: Nekat + Öppna Inställningar', rader.some(r => r[0] === 'Notiser' && r[1] === 'Nekat' && r[2] === 'Öppna Inställningar'), JSON.stringify(rader[0]));
  koll('kalendern: Tillåtet', rader.some(r => r[0] === 'Kalendern' && r[1] === 'Tillåtet'), JSON.stringify(rader[1]));
  koll('kamera, mikrofon, bilder listade', ['Kamera', 'Mikrofon', 'Bilder'].every(n => rader.some(r => r[0] === n)));
  koll('knappen Öppna iPhonens inställningar (app-settings:)', !!(await f.$('a.btn[href="app-settings:"]')));
  koll('konto: inloggad som Sara, Leo', norm(await f.$eval('main', e => e.textContent)).includes('Inloggad som Sara · 070-444 55 22 · Leo'));
  await f.screenshot({ path: path.join(UT, 'installningar-app.png'), fullPage: true });

  // påminnelsen kvällen före: av → ingen notis
  await f.click('input[data-action=inst-paminn]'); await f.waitForTimeout(800);
  const kl = (await adm('GET', `/admin/klient/${ny.klient.id}`)).klient;
  koll('påminnelsen avstängd sparas på kontot', kl.installningar?.paminnelse === false, JSON.stringify(kl.installningar));
  const man = (await adm('GET', '/admin/veckor')).mandag[V];
  const sondag = new Date(Date.parse(`${man}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  pushLogg.length = 0;
  const p1 = await adm('POST', '/admin/paminnelser', { nu: `${sondag}T18:05` });
  koll('avstängd: ingen påminnelse', p1.skickade === 0 && !pushLogg.some(x => x.till?.includes(ny.klient.id)), JSON.stringify(p1));
  await f.click('input[data-action=inst-paminn]'); await f.waitForTimeout(800);
  const p2 = await adm('POST', '/admin/paminnelser', { nu: `${sondag}T18:10` });
  koll('på igen: påminnelsen går ut', p2.skickade === 1, JSON.stringify(p2).slice(0, 120));

  // webben: ingen tillåtelselista från telefonen, prenumerationslänk
  const w = await nyFlik('webb', false);
  const kod2 = (await adm('POST', `/admin/klient/${ny.klient.id}/lank`, { typ: 'logga', ny: true })).kod;
  await w.goto(base + 'index.html#/login', { waitUntil: 'networkidle' }); await w.fill('#anv', TEL); await w.fill('#losen', 'hemligt1'); await w.click('form[data-form=login] button[type=submit]');
  await w.waitForSelector('.greet', { timeout: 15000 }).catch(() => {});
  await w.goto(base + 'index.html#/installningar'); await w.waitForSelector('.inst-rad'); await w.waitForTimeout(800);
  koll('webben: kalendern som prenumeration, ingen app-settings-knapp', !!(await w.$('.inst-rad a[href^="webcal://"]')) && !(await w.$('a[href="app-settings:"]')), String(!!kod2));

  await adm('DELETE', `/admin/klient/${ny.klient.id}`);
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close(); mock.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
