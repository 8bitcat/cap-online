// Utveckling (Carl 2026-10-23): förälderns sida för spelaren. Nivån Haris satt, bedömningarna som diagram
// (konbana 32 s → 27 s …), filmerna och ljudet från passen, och passen Haris delat.
import { store } from './store.js';
import { minaNu, hamtaMina } from './boka.js';
import { diagram, sammanfattning } from './diagram.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const fmtIso = iso => { const [y, m, d] = String(iso || '').split('-'); return m ? `${+d} ${MAN[+m - 1]} ${y}` : ''; };
const fmtSek = s => `${Number(s).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
let ui = null, C = null;
export function utvecklingInit(deps) { ui = deps; C = deps.content; }
const nivaNamn = n => C?.game?.levels?.find(l => l.n === n)?.name || `Nivå ${n}`;

export function utvecklingPage() {
  const u = store.session?.user;
  const p = store.profile;
  if (!u) return `
  <section class="hero" style="padding-top:30px"><div class="eyebrow">Utveckling</div><h1>${esc(p?.name || 'Spelaren')}s utveckling</h1>
    <p class="lead">Här syns nivån Haris satt, bedömningarna över tid och filmerna från passen. Det kräver ett konto hos Haris.</p>
    <a class="btn grad" href="#/login">Logga in</a></section>`;
  const m = minaNu();
  if (!m.hamtat) { hamtaMina().then(ui.kvar()); return `<section class="empty"><p class="muted">Hämtar…</p></section>`; }
  // hämta om i bakgrunden om kopian är gammal, så nivå och bedömningar hänger med
  hamtaMina().then(ny => { if (ny.hamtat !== m.hamtat && location.hash.replace(/^#/, '') === '/utveckling') ui.route(); });
  const k = m.klient;
  const alla = m.bedomningar || [];
  const typer = [...new Map(alla.map(b => [b.typ, b.namn])).entries()];
  const media = (m.media || []).slice().sort((a, b) => (b.t || '').localeCompare(a.t || ''));
  const namn = k?.barn || p?.name || 'Spelaren';
  return `
  <section>
    <div class="eyebrow">Utveckling</div>
    <h1>${esc(namn)}</h1>
    ${k ? `<div class="panel brand">
      <div class="section-head"><h3>Nivå hos Haris</h3><span class="small muted">${k.nivaHistorik?.length > 1 ? `senast ändrad ${fmtIso(k.nivaHistorik.at(-1).t.slice(0, 10))}` : ''}</span></div>
      <div class="niva-tal" style="margin:6px 0"><b>${k.niva}</b><span>${esc(nivaNamn(k.niva))} · nivå ${k.niva} av 5</span></div>
      <div class="niva-skala">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= k.niva ? 'on' : ''}"></i>`).join('')}</div>
      ${k.nivaHistorik?.length > 1 ? `<p class="small muted" style="margin:10px 0 0">${k.nivaHistorik.slice().reverse().slice(0, 4).map(h => `${fmtIso(h.t.slice(0, 10))}: nivå ${h.niva}${h.kommentar && h.kommentar !== 'Start' ? ` – ${esc(h.kommentar)}` : ''}`).join('<br>')}</p>` : '<p class="small muted" style="margin:10px 0 0">Haris höjer nivån när han ser att det sitter.</p>'}
    </div>` : '<p class="muted small">Kontot är inte kopplat till registret än. Be Haris lägga in er med mobilnumret.</p>'}
  </section>
  <section>
    <h2>Bedömningar</h2>
    ${!alla.length ? '<p class="muted small">När Haris tar tid på en bedömning under ett pass, till exempel konbanan, syns resultatet här med en kurva över tid.</p>'
      : typer.map(([typ, namnT]) => {
        const rader = alla.filter(b => b.typ === typ).sort((a, b) => (a.datum + a.t).localeCompare(b.datum + b.t));
        const punkter = rader.map(b => ({ datum: b.datum, varde: b.medel }));
        return `<div class="panel bed-typ">
          <div class="section-head"><h3>${esc(namnT)}</h3><span class="small muted">${rader.length} ${rader.length === 1 ? 'tillfälle' : 'tillfällen'}</span></div>
          ${diagram(punkter)}
          <p class="small" style="margin:6px 0 10px">${esc(sammanfattning(punkter))}</p>
          <ul class="list small">${rader.slice().reverse().map(b => `<li><b>${fmtIso(b.datum)}</b> · medel <b>${fmtSek(b.medel)}</b>${b.varv.length > 1 ? ` · bäst ${fmtSek(b.bast)} (${b.varv.map(v => fmtSek(v)).join(', ')})` : ''}${b.kommentar ? `<div class="muted">${esc(b.kommentar)}</div>` : ''}</li>`).join('')}</ul>
        </div>`;
      }).join('')}
  </section>
  <section>
    <h2>Filmer och ljud från passen</h2>
    ${media.length ? `<div class="media-lista">${media.map(x => `<div class="media-item"><div class="small"><b>${x.typ === 'audio' ? '🎙' : '🎥'} ${esc(x.titel || x.namn)}</b><div class="muted">${esc((x.t || '').slice(0, 10))}</div></div>
      ${x.typ === 'audio' ? `<audio controls preload="none" src="${esc(x.url)}"></audio>` : `<div class="player portrait manuell" style="max-height:50vh;margin:8px 0"><video controls playsinline preload="metadata" src="${esc(x.url)}" poster="${esc(x.poster || '')}"></video></div>`}</div>`).join('')}</div>`
      : '<p class="muted small">Det Haris filmar och spelar in under era pass hamnar här.</p>'}
  </section>
  <section>
    <div class="section-head"><h2>Pass med Haris</h2><a class="small" href="#/boka">Boka ›</a></div>
    ${m.planer?.length ? `<div class="cards">${m.planer.map(pl => `<a class="card" href="#/med-haris/${pl.id}"><div class="card-body"><div class="eyebrow">${esc(pl.datum)}</div><h3>${esc(pl.titel)}</h3><p class="desc">${pl.block.length} moment · ${pl.block.filter(b => b.resultat).length} bedömningar · ${pl.block.reduce((n, b) => n + (b.media?.length || 0) + (b.film ? 1 : 0), 0)} inspelningar</p></div></a>`).join('')}</div>` : '<p class="muted small">När Haris delat ett pass med er syns det här.</p>'}
  </section>`;
}
