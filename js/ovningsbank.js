// Övningsbanken (Carl 2026-10-28): samma övningar som Excel-filen till Haris, ur data/ovningsbank.json
// (python tools/ovningsbank.py --json). Delas av Admin → Övningar och passen (filmklippet i kör-läget).
// Haris ändringar (Carl 2026-11-25: "lägga upp nya och ta bort övningar … och lägga till filmer") ligger på servern
// (/admin/ovningsbank) och läggs ovanpå grundfilen: ändrade övningar ersätter sina original, nya läggs sist och
// borttagna försvinner. Utan admininloggning visas grundfilen.
import { api } from './api.js';
import { store } from './store.js';
let bank = null, hamtar = null, grund = null, medAdmin = false;
export function hamtaBank() {
  if (bank) return Promise.resolve(bank);
  return hamtar ||= (async () => {
    try {
      grund = grund || (await (await fetch('data/ovningsbank.json', { cache: 'no-cache' })).json()).ovningar || [];
      const r = store.admin ? await api.admin.get('/admin/ovningsbank') : null;
      const andr = r?.ok ? r.ovningar || {} : {}, borta = new Set(r?.ok ? r.borta || [] : []);
      medAdmin = !!r?.ok;
      const ut = grund.filter(o => !borta.has(o.id)).map(o => andr[o.id] ? { ...o, ...andr[o.id] } : o);
      for (const [id, o] of Object.entries(andr)) if (!grund.some(g => g.id === id) && !borta.has(id)) ut.push(o);
      return (bank = ut);
    } catch { return []; } finally { hamtar = null; }
  })();
}
export const bankLaddaOm = () => { bank = null; return hamtaBank(); };
// banken med Haris ändringar (läses om bara om den hämtades utan admininloggning)
export const bankMedAndringar = () => bank && medAdmin ? Promise.resolve(bank) : bankLaddaOm();
export const grundOvning = id => grund?.find(o => o.id === id) || null;
export function bankSatt(o) { if (!bank) return; const i = bank.findIndex(x => x.id === o.id); const g = grundOvning(o.id); const ny = g ? { ...g, ...o } : o; if (i >= 0) bank[i] = ny; else bank.push(ny); }
export function bankBort(id) { if (bank) bank = bank.filter(o => o.id !== id); }
export const bankNu = () => bank;
export const ovning = id => bank?.find(o => o.id === id) || null;

// Vart de valda övningarna ska: passet Haris redigerar ({ passId, uid, titel, barn }), annars ett nytt pass
let mal = null;
export const sattMal = m => { mal = m; };
export const malNu = () => mal;

// En övning blir ett block i passet. Tidtagningar blir tidtagning, konbanan bedömning, resten övning.
const TYP = { Tidtagning: 'tid', Bedömning: 'bedomning' };
export const blockAv = o => ({ typ: TYP[o.typ] || 'ovning', titel: o.namn, desc: o.desc, minuter: o.tid || 5, fardighet: (o.fardighet || [])[0] || '', mal: o.maltid || 0, varv: 3, ovningId: o.id });

// Filmklippet ur Haris film: spelaren börjar vid start och stannar vid slut
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const klippHtml = o => `<div class="player portrait manuell ov-klipp"><video controls playsinline preload="metadata" src="${esc(o.film.url)}#t=${+o.film.start || 0}${o.film.slut ? `,${o.film.slut}` : ''}" poster="${esc(o.film.poster || '')}" data-start="${+o.film.start || 0}" data-slut="${o.film.slut || 99999}"></video></div>`;
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
