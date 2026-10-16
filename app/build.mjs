// Bygger app/www/ – prototypen som den ligger i iOS-appen (Capacitor):
//   - index.html, css/, js/, data/, assets/ (logga, ikon, omslag) och de små filmerna (media/small → media/)
//   - DM Sans läggs lokalt i vendor/, så att appen ser rätt ut utan nät
//   node build.mjs   (körs av "npm run build" / "npm run sync" och i codemagic.yaml)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const APP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(APP, '..');
const WWW = path.join(APP, 'www');
const NM = path.join(APP, 'node_modules');

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
const small = path.join(ROOT, 'media', 'small');
if (!fs.existsSync(small)) throw new Error('media/small saknas – kör python tools/transcode.py --small först');
copyDir(small, path.join(WWW, 'media'), f => f.endsWith('.mp4'));

// vendor/: DM Sans (variabelt typsnitt) i stället för Google Fonts
const vendor = path.join(WWW, 'vendor', 'fonts');
fs.mkdirSync(vendor, { recursive: true });
const fontDir = path.join(NM, '@fontsource-variable/dm-sans/files');
const faces = fs.readdirSync(fontDir).filter(f => /^dm-sans-latin(-ext)?-wght-(normal|italic)\.woff2$/.test(f));
let css = '';
for (const f of faces) {
  fs.copyFileSync(path.join(fontDir, f), path.join(vendor, f));
  const italic = /italic/.test(f);
  css += `@font-face { font-family: "DM Sans"; font-style: ${italic ? 'italic' : 'normal'}; font-weight: 100 1000; font-display: swap; src: url("fonts/${f}") format("woff2"); }\n`;
}
fs.writeFileSync(path.join(WWW, 'vendor', 'fonts.css'), css);

// index.html: Google Fonts → vendor/fonts.css, ingen service worker-registrering behövs (capacitor:-schema ≠ https)
const idx = path.join(WWW, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const n = (html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/g) || []).length;
if (n !== 1) throw new Error(`index.html: hittade ${n} Google Fonts-rader (väntade 1)`);
html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/, '<link rel="stylesheet" href="vendor/fonts.css">');
html = html.replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"( crossorigin)?>/g, '');
if (/fonts\.googleapis|fonts\.gstatic/.test(html)) throw new Error('index.html har kvar Google Fonts');
fs.writeFileSync(idx, html);

const size = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`app/www: ${(size(WWW) / 1e6).toFixed(1)} MB, ${faces.length} typsnittsfiler`);
