// Ny version av appen i App Store (Carl 2026-11-22: "lägga in i appen högst upp när det finns en ny version … att man
// ska uppdatera den i App Store"). Webben laddar redan om sig själv (kollaNyVersion i app.js), men det inbyggda, som
// kalendern i 1.2, kommer bara med en ny app från App Store. Appen frågar Apples öppna sök-API vilken version som ligger
// ute och visar en rad överst om den är nyare än den som är installerad. Bara i iOS-appen; ✕ döljer raden för den versionen.
const APP_ID = '6825529179';
const BUTIK = `https://apps.apple.com/se/app/cap/id${APP_ID}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nyare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ok */ } } };
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ok */ } } };

async function butiksVersion() {
  // högst en fråga i halvtimmen
  try { const c = JSON.parse(ss.get('cap_butik') || 'null'); if (c && Date.now() - c.t < 30 * 60e3) return c; } catch { /* ok */ }
  const r = await fetch(`https://itunes.apple.com/lookup?id=${APP_ID}&country=se&t=${Math.floor(Date.now() / 60e3)}`).then(x => x.json()).catch(() => null);
  const a = r?.results?.[0];
  if (!a?.version) return null;
  const c = { version: a.version, nyheter: String(a.releaseNotes || '').split(/\r?\n/)[0].slice(0, 120), t: Date.now() };
  ss.set('cap_butik', JSON.stringify(c));
  return c;
}

export async function kollaAppVersion() {
  const C = window.Capacitor;
  if (!C?.isNativePlatform?.() || !C.isPluginAvailable?.('App')) return;
  const [info, butik] = await Promise.all([C.Plugins.App.getInfo().catch(() => null), butiksVersion()]);
  document.getElementById('app-uppdatera')?.remove();
  if (!info?.version || !butik || !nyare(butik.version, info.version) || ls.get('cap_uppd_dold') === butik.version) return;
  const rad = document.createElement('div');
  rad.id = 'app-uppdatera';
  rad.className = 'app-uppdatera';
  rad.innerHTML = `<div class="au-text"><b>Ny version av CAP: ${esc(butik.version)}</b>${butik.nyheter ? `<span>${esc(butik.nyheter)}</span>` : '<span>Uppdatera i App Store för att få det nya.</span>'}</div>
    <a class="au-knapp" href="${BUTIK}">Uppdatera</a>
    <button type="button" class="au-stang" aria-label="Dölj">✕</button>`;
  rad.querySelector('.au-stang').addEventListener('click', () => { ls.set('cap_uppd_dold', butik.version); rad.remove(); });
  document.querySelector('header.top')?.after(rad);
}
