// Sista steget när kontot skapas (Carl 2026-11-23: "alla frågor kommer i början när man skapar ett konto … en sida med
// allting"). Låtsad iOS-app där telefonen inte frågat än: länken → lösenord → barnets namn → Sista steget. Ingen fråga om
// lov får komma före sidan, "Slå på allt" frågar om notiser och kalendern, och efter Klart frågar appen inte mer.
// Kör lokalt som installningar-test.js (wrangler dev med TEST_LAGE:1 och PUSH_BASE:http://127.0.0.1:8799, serve.py 8808).
const { chromium, devices } = require('playwright');
const http = require('http');
const path = require('path');
const base = 'http://127.0.0.1:8808/', API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const mock = http.createServer((req, res) => { req.on('data', () => {}); req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end('{"ok":true,"skickade":1}'); }); });
(async () => {
  await new Promise(r => mock.listen(8799, '127.0.0.1', r));
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const nyFlik = async (namn, app, kal = true) => {
    const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
    await ctx.addInitScript(([api, app, kal]) => {
      try { localStorage.setItem('cap_api', api); } catch {}
      if (!app) return;
      window.__fragor = [];
      const lage = { push: 'prompt', kal: 'fraga' };
      const lyssn = { remove() {} };
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => ['PushNotifications', 'LocalNotifications', 'App'].concat(kal ? ['CapKalender'] : []).includes(n), Plugins: {
        PushNotifications: { checkPermissions: async () => ({ receive: lage.push }), requestPermissions: async () => { window.__fragor.push('notiser:' + location.hash); lage.push = 'granted'; return { receive: 'granted' }; }, addListener: async () => lyssn, register: async () => {} },
        LocalNotifications: { checkPermissions: async () => ({ display: lage.push }), requestPermissions: async () => { lage.push = 'granted'; return { display: 'granted' }; }, getPending: async () => ({ notifications: [] }), cancel: async () => {}, schedule: async () => { window.__fragor.push('trana'); } },
        CapKalender: { status: async () => ({ behorighet: lage.kal }), synka: async ({ fraga }) => { if (lage.kal === 'fraga' && fraga) { window.__fragor.push('kalender:' + location.hash); lage.kal = 'ja'; } return { ok: lage.kal === 'ja', behorighet: lage.kal, skapade: 0 }; }, avsluta: async () => ({ ok: true }) },
        App: { getInfo: async () => ({ version: kal ? '1.2' : '1.1' }), addListener: () => ({ catch() {} }), getLaunchUrl: async () => ({}) },
      } };
    }, [API, app, kal]);
    await ctx.route(/itunes\.apple\.com/, r => r.fulfill({ contentType: 'application/json', body: '{"resultCount":0,"results":[]}' }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(namn + ': ' + e.message)); return p;
  };

  const a = await nyFlik('haris', false);
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.click('#anv-lage');
  for (let i = 0; i < 4 && !/admin\/klienter/.test(a.url()); i++) { await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]'); await a.waitForURL(/#\/admin\/klienter/, { timeout: 8000 }).catch(() => {}); }
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (m, p, d) => fetch(API + p, { method: m, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: d ? JSON.stringify(d) : undefined }).then(r => r.json());
  const nyKlient = async (tel, teln, barn) => {
    for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === teln)) await adm('DELETE', `/admin/klient/${k.id}`);
    return adm('POST', '/admin/klient', { foralder: 'Nora', telefon: tel, barn, efternamn: 'Exempel', fodd: 2017 });
  };
  const genomKonto = async (f, kod) => {
    await f.goto(base + 'index.html#/k/' + kod, { waitUntil: 'networkidle' }); await f.waitForSelector('#losen1');
    await f.fill('#losen1', 'hemligt1'); await f.fill('#losen2', 'hemligt1'); await f.click('form[data-form=losen] button[type=submit]');
    await f.waitForSelector('#name', { timeout: 15000 });
    await f.selectOption('#fodd', '2017'); await f.click('form[data-form=wiz1] button');
    await f.waitForURL(/#\/kom-igang/, { timeout: 10000 }); await f.waitForTimeout(1500);
  };

  // appen 1.2: alla frågor på Sista steget
  const ny = await nyKlient('070-444 55 33', '+46704445533', 'Vide');
  const f = await nyFlik('app12', true);
  await genomKonto(f, ny.kod);
  koll('efter barnets namn: Sista steget', /#\/kom-igang$/.test(f.url()));
  koll('ingen fråga om lov före sidan', !(await f.evaluate(() => window.__fragor.length)), JSON.stringify(await f.evaluate(() => window.__fragor)));
  const rubriker = await f.$$eval('.inst-rad b', r => r.map(x => x.textContent));
  koll('raderna Notiser, Kalendern, Träna hemma', ['Notiser', 'Kalendern', 'Träna hemma'].every(n => rubriker.includes(n)), rubriker.join(','));
  koll('knappen Slå på allt', !!(await f.$('button[data-action=inst-allt]')));
  await f.screenshot({ path: path.join(UT, 'intro-fore.png'), fullPage: true });
  await f.click('button[data-action=inst-allt]'); await f.waitForTimeout(2500);
  const fr = await f.evaluate(() => window.__fragor);
  koll('Slå på allt: notiser, kalendern, träna hemma', fr.some(x => x.startsWith('notiser:#/kom-igang')) && fr.some(x => x.startsWith('kalender:#/kom-igang')) && fr.includes('trana'), JSON.stringify(fr));
  const chips = await f.$$eval('.inst-rad', r => r.map(x => x.querySelector('b').textContent + '=' + (x.querySelector('.inst-chip')?.textContent || '')));
  koll('alla tre På', chips.filter(c => c.endsWith('=På')).length === 3, chips.join(' '));
  koll('knappen blir Klart', (await f.textContent('button[data-action=inst-klar]')).includes('Klart'));
  await f.screenshot({ path: path.join(UT, 'intro-efter.png'), fullPage: true });
  await f.click('button[data-action=inst-klar]'); await f.waitForSelector('.greet', { timeout: 10000 });
  koll('Klart → startsidan', !/kom-igang/.test(f.url()), f.url());

  // appen 1.1 (utan kalendertillägget): hoppa över → appen frågar inte själv efteråt
  const ny2 = await nyKlient('070-444 55 34', '+46704445534', 'Tove');
  const g = await nyFlik('app11', true, false);
  await genomKonto(g, ny2.kod);
  koll('1.1: kalendern som Prenumerera', !!(await g.$('.inst-rad a[href^="webcal://"]')));
  await g.click('button[data-action=inst-klar]'); await g.waitForSelector('.greet', { timeout: 10000 });
  await g.goto(base + 'index.html#/mer'); await g.waitForTimeout(800); await g.goto(base + 'index.html#/'); await g.waitForTimeout(800);
  koll('hoppat över: ingen fråga efteråt', !(await g.evaluate(() => window.__fragor.length)), JSON.stringify(await g.evaluate(() => window.__fragor)));

  await adm('DELETE', `/admin/klient/${ny.klient.id}`); await adm('DELETE', `/admin/klient/${ny2.klient.id}`);
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close(); mock.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
