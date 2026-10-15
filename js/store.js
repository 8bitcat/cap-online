// Lokal lagring i prototypen. Byts mot backend när betalsätt och konto är valt.
const KEY = 'caponline.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
const data = Object.assign({ library: [], logs: [], profile: null, requests: [], steps: {} }, load());
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* privat läge m.m. */ }
}

export const store = {
  // Bibliotek
  get library() { return data.library.slice(); },
  has(id) { return data.library.includes(id); },
  add(id) { if (!this.has(id)) { data.library.push(id); save(); } },
  remove(id) { data.library = data.library.filter(x => x !== id); save(); },

  // Loggade pass
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

  // Barnprofil (Hjälp mig välja)
  get profile() { return data.profile; },
  set profile(p) { data.profile = p; save(); },

  // Förfrågningar till Haki (prototyp: sparas bara lokalt)
  get requests() { return data.requests.slice(); },
  addRequest(req) {
    data.requests.push(Object.assign({ id: Date.now().toString(36), date: today(), status: 'skickad' }, req));
    save();
  },

  reset() { localStorage.removeItem(KEY); location.reload(); }
};

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
