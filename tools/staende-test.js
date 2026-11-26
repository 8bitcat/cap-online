// Stående tider (Haris 2026-11-26: "kan du fixa så att jag kan ha stående tider till vissa klienter?").
// Kör lokalt som passfilm-test.js (wrangler dev med TEST_LAGE:1, PUSH_BASE:http://127.0.0.1:8799, serve.py 8808).
const { chromium, devices } = require('playwright');
const http = require('http');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-444 55 84', TELN = '+46704445584', TEL2 = '070-444 55 85', TELN2 = '+46704445585';
const pushLogg = [];
const mock = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { if (req.method === 'POST') { try { pushLogg.push(JSON.parse(b)); } catch { /* ok */ } } res.setHeader('content-type', 'application/json'); res.end('{"ok":true,"skickade":1}'); }); });
const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };

(async () => {
  await new Promise(r => mock.listen(8799, '127.0.0.1', r));
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = []; let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const j = (m, p, d, t) => fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: d ? JSON.stringify(d) : undefined }).then(r => r.json());
  const tok = (await j('POST', '/auth/login', { anvandare: 'haris@test.se', losen: 'testlosen' })).admin;
  const adm = (m, p, d) => j(m, p, d, tok);
  await adm('PUT', '/admin/config/betalning', { swish: '1232852762', pris: 850 });
  await adm('PUT', '/admin/notiser', {});
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => [TELN, TELN2].includes(x.telefon))) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Sara', telefon: TEL, barn: 'Ella', efternamn: 'Ek', fodd: 2016 });
  const ella = ny.klient.id;
  const annan = (await adm('POST', '/admin/klient', { foralder: 'Ola', telefon: TEL2, barn: 'Max', efternamn: 'Berg', fodd: 2015 })).klient.id;
  await adm('POST', `/admin/klient/${ella}/paket`, { namn: '10 pass', antal: 10, pris: 6900, betald: true });
  const [V1, V2, V3, V4] = [veckaOm(5), veckaOm(6), veckaOm(7), veckaOm(8)];
  for (const v of [V1, V2, V3, V4]) await adm('PUT', `/admin/vecka/${v}`, { oppen: false, slots: [], notis: false });
  // två veckor finns redan, tisdag 16–19; i V2 har Max redan tagit 17:00 … nej, V2 är ledig; Max tar V4 senare
  for (const v of [V1, V2]) { const a = await adm('POST', `/admin/vecka/${v}/auto`, { schema: [{ dag: 2, pa: true, start: '16:00', slut: '19:00' }], langd: 60, plats: 'Backavallen', ersatt: true }); await adm('PUT', `/admin/vecka/${v}`, { oppen: true, slots: a.vecka.slots, notis: false }); }
  const tid = async (v, start = '17:00') => (await adm('GET', '/admin/veckor')).veckor.find(w => w.v === v)?.slots.find(s => s.dag === 2 && s.start === start);

  // ---- Haris lägger till en stående tid på kundsidan ----
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  await ctx.addInitScript(api => { try { localStorage.setItem('cap_api', api); } catch { /* ok */ } }, API);
  const a = await ctx.newPage(); a.on('pageerror', e => errs.push(e.message));
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.click('#anv-lage');
  for (let i = 0; i < 4 && !/admin\/(idag|klienter)/.test(a.url()); i++) { await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]'); await a.waitForURL(/#\/admin\/(idag|klienter)/, { timeout: 8000 }).catch(() => {}); }
  await a.goto(base + 'index.html#/admin/klienter', { waitUntil: 'networkidle' }); await a.waitForSelector(`a[href="#/admin/klient/${ella}"]`, { timeout: 15000 });
  await a.click(`a[href="#/admin/klient/${ella}"]`); await a.waitForSelector('#staende', { timeout: 15000 });
  pushLogg.length = 0;
  await a.selectOption('form[data-form=klient-staende] select[name=dag]', '2'); await a.fill('form[data-form=klient-staende] input[name=start]', '17:00');
  await a.click('form[data-form=klient-staende] button[type=submit]');
  await a.waitForSelector('#staende .note', { timeout: 10000 }).catch(() => {});
  const panel = await a.textContent('#staende').catch(() => '');
  koll('kundsidan: Varje tisdag 17:00, bokad i två veckor', /Varje tisdag 17:00/.test(panel) && (panel.match(/tis \d+ \w+ kl 17:00/g) || []).length === 2, panel.replace(/\s+/g, ' ').slice(0, 220));
  await a.screenshot({ path: path.join(UT, 'staende-1-kundsida.png'), fullPage: false });
  const t1 = await tid(V1), t2 = await tid(V2);
  koll('båda veckorna bokade åt Ella, ur paketet', t1?.bokad?.uid === ella && t2?.bokad?.uid === ella && !!t1.bokad.staende && !!t1.bokad.paket, JSON.stringify(t1?.bokad || {}).slice(0, 120));
  koll('föräldern får «Er stående tid är bokad»', pushLogg.filter(x => x.title === 'Er stående tid är bokad').length === 2, pushLogg.map(x => x.title).join(' | '));

  // ---- en ny vecka läggs ut: den stående tiden bokas innan veckan öppnas ----
  const ny3 = await adm('POST', `/admin/vecka/${V3}/auto`, { schema: [{ dag: 2, pa: true, start: '16:00', slut: '19:00' }], langd: 60, plats: 'Backavallen', ersatt: true });
  koll('ny vecka: bokad direkt när tiderna läggs ut', ny3.staende?.bokade?.length === 1 && ny3.vecka.slots.find(s => s.start === '17:00')?.bokad?.uid === ella, JSON.stringify(ny3.staende));
  // ---- upptagen tid: rapporteras ----
  const a4 = await adm('POST', `/admin/vecka/${V4}/auto`, { schema: [{ dag: 2, pa: true, start: '18:00', slut: '19:00' }], langd: 60, plats: 'Backavallen', ersatt: true });
  koll('vecka utan tiden: rapporteras som missad', a4.staende?.missade?.some(x => /ingen tid tis 17:00/.test(x)), JSON.stringify(a4.staende));

  // ---- föräldern avbokar V1: bokas inte om när Haris sparar veckan ----
  const inl = await j('POST', '/auth/kod', { kod: ny.kod }); await j('POST', '/auth/pin', { losen: 'hemligt1' }, inl.token);
  const av = await j('POST', '/boka/avboka', { v: V1, slot: t1.id }, inl.token);
  const w1 = (await adm('GET', '/admin/veckor')).veckor.find(w => w.v === V1);
  const igen = await adm('PUT', `/admin/vecka/${V1}`, { oppen: true, slots: w1.slots, notis: false });
  koll('avbokad vecka bokas inte om', av.ok && !igen.vecka.slots.find(s => s.id === t1.id)?.bokad && !igen.staende?.bokade?.length, JSON.stringify(igen.staende));
  const kl = (await adm('GET', `/admin/klient/${ella}`)).klient;
  koll('undantaget sparat på den stående tiden', kl.staende?.[0]?.undantag?.includes(V1), JSON.stringify(kl.staende));

  // ---- någon annan har tiden: rapporteras ----
  await adm('PUT', `/admin/vecka/${V4}`, { oppen: false, slots: [], notis: false });
  const a4b = await adm('POST', `/admin/vecka/${V4}/auto`, { schema: [{ dag: 2, pa: true, start: '17:00', slut: '18:00' }], langd: 60, plats: 'Backavallen', ersatt: true });
  // Ella fick tiden direkt; ta bort den och låt Max boka, spara igen
  await adm('POST', `/admin/klient/${ella}/avboka`, { v: V4, slot: a4b.vecka.slots[0].id });
  await adm('POST', `/admin/klient/${annan}/boka`, { v: V4, slot: a4b.vecka.slots[0].id });
  const w4 = (await adm('GET', '/admin/veckor')).veckor.find(w => w.v === V4);
  koll('Haris avbokning blir också ett undantag, Max får tiden', w4.slots[0].bokad?.uid === annan && (await adm('GET', `/admin/klient/${ella}`)).klient.staende[0].undantag.includes(V4));

  // ---- ta bort den stående tiden: bokade tider ligger kvar ----
  await a.reload({ waitUntil: 'networkidle' }); await a.waitForSelector('[data-action=klient-staende-bort]', { timeout: 10000 });
  await a.click('[data-action=klient-staende-bort]'); await a.click('[data-action=klient-staende-bort]');
  await a.waitForFunction(() => !document.querySelector('[data-action=klient-staende-bort]'), null, { timeout: 8000 }).catch(() => {});
  koll('borttagen: inga stående tider, V2 och V3 är kvar', !(await adm('GET', `/admin/klient/${ella}`)).klient.staende?.length && (await tid(V2))?.bokad?.uid === ella && (await tid(V3))?.bokad?.uid === ella);

  for (const v of [V1, V2, V3, V4]) await adm('PUT', `/admin/vecka/${v}`, { oppen: false, slots: [], notis: false });
  await adm('DELETE', `/admin/klient/${ella}`); await adm('DELETE', `/admin/klient/${annan}`);
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close(); mock.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
