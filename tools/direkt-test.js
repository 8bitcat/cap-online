// Haris ser en ny bokning direkt (Carl 2026-11-24: "Haris måste kunna se direkt när ett pass blir bokat … då syntes det
// inte att vi bokade ett pass"): när notisen kommer (cap:push), och utan notis inom 20 sekunder. Plus zoomen: rutorna
// är minst 16 px på telefonen ("ibland zoomar det in i appen och då fastnar man inzoomad").
// Kör lokalt som passfilm-test.js.
const { chromium, devices } = require('playwright');
const http = require('http');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const TEL = '070-444 55 62', TELN = '+46704445562';
const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
const mock = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end('{"ok":true,"skickade":1}'); }); });

(async () => {
  await new Promise(r => mock.listen(8799, '127.0.0.1', r));
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
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN)) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Sara', telefon: TEL, barn: 'Nils', efternamn: 'Exempel', fodd: 2016 });
  const V = veckaOm(0), dag = ((new Date().getDay() + 6) % 7) + 1;
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  const auto = await adm('POST', `/admin/vecka/${V}/auto`, { schema: [{ dag, pa: true, start: '20:00', slut: '22:00' }], langd: 60, plats: 'Hisings Backa', ersatt: true });
  await adm('PUT', `/admin/vecka/${V}`, { oppen: true, slots: auto.vecka.slots, notis: false });
  const [s1, s2] = auto.vecka.slots.map(s => s.id);

  // Tider framme, sedan bokar "föräldern" och notisen kommer
  await a.goto(base + 'index.html#/admin/tider', { waitUntil: 'networkidle' }); await a.waitForTimeout(1500);
  koll('Tider: Nils syns inte innan', !(await a.textContent('main')).includes('Nils'));
  await adm('POST', `/admin/klient/${ny.klient.id}/boka`, { v: V, slot: s1 });
  await a.evaluate(() => document.dispatchEvent(new CustomEvent('cap:push', { detail: { title: 'Ny bokning', body: 'Nils Exempel bokade' } })));
  const medNotis = await a.waitForFunction(() => document.querySelector('main').textContent.includes('Nils'), null, { timeout: 5000 }).then(() => true, () => false);
  koll('notisen kommer: bokningen syns på Tider direkt', medNotis);

  // Idag framme, bokning utan notis: syns inom 20 s
  await a.goto(base + 'index.html#/admin/idag', { waitUntil: 'networkidle' }); await a.waitForTimeout(1200);
  const fore = (await a.$$(`[data-slot="${s2}"]`)).length;
  await adm('POST', `/admin/klient/${ny.klient.id}/boka`, { v: V, slot: s2 });
  const t0 = Date.now();
  const utan = await a.waitForFunction(s => document.querySelectorAll(`[data-slot="${s}"]`).length > 0, s2, { timeout: 25000 }).then(() => true, () => false);
  koll('utan notis: bokningen syns på Idag inom 20 s', fore === 0 && utan, `${Math.round((Date.now() - t0) / 1000)} s`);

  // zoomen
  const storlek = await a.evaluate(() => { const i = document.createElement('input'); i.type = 'text'; const d = document.createElement('div'); d.className = 'small'; d.appendChild(i); document.body.appendChild(d); const s = getComputedStyle(i).fontSize; d.remove(); return s; });
  const vp = await a.$eval('meta[name=viewport]', m => m.content);
  koll('zoom: rutorna 16 px och maximum-scale=1', storlek === '16px' && vp.includes('maximum-scale=1'), `${storlek} · ${vp}`);

  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  await adm('DELETE', `/admin/klient/${ny.klient.id}`);
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close(); mock.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
