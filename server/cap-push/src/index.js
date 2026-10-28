// CAP push – Cloudflare Worker (Carl 2026-10-21: "gör också så vi kan ha notiser").
// Telefonerna med appen registrerar sin pushkod, och Carl eller Haris skickar en nyhet till alla –
// även när appen är stängd. Samma APNs-upplägg som Pixelcity (snabbfilen/server/kbk-push).
//
//   POST /registrera   {token, namn}            telefonens pushkod + barnets namn (bara för räkning)
//   POST /avregistrera {token}
//   POST /skicka       {hemlig, text, title?, hash?}   nyhet till alla telefoner (kräver ADMIN_HEMLIG); hash = sidan
//                      appen öppnar när man trycker på notisen, t.ex. /boka/2026-W45
//   GET  /                                      {ok, telefoner}
//
// KV (bindningen CAP): tok:<pushkod> med metadata {namn, t}. Inget annat sparas.
// Hemligheter: APNS_KEY (Apples .p8) och ADMIN_HEMLIG. Variabler: APNS_KEY_ID, TEAM_ID, TOPIC, APNS_HOST (bara test).

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const svar = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const TOKEN_RE = /^[0-9a-f]{64,200}$/i;
const ren = (v, n = 24) => String(v ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);

// Apples token (ES256-JWT, giltig en timme – ny var 50:e minut)
let jwt = null, jwtT = 0;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function apnsJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  if (jwt && now - jwtT < 50 * 60) return jwt;
  const pem = String(env.APNS_KEY || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const huvud = enc({ alg: 'ES256', kid: env.APNS_KEY_ID }), kropp = enc({ iss: env.TEAM_ID, iat: now });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${huvud}.${kropp}`));
  jwt = `${huvud}.${kropp}.${b64u(sig)}`; jwtT = now;
  return jwt;
}
async function skicka(env, token, text, title, extra = {}) {
  const host = env.APNS_HOST || 'https://api.push.apple.com';
  const r = await fetch(`${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await apnsJwt(env)}`, 'apns-topic': env.TOPIC, 'apns-push-type': 'alert', 'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400), 'content-type': 'application/json',
    },
    body: JSON.stringify({ aps: { alert: { title, body: text }, sound: 'default' }, ...extra }),
  });
  if (r.status !== 200) {
    const fel = await r.json().catch(() => ({}));
    if (r.status === 410 || /BadDeviceToken|DeviceTokenNotForTopic|Unregistered/.test(fel.reason || '')) await env.CAP.delete(`tok:${token}`);
    return { status: r.status, reason: fel.reason || '' };
  }
  return { status: 200 };
}
async function allaTelefoner(env) {
  const ut = []; let cursor;
  do {
    const sida = await env.CAP.list({ prefix: 'tok:', cursor });
    for (const k of sida.keys) ut.push({ token: k.name.slice(4), ...(k.metadata || {}) });
    cursor = sida.list_complete ? null : sida.cursor;
  } while (cursor);
  return ut;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/') return svar({ ok: true, app: 'CAP', telefoner: (await allaTelefoner(env)).length });
    if (req.method !== 'POST') return svar({ ok: false, fel: 'bara POST' }, 405);
    let d = {};
    try { d = await req.json(); } catch { return svar({ ok: false, fel: 'trasig JSON' }, 400); }

    if (url.pathname === '/registrera') {
      const token = String(d.token || '').toLowerCase();
      if (!TOKEN_RE.test(token)) return svar({ ok: false, fel: 'ogiltig pushkod' }, 400);
      await env.CAP.put(`tok:${token}`, '1', { metadata: { namn: ren(d.namn), t: Date.now() } });
      return svar({ ok: true });
    }
    if (url.pathname === '/avregistrera') {
      const token = String(d.token || '').toLowerCase();
      if (TOKEN_RE.test(token)) await env.CAP.delete(`tok:${token}`);
      return svar({ ok: true });
    }
    // Testknappen i appen: en notis till just den här telefonen (högst en var 20:e sekund)
    if (url.pathname === '/test') {
      const token = String(d.token || '').toLowerCase();
      if (!TOKEN_RE.test(token)) return svar({ ok: false, fel: 'ogiltig pushkod' }, 400);
      if (!(await env.CAP.get(`tok:${token}`))) return svar({ ok: false, fel: 'telefonen är inte registrerad' }, 404);
      if (await env.CAP.get(`test:${token}`)) return svar({ ok: false, fel: 'vänta en stund' }, 429);
      await env.CAP.put(`test:${token}`, '1', { expirationTtl: 60 });
      const res = await skicka(env, token, `Testnotis från CAP 👋 ${new Date().toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' })}`, 'CAP');
      return svar({ ok: res.status === 200, status: res.status, reason: res.reason || '' });
    }
    if (url.pathname === '/skicka') {
      if (!env.ADMIN_HEMLIG || String(d.hemlig || '') !== env.ADMIN_HEMLIG) return svar({ ok: false, fel: 'fel lösen' }, 403);
      const text = ren(d.text, 180), title = ren(d.title, 40) || 'CAP';
      if (!text) return svar({ ok: false, fel: 'tom text' }, 400);
      const hash = /^\/[\w/-]{1,60}$/.test(String(d.hash || '')) ? d.hash : '';
      const till = await allaTelefoner(env);
      const jobb = Promise.all(till.map((t) => skicka(env, t.token, text, title, hash ? { hash } : {}).catch((e) => ({ status: 0, reason: String(e) }))));
      if (d.vanta) { const res = await jobb; return svar({ ok: true, skickade: till.length, svar: res }); }
      ctx.waitUntil(jobb);
      return svar({ ok: true, skickade: till.length });
    }
    return svar({ ok: false, fel: 'okänd adress' }, 404);
  },
};
