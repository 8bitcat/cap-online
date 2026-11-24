// Passen med film (Carl 2026-11-24): Idag med bokningarna → passet för bokningen, filma (komprimerat i appen 1.4),
// bedömning med tid, känslan från passet, dela, kommentarer åt båda håll med notiser, tiden ovanpå filmen, jämförelse
// med första gången, filmbanken med ⭐ och lagringstaket.
// Kör lokalt: wrangler dev -c wrangler.test.toml (R2 påslaget lokalt) med TEST_LAGE:1 och PUSH_BASE:http://127.0.0.1:8799,
// och python tools/serve.py 8808.
const { chromium, devices } = require('playwright');
const http = require('http');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-444 55 61', TELN = '+46704445561';

const pushLogg = [];
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.method === 'POST') { try { pushLogg.push({ path: req.url, ...JSON.parse(body) }); } catch { /* ok */ } }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.method === 'POST' ? { ok: true, skickade: 1 } : { ok: true, telefoner: 1, inloggade: 1, haris: 0 }));
  });
});
const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };

(async () => {
  await new Promise(r => mock.listen(8799, '127.0.0.1', r));
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [];
  let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
  const vantaToast = (p, t) => p.waitForFunction(t => (document.querySelector('#toast')?.textContent || '').replace(/\s+/g, ' ').includes(t), t, { timeout: 12000 }).then(() => true, () => false);
  const toast = p => p.$eval('#toast', e => e.textContent).then(norm).catch(() => '');

  // ---- Haris i appen 1.4: CapFilm "filmar" och laddar upp en liten fil på riktigt till den lokala R2 ----
  const ctxH = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE', permissions: ['microphone'] });
  await ctxH.addInitScript(api => {
    try { localStorage.setItem('cap_api', api); } catch { /* ok */ }
    const lyss = [];
    window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => ['App', 'CapFilm'].includes(n), Plugins: {
      App: { getInfo: async () => ({ version: '1.4' }), addListener: () => ({ catch() {} }), getLaunchUrl: async () => ({}) },
      CapFilm: {
        addListener: async (h, f) => { lyss.push(f); return { remove() {} }; },
        filma: async ({ id }) => { for (const a of [0.3, 0.7, 1]) lyss.forEach(f => f({ steg: 'komprimerar', andel: a })); window.__filmat = (window.__filmat || 0) + 1; return { id, sek: 12.3, fore: 52428800, efter: 9437184 }; },
        laddaUpp: async ({ api, token, klientId, filnamn }) => {
          const j = (m, p, d, typ) => fetch(api + p, { method: m, headers: { authorization: 'Bearer ' + token, ...(typ ? {} : { 'content-type': 'application/json' }) }, body: typ ? d : JSON.stringify(d) }).then(r => r.json());
          const st = await j('POST', '/admin/upload/start', { klientId, filnamn, typ: 'video/mp4', storlek: 2048 });
          if (!st.ok) return st;
          const del = await j('PUT', `/admin/upload/part?key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&part=1`, new Uint8Array(2048), true);
          lyss.forEach(f => f({ steg: 'laddar', andel: 1 }));
          const k = await j('POST', '/admin/upload/complete', { key: st.key, uploadId: st.uploadId, parts: [{ partNumber: 1, etag: del.etag }] });
          return k.ok ? { ok: true, url: k.url, key: k.key, storlek: k.storlek } : k;
        },
        taBort: async () => ({ ok: true }), vantande: async () => ({ filer: [] }),
      },
    } };
  }, API);
  await ctxH.route(/itunes\.apple\.com/, r => r.fulfill({ contentType: 'application/json', body: '{"resultCount":0,"results":[]}' }));
  const a = await ctxH.newPage(); a.on('pageerror', e => errs.push('haris: ' + e.message));
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.click('#anv-lage');
  for (let i = 0; i < 4 && !/admin\/(idag|klienter)/.test(a.url()); i++) { await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]'); await a.waitForURL(/#\/admin\/(idag|klienter)/, { timeout: 8000 }).catch(() => {}); }
  koll('Haris landar på Idag', /#\/admin\/idag$/.test(a.url()), a.url());
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (m, p, d) => fetch(API + p, { method: m, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: d ? JSON.stringify(d) : undefined }).then(r => r.json());
  await adm('PUT', '/admin/notiser', {});
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN)) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Sara', telefon: TEL, barn: 'Vide', efternamn: 'Exempel', fodd: 2016, position: 'anf' });
  const vide = ny.klient.id;

  // en bokning i dag
  const V = veckaOm(0), dag = ((new Date().getDay() + 6) % 7) + 1;
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  const auto = await adm('POST', `/admin/vecka/${V}/auto`, { schema: [{ dag, pa: true, start: '20:00', slut: '22:00' }], langd: 60, plats: 'Hisings Backa', ersatt: true });
  await adm('PUT', `/admin/vecka/${V}`, { oppen: true, slots: auto.vecka.slots, notis: false });
  const slot = auto.vecka.slots.find(s => s.start === '20:00').id;
  const bok = await adm('POST', `/admin/klient/${vide}/boka`, { v: V, slot });
  koll('Vide bokad i dag 20:00', bok.ok, bok.fel || '');

  // ett tidigare pass med konbanan och en film (för jämförelsen)
  const fore = await adm('POST', '/admin/plan', { uid: vide, barn: 'Vide', titel: 'Pass 10 nov', datum: '2026-11-10', block: [{ id: 'kon001', typ: 'bedomning', titel: 'Konbana', varv: 3 }], delad: true });
  await adm('POST', `/admin/klient/${vide}/bedomning`, { namn: 'Konbana', varv: [31.2, 30.4, 30.8], datum: '2026-11-10', planId: fore.plan.id, blockId: 'kon001' });
  const st0 = await adm('POST', '/admin/upload/start', { klientId: vide, filnamn: 'konbana.mp4', typ: 'video/mp4', storlek: 1024 });
  const del0 = await fetch(`${API}/admin/upload/part?key=${encodeURIComponent(st0.key)}&uploadId=${encodeURIComponent(st0.uploadId)}&part=1`, { method: 'PUT', headers: { authorization: 'Bearer ' + tok }, body: new Uint8Array(1024) }).then(r => r.json());
  const k0 = await adm('POST', '/admin/upload/complete', { key: st0.key, uploadId: st0.uploadId, parts: [{ partNumber: 1, etag: del0.etag }] });
  await adm('POST', `/admin/klient/${vide}/media`, { id: 'mfore01', typ: 'video', url: k0.url, key: k0.key, namn: 'konbana.mp4', planId: fore.plan.id, blockId: 'kon001', storlek: 1024 });
  koll('tidigare pass med konbana och film', fore.ok && k0.ok, k0.fel || '');

  // ---- Idag: bokningen med Kör direkt ----
  await a.goto(base + 'index.html#/admin/klienter'); await a.waitForTimeout(300); await a.goto(base + 'index.html#/admin/idag'); await a.waitForSelector(`[data-action=idag-kor][data-uid="${vide}"]`, { timeout: 10000 }).catch(() => {});
  const idagText = norm(await a.textContent('main'));
  koll('Idag: I dag, 20:00, Vide med Planera och Kör direkt', idagText.includes('I dag') && idagText.includes('20:00') && idagText.includes('Vide Exempel') && !!(await a.$(`[data-action=idag-planera][data-uid="${vide}"]`)), idagText.slice(0, 160));
  await a.screenshot({ path: path.join(UT, 'passfilm-1-idag.png'), fullPage: true });
  await a.click(`[data-action=idag-kor][data-uid="${vide}"]`);
  await a.waitForURL(/#\/admin\/pass\/[a-z0-9]+\/kor$/, { timeout: 10000 }).catch(() => {});
  const planId = (a.url().match(/pass\/([a-z0-9]+)\/kor/) || [])[1];
  const plan0 = (await adm('GET', `/admin/plan/${planId}`)).plan;
  koll('passet hör till bokningen', plan0?.bokning?.v === V && plan0?.bokning?.slot === slot && plan0.uid === vide, JSON.stringify(plan0?.bokning));
  const konId = plan0.block.find(x => x.typ === 'bedomning').id;

  // ---- Kör: filma samtalet (komprimerat), mät konbanan, filma den ----
  await a.waitForSelector('[data-action=pass-filma][data-kalla=kamera]', { timeout: 10000 });
  koll('kör-läget: Filma (appen) + Välj från telefonen', !!(await a.$('[data-action=pass-filma][data-kalla=bibliotek]')) && !(await a.$('#passfilm')));
  await a.click('[data-action=pass-filma][data-kalla=kamera]');
  koll('filmen uppladdad, med storleken före och efter', await vantaToast(a, 'Filmen är uppladdad (50 MB → 9 MB)'), await toast(a));
  await a.click('[data-action=pass-steg][data-d="1"]'); await a.waitForTimeout(500);
  await a.click('[data-action=pass-steg][data-d="1"]'); await a.waitForSelector('.stopur[data-lage=varv]', { timeout: 8000 });
  for (let i = 0; i < 2; i++) { await a.click('#stopurKnapp'); await a.waitForTimeout(350); await a.click('#stopurKnapp'); await a.waitForTimeout(400); }
  await a.click('[data-action=pass-bed-las]');
  koll('konbanan låst, jämförd med förra gången', await vantaToast(a, 'förra gången'), await toast(a));
  await a.click('[data-action=pass-filma][data-kalla=kamera]'); await vantaToast(a, 'Filmen är uppladdad');
  await a.screenshot({ path: path.join(UT, 'passfilm-2-kor.png'), fullPage: true });

  // ---- passets sida: känslan från passet, kommentar, dela ----
  await a.goto(base + `index.html#/admin/pass/${planId}`); await a.waitForSelector('[data-action=pass-kansla]', { timeout: 10000 });
  await a.click('[data-action=pass-kansla]'); await a.waitForSelector('[data-action=pass-kansla] .rec-dot', { timeout: 8000 }).catch(() => {});
  await a.waitForTimeout(1500);
  await a.click('[data-action=pass-kansla]');
  koll('känslan från passet inspelad och uppladdad', await vantaToast(a, 'Inspelningen är sparad på passet'), await toast(a));
  await a.fill(`#svar-${konId}`, 'Snabbare fötter i dag!'); await a.click(`[data-action=pass-svar][data-block="${konId}"]`);
  koll('Haris kommentar sparad', await vantaToast(a, 'Föräldern ser det när passet är delat'), await toast(a));
  await a.check('input[name=delad]'); await a.click('form[data-form=pass-spara] button[type=submit]');
  await vantaToast(a, 'delat med föräldern'); await a.waitForTimeout(800);
  koll('föräldern får notis när passet delas', pushLogg.some(x => /Passet från Haris/.test(x.title || '')), pushLogg.map(x => x.title).join(' | '));

  // ---- föräldern ----
  const inl = await fetch(API + '/auth/kod', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kod: ny.kod }) }).then(r => r.json());
  await fetch(API + '/auth/pin', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + inl.token }, body: JSON.stringify({ losen: 'hemligt1' }) });
  const ctxF = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  await ctxF.addInitScript(([api, ses]) => {
    try {
      localStorage.setItem('cap_api', api);
      const d = JSON.parse(localStorage.getItem('caponline.v3') || '{}');
      d.session = ses; d.proto = 'app'; d.notiser = { intro: true, introVer: '1.3', fragat: true };
      d.profile = { name: 'Vide', efternamn: 'Exempel', fodd: '2016', age: '10', position: 'anf', foot: 'Höger', experience: 'Spelat 1–2 år', drom: '', difficulties: [], freq: '2', mer: false };
      localStorage.setItem('caponline.v3', JSON.stringify(d));
    } catch { /* ok */ }
  }, [API, { token: inl.token, user: inl.user, t: Date.now(), nyttLosen: false }]);
  const f = await ctxF.newPage(); f.on('pageerror', e => errs.push('förälder: ' + e.message));
  await f.goto(base + `index.html#/med-haris/${planId}`, { waitUntil: 'networkidle' }); await f.waitForSelector('.pf-tid', { timeout: 12000 }).catch(() => {});
  const tider = await f.$$eval('.pf-tid', r => r.map(x => x.textContent));
  koll('tiden ovanpå konbanefilmen', tider.some(t => /^Konbana · \d+,\d s$/.test(t)), tider.join(' | '));
  koll('jämförelse med första gången', !!(await f.$('.pf-jamfor')) && (await f.$$('.pf-jamfor video')).length === 2);
  koll('Haris om passet (ljudet) överst', !!(await f.$('.panel.brand audio')));
  koll('Haris kommentar på momentet', norm(await f.textContent('main')).includes('Snabbare fötter i dag!'));
  await f.fill(`#svar-${konId}`, 'Han har tränat hemma varje dag!'); await f.click(`[data-action=boka-svar][data-block="${konId}"]`);
  koll('förälderns kommentar skickad', await vantaToast(f, 'Skickat till Haris'), await toast(f));
  await f.waitForTimeout(600);
  koll('Haris får notis om förälderns kommentar', pushLogg.some(x => /svarade på passet/.test(x.title || '') && /Konbana: Han har tränat/.test(x.text || '')), pushLogg.map(x => x.title).join(' | '));
  await f.screenshot({ path: path.join(UT, 'passfilm-3-foralder.png'), fullPage: true });
  await f.goto(base + 'index.html#/utveckling', { waitUntil: 'networkidle' }); await f.waitForSelector('.bed-typ', { timeout: 10000 }).catch(() => {});
  koll('Utveckling: jämför första och senaste filmen', !!(await f.$('.bed-typ .pf-jamfor')));

  // ---- Haris svarar → notis till föräldern ----
  await a.goto(base + 'index.html#/admin/idag'); await a.waitForTimeout(300);
  await a.goto(base + `index.html#/admin/pass/${planId}`); await a.waitForSelector(`#svar-${konId}`);
  koll('Haris ser förälderns kommentar', await a.waitForFunction(() => document.querySelector('main').textContent.includes('Han har tränat hemma varje dag!'), null, { timeout: 8000 }).then(() => true, () => false));
  await a.fill(`#svar-${konId}`, 'Det syns!'); await a.click(`[data-action=pass-svar][data-block="${konId}"]`);
  await vantaToast(a, 'Skickat till föräldern'); await a.waitForTimeout(500);
  koll('föräldern får notis när Haris svarar', pushLogg.some(x => /Haris svarade/.test(x.title || '')));

  // ---- filmbanken ----
  await a.goto(base + 'index.html#/admin/filmbank'); await a.waitForSelector('.fb-kort', { timeout: 12000 }).catch(() => {});
  const fbText = norm(await a.textContent('main'));
  const kort = (await a.$$('.fb-kort')).length;
  koll('filmbanken: mätaren och filmerna', fbText.includes('av 10 GB') && kort >= 4, `${kort} kort`);
  await a.click('.fb-kort [data-action=fb-marknad]'); await a.waitForTimeout(800);
  await a.click('[data-action=fb-filter][data-f=marknad]'); await a.waitForTimeout(500);
  koll('⭐ till marknadsföring + filtret', (await a.$$('.fb-kort')).length === 1 && !!(await a.$('.fb-kort.marknad')));
  await a.click('[data-action=fb-filter][data-f=bed]'); await a.waitForTimeout(400);
  await a.click('[data-action=fb-jamfor]'); await a.waitForSelector('.pf-jamfor', { timeout: 5000 }).catch(() => {});
  koll('filmbanken: jämför konbanan', !!(await a.$('.pf-jamfor')));
  await a.screenshot({ path: path.join(UT, 'passfilm-4-jamfor.png'), fullPage: true });
  await a.click('[data-action=fb-jamfor-stang]'); await a.click('[data-action=fb-filter][data-f=alla]'); await a.waitForTimeout(400);
  await a.screenshot({ path: path.join(UT, 'passfilm-5-filmbank.png'), fullPage: true });

  // ---- taket ----
  const full = await adm('POST', '/admin/upload/start', { klientId: vide, filnamn: 'stor.mp4', typ: 'video/mp4', storlek: 10e9 });
  koll('taket: en fil som skulle gå över 9,5 GB stoppas', !full.ok && /Lagringen är full/.test(full.fel || ''), full.fel || '');

  // ---- städa ----
  await adm('POST', `/admin/klient/${vide}/avboka`, { v: V, slot });
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  for (const pl of (await adm('GET', '/admin/planer')).planer.filter(x => x.uid === vide)) await adm('DELETE', `/admin/plan/${pl.id}`);
  await adm('DELETE', `/admin/klient/${vide}`);
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close(); mock.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
