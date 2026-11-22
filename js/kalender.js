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
// pa: synkar · av: föräldern stängde av · nekad: telefonen sa nej
export const kalLage = () => { const s = las(); return !kalStod() ? 'saknas' : s.nekad ? 'nekad' : s.av ? 'av' : s.pa ? 'pa' : 'ny'; };

const platsFor = b => (b.plats ? `${b.plats}${/göteborg/i.test(b.plats) ? '' : ', Göteborg'}` : 'Backavallen, Göteborg');
const idag = () => new Date().toLocaleDateString('sv-SE');
function handelser(bokningar) {
  return (bokningar || []).filter(b => b.datum >= idag()).map(b => ({
    id: `${b.v}-${b.id}`,
    titel: `Träning med CAP${b.barn ? ` (${b.barn})` : ''}`,
    start: new Date(`${b.datum}T${b.start}:00`).toISOString(),
    slut: new Date(`${b.datum}T${b.slut}:00`).toISOString(),
    plats: platsFor(b),
    anteckning: 'Påminnelsen kommer en timme före: dags att åka till Backavallen. Kan ni inte komma? Avboka i appen under Med Haris.',
    paminnMin: 60,
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
      if (r?.ok) spara({ pa: true, sig, t: Date.now(), fragat: true });
      else spara({ ...las(), fragat: true, nekad: r?.behorighet === 'nej' || r?.behorighet === 'skriv' });
      return r;
    } catch (e) { return { ok: false, fel: String(e?.message || e) }; } finally { pagar = null; }
  })();
  return pagar;
}
// Stäng av: CAP-kalendern tas bort från telefonen
export async function kalAv() {
  const p = tillagg();
  spara({ ...las(), pa: false, av: true, sig: '' });
  if (p) { try { await p.avsluta(); } catch { /* ok */ } }
}
// Utloggning och raderat konto: kalendern tas bort, och nästa förälder på telefonen får frågan på nytt
export async function kalAvsluta() {
  const p = tillagg();
  try { localStorage.removeItem(LS); } catch { /* ok */ }
  if (p) { try { await p.avsluta(); } catch { /* ok */ } }
}
