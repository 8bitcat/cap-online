// Lokal lagring i prototypen. Byts mot backend när betalsätt och konto är valt.
// Nyckeln bumpades 2026-10-16 (Carl: "nollställ hela artefakten"): allt som
// sparats under äldre nycklar rensas vid start så att alla börjar från tomt.
const KEY = 'caponline.v3';
const OLD = 'caponline.v2';

function load() {
  try {
    ['caponline.v1', 'caponline.v2'].forEach(k => localStorage.removeItem(k));
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch { return {}; }
}
const data = Object.assign(
  { proto: null, library: [], logs: [], profile: null, draft: {}, requests: [], steps: {}, plans: [], modules: {}, demo: 0 },
  load()
);
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* privat läge m.m. */ }
}

export const store = {
  // Vald prototyp: 'bibliotek' | 'spelare' | 'utbildning' | null
  get proto() { return data.proto; },
  set proto(p) { data.proto = p; save(); },

  // Bibliotek
  get library() { return data.library.slice(); },
  has(id) { return data.library.includes(id); },
  add(id) { if (!this.has(id)) { data.library.push(id); save(); } },
  remove(id) { data.library = data.library.filter(x => x !== id); save(); },

  // Loggade pass (sessionId är ett pass-id eller ett plan-id)
  logs(id) { return id ? data.logs.filter(l => l.sessionId === id) : data.logs.slice(); },
  addLog(log) {
    data.logs.push(Object.assign({ id: Date.now().toString(36), date: today() }, log));
    save();
  },

  // Avbockade moment i ett pass (nollas när passet loggas)
  stepsDone(id) { return data.steps[id] || []; },
  setStepDone(id, index, done) {
    const set = new Set(data.steps[id] || []);
    done ? set.add(index) : set.delete(index);
    data.steps[id] = [...set];
    save();
  },
  clearSteps(id) { delete data.steps[id]; save(); },

  // Barnprofil + utkast under startguiden
  get profile() { return data.profile; },
  set profile(p) { data.profile = p; save(); },
  get draft() { return data.draft || {}; },
  set draft(d) { data.draft = d; save(); },

  // Planerade pass
  plans() { return data.plans.slice(); },
  plan(id) { return data.plans.find(p => p.id === id); },
  addPlan(p) { data.plans.push(p); save(); },

  // Utbildningsmoduler: { [id]: { done, score, sent, date } }
  get modules() { return data.modules; },
  setModule(id, patch) { data.modules[id] = Object.assign({}, data.modules[id], patch, { date: today() }); save(); },

  // Förhandsvisning av progression i utbildningsvägen (0 = verklig, 1, 2)
  get demo() { return data.demo || 0; },
  set demo(v) { data.demo = v; save(); },

  // Konto: { token, user } från koden, eller gäst utan konto
  get session() { return data.session || null; },
  set session(s) { data.session = s; save(); },
  get guest() { return !!data.guest; },
  set guest(v) { data.guest = !!v; save(); },
  get admin() { return data.admin || null; },
  set admin(t) { data.admin = t; save(); },
  // Filmer från servern (kopia för offline)
  get filmer() { return data.filmer || []; },
  set filmer(f) { data.filmer = f; save(); },

  // Träningsstigen: { done: {nod: t}, tider: {nod: [{sek, t}]}, video: {nod: {t, namn, status}} }
  get stig() { return Object.assign({ done: {}, tider: {}, video: {} }, data.stig || {}); },
  stigKlar(id) { const s = this.stig; s.done[id] = today(); data.stig = s; save(); },
  stigTid(id, sek) { const s = this.stig; (s.tider[id] = s.tider[id] || []).push({ sek, t: new Date().toISOString() }); data.stig = s; save(); },
  stigVideo(id, info) { const s = this.stig; s.video[id] = Object.assign({ t: new Date().toISOString(), dag: today(), status: 'skickad' }, info); data.stig = s; save(); },

  // Notiser i appen: { paminn, push, token }
  get notiser() { return Object.assign({ paminn: false, push: false, token: null }, data.notiser || {}); },
  set notiser(n) { data.notiser = n; save(); },

  // Förfrågningar till Haris (prototyp: sparas bara lokalt)
  get requests() { return data.requests.slice(); },
  addRequest(req) {
    data.requests.push(Object.assign({ id: Date.now().toString(36), date: today(), status: 'skickad' }, req));
    save();
  },

  reset() { localStorage.removeItem(KEY); localStorage.removeItem(OLD); location.hash = '#/'; location.reload(); }
};

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Veckonummer räknat från måndag 2024-01-01, så att svit kan räknas i hela veckor.
export function weekIndex(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2024, 0, 1)) / 604800000);
}
