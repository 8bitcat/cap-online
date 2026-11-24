// Passen i telefonens kalender (app 1.2, CapKalender.swift). Webbdelen testas med ett låtsat tillägg: telefonen
// "frågar om lov" och svarar ja, och varje synk sparas så att testet kan se vad appen skickade.
// Kör lokalt som schema-test.js (wrangler dev med TEST_LAGE:1, serve.py 8808).
const { chromium, devices } = require('playwright');
const path = require('path');
const base = 'http://127.0.0.1:8808/', API = 'http://127.0.0.1:8787';
const UT = process.env.UT || __dirname;
const TEL = '070-444 55 11', TELN = '+46704445511';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  let fel = 0;
  const koll = (namn, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${namn}${extra ? ` | ${extra}` : ''}`); if (!ok) fel++; };
  const veckaOm = n => { const d = new Date(Date.now() + n * 7 * 864e5); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return `${x.getUTCFullYear()}-W${String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
  const V = veckaOm(2);
  const nyFlik = async (namn, app) => {
    const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
    await ctx.addInitScript(([api, app]) => {
      try { localStorage.setItem('cap_api', api); } catch {}
      if (!app) return;
      // låtsad iOS-app med bara kalendertillägget
      window.__kal = { anrop: [], behorighet: 'fraga', handelser: {} };
      const K = {
        status: async () => ({ behorighet: window.__kal.behorighet }),
        synka: async o => {
          window.__kal.anrop.push(JSON.parse(JSON.stringify(o)));
          if (window.__kal.behorighet === 'fraga') { if (!o.fraga) return { ok: false, behorighet: 'fraga' }; window.__kal.behorighet = window.__kal.svar || 'ja'; }
          if (window.__kal.behorighet !== 'ja') return { ok: false, behorighet: window.__kal.behorighet };
          const fore = Object.keys(window.__kal.handelser); let skapade = 0;
          const nya = {}; for (const h of o.handelser) { if (!window.__kal.handelser[h.id]) skapade++; nya[h.id] = h; }
          window.__kal.handelser = nya;
          return { ok: true, behorighet: 'ja', skapade, andrade: 0, borttagna: fore.filter(id => !nya[id]).length };
        },
        avsluta: async () => { window.__kal.avslutad = (window.__kal.avslutad || 0) + 1; window.__kal.handelser = {}; return { ok: true }; },
      };
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: n => n === 'CapKalender', Plugins: { CapKalender: K }, getPlatform: () => 'ios' };
    }, [API, app]);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(namn + ': ' + e.message)); return p;
  };
  const kal = p => p.evaluate(() => window.__kal);

  // Haris: kund och en vecka med två tider
  const a = await nyFlik('haris', false);
  await a.goto(base + 'index.html#/login', { waitUntil: 'networkidle' });
  await a.click('#anv-lage');
  for (let i = 0; i < 4 && !/admin\/(idag|klienter)/.test(a.url()); i++) { await a.fill('#anv', 'haris@test.se'); await a.fill('#losen', 'testlosen'); await a.click('form[data-form=login] button[type=submit]'); await a.waitForURL(/#\/admin\/(idag|klienter)/, { timeout: 8000 }).catch(() => {}); }
  const tok = await a.evaluate(() => JSON.parse(localStorage.getItem('caponline.v3') || '{}').admin);
  const adm = (m, p, d) => fetch(API + p, { method: m, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: d ? JSON.stringify(d) : undefined }).then(r => r.json());
  await adm('PUT', '/admin/config/betalning', { swish: '1232852762', pris: 850 });
  for (const k of (await adm('GET', '/admin/klienter')).klienter.filter(x => x.telefon === TELN)) await adm('DELETE', `/admin/klient/${k.id}`);
  const ny = await adm('POST', '/admin/klient', { foralder: 'Sara', telefon: TEL, barn: 'Leo', efternamn: 'Exempel', fodd: 2016 });
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  const auto = await adm('POST', `/admin/vecka/${V}/auto`, { schema: [{ dag: 2, pa: true, start: '15:00', slut: '17:00' }], langd: 60, plats: 'Backavallen, Gratts Arena', ersatt: true });
  await adm('PUT', `/admin/vecka/${V}`, { oppen: true, slots: auto.vecka.slots, notis: false });
  const [t15, t16] = auto.vecka.slots;

  // föräldern i "appen": inga pass än → ingen fråga
  const f = await nyFlik('förälder', true);
  await f.goto(base + 'index.html#/k/' + ny.kod, { waitUntil: 'networkidle' }); await f.waitForSelector('#losen1');
  await f.fill('#losen1', 'hemligt1'); await f.fill('#losen2', 'hemligt1'); await f.click('form[data-form=losen] button[type=submit]');
  await f.waitForFunction(() => document.querySelector('#name') || document.querySelector('.greet'), null, { timeout: 15000 });
  if (await f.$('#name')) { await f.selectOption('#fodd', '2016'); await f.click('form[data-form=wiz1] button'); await f.waitForURL(/kom-igang/, { timeout: 10000 }); await f.evaluate(() => { location.hash = '#/'; }); } // Sista steget testas i intro-test.js
  await f.waitForSelector('.greet');
  await f.goto(base + `index.html#/boka/${V}`); await f.waitForSelector(`button.tid[data-slot="${t15.id}"]`, { timeout: 15000 }); await f.waitForTimeout(800);
  koll('inga pass: telefonen frågar inte än', (await kal(f)).anrop.length === 0);
  koll('knappen Lägg in alla pass i kalendern', !!(await f.$('[data-action=boka-kal-pa]')) && !(await f.$('.kal-feed a[href^="webcal"]')));

  // första bokningen → telefonen frågar, passet läggs in
  await f.click(`button.tid[data-slot="${t15.id}"]`); await f.waitForSelector('.hall [data-action=boka-bekrafta]');
  await f.click('.hall [data-action=boka-bekrafta]');
  await f.waitForFunction(() => window.__kal.anrop.length > 0, null, { timeout: 10000 }).catch(() => {});
  let k = await kal(f);
  const h = k.anrop[0]?.handelser?.[0];
  koll('efter bokningen: frågar om lov och lägger in passet', k.anrop[0]?.fraga === true && k.anrop[0].handelser.length === 1, JSON.stringify(k.anrop[0] || {}).slice(0, 120));
  koll('händelsen: rubrik, plats, larm dagen före och 45 min före (dags att åka)', h?.titel === 'Träning med CAP (Leo)' && h.plats === 'Backavallen, Gratts Arena, Göteborg' && h.paminnMin === 45 && h.larm?.join() === '1440,45' && /dags att åka/.test(h.anteckning), JSON.stringify(h?.larm));
  const man = (await adm('GET', '/admin/veckor')).mandag[V];
  const tis = new Date(Date.parse(`${man}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  koll('rätt tid (15:00 svensk tid)', h?.start === new Date(`${tis}T15:00:00+01:00`).toISOString() && h.slut === new Date(`${tis}T16:00:00+01:00`).toISOString(), `${h?.start} – ${h?.slut}`);
  if (await f.$('[data-action=boka-ark-stang]')) await f.click('[data-action=boka-ark-stang]');
  await f.waitForSelector('#mina .kal-feed', { timeout: 10000 });
  koll('raden: Passen läggs in i kalendern CAP', (await f.$eval('#mina .kal-feed', e => e.textContent)).includes('kalendern CAP'), (await f.$eval('#mina .kal-feed', e => e.textContent)).trim().slice(0, 80));
  await (await f.$('#mina')).screenshot({ path: path.join(UT, 'kalender-1-pa.png') });

  // Haris bokar en tid till → nästa hämtning lägger in den; Haris avbokar → den tas bort
  await adm('POST', `/admin/klient/${ny.klient.id}/boka`, { v: V, slot: t16.id });
  await f.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await f.waitForFunction(() => Object.keys(window.__kal.handelser).length === 2, null, { timeout: 10000 }).catch(() => {});
  koll('Haris bokning kommer in när appen öppnas igen', Object.keys((await kal(f)).handelser).length === 2);
  await adm('POST', `/admin/klient/${ny.klient.id}/avboka`, { v: V, slot: t15.id });
  await f.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await f.waitForFunction(() => Object.keys(window.__kal.handelser).length === 1, null, { timeout: 10000 }).catch(() => {});
  k = await kal(f);
  koll('avbokad tid tas bort ur kalendern', Object.keys(k.handelser).length === 1 && Object.keys(k.handelser)[0].endsWith(t16.id));
  const antal = k.anrop.length;
  await f.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await f.waitForTimeout(1500);
  koll('inget nytt anrop när inget ändrats', (await kal(f)).anrop.length === antal);

  // stäng av → kalendern tas bort, ingen synk efter det
  await f.goto(base + 'index.html#/mer'); await f.goto(base + `index.html#/boka/${V}`); await f.waitForSelector('#mina [data-action=boka-kal-av]', { timeout: 10000 });
  await f.click('#mina [data-action=boka-kal-av]'); await f.click('#mina [data-action=boka-kal-av]');
  await f.waitForFunction(() => window.__kal.avslutad >= 1, null, { timeout: 5000 }).catch(() => {});
  koll('Stäng av tar bort kalendern CAP', (await kal(f)).avslutad === 1);
  await adm('POST', `/admin/klient/${ny.klient.id}/boka`, { v: V, slot: t15.id });
  const fore = (await kal(f)).anrop.length;
  await f.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await f.waitForTimeout(1500);
  koll('avstängd: ingen synk', (await kal(f)).anrop.length === fore);
  await f.waitForSelector('#mina [data-action=boka-kal-pa]', { timeout: 10000 });
  await f.click('#mina [data-action=boka-kal-pa]');
  await f.waitForFunction(() => Object.keys(window.__kal.handelser).length === 2, null, { timeout: 10000 }).catch(() => {});
  koll('slå på igen: båda passen in', Object.keys((await kal(f)).handelser).length === 2);

  // utloggning tar bort kalendern
  await f.evaluate(async () => { const m = await import('./js/api.js'); await m.loggaUt(); });
  await f.waitForTimeout(500);
  koll('utloggning tar bort kalendern', (await kal(f)).avslutad === 2);

  // webben utan tillägget: prenumerationslänken som förut
  const w = await nyFlik('webb', false);
  await w.goto(base + 'index.html#/k/' + (await adm('POST', `/admin/klient/${ny.klient.id}/lank`, { typ: 'logga', ny: true })).kod, { waitUntil: 'networkidle' });
  await w.waitForFunction(() => document.querySelector('#losen1') || document.querySelector('.greet') || document.querySelector('#losen'), null, { timeout: 15000 });
  if (await w.$('#losen1')) { await w.fill('#losen1', 'hemligt2'); await w.fill('#losen2', 'hemligt2'); await w.click('form[data-form=losen] button[type=submit]'); }
  await w.waitForSelector('.greet', { timeout: 15000 }).catch(() => {});
  await w.goto(base + `index.html#/boka/${V}`); await w.waitForSelector('#mina .kal-feed', { timeout: 15000 }).catch(() => {});
  koll('webben: länken till prenumerationen', !!(await w.$('#mina .kal-feed a[href^="webcal://"]')));

  await adm('DELETE', `/admin/klient/${ny.klient.id}`);
  await adm('PUT', `/admin/vecka/${V}`, { oppen: false, slots: [] });
  koll('inga sidfel', !errs.length, errs.join(' | '));
  await b.close();
  console.log(fel ? `${fel} FEL` : 'ALLT GRÖNT');
  process.exit(fel ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
