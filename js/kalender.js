// Passen i telefonens kalender (Carl 2026-11-22: "vi gör ett nytt bygge som gör så att de prenumererar på
// kalenderflödet"). Från app 1.2 finns det inbyggda tillägget CapKalender (app/ios/App/App/CapKalender.swift): appen
// håller en egen kalender, CAP, i takt med familjens bokningar. Telefonen frågar en gång om lov, första gången
// föräldern har ett bokat pass. Sedan synkas kalendern varje gång bokningarna hämtas: efter en bokning eller
// avbokning, när appen öppnas och när Haris bokar något. I äldre appar och på webben finns inget tillägg, och
// då visas länkarna till kalenderprenumerationen i stället (boka.js).
const LS = 'cap_kalender';
const las = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };
const spara = d => { try { localStorage.setItem(LS, JSON.stringify(d)); } catch { /* ok */ } };

function tillagg() {
  try {
    const C = window.Capacitor;
    if (!C?.isNativePlatform?.() || !C.isPluginAvailable?.('CapKalender')) return null;
    return C.Plugins?.CapKalender || C.registerPlugin?.('CapKalender') || null;
  } catch { return null; }
}
export const kalStod = () => !!tillagg();
// telefonens tillstånd för kalendern: ja | fraga | nej | skriv (bara lägga till), null utan tillägget
export async function kalStatus() { const p = tillagg(); if (!p) return null; try { return (await p.status())?.behorighet || null; } catch { return null; } }
// pa: synkar · av: föräldern stängde av · nekad: telefonen sa nej
export const kalLage = () => { const s = las(); return !kalStod() ? 'saknas' : s.nekad ? 'nekad' : s.av ? 'av' : s.pa ? 'pa' : 'ny'; };

const platsFor = b => (b.plats ? `${b.plats}${/göteborg/i.test(b.plats) ? '' : ', Göteborg'}` : 'Backavallen, Göteborg');
const idag = () => new Date().toLocaleDateString('sv-SE');
// Larmen (Carl 2026-11-24: "en notis kommer 24h innan, och att man får en notis när det är dags att åka"): 24 timmar
// före och familjens restid före (45 min om inget annat är valt under Inställningar). Äldre appar (1.2–1.3) kan bara ha
// ett larm, paminnMin, och får då "dags att åka".
const RESTID = 45;
export const kalRestid = () => { const r = +las().restid; return r >= 5 && r <= 180 ? r : RESTID; };
export function sattRestid(n) { const r = Math.round(+n); if (!(r >= 5 && r <= 180)) return; const s = las(); if (s.restid !== r) spara({ ...s, restid: r }); }
function handelser(bokningar) {
  const restid = kalRestid();
  return (bokningar || []).filter(b => b.datum >= idag()).map(b => ({
    id: `${b.v}-${b.id}`,
    titel: `Träning med CAP${b.barn ? ` (${b.barn})` : ''}`,
    start: new Date(`${b.datum}T${b.start}:00`).toISOString(),
    slut: new Date(`${b.datum}T${b.slut}:00`).toISOString(),
    plats: platsFor(b),
    anteckning: `Påminnelser: dagen före och ${restid} minuter före, när det är dags att åka. Restiden ändrar du under Inställningar i CAP. Kan ni inte komma? Avboka i appen under Med Haris, senast 24 timmar före.`,
    paminnMin: restid,
    larm: [1440, restid],
  }));
}

let pagar = null;
// fraga: be telefonen om lov om det inte är bestämt. Utan fraga synkas bara när föräldern redan sagt ja.
export async function kalSynk(bokningar, { fraga = false, tvinga = false } = {}) {
  const p = tillagg();
  if (!p) return null;
  const s = las();
  if (s.av && !tvinga) return null;
  const lista = handelser(bokningar);
  // första gången: fråga först när det finns ett pass att lägga in
  if (!s.pa && !tvinga && (!fraga || s.fragat || !lista.length)) return null;
  const sig = JSON.stringify(lista);
  if (s.pa && !tvinga && s.sig === sig && Date.now() - (s.t || 0) < 6 * 3600e3) return null;
  if (pagar) return pagar;
  pagar = (async () => {
    try {
      const r = await p.synka({ handelser: lista, fraga: fraga || tvinga });
      if (r?.ok) spara({ ...las(), pa: true, av: false, sig, t: Date.now(), fragat: true });
      else spara({ ...las(), fragat: true, nekad: r?.behorighet === 'nej' || r?.behorighet === 'skriv' });
      // servern skickar inga påminnelsenotiser när båda larmen ligger i kalendern (app 1.4 svarar larm: true)
      document.dispatchEvent(new CustomEvent('cap:kalender', { detail: { larm: !!(r?.ok && r.larm) } }));
      return r;
    } catch (e) { return { ok: false, fel: String(e?.message || e) }; } finally { pagar = null; }
  })();
  return pagar;
}
// Sista steget hoppades över: fråga inte av sig självt när första passet bokas (knappen på Boka finns kvar)
export function kalFragat() { const s = las(); if (!s.pa) spara({ ...s, fragat: true }); }
// Stäng av: CAP-kalendern tas bort från telefonen
export async function kalAv() {
  const p = tillagg();
  spara({ ...las(), pa: false, av: true, sig: '' });
  if (p) { try { await p.avsluta(); } catch { /* ok */ } }
  document.dispatchEvent(new CustomEvent('cap:kalender', { detail: { larm: false } }));
}
// Utloggning och raderat konto: kalendern tas bort, och nästa förälder på telefonen får frågan på nytt
export async function kalAvsluta() {
  const p = tillagg();
  try { localStorage.removeItem(LS); } catch { /* ok */ }
  if (p) { try { await p.avsluta(); } catch { /* ok */ } }
}
