// Betala med Swish Företag (Carl 2026-10-27): "går det att göra en länk så att allt är förifyllt? priset för passet
// och numret". Swish Företag har inget API, så appen kan inte se vem som betalat. Länken öppnar Swish med Haris
// nummer, beloppet och ett meddelande ifyllt och låsta, och Haris bockar av betalningen i admin.
//
// Formatet följer Swish egen specifikation (developer.swish.nu → Guides → Generate QR codes):
//   https://app.swish.nu/1/p/sw/?sw=<nummer>&amt=<belopp med punkt>&msg=<URL-kodat>
// Belopp och meddelande blir låsta när de finns med (edit=amt,msg skulle låsa upp dem). Ingen cur-parameter.
// Meddelandet: a–ö, A–Ö, 0–9, mellanslag och !?(),.-:; och högst 50 tecken. app.swish.nu är en universell länk,
// så den öppnar Swish-appen direkt på telefonen. Utan Swish visar sidan var man laddar ner appen.

const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const TILLATET = /[a-zA-Z0-9åäöÅÄÖ !?(),.:;-]/;

export function swishMeddelande(text) {
  return [...String(text ?? '').normalize('NFC')].map(c => {
    if (TILLATET.test(c)) return c;
    if (/[‐-―]/.test(c)) return '-';
    const bas = c.normalize('NFD')[0];  // é → e, ü → u
    return /[a-zA-Z]/.test(bas) ? bas : ' ';
  }).join('').replace(/\s+/g, ' ').trim().slice(0, 50).trim();
}

export function swishLank(nr, belopp, msg = '') {
  const amt = (Math.round(Number(belopp) * 100) / 100).toFixed(2);
  const m = swishMeddelande(msg);
  return `https://app.swish.nu/1/p/sw/?sw=${encodeURIComponent(nr)}&amt=${amt}${m ? `&msg=${encodeURIComponent(m)}` : ''}`;
}

// 1232852762 → 123 285 27 62, som på Swish egna skyltar
export function visaSwish(nr) {
  const d = String(nr || '');
  if (/^123\d{7}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  if (/^467\d{8}$/.test(d)) return `0${d.slice(2, 4)}-${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  return d;
}

// Meddelandet Haris ser i sin Swish: "CAP Alva Lind 3 nov kl 17.00"
export function bokningsMeddelande(b, efternamn = '') {
  const d = b.datum ? new Date(b.datum + 'T12:00:00') : null;
  const namn = [b.barn, efternamn].filter(Boolean).join(' ');
  return swishMeddelande(`CAP ${namn} ${d ? `${d.getDate()} ${MAN[d.getMonth()]}` : ''} kl ${String(b.start || '').replace(':', '.')}`);
}

export const kr = n => `${Number(n).toLocaleString('sv-SE')} kr`;

// Meddelandet för ett paket: "CAP Alva Lind paket 10 pass"
export function paketMeddelande(p, barn = '', efternamn = '') {
  const namn = [barn, efternamn].filter(Boolean).join(' ');
  return swishMeddelande(`CAP ${namn} ${/paket/i.test(p.namn) ? '' : 'paket '}${p.namn}`);
}

// För Haris: Swish Företag säger inget till appen. Haris ser betalningen i sin Swish (meddelandet ovan) och bockar
// av den i admin. "Swishad" betyder att föräldern tryckt "Jag har swishat".
export function betalStatus(b) {
  if (b.paket) return `<span class="small"><span class="i-paket">Ingår i paket</span></span>`;
  const pris = b.pris ? `${kr(b.pris)} · ` : '';
  if (b.betald) return `<span class="small">${pris}<span class="betald">Betald ✓</span></span>`;
  if (b.swishad) return `<span class="small">${pris}<span class="swishad">Swishad enligt föräldern</span>, kolla din Swish</span>`;
  return `<span class="small muted">${pris}Inte betald</span>`;
}
