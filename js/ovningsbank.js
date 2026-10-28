// Övningsbanken (Carl 2026-10-28): samma övningar som Excel-filen till Haris, ur data/ovningsbank.json
// (python tools/ovningsbank.py --json). Delas av Admin → Övningar och passen (filmklippet i kör-läget).
let bank = null, hamtar = null;
export function hamtaBank() {
  if (bank) return Promise.resolve(bank);
  return hamtar ||= fetch('data/ovningsbank.json', { cache: 'no-cache' }).then(r => r.json())
    .then(d => (bank = d.ovningar || [])).catch(() => { hamtar = null; return []; });
}
export const bankNu = () => bank;
export const ovning = id => bank?.find(o => o.id === id) || null;

// Vart de valda övningarna ska: passet Haris redigerar ({ passId, uid, titel, barn }), annars ett nytt pass
let mal = null;
export const sattMal = m => { mal = m; };
export const malNu = () => mal;

// En övning blir ett block i passet. Tidtagningar blir tidtagning, konbanan bedömning, resten övning.
const TYP = { Tidtagning: 'tid', Bedömning: 'bedomning' };
export const blockAv = o => ({ typ: TYP[o.typ] || 'ovning', titel: o.namn, desc: o.desc, minuter: o.tid || 5, fardighet: o.fardighet[0] || '', mal: o.maltid || 0, varv: 3, ovningId: o.id });

// Filmklippet ur Haris film: spelaren börjar vid start och stannar vid slut
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const klippHtml = o => `<div class="player portrait manuell ov-klipp"><video controls playsinline preload="metadata" src="${esc(o.film.url)}#t=${o.film.start},${o.film.slut}" poster="${esc(o.film.poster)}" data-start="${o.film.start}" data-slut="${o.film.slut}"></video></div>`;
export function kopplaKlipp(root) {
  root.querySelectorAll('video[data-slut]').forEach(v => {
    if (v.dataset.kopplad) return;
    v.dataset.kopplad = '1';
    const a = +v.dataset.start, b = +v.dataset.slut;
    v.addEventListener('loadedmetadata', () => { if (v.currentTime < a) v.currentTime = a; });
    v.addEventListener('play', () => { if (v.currentTime < a || v.currentTime >= b - 0.2) v.currentTime = a; });
    v.addEventListener('timeupdate', () => { if (v.currentTime >= b) v.pause(); });
  });
}
