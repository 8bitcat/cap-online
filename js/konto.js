// Inloggning med kod (Carl 2026-10-21): Haris skapar en inbjudan i admin → föräldern får en kod
// (och en länk). Koden ger ett konto på mejladressen och en lång session på den här enheten.
// Telefonens egen låsning skyddar sedan appen – ingen extra PIN i prototypen.
import { store } from './store.js';
import { loggaInMedKod } from './api.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function loginPage({ kod = '', fel = '' } = {}) {
  return `
  <section class="hero" style="padding-top:40px">
    <img class="hero-logo" src="assets/cap-logo.png" alt="CAP – Complete Athletic Performance">
    <div class="eyebrow">CAP Online</div>
    <h1>Välkommen</h1>
    <p class="lead">Har du fått en kod av Haris? Skriv in den så skapas ditt konto på en gång. Har du fått en länk räcker det att öppna den.</p>
  </section>
  <section class="panel">
    <form data-form="kod">
      <div class="field">
        <label for="kod">Din kod</label>
        <input type="text" id="kod" name="kod" value="${esc(kod)}" placeholder="T.ex. ABC-234" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="8" style="font-size:22px;letter-spacing:.2em;text-align:center;font-weight:700">
        ${fel ? `<span class="hint" style="color:var(--danger)">${esc(fel)}</span>` : '<span class="hint">Sex tecken, stora bokstäver och siffror. Bindestrecket spelar ingen roll.</span>'}
      </div>
      <button class="btn grad block" type="submit">Logga in</button>
    </form>
  </section>
  <section class="panel">
    <h3>Ingen kod än?</h3>
    <p class="small muted">Koden kommer från Haris när ni bestämt er. Vill du bara titta: <a data-action="gast" href="#/">prova utan konto</a>. Det du gör sparas då bara i den här webbläsaren.</p>
  </section>
  <p class="small muted" style="text-align:center;margin-top:24px"><a href="#/admin">Admin</a> · för Haris och Carl</p>`;
}

// #/k/KOD – länken ur inbjudan loggar in direkt
export async function loggaInViaLank(kod, { toast, go }) {
  const r = await loggaInMedKod(kod);
  if (!r.ok) { toast(r.fel || 'Koden fungerade inte'); return go('/login'); }
  efterInloggning(r.user, { toast });
  go('/prototyper');
}

export function efterInloggning(user, { toast }) {
  store.guest = false;
  if (user?.barn && !store.profile) store.draft = { ...store.draft, name: user.barn };
  toast(`Välkommen${user?.namn ? ', ' + user.namn : ''}!`);
}

export function kontoRad() {
  const s = store.session;
  if (s?.user) return `<span class="small muted">Inloggad som <b>${esc(s.user.email)}</b></span> · <a data-action="logga-ut" href="#/login">Logga ut</a>`;
  if (store.guest) return `<span class="small muted">Du provar utan konto.</span> · <a href="#/login">Logga in med kod</a>`;
  return '';
}
