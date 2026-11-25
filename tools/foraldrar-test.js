// Fler föräldrar på samma konto (Haris 2026-11-25: "om mamma och pappa vill ha tillgång till barnets spelarkort … att
// jag knappar in två olika telefonnummer"; Carl: "föräldrarna ska kunna bjuda in en annan förälder eller så gör Haris
// det till samma konto"). Kör lokalt som passfilm-test.js.
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/';
const API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const A = '070-444 55 80', AN = '+46704445580', B = '070-444 55 81', BN = '+46704445581', C = '070-444 55 82', CN = '+46704445582', D = '070-444 55 83';

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = []; let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const j = (m, p, d, t) => fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: d ? JSON.stringify(d) : undefined }).then(async r => ({ status: r.status, ...(await r.json()) }));
  const adm0 = (await j('POST', '/auth/login', { anvandare: 'haris@test.se', losen: 'testlosen' })).admin;
  const adm = (m, p, d) => j(m, p, d, adm0);
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => [AN, BN, CN].includes(x.telefon)).sort((x, y) => (y.syskonTill ? 1 : 0) - (x.syskonTill ? 1 : 0))) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Sara', telefon: A, barn: 'Mia', efternamn: 'Exempel', fodd: 2016 });
  const kid = ny.klient.id;
  const sara = (await j('POST', '/auth/kod', { kod: ny.kod })).token;
  await j('POST', '/auth/pin', { losen: 'saraslosen' }, sara);

  // föräldern bjuder in Ali
  const inb = await j('POST', '/mina/foralder', { namn: 'Ali', telefon: B }, sara);
  koll('Sara bjuder in Ali: kod och sms-text', inb.ok && /^\d{6}$/.test(inb.foralder?.kod || '') && /Ali/.test(inb.text) && /070-444 55 81/.test(inb.text), inb.fel || '');
  const kodB = inb.foralder.kod;
  const ali = await j('POST', '/auth/login', { anvandare: B, losen: kodB });
  koll('Ali loggar in med sitt nummer och koden', ali.ok && ali.nyttLosen && ali.user?.namn === 'Ali' && ali.user.klientId === kid, ali.fel || JSON.stringify(ali.user));
  await j('POST', '/auth/pin', { losen: 'alislosen1' }, ali.token);
  const ali2 = await j('POST', '/auth/login', { anvandare: B, losen: 'alislosen1' });
  const sara2 = await j('POST', '/auth/login', { anvandare: A, losen: 'saraslosen' });
  koll('båda loggar in med eget lösenord', ali2.ok && sara2.ok && ali2.user.namn === 'Ali' && sara2.user.namn === 'Sara');
  koll('koden slutar gälla när Ali valt lösenord', !(await j('POST', '/auth/login', { anvandare: B, losen: kodB })).ok);
  const minaAli = await j('GET', '/mina', null, ali2.token);
  koll('Ali ser samma barn och båda föräldrarna', minaAli.ok && minaAli.klient?.id === kid && minaAli.foraldrar.length === 2 && minaAli.foraldrar.find(f => f.du)?.namn === 'Ali', JSON.stringify(minaAli.foraldrar));
  const glomt = await j('POST', '/auth/glomt', { telefon: B });
  koll('glömt lösenordet fungerar för Ali', glomt.ok, glomt.fel || glomt.meddelande);

  // Haris lägger till mormor
  const mor = await adm('POST', `/admin/klient/${kid}/foralder`, { namn: 'Mormor', telefon: C });
  koll('Haris lägger till ett tredje nummer', mor.ok && /^\d{6}$/.test(mor.kod) && mor.klient.foraldrar.length === 2, mor.fel || '');
  koll('mormor loggar in med koden', (await j('POST', '/auth/login', { anvandare: C, losen: mor.kod })).ok);
  koll('samma nummer två gånger nekas', (await j('POST', '/mina/foralder', { namn: 'X', telefon: A }, sara)).status === 409 && (await adm('POST', `/admin/klient/${kid}/foralder`, { namn: 'X', telefon: B })).status === 409);

  // appen: Inställningar hos Sara, och kundsidan hos Haris
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  await ctx.addInitScript(([api, ses]) => {
    try { localStorage.setItem('cap_api', api); const d = JSON.parse(localStorage.getItem('caponline.v3') || '{}'); d.session = ses; d.notiser = { intro: true, introVer: '1.4', fragat: true }; d.profile = { name: 'Mia', efternamn: 'Exempel', fodd: '2016', age: '10', position: 'mitt', foot: 'Höger', experience: 'Spelat 1–2 år', drom: '', difficulties: [], freq: '2', mer: false }; localStorage.setItem('caponline.v3', JSON.stringify(d)); } catch { /* ok */ }
  }, [API, { token: sara2.token, user: sara2.user, t: Date.now(), nyttLosen: false }]);
  const f = await ctx.newPage(); f.on('pageerror', e => errs.push(e.message));
  await f.goto(base + 'index.html#/installningar', { waitUntil: 'networkidle' }); await f.waitForSelector('#foraldrar', { timeout: 10000 }).catch(() => {});
  const lista = await f.textContent('#foraldrar').catch(() => '');
  koll('Inställningar: Sara (du), Ali och Mormor', /Sara.*\(du\)/.test(lista) && /Ali/.test(lista) && /Mormor/.test(lista), lista.replace(/\s+/g, ' ').slice(0, 160));
  await f.click('#foraldrar summary'); await f.fill('#forNamn', 'Farfar'); await f.fill('#forTel', D);
  await f.click('form[data-form=inst-foralder] button[type=submit]');
  await f.waitForSelector('#foraldrar a[href^="sms:"]', { timeout: 10000 }).catch(() => {});
  const smsHref = await f.$eval('#foraldrar a[href^="sms:"]', a => a.getAttribute('href')).catch(() => '');
  koll('bjud in i appen: Skicka inbjudan öppnar Meddelanden med texten', smsHref.startsWith('sms:+46704445583') && decodeURIComponent(smsHref).includes('Farfar'), smsHref.slice(0, 60));
  await f.screenshot({ path: path.join(UT, 'foraldrar-1-installningar.png'), fullPage: true });

  // Ali tas bort av Sara: utloggad och numret släpps
  const aliId = minaAli.foraldrar.find(x => x.du).id;
  const bort = await j('DELETE', `/mina/foralder/${aliId}`, null, sara2.token);
  koll('Sara tar bort Ali', bort.ok, bort.fel || '');
  koll('Ali är utloggad och numret finns inte längre', (await j('GET', '/mina', null, ali2.token)).status === 401 && (await j('POST', '/auth/login', { anvandare: B, losen: 'alislosen1' })).status === 404);

  // radera kontot: alla nummer släpps
  await adm('DELETE', `/admin/klient/${kid}`);
  koll('raderat konto: mormors nummer släppt', (await j('POST', '/auth/login', { anvandare: C, losen: mor.kod })).status === 404);
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
