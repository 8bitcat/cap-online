// Köp i appen (Carl 2026-11-23: träningsblocken 129–999 kr). Appen skickar Apples signerade transaktion (StoreKit 2,
// jwsRepresentation) och servern kontrollerar den innan blocket läggs på familjens konto:
//   1. certifikatkedjan i x5c slutar i Apple Root CA - G3 (fingeravtrycket nedan)
//   2. mellancertifikatet är signerat av roten och lövet av mellancertifikatet (ECDSA)
//   3. själva JWS:en är signerad med lövets nyckel (ES256)
// Utan beroenden: en liten DER-läsare plockar ut det som behövs ur certifikaten, WebCrypto gör resten.

const APPLE_ROT_G3 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

const b64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');


// DER: tagg, längd och innehåll. Returnerar {tag, start (innehållet), slut, hel (hela TLV:n)}
function tlv(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1], p = pos + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[p + i]; p += n; }
  return { tag, start: p, slut: p + len, hel: buf.subarray(pos, p + len) };
}
function barn(buf, t) {
  const ut = [];
  for (let p = t.start; p < t.slut;) { const c = tlv(buf, p); ut.push(c); p = c.slut; }
  return ut;
}

// OID:er som bytes
const OID = {
  p256: [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07],
  p384: [0x2b, 0x81, 0x04, 0x00, 0x22],
  sha256: [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02],
  sha384: [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x03],
};
const harOid = (bytes, oid) => { for (let i = 0; i + oid.length <= bytes.length; i++) if (oid.every((x, j) => bytes[i + j] === x)) return true; return false; };

// Certifikat → {tbs, sigAlg: SHA-256|SHA-384, sig (DER), spki, kurva: P-256|P-384}
export function lasCert(der) {
  const cert = tlv(der, 0);
  const [tbs, alg, sigBits] = barn(der, cert);
  const f = barn(der, tbs);
  const i = f[0].tag === 0xa0 ? 1 : 0; // [0] version finns i v3-certifikat
  const spki = f[i + 5];
  const spkiBytes = spki.hel;
  const algBytes = alg.hel;
  return {
    tbs: tbs.hel,
    sigAlg: harOid(algBytes, OID.sha384) ? 'SHA-384' : harOid(algBytes, OID.sha256) ? 'SHA-256' : null,
    sig: der.subarray(sigBits.start + 1, sigBits.slut), // BIT STRING: första byten = antal oanvända bitar
    spki: spkiBytes,
    kurva: harOid(spkiBytes, OID.p384) ? 'P-384' : harOid(spkiBytes, OID.p256) ? 'P-256' : null,
  };
}

// ECDSA-signatur i DER (SEQUENCE {INTEGER r, INTEGER s}) → r||s som WebCrypto vill ha
function ecdsaRa(sig, storlek) {
  const seq = tlv(sig, 0);
  const [r, s] = barn(sig, seq);
  const fix = t => { let b = sig.subarray(t.start, t.slut); while (b.length > storlek && b[0] === 0) b = b.subarray(1); const ut = new Uint8Array(storlek); ut.set(b, storlek - b.length); return ut; };
  const ut = new Uint8Array(storlek * 2); ut.set(fix(r)); ut.set(fix(s), storlek); return ut;
}
const nyckel = (spki, kurva) => crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: kurva }, false, ['verify']);
async function signeradAv(barnCert, foralder) {
  if (!barnCert.sigAlg || !foralder.kurva) return false;
  const k = await nyckel(foralder.spki, foralder.kurva);
  return crypto.subtle.verify({ name: 'ECDSA', hash: barnCert.sigAlg }, k, ecdsaRa(barnCert.sig, foralder.kurva === 'P-384' ? 48 : 32), barnCert.tbs);
}

// Kontrollera en signerad transaktion. rot = fingeravtrycket (sha256, hex) roten måste ha – bara testerna byter det.
// Returnerar payloaden (transactionId, originalTransactionId, productId, bundleId, environment, revocationDate …)
export async function kollaTransaktion(jws, { rot = APPLE_ROT_G3 } = {}) {
  const delar = String(jws || '').split('.');
  if (delar.length !== 3) throw new Error('inte en JWS');
  const head = JSON.parse(new TextDecoder().decode(b64(delar[0])));
  if (head.alg !== 'ES256' || !Array.isArray(head.x5c) || head.x5c.length < 3) throw new Error('fel huvud');
  const der = head.x5c.map(x => Uint8Array.from(atob(x), c => c.charCodeAt(0)));
  if (hex(await crypto.subtle.digest('SHA-256', der[der.length - 1])) !== rot) throw new Error('fel rotcertifikat');
  const certs = der.map(lasCert);
  for (let i = 0; i < certs.length - 1; i++) if (!(await signeradAv(certs[i], certs[i + 1]))) throw new Error(`certifikat ${i} är inte signerat av nästa`);
  const lov = certs[0];
  if (lov.kurva !== 'P-256') throw new Error('lövet är inte P-256');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await nyckel(lov.spki, 'P-256'), b64(delar[2]), new TextEncoder().encode(`${delar[0]}.${delar[1]}`));
  if (!ok) throw new Error('signaturen stämmer inte');
  return JSON.parse(new TextDecoder().decode(b64(delar[1])));
}

