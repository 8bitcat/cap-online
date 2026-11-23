// Träningsblocken (Carl 2026-11-23: "ja till alla produkter, det knyter vi till stegen senare i träningsbiten").
// Engångsköp i App Store (köp i appen, @capgo/native-purchases från app 1.3). Servern kontrollerar Apples signatur
// (server/cap-api/src/apple.js) och lägger blocket på familjens konto, så det följer kontot och gäller syskonen.
// Vilka steg ett block låser upp: nod.block i stigen (Haris ändrar under Admin → Stigen), annars efter etapp:
// etapp 1 gratis, 2 = niva2, 3 = niva3, 4–5 = matchfart, och steg för en viss position = position.
import { store } from './store.js';
import { api } from './api.js';
import { minaNu, hamtaMina } from './boka.js';

const BUNDLE = 'se.completeathletic.caponline';
export const BLOCK = [
  { id: 'niva2', ikon: '⚽', namn: 'Nivå 2: Passa och dribbla', pris: 129, text: 'Etapp 2 på stigen: passningar, dribblingar, titta upp och positionens första steg.', ger: ['niva2'] },
  { id: 'niva3', ikon: '🌀', namn: 'Nivå 3: Finter och koordination', pris: 149, text: 'Etapp 3: koordination, snabba fötter, finter i fart och att vara en bra lagkamrat.', ger: ['niva3'] },
  { id: 'matchfart', ikon: '🔥', namn: 'Nivå 4–5: Matchfart', pris: 199, text: 'Etapp 4 och 5: första touch under press, ytor och tid, avslut i fart, en mot en. Diplomet Matchvinnare.', ger: ['matchfart'] },
  { id: 'position', ikon: '🧤', namn: 'Positionsblocket', pris: 249, text: 'Stegen för barnets position, för anfallare, mittfältare, back och målvakt.', ger: ['position'] },
  { id: 'stigen', ikon: '🏆', namn: 'Hela stigen', pris: 499, text: 'Alla fyra blocken ovan på en gång.', ger: ['niva2', 'niva3', 'matchfart', 'position'] },
  { id: 'plus', ikon: '⭐', namn: 'CAP Hemma Plus', pris: 999, text: 'Hela stigen, alla block som kommer, och ett personligt hemmaprogram från Haris.', ger: ['niva2', 'niva3', 'matchfart', 'position', 'plus'] },
];
const sku = id => `${BUNDLE}.block.${id}`;
const kr = n => `${n.toLocaleString('sv-SE')} kr`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// det familjen låst upp, sparat så att stigen ritas rätt direkt vid start (servern är facit)
const LS = 'cap_block';
const lasLokalt = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null') || { block: [], kopta: [] }; } catch { return { block: [], kopta: [] }; } };
let agt = lasLokalt();
function satt(r) {
  if (!Array.isArray(r?.block)) return;
  agt = { block: r.block, kopta: r.kopta || [] };
  try { localStorage.setItem(LS, JSON.stringify(agt)); } catch { /* ok */ }
}
export const blockRensa = () => { agt = { block: [], kopta: [] }; try { localStorage.removeItem(LS); } catch { /* ok */ } };
// anropas när /mina hämtats
export function blockFranMina(m) { if (m && Array.isArray(m.block)) satt(m); }
// Låsen gäller bara i appar som kan köpa (från 1.3). Äldre appar och webben har stigen öppen som förut.
export const harBlock = id => !butikFinns() || !id || id === 'gratis' || agt.block.includes(id) || agt.block.includes('plus');
export const koptBlock = id => agt.kopta.includes(id) || BLOCK.find(b => b.id === id)?.ger.every(g => agt.block.includes(g));

// vilket block ett steg i stigen hör till
export function nodBlock(n) {
  if (n.block) return n.block;
  if (n.position?.length) return 'position';
  return n.etapp <= 1 ? 'gratis' : n.etapp === 2 ? 'niva2' : n.etapp === 3 ? 'niva3' : 'matchfart';
}
export const blockNamn = id => BLOCK.find(b => b.id === id)?.namn || '';
// billigaste produkten som låser upp blocket
export const blockKop = id => BLOCK.filter(b => b.ger.includes(id)).sort((a, b) => a.pris - b.pris)[0] || null;

// ---------- Apple ----------
const plugin = () => { try { const C = window.Capacitor; return C?.isNativePlatform?.() && C.isPluginAvailable?.('NativePurchases') ? C.Plugins.NativePurchases : null; } catch { return null; } };
export const butikFinns = () => !!plugin();
let priser = null, hamtarPriser = false;
async function hamtaPriser() {
  const P = plugin();
  if (!P || priser || hamtarPriser) return priser;
  hamtarPriser = true;
  try {
    const r = await P.getProducts({ productIdentifiers: BLOCK.map(b => sku(b.id)), productType: 'inapp' });
    const m = {};
    for (const x of r?.products || []) if (x?.identifier) m[x.identifier] = String(x.priceString || '');
    priser = m;
  } catch { priser = {}; } finally { hamtarPriser = false; }
  return priser;
}
const prisText = b => priser?.[sku(b.id)] || kr(b.pris);

async function skicka(tx) {
  if (!tx?.jwsRepresentation) return { ok: false, fel: 'Apple skickade inget kvitto' };
  const r = await api.post('/mina/kop', { jws: tx.jwsRepresentation }, store.session?.token);
  if (r.ok) satt(r);
  return r;
}

let upptagen = null;
async function kopa(id) {
  const P = plugin(), b = BLOCK.find(x => x.id === id);
  if (!P || !b || upptagen) return { ok: false };
  upptagen = id;
  try {
    const tx = await P.purchaseProduct({ productIdentifier: sku(id), productType: 'inapp', quantity: 1, isConsumable: false });
    const r = await skicka(tx);
    return r.ok ? { ok: true, b } : { ok: false, fel: r.fel };
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/pending/i.test(msg)) return { ok: false, fel: 'Köpet väntar på att bli godkänt (Be om att köpa). Blocket öppnas när det är klart.' };
    if (/cancel/i.test(msg)) return { ok: false, avbrutet: true };
    return { ok: false, fel: 'Köpet gick inte igenom. Försök igen om en stund.' };
  } finally { upptagen = null; }
}
// Återställ köp: allt som Apple-kontot köpt skickas till servern igen (ny telefon, eller om kontrollen missade)
async function aterstall({ tyst = false } = {}) {
  const P = plugin();
  if (!P) return { ok: false };
  try {
    if (!tyst) await P.restorePurchases();
    const r = await P.getPurchases({ productType: 'inapp', onlyCurrentEntitlements: true });
    let n = 0, fel = '';
    for (const tx of r?.purchases || []) {
      if (!String(tx?.productIdentifier || '').startsWith(`${BUNDLE}.block.`)) continue;
      const s = await skicka(tx);
      if (s.ok) n++; else fel = s.fel;
    }
    return { ok: true, n, fel };
  } catch { return { ok: false, fel: 'Det gick inte att återställa just nu.' }; }
}
// Vid start i appen: köp som godkänns senare ("Be om att köpa") kommer som transactionUpdated
let lyssnar = false;
export function blockStart() {
  const P = plugin();
  if (!P || lyssnar) return;
  lyssnar = true;
  try { P.addListener('transactionUpdated', tx => { if (store.session?.token) skicka(tx).then(r => { if (r.ok) document.dispatchEvent(new CustomEvent('cap:block')); }); }); } catch { /* ok */ }
}

// ---------- sidan Träningsblock ----------
let ui = null;
export function blockInit(deps) { ui = deps; document.addEventListener('cap:block', () => { if (/^#\/(block|stig)/.test(location.hash)) ui.route(); }); }

export function blockPage(valt) {
  const inloggad = !!store.session?.token;
  if (inloggad && !minaNu().hamtat) hamtaMina().then(ui.kvar());
  if (butikFinns() && !priser) hamtaPriser().then(ui.kvar());
  const app = butikFinns();
  const kort = BLOCK.map(b => {
    const ag = koptBlock(b.id);
    return `<div class="panel block-kort ${ag ? 'agt' : ''} ${valt === b.id ? 'valt' : ''}" id="block-${b.id}">
      <div class="block-rad"><span class="block-ikon" aria-hidden="true">${b.ikon}</span><div class="block-mitt"><b>${esc(b.namn)}</b><small>${esc(b.text)}</small></div></div>
      <div class="block-fot">${ag ? '<span class="inst-chip ja">✓ Ert</span>'
        : app ? `<button class="btn grad" data-action="block-kop" data-id="${b.id}" ${upptagen ? 'disabled' : ''}>${upptagen === b.id ? 'Köper…' : `Köp ${esc(prisText(b))}`}</button>`
        : `<span class="small muted">${kr(b.pris)}</span>`}</div>
    </div>`;
  }).join('');
  return `
  <a class="back" href="#/stig">‹ Stigen</a>
  <section><div class="eyebrow">Träna själv</div><h1>Träningsblock</h1>
    <p class="muted">Etapp 1 på stigen är gratis. Blocken öppnar fler steg med filmer, tider och frågor från Haris. Ni köper en gång och har dem sedan för alltid, för alla barn på kontot.</p></section>
  ${inloggad ? '' : '<section class="note">Logga in först, så hamnar blocken på ert konto.</section>'}
  ${app ? '' : window.Capacitor?.isNativePlatform?.() ? '<section class="note">Blocken köps i den nya versionen av appen. <a href="https://apps.apple.com/se/app/cap/id6825529179">Uppdatera CAP i App Store ›</a></section>' : '<section class="note">Blocken köps i iPhone-appen CAP.</section>'}
  <section class="block-lista">${kort}</section>
  ${app ? `<section class="btn-row"><button class="btn secondary block" data-action="block-aterstall">Återställ köp</button></section>
  <p class="small muted" style="text-align:center">Köpet dras från ditt Apple-konto. Har ni köpt på en annan telefon, tryck Återställ köp.</p>` : ''}`;
}

export async function blockAction(action, el) {
  const { toast } = ui;
  if (action === 'block-kop') {
    if (!store.session?.token) { toast('Logga in först'); ui.go('/login'); return true; }
    const id = el.dataset.id;
    const om = ui.kvar();
    setTimeout(om, 0);
    const r = await kopa(id);
    if (r.ok) toast(`${r.b.ikon} ${r.b.namn} är upplåst. Tack!`);
    else if (!r.avbrutet && r.fel) toast(r.fel);
    om(); return true;
  }
  if (action === 'block-aterstall') {
    el.disabled = true; el.textContent = 'Återställer…';
    const r = await aterstall();
    toast(!r.ok ? (r.fel || 'Gick inte') : r.n ? `${r.n} ${r.n === 1 ? 'köp' : 'köp'} återställda` : r.fel || 'Inga köp att återställa på det här Apple-kontot');
    ui.route(); return true;
  }
  return false;
}
// tester
export const _block = { satt, lasLokalt: () => agt };
