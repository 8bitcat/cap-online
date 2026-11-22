// Ny version av appen i App Store (Carl 2026-11-22: "lägga in i appen högst upp när det finns en ny version … att man
// ska uppdatera den i App Store", sedan: "en knapp mellan loggan och notisklockan … kommer man direkt till App Store").
// Webben laddar redan om sig själv (kollaNyVersion i app.js), men det inbyggda, som kalendern i 1.2, kommer bara med en
// ny app från App Store. Appen frågar Apples öppna sök-API vilken version som ligger ute, och är den nyare än den
// installerade visas knappen Uppdatera i toppen. Bara i iOS-appen.
const APP_ID = '6825529179';
const BUTIK = `https://apps.apple.com/se/app/cap/id${APP_ID}`;
const nyare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ok */ } } };

async function butiksVersion() {
  // högst en fråga i halvtimmen
  try { const c = JSON.parse(ss.get('cap_butik') || 'null'); if (c && Date.now() - c.t < 30 * 60e3) return c; } catch { /* ok */ }
  const r = await fetch(`https://itunes.apple.com/lookup?id=${APP_ID}&country=se&t=${Math.floor(Date.now() / 60e3)}`).then(x => x.json()).catch(() => null);
  const a = r?.results?.[0];
  if (!a?.version) return null;
  const c = { version: a.version, t: Date.now() };
  ss.set('cap_butik', JSON.stringify(c));
  return c;
}

export async function kollaAppVersion() {
  const C = window.Capacitor;
  if (!C?.isNativePlatform?.() || !C.isPluginAvailable?.('App')) return;
  const [info, butik] = await Promise.all([C.Plugins.App.getInfo().catch(() => null), butiksVersion()]);
  const fore = document.getElementById('app-uppdatera');
  if (!info?.version || !butik || !nyare(butik.version, info.version)) { fore?.remove(); return; }
  if (fore) return;
  const knapp = document.createElement('a');
  knapp.id = 'app-uppdatera';
  knapp.className = 'top-uppdatera';
  knapp.href = BUTIK;
  knapp.setAttribute('aria-label', `Uppdatera CAP till version ${butik.version} i App Store`);
  knapp.title = `Ny version ${butik.version} i App Store`;
  knapp.innerHTML = '<span aria-hidden="true">⬆</span> Uppdatera';
  // mellan loggan och notisklockan: först i högra gruppen i toppen
  const hoger = document.querySelector('header.top .top-right');
  if (hoger) hoger.prepend(knapp); else document.querySelector('header.top')?.append(knapp);
}
