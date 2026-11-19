// Litet linjediagram i SVG för bedömningar: ett tillfälle per punkt, medeltiden på y-axeln.
// Lägre är bättre för tider, så förbättringar markeras med ▼. Ingen beroende, ritas som text.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const kort = iso => { const [, m, d] = String(iso || '').split('-'); return m ? `${+d} ${MAN[+m - 1]}` : ''; };
const fmt = (v, enhet) => `${(Math.round(v * 10) / 10).toLocaleString('sv-SE')}${enhet ? ' ' + enhet : ''}`;

// punkter: [{ datum, varde, label? }] i tidsordning. Returnerar SVG som sträng (viewBox, skalar med bredden).
export function diagram(punkter, { enhet = 's', lagreBattre = true, hojd = 170 } = {}) {
  const p = (punkter || []).filter(x => x && isFinite(+x.varde));
  if (!p.length) return '<p class="muted small">Inga tillfällen än.</p>';
  const W = 360, H = hojd, L = 44, R = 18, T = 30, B = 30;
  const vals = p.map(x => +x.varde);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  const pad = (max - min) * 0.18; min -= pad; max += pad; if (min < 0 && Math.min(...vals) >= 0) min = 0;
  const x = i => p.length === 1 ? L + (W - L - R) / 2 : L + (W - L - R) * i / (p.length - 1);
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  const linje = p.map((d, i) => `${x(i).toFixed(1)},${y(+d.varde).toFixed(1)}`).join(' ');
  const yt = [min, (min + max) / 2, max];
  const bast = lagreBattre ? Math.min(...vals) : Math.max(...vals);
  return `<svg class="diagram" viewBox="0 0 ${W} ${H}" role="img" aria-label="${p.length} tillfällen, ${fmt(vals[0], enhet)} till ${fmt(vals.at(-1), enhet)}">
    ${yt.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" class="ax" text-anchor="end">${fmt(v, '')}</text>`).join('')}
    ${p.length > 1 ? `<polyline points="${linje}" class="linje"/>` : ''}
    ${p.map((d, i) => { const v = +d.varde, f = i > 0 ? v - +p[i - 1].varde : 0; const battre = i > 0 && (lagreBattre ? f < 0 : f > 0);
      // etiketterna fästs så de inte krockar med y-axeln (första) eller klipps i kanten (sista)
      const ankare = p.length === 1 ? 'middle' : i === 0 ? 'start' : i === p.length - 1 ? 'end' : 'middle';
      const tx = ankare === 'start' ? x(i) + 9 : ankare === 'end' ? x(i) - 9 : x(i);
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${v === bast ? 6 : 4.5}" class="punkt ${v === bast ? 'bast' : ''}"/>
      <text x="${tx.toFixed(1)}" y="${(y(v) - 11).toFixed(1)}" class="varde" text-anchor="${ankare}">${fmt(v, enhet)}${i > 0 ? `<tspan class="${battre ? 'battre' : 'samre'}"> ${battre ? '▼' : f === 0 ? '' : '▲'}${f !== 0 ? Math.abs(Math.round(f * 10) / 10).toLocaleString('sv-SE') : ''}</tspan>` : ''}</text>
      <text x="${x(i).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="${ankare}">${esc(d.label || kort(d.datum))}</text>`; }).join('')}
  </svg>`;
}

// Sammanfattning i ord: "32,0 s → 27,6 s, 4,4 s bättre på 3 tillfällen"
export function sammanfattning(punkter, { enhet = 's', lagreBattre = true } = {}) {
  const p = (punkter || []).filter(x => isFinite(+x.varde));
  if (p.length < 2) return p.length === 1 ? `Första tillfället: ${fmt(+p[0].varde, enhet)}.` : '';
  const a = +p[0].varde, b = +p.at(-1).varde, d = b - a, battre = lagreBattre ? d < 0 : d > 0;
  return `${fmt(a, enhet)} → ${fmt(b, enhet)}: ${fmt(Math.abs(d), enhet)} ${battre ? 'bättre' : d === 0 ? 'oförändrat' : 'sämre'} på ${p.length} tillfällen.`;
}
