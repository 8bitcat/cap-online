// Kalendern och påminnelserna (Carl 2026-11-24: "en notis kommer 24h innan, och att man får en notis när det är dags
// att åka"), sen avbokning ("man får inte pengarna tillbaka om man avbokar om det är mindre än 24 timmar kvar, men
// passet kan fortfarande bli öppet") och syskon som föräldern lägger till själv ("En förälder kunde inte koppla ett syskon").
// Kör lokalt som passfilm-test.js (wrangler dev med TEST_LAGE:1, PUSH_BASE:http://127.0.0.1:8799, serve.py 8808).
const { chromium, devices } = require('playwright');
const http = require('http');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const TEL = '070-444 55 63', TELN = '+46704445563';
const pushLogg = [];
const mock = http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; });
  req.on('end', () => { if (req.method === 'POST') { try { pushLogg.push(JSON.parse(body)); } catch { /* ok */ } } res.setHeader('content-type', 'application/json'); res.end('{"ok":true,"skickade":1}'); });
});
const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
// svensk lokal tid "YYYY-MM-DDTHH:MM" för ett datum
const lokal = d => d.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).replace(' ', 'T').slice(0, 16);

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
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN).sort((x, y) => (y.syskonTill ? 1 : 0) - (x.syskonTill ? 1 : 0))) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Sara', telefon: TEL, barn: 'Ella', efternamn: 'Exempel', fodd: 2016 });
  const ella = ny.klient.id;
  const inl = await j('POST', '/auth/kod', { kod: ny.kod });
  await j('POST', '/auth/pin', { losen: 'hemligt1' }, inl.token);
  const ftok = inl.token;

  // en vecka framåt: två tider på onsdagen
  const V = veckaOm(1);
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  const auto = await adm('POST', `/admin/vecka/${V}/auto`, { schema: [{ dag: 3, pa: true, start: '17:00', slut: '19:00' }], langd: 60, plats: 'Backavallen', ersatt: true });
  await adm('PUT', `/admin/vecka/${V}`, { oppen: true, slots: auto.vecka.slots, notis: false });
  const s17 = auto.vecka.slots.find(s => s.start === '17:00').id, s18 = auto.vecka.slots.find(s => s.start === '18:00').id;
  const bok = await adm('POST', `/admin/klient/${ella}/boka`, { v: V, slot: s17 });
  koll('Ella bokad onsdag 17:00 nästa vecka', bok.ok, bok.fel || '');
  const mina = await j('GET', '/mina', null, ftok);
  const b17 = mina.bokningar.find(x => x.id === s17);
  const start = new Date(`${b17.datum}T17:00:00+01:00`); // vintertid
  const nu = ms => lokal(new Date(start.getTime() - ms));

  // ---- påminnelserna ----
  pushLogg.length = 0;
  await adm('POST', '/admin/paminnelser', { nu: nu(864e5 + 60e3) });
  koll('inget före 24 timmar', !pushLogg.some(x => /Träning|Dags/.test(x.title || '')));
  await adm('POST', '/admin/paminnelser', { nu: nu(864e5 - 60e3) });
  koll('24 timmar före: «Träning med Haris i morgon»', pushLogg.some(x => x.title === 'Träning med Haris i morgon' && /Backavallen/.test(x.text)), pushLogg.map(x => x.title).join(' | '));
  await adm('POST', '/admin/paminnelser', { nu: nu(864e5 - 120e3) });
  koll('bara en gång', pushLogg.filter(x => x.title === 'Träning med Haris i morgon').length === 1);
  const r30 = await j('PUT', '/mina/installningar', { restid: 30 }, ftok);
  koll('restiden 30 min sparad', r30.ok && r30.installningar.restid === 30);
  await adm('POST', '/admin/paminnelser', { nu: nu(40 * 60e3) });
  koll('inget «dags att åka» 40 min före (restid 30)', !pushLogg.some(x => /Dags att åka/.test(x.title || '')));
  await adm('POST', '/admin/paminnelser', { nu: nu(29 * 60e3) });
  koll('30 min före: «Dags att åka till träningen»', pushLogg.some(x => x.title === 'Dags att åka till träningen' && /17:00 på Backavallen/.test(x.text)), pushLogg.map(x => `${x.title}: ${x.text}`).join(' | '));

  // ---- kalenderprenumerationen: två larm ----
  const ics = await fetch(API + mina.kalFeed).then(r => r.text());
  koll('kalenderfilen: larm dagen före och 30 min före', ics.includes('TRIGGER:-P1D') && ics.includes('TRIGGER:-PT30M') && ics.includes('Dags att åka till Backavallen'), (ics.match(/TRIGGER:[^\r\n]+/g) || []).join(','));

  // ---- med larmen i kalendern: inga notiser ----
  await adm('POST', `/admin/klient/${ella}/boka`, { v: V, slot: s18 });
  await j('PUT', '/mina/installningar', { kalender: true }, ftok);
  pushLogg.length = 0;
  const start18 = new Date(start.getTime() + 3600e3);
  await adm('POST', '/admin/paminnelser', { nu: lokal(new Date(start18.getTime() - 864e5 + 60e3)) });
  koll('larmen i kalendern: ingen notis', !pushLogg.some(x => /Träning|Dags/.test(x.title || '')), pushLogg.map(x => x.title).join(' | '));
  await j('PUT', '/mina/installningar', { kalender: false }, ftok);

  // ---- sen avbokning: obetalt pass, Swish ----
  pushLogg.length = 0;
  const sen = await j('POST', '/boka/avboka', { v: V, slot: s18, testNu: new Date(start18.getTime() - 5 * 3600e3).toISOString() }, ftok);
  koll('avbokning 5 timmar före: passet ska betalas', sen.ok && /ska betalas \(850 kr\)/.test(sen.sen || ''), JSON.stringify(sen));
  const w = (await adm('GET', '/admin/veckor')).veckor.find(x => x.v === V);
  koll('tiden är ledig igen', !w.slots.find(s => s.id === s18).bokad);
  koll('Haris får «Sen avbokning»', pushLogg.some(x => x.title === 'Sen avbokning' && /mindre än 24 timmar/.test(x.text)), pushLogg.map(x => x.title).join(' | '));

  // ---- sen avbokning från paketet: passet räknas ----
  await adm('POST', `/admin/klient/${ella}/paket`, { namn: '10 pass', antal: 10, pris: 6900, betald: true });
  await adm('POST', `/admin/klient/${ella}/boka`, { v: V, slot: s18 });
  const fore = (await j('GET', '/mina', null, ftok)).paket.reduce((n, p) => n + p.kvar, 0);
  const senP = await j('POST', '/boka/avboka', { v: V, slot: s18, testNu: new Date(start18.getTime() - 3 * 3600e3).toISOString() }, ftok);
  const efter = (await j('GET', '/mina', null, ftok)).paket.reduce((n, p) => n + p.kvar, 0);
  koll('paket: passet tillbaka? nej, det räknas', senP.ok && /paketet/.test(senP.sen || '') && efter === fore, `${fore} → ${efter} · ${senP.sen}`);
  await adm('POST', `/admin/klient/${ella}/boka`, { v: V, slot: s18 });
  const tidig = await j('POST', '/boka/avboka', { v: V, slot: s18, testNu: new Date(start18.getTime() - 30 * 3600e3).toISOString() }, ftok);
  const efter2 = (await j('GET', '/mina', null, ftok)).paket.reduce((n, p) => n + p.kvar, 0);
  koll('avbokning 30 timmar före: passet tillbaka', tidig.ok && !tidig.sen && efter2 === efter, `${efter} → ${efter2}`);

  // ---- föräldern: restiden och syskon i Inställningar ----
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  await ctx.addInitScript(([api, ses]) => {
    try { localStorage.setItem('cap_api', api); const d = JSON.parse(localStorage.getItem('caponline.v3') || '{}'); d.session = ses; d.notiser = { intro: true, introVer: '1.4', fragat: true }; d.profile = { name: 'Ella', efternamn: 'Exempel', fodd: '2016', age: '10', position: 'mitt', foot: 'Höger', experience: 'Spelat 1–2 år', drom: '', difficulties: [], freq: '2', mer: false }; localStorage.setItem('caponline.v3', JSON.stringify(d)); } catch { /* ok */ }
  }, [API, { token: ftok, user: inl.user, t: Date.now(), nyttLosen: false }]);
  const f = await ctx.newPage(); f.on('pageerror', e => errs.push(e.message));
  await f.goto(base + 'index.html#/installningar', { waitUntil: 'networkidle' }); await f.waitForSelector('#instRestid', { timeout: 10000 }).catch(() => {});
  koll('Inställningar: «Inför passet» och restiden', (await f.textContent('main')).includes('24 timmar före, och när det är dags att åka') && await f.$eval('#instRestid', e => e.value).catch(() => '') === '30');
  await f.selectOption('#instRestid', '60');
  await f.waitForFunction(() => (document.querySelector('#toast')?.textContent || '').includes('60 minuter'), null, { timeout: 8000 }).catch(() => {});
  koll('restiden ändrad till 60 i appen', (await j('GET', '/mina', null, ftok)).klient.installningar.restid === 60);
  pushLogg.length = 0;
  await f.click('#barnen summary'); await f.fill('#syskonBarn', 'Leo'); await f.selectOption('#syskonFodd', '2018');
  await f.click('form[data-form=inst-syskon] button[type=submit]');
  await f.waitForFunction(() => (document.querySelector('#toast')?.textContent || '').includes('är tillagd'), null, { timeout: 10000 }).catch(() => {});
  await f.waitForTimeout(800);
  const lista = (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN);
  koll('syskonet Leo tillagt på familjens konto', lista.some(x => x.barn === 'Leo' && x.syskonTill === 'Ella'), lista.map(x => `${x.barn}/${x.syskonTill}`).join(','));
  koll('listan i appen visar båda barnen', /Ella[\s\S]*Leo/.test(await f.textContent('#barnen')));
  koll('Haris får «Nytt syskon»', pushLogg.some(x => x.title === 'Nytt syskon' && /Leo/.test(x.text)));
  const dubbel = await j('POST', '/mina/syskon', { barn: 'leo' }, ftok);
  koll('samma namn två gånger nekas', !dubbel.ok && /finns redan/.test(dubbel.fel || ''), dubbel.fel);

  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN).sort((x, y) => (y.syskonTill ? 1 : 0) - (x.syskonTill ? 1 : 0))) await adm('DELETE', `/admin/klient/${k.id}`);
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close(); mock.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
