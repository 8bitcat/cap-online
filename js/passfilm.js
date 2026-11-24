// Filmerna från passen (Carl 2026-11-24): tiden syns ovanpå filmen ("lägga assessment i filmen, en konbana där vi
// filmar och tar tid"), och samma moment från två pass kan ses bredvid varandra ("ha filmen från första passet och
// jämföra med andra passet"). Används av Haris filmbank, förälderns pass och sidan Utveckling.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const fmtSek = s => `${Number(s).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
export const fmtDag = iso => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return m ? `${+d} ${MAN[+m - 1]}${y && y !== String(new Date().getFullYear()) ? ` ${y}` : ''}` : ''; };

// En film med en etikett ovanpå, t.ex. "Konbana · 27,4 s"
export function filmMedTid({ url, poster = '', etikett = '', under = '' }) {
  return `<figure class="pf-film">
    <div class="pf-ram"><video controls playsinline preload="metadata" src="${esc(url)}" ${poster ? `poster="${esc(poster)}"` : ''}></video>${etikett ? `<span class="pf-tid">${esc(etikett)}</span>` : ''}</div>
    ${under ? `<figcaption class="small muted">${under}</figcaption>` : ''}
  </figure>`;
}

// Två filmer bredvid varandra med tiderna. a = först, b = senast: { url, poster, datum, sek, namn }
export function jamforHtml(a, b, rubrik = '') {
  const skill = a.sek && b.sek ? b.sek - a.sek : null;
  const text = skill == null ? '' : skill < 0 ? `${fmtSek(-skill)} snabbare 🎉` : skill > 0 ? `${fmtSek(skill)} långsammare` : 'samma tid';
  return `<div class="pf-jamfor">
    ${rubrik ? `<div class="section-head"><h3>${esc(rubrik)}</h3>${text ? `<span class="small"><b>${text}</b></span>` : ''}</div>` : ''}
    <div class="pf-par">
      ${filmMedTid({ url: a.url, poster: a.poster, etikett: a.sek ? fmtSek(a.sek) : '', under: `Först · ${fmtDag(a.datum)}` })}
      ${filmMedTid({ url: b.url, poster: b.poster, etikett: b.sek ? fmtSek(b.sek) : '', under: `Senast · ${fmtDag(b.datum)}` })}
    </div>
    <button class="btn secondary block" data-pf-spela>▶ Spela båda samtidigt</button>
  </div>`;
}

// Bedömningar av samma slag som har en film: [{bed, film}] äldst först.
// media: filmerna på barnet (med planId/blockId/bedId/url), bedomningar: barnets bedömningar
export function serieMedFilm(bedomningar = [], media = [], namn = null) {
  const ut = [];
  for (const b of bedomningar.filter(x => namn == null || x.namn === namn)) {
    const film = media.find(m => m.typ === 'video' && m.url && ((b.mediaId && m.id === b.mediaId) || (m.bedId && m.bedId === b.id) || (b.planId && m.planId === b.planId && m.blockId === b.blockId)));
    if (film) ut.push({ bed: b, film });
  }
  return ut.sort((x, y) => String(x.bed.datum + x.bed.t).localeCompare(String(y.bed.datum + y.bed.t)));
}
// Jämförelsen för en bedömning (först mot senast), eller '' om det inte finns två filmer
// namn = null: bedömningarna är redan av samma slag. rubrik visas ovanför.
export function serieJamfor(bedomningar, media, namn = null, rubrik = '') {
  const s = serieMedFilm(bedomningar, media, namn);
  if (s.length < 2) return '';
  const f = s[0], l = s.at(-1);
  return jamforHtml({ url: f.film.url, poster: f.film.poster, datum: f.bed.datum, sek: f.bed.medel }, { url: l.film.url, poster: l.film.poster, datum: l.bed.datum, sek: l.bed.medel }, rubrik || `${namn || 'Filmerna'}: första och senaste`);
}

// "Spela båda samtidigt"
export function kopplaJamfor(root) {
  root.querySelectorAll('[data-pf-spela]').forEach(k => {
    k.onclick = e => {
      e.preventDefault();
      const v = [...k.closest('.pf-jamfor').querySelectorAll('video')];
      v.forEach(x => { x.muted = true; x.currentTime = 0; });
      Promise.all(v.map(x => x.play().catch(() => {})));
    };
  });
}
