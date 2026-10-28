// Bygger app/www/ för iOS-appen (Capacitor).
//
// Appen laddar prototypen från https://8bitcat.github.io/cap-online/ (server.url i
// capacitor.config.json), så varje `python tools/deploy-pages.py` uppdaterar appen utan
// nytt TestFlight-bygge. Det som byggs in här används bara när nätet saknas:
//   - error.html (visas av Capacitor när sidan inte går att ladda, server.errorPath)
//   - en liten kopia av appen utan filmer, som reserv om vi någon gång stänger av server.url
//   node build.mjs   (körs av "npm run build" / "npm run sync" och i codemagic.yaml)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const APP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(APP, '..');
const WWW = path.join(APP, 'www');
const NM = path.join(APP, 'node_modules');
const REMOTE = JSON.parse(fs.readFileSync(path.join(APP, 'capacitor.config.json'), 'utf8')).server?.url || '';

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

const copyDir = (from, to, filter = () => true) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d, filter);
    else if (filter(s)) fs.copyFileSync(s, d);
  }
};

for (const f of ['index.html', 'manifest.json']) fs.copyFileSync(path.join(ROOT, f), path.join(WWW, f));
for (const d of ['css', 'js', 'data']) copyDir(path.join(ROOT, d), path.join(WWW, d));
copyDir(path.join(ROOT, 'assets'), path.join(WWW, 'assets'));
// Inga filmer i paketet: appen spelar dem från webben. Reservkopian faller tillbaka på Drive-länkarna.

// vendor/: DM Sans (variabelt typsnitt) i stället för Google Fonts i reservkopian
const vendor = path.join(WWW, 'vendor', 'fonts');
fs.mkdirSync(vendor, { recursive: true });
const fontDir = path.join(NM, '@fontsource-variable/dm-sans/files');
const faces = fs.readdirSync(fontDir).filter(f => /^dm-sans-latin(-ext)?-wght-(normal|italic)\.woff2$/.test(f));
let css = '';
for (const f of faces) {
  fs.copyFileSync(path.join(fontDir, f), path.join(vendor, f));
  css += `@font-face { font-family: "DM Sans"; font-style: ${/italic/.test(f) ? 'italic' : 'normal'}; font-weight: 100 1000; font-display: swap; src: url("fonts/${f}") format("woff2"); }\n`;
}
fs.writeFileSync(path.join(WWW, 'vendor', 'fonts.css'), css);

const idx = path.join(WWW, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const n = (html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/g) || []).length;
if (n !== 1) throw new Error(`index.html: hittade ${n} Google Fonts-rader (väntade 1)`);
html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/, '<link rel="stylesheet" href="vendor/fonts.css">');
html = html.replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"( crossorigin)?>/g, '');
if (/fonts\.googleapis|fonts\.gstatic/.test(html)) throw new Error('index.html har kvar Google Fonts');
fs.writeFileSync(idx, html);

// error.html: visas när webben inte går att nå. Knappen laddar om mot webben.
fs.writeFileSync(path.join(WWW, 'error.html'), `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>CAP</title>
<link rel="stylesheet" href="vendor/fonts.css">
<style>
  html, body { height: 100%; margin: 0; }
  body { background: #000912; color: #fdfdfd; font-family: "DM Sans", system-ui, sans-serif; display: grid; place-items: center; text-align: center;
         padding: max(16px, env(safe-area-inset-left)) ; }
  main { max-width: 32ch; }
  img { height: 44px; margin-bottom: 22px; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  p { color: #9aa5b1; line-height: 1.5; margin: 0 0 20px; }
  button { font: inherit; font-weight: 700; background: linear-gradient(90deg, #0a9e9a, #00d4cb 55%, #00f0ff); color: #00242a; border: 0; border-radius: 12px; padding: 14px 22px; min-height: 48px; }
</style></head>
<body><main>
  <img src="assets/cap-logo.png" alt="CAP">
  <h1>Ingen anslutning</h1>
  <p>CAP hämtar alltid den senaste versionen från webben. Koppla upp telefonen och försök igen.</p>
  <button onclick="location.href='${REMOTE}'">Försök igen</button>
</main></body></html>
`);

const size = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`app/www: ${(size(WWW) / 1e6).toFixed(1)} MB (reservkopia utan filmer + error.html). Appen laddar ${REMOTE || 'den inbyggda kopian'}`);
