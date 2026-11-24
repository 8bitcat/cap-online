// CAP i App Store Connect via API (2026-11-19). Fyller i allt som API:et når enligt docs/APPSTORE.md.
// Nyckeln (Codemagic-nyckeln 94H7H2CY53, App Manager) läses bara för att signera anropen – skrivs aldrig ut.
// Demokontot läses ur C:\Users\palss\.secrets\cap-appreview.txt (står aldrig i repot).
//   node tools/asc-store.mjs lage          vad som är ifyllt
//   node tools/asc-store.mjs fyll          texter, kategori, ålder, rättigheter, pris, länder, granskningsinfo
//   node tools/asc-store.mjs bilder        skärmbilderna i docs/appstore/ (6,9")
//   node tools/asc-store.mjs bygge [nr]    koppla bygget (senaste giltiga 1.1-bygget om nr saknas)
// Integritetsenkäten (App Privacy) finns inte i API:et – den görs i webben.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ISS = '08e19ca3-bbeb-4a09-8096-06f1e3eb6e4b', KID = '94H7H2CY53', APP = '6825529179';
const key = fs.readFileSync('C:/Users/palss/Downloads/AuthKey_94H7H2CY53.p8', 'utf8');
const ROT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROT, 'app/package.json'), 'utf8')).appVersion;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() {
  const n = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'ES256', kid: KID, typ: 'JWT' }), p = b64({ iss: ISS, iat: n, exp: n + 1200, aud: 'appstoreconnect-v1' });
  return `${h}.${p}.${crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const API = 'https://api.appstoreconnect.apple.com';
async function call(method, p, body) {
  const r = await fetch(p.startsWith('http') ? p : API + p, { method, headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch { /* tomt */ }
  if (!r.ok) { const e = new Error(`${method} ${p} → ${r.status}: ${txt.slice(0, 900)}`); e.status = r.status; throw e; }
  return j;
}
const get = (p) => call('GET', p);
const tyst404 = (pr) => pr.catch((e) => { if (e.status === 404) return null; throw e; });
const steg = async (namn, fn) => { try { const r = await fn(); console.log(`✓ ${namn}${r ? ' – ' + r : ''}`); } catch (e) { console.log(`✗ ${namn}\n  ${e.message}`); process.exitCode = 1; } };

// ---- texterna (docs/APPSTORE.md avsnitt 1, 3 och 6) ----
const SUPPORT = 'https://8bitcat.github.io/cap-online/support.html';
const INTEGRITET = 'https://8bitcat.github.io/cap-online/integritet.html';
const TEXT = {
  subtitle: 'Boka och följ fotbollsträning',
  promotionalText: 'Boka träningspass med Haris, betala med Swish och följ ditt barns utveckling. Nya tider? Du får en notis direkt när de släpps.',
  description: `CAP är appen för familjerna som tränar fotboll med Haris på Complete Athletic Performance.

BOKA PASS
Haris öppnar nya tider vecka för vecka. Du får en notis när tiderna släpps, väljer en ledig tid och bokar med några tryck. Platsen hålls åt dig medan du bekräftar, så ingen annan hinner ta den.

BETALA ENKELT
Betala passet med Swish direkt efter bokningen – Swish öppnas med belopp och meddelande ifyllt. Har ni ett paket med pass eller en pott hos Haris dras passet därifrån i stället, och du ser hela tiden hur mycket som finns kvar.

FÖLJ UTVECKLINGEN
Se barnets nivå, tider från bedömningarna och hur de förbättras över tid. Haris kan dela filmer och anteckningar från passen med er.

TRÄNA SJÄLV
Träningsstigen och övningsbanken med Haris filmer gör det lätt att träna hemma mellan passen. Påminnelser på träningsdagarna hjälper er hålla rytmen.

ALLT PÅ ETT STÄLLE
• Dina bokningar, pass och betalningar
• Historik över pass som lagts in, använts och lämnats tillbaka
• Notiser när Haris öppnar tider eller bokar något åt er

CAP används av Complete Athletic Performances kunder. Haris lägger in er och skickar ett sms med en kod att logga in med.`,
  keywords: 'fotboll,träning,boka,pass,tränare,barn,ungdom,övningar,teknik,bollkontroll,utveckling,swish',
  copyright: '2026 Complete Athletic Performance',
};
const NOTES = `CAP is the companion app for the families who train football (soccer) with coach Haris Skenderovic at Complete Athletic Performance in Sweden. The app is in Swedish.

Parents do not sign up themselves: the coach adds each family with the parent's mobile number and sends a one-time code by text message. The parent signs in with the mobile number and the code, and then chooses a password. For review we have created a demo family account that already has a password.

How to sign in:
1. Open the app. The first screen is "Logga in" (Sign in).
2. Enter the mobile number ("Mobilnummer") and password ("Lösenord") from the Sign-in Information fields and tap "Logga in".

What to try:
- "Med Haris" (With Haris, bottom bar): pick a free time slot in an open week and confirm it. The app then offers to pay with Swish, or to use a session from the family's prepaid package/balance.
- "Mer" → "Mina pass" (My sessions): remaining sessions, prepaid balance and the history of sessions added, used and returned.
- "Utveckling" (Progress): the child's level and timed assessments over time.
- Training path and exercise videos for training at home.
- Notifications: the app asks for permission and notifies parents when the coach opens new time slots or books a session for them.
- "Mer" → "Radera mitt konto" (Delete my account) deletes the account and its data.

Payments: The sessions are physical, in-person football training sessions with the coach, consumed outside the app. Payment is made with Swish (the Swedish bank payment app) by opening Swish with the amount prefilled; the app never handles card or bank details. Under guideline 3.1.3(e) (goods and services outside of the app) in-app purchase is not used for these sessions.

The coach signs in on the same screen with his e-mail address ("Logga in med e-post i stället") and the admin password, and then gets the coach's admin view (client register, time slots, sessions). It is only used by the coach and is not needed to review the parent features.

The app is built and published by Carl Pålsson (8bitcat) on behalf of Complete Athletic Performance, with the owner's permission.`;

async function version() {
  const v = await get(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS`);
  const ver = v.data.find((x) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(x.attributes.appStoreState)) || v.data[0];
  return ver;
}
const appInfo = async () => (await get(`/v1/apps/${APP}/appInfos`)).data.find((x) => x.attributes.appStoreState !== 'READY_FOR_SALE') || null;

function demo() {
  const rader = fs.readFileSync('C:/Users/palss/.secrets/cap-appreview.txt', 'utf8').split(/\r?\n/);
  const v = (i) => (rader[i] || '').replace(/^[^:]*:\s*/, '').trim();
  return { namn: v(1), losen: v(2) };
}

const cmd = process.argv[2] || 'lage';

if (cmd === 'lage') {
  const ver = await version(), info = await appInfo();
  console.log('version', ver.attributes.versionString, ver.attributes.appStoreState, 'release', ver.attributes.releaseType, 'copyright', ver.attributes.copyright);
  const vl = await get(`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`);
  for (const l of vl.data) {
    const a = l.attributes; console.log('text', a.locale, 'beskr', (a.description || '').length, 'sökord', !!a.keywords, 'support', a.supportUrl);
    const sets = await get(`/v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets?include=appScreenshots`);
    for (const s of sets.data) console.log('  bilder', s.attributes.screenshotDisplayType, (s.relationships.appScreenshots.data || []).length);
  }
  const il = await get(`/v1/appInfos/${info.id}/appInfoLocalizations`);
  for (const l of il.data) console.log('info', l.attributes.locale, l.attributes.name, '|', l.attributes.subtitle, '|', l.attributes.privacyPolicyUrl);
  const ar = await get(`/v1/appInfos/${info.id}/ageRatingDeclaration`); console.log('ålder ifylld', Object.values(ar.data.attributes).filter((x) => x !== null).length);
  const rd = await tyst404(get(`/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`)); console.log('granskning', rd?.data ? `demo ${!!rd.data.attributes.demoAccountName}, kontakt ${rd.data.attributes.contactEmail ? 'ja' : 'SAKNAS'}` : 'saknas');
  const b = await tyst404(get(`/v1/appStoreVersions/${ver.id}/build`)); console.log('bygge', b?.data ? b.data.attributes.version : 'inget');
}

if (cmd === 'fyll') {
  const ver = await version(), info = await appInfo();
  await steg(`version ${VERSION}, copyright, manuellt släpp`, async () => {
    await call('PATCH', `/v1/appStoreVersions/${ver.id}`, { data: { type: 'appStoreVersions', id: ver.id, attributes: { versionString: VERSION, copyright: TEXT.copyright, releaseType: 'MANUAL' } } });
  });
  await steg('beskrivning, reklamtext, sökord, support', async () => {
    const vl = await get(`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`);
    const sv = vl.data.find((x) => x.attributes.locale === 'sv');
    await call('PATCH', `/v1/appStoreVersionLocalizations/${sv.id}`, { data: { type: 'appStoreVersionLocalizations', id: sv.id, attributes: { description: TEXT.description, promotionalText: TEXT.promotionalText, keywords: TEXT.keywords, supportUrl: SUPPORT } } });
  });
  await steg('underrubrik och integritetspolicy', async () => {
    const il = await get(`/v1/appInfos/${info.id}/appInfoLocalizations`);
    const sv = il.data.find((x) => x.attributes.locale === 'sv');
    await call('PATCH', `/v1/appInfoLocalizations/${sv.id}`, { data: { type: 'appInfoLocalizations', id: sv.id, attributes: { subtitle: TEXT.subtitle, privacyPolicyUrl: INTEGRITET } } });
  });
  await steg('kategori Sport + Hälsa och träning', async () => {
    await call('PATCH', `/v1/appInfos/${info.id}`, { data: { type: 'appInfos', id: info.id, relationships: { primaryCategory: { data: { type: 'appCategories', id: 'SPORTS' } }, secondaryCategory: { data: { type: 'appCategories', id: 'HEALTH_AND_FITNESS' } } } } });
  });
  await steg('åldersgräns (allt Nej/Inget → 4+)', async () => {
    const ar = await get(`/v1/appInfos/${info.id}/ageRatingDeclaration`);
    const BOOL = ['advertising', 'gambling', 'lootBox', 'messagingAndChat', 'parentalControls', 'ageAssurance', 'healthOrWellnessTopics', 'socialMedia', 'socialMediaAgeRestricted', 'unrestrictedWebAccess', 'userGeneratedContent'];
    const NIVA = ['alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity', 'sexualContentOrNudity', 'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'violenceCartoonOrFantasy', 'violenceRealisticProlongedGraphicOrSadistic', 'violenceRealistic'];
    const attr = {};
    for (const k of BOOL) if (k in ar.data.attributes) attr[k] = false;
    for (const k of NIVA) if (k in ar.data.attributes) attr[k] = 'NONE';
    await call('PATCH', `/v1/ageRatingDeclarations/${ar.data.id}`, { data: { type: 'ageRatingDeclarations', id: ar.data.id, attributes: attr } });
  });
  await steg('inget innehåll från tredje part', async () => {
    await call('PATCH', `/v1/apps/${APP}`, { data: { type: 'apps', id: APP, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } } });
  });
  await steg('gratis', async () => {
    const pp = await get(`/v1/apps/${APP}/appPricePoints?filter[territory]=SWE&limit=200`);
    const gratis = pp.data.find((x) => Number(x.attributes.customerPrice) === 0);
    await call('POST', '/v1/appPriceSchedules', {
      data: { type: 'appPriceSchedules', relationships: { app: { data: { type: 'apps', id: APP } }, baseTerritory: { data: { type: 'territories', id: 'SWE' } }, manualPrices: { data: [{ type: 'appPrices', id: '${pris0}' }] } } },
      included: [{ type: 'appPrices', id: '${pris0}', attributes: { startDate: null }, relationships: { appPricePoint: { data: { type: 'appPricePoints', id: gratis.id } } } }],
    });
  });
  await steg('bara Sverige', async () => {
    const finns = await tyst404(get(`/v1/apps/${APP}/appAvailabilityV2`));
    if (finns?.data) return 'fanns redan';
    // Apple vill ha alla länder med i anropet: Sverige på, resten av
    const t = await get('/v1/territories?limit=200');
    const inc = t.data.map((x) => ({ type: 'territoryAvailabilities', id: '${' + x.id + '}', attributes: { available: x.id === 'SWE', releaseDate: null, preOrderEnabled: false }, relationships: { territory: { data: { type: 'territories', id: x.id } } } }));
    await call('POST', '/v2/appAvailabilities', {
      data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: false }, relationships: { app: { data: { type: 'apps', id: APP } }, territoryAvailabilities: { data: inc.map((x) => ({ type: x.type, id: x.id })) } } },
      included: inc,
    });
    return `${t.data.length} länder, bara SWE på`;
  });
  await steg('granskningsinfo: demokonto + anteckningar', async () => {
    // Apple kräver kontaktens e-post och telefon. De står inte i repot: CAP_KONTAKT_EPOST=… CAP_KONTAKT_TEL=+46… node tools/asc-store.mjs fyll
    const epost = process.env.CAP_KONTAKT_EPOST, tel = process.env.CAP_KONTAKT_TEL;
    if (!epost || !tel) return 'HOPPADES ÖVER – kontaktens e-post/telefon saknas (CAP_KONTAKT_EPOST, CAP_KONTAKT_TEL)';
    const d = demo();
    const attr = { contactFirstName: 'Carl', contactLastName: 'Pålsson', contactEmail: epost, contactPhone: tel, demoAccountName: d.namn, demoAccountPassword: d.losen, demoAccountRequired: true, notes: NOTES };
    const rd = await tyst404(get(`/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`));
    if (rd?.data) await call('PATCH', `/v1/appStoreReviewDetails/${rd.data.id}`, { data: { type: 'appStoreReviewDetails', id: rd.data.id, attributes: attr } });
    else await call('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: attr, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } });
  });
}

if (cmd === 'bilder') {
  const ver = await version();
  const vl = await get(`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`);
  const sv = vl.data.find((x) => x.attributes.locale === 'sv');
  const TYP = 'APP_IPHONE_67';   // 6,7"/6,9" – 1320 × 2868 hör hit
  const sets = await get(`/v1/appStoreVersionLocalizations/${sv.id}/appScreenshotSets?include=appScreenshots`);
  let set = sets.data.find((s) => s.attributes.screenshotDisplayType === TYP);
  if (set) for (const s of set.relationships.appScreenshots.data || []) await call('DELETE', `/v1/appScreenshots/${s.id}`);
  else set = (await call('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: TYP }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: sv.id } } } } })).data;
  const mapp = path.join(ROT, 'docs/appstore');
  for (const f of fs.readdirSync(mapp).filter((x) => x.endsWith('.png')).sort()) {
    await steg(f, async () => {
      const buf = fs.readFileSync(path.join(mapp, f));
      const res = (await call('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: f, fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } })).data;
      for (const op of res.attributes.uploadOperations) {
        const h = Object.fromEntries(op.requestHeaders.map((x) => [x.name, x.value]));
        const r = await fetch(op.url, { method: op.method, headers: h, body: buf.subarray(op.offset, op.offset + op.length) });
        if (!r.ok) throw new Error(`uppladdning ${r.status}`);
      }
      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      await call('PATCH', `/v1/appScreenshots/${res.id}`, { data: { type: 'appScreenshots', id: res.id, attributes: { uploaded: true, sourceFileChecksum: md5 } } });
    });
  }
}

// En ny version efter den som är ute (1.2 = passen i kalendern, 2026-11-22): skapar versionen om den saknas (texter
// och skärmbilder följer med från förra), skriver Nyheter och granskningsinfon (kontakten från förra versionen).
const NYHETER = `Påminnelser: en notis dagen före passet och en när det är dags att åka. Restiden väljer du under Inställningar. Ligger passen i kalendern CAP kommer påminnelserna därifrån, med adress och vägbeskrivning.

Passen med Haris: Haris kan filma och mäta tiden under passet och dela det med er. Ni ser tiden direkt på filmen, kan jämföra med första gången och kommentera varje moment.

Syskon: lägg till syskon själv under Inställningar → Barn på kontot.

Avbokning: avboka senast 24 timmar före. Avbokar du senare blir tiden ledig för andra, men passet räknas.

Rättat: appen kunde fastna inzoomad efter att man skrivit i en ruta.`;
const NOTES_KALENDER = `

New in this version: with the user's permission the app keeps its own calendar named "CAP" with the family's booked sessions (EventKit). Full access is requested because the app also updates and removes sessions that are moved or cancelled; it only reads and changes events in its own "CAP" calendar. The permission is asked the first time the parent has a booked session: in the demo account, open "Med Haris", tap a free time and confirm the booking. All permissions can also be reviewed under "Mer" → "Inställningar" (Settings), which links to the app's page in the iOS Settings app.

In-app purchases (new): six non-consumable "Träningsblock" (training blocks) that unlock more steps of the in-app training path. In the demo account open "Mer" → "Träningsblock", or "Träna själv" → a locked 🔒 step. "Återställ köp" (Restore Purchases) is on the same page. In-person sessions with the coach are not sold in the app (paid by Swish, guideline 3.1.3(e)).

Version 1.4: reminders 24 hours before a booked session and when it is time to leave (two alarms on the event in the app's own "CAP" calendar, and the place is geocoded with CLGeocoder for the event's map; no location permission is used). The coach can film moments during a session; the app compresses the video (AVFoundation) before uploading it. Choosing an existing video uses the system photo picker (PHPicker).

Camera and microphone: parents film the training-path tasks ("Film till Haris") with the phone and send them to the coach; filming with sound needs both. They are requested on the "Missa inget pass" page after sign-up, with an explanation, or when filming.`;
if (cmd === 'uppdatering') {
  const alla = (await get(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS`)).data;
  let ver = alla.find((x) => x.attributes.versionString === VERSION);
  const forra = alla.find((x) => x.attributes.appStoreState === 'READY_FOR_SALE');
  await steg(`version ${VERSION}`, async () => {
    if (ver) return `finns redan (${ver.attributes.appStoreState})`;
    // en version som inte skickats in än byter bara nummer (1.2 → 1.3)
    const vantar = alla.find((x) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(x.attributes.appStoreState));
    if (vantar) {
      ver = (await call('PATCH', `/v1/appStoreVersions/${vantar.id}`, { data: { type: 'appStoreVersions', id: vantar.id, attributes: { versionString: VERSION } } })).data;
      return `bytt ${vantar.attributes.versionString} → ${VERSION}`;
    }
    ver = (await call('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: VERSION, releaseType: 'AFTER_APPROVAL', copyright: TEXT.copyright }, relationships: { app: { data: { type: 'apps', id: APP } } } } })).data;
    return 'skapad';
  });
  await steg('Nyheter i versionen', async () => {
    const vl = await get(`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`);
    const sv = vl.data.find((x) => x.attributes.locale === 'sv');
    await call('PATCH', `/v1/appStoreVersionLocalizations/${sv.id}`, { data: { type: 'appStoreVersionLocalizations', id: sv.id, attributes: { whatsNew: NYHETER } } });
  });
  await steg('granskningsinfo (kontakt från förra versionen, demokonto, kalendern)', async () => {
    const f = forra && await tyst404(get(`/v1/appStoreVersions/${forra.id}/appStoreReviewDetail`));
    const a = f?.data?.attributes || {};
    if (!a.contactEmail || !a.contactPhone) return 'HOPPADES ÖVER – förra versionen saknar kontakt';
    const d = demo();
    const attr = { contactFirstName: a.contactFirstName, contactLastName: a.contactLastName, contactEmail: a.contactEmail, contactPhone: a.contactPhone, demoAccountName: d.namn, demoAccountPassword: d.losen, demoAccountRequired: true, notes: NOTES + NOTES_KALENDER };
    const rd = await tyst404(get(`/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`));
    if (rd?.data) await call('PATCH', `/v1/appStoreReviewDetails/${rd.data.id}`, { data: { type: 'appStoreReviewDetails', id: rd.data.id, attributes: attr } });
    else await call('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: attr, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } });
  });
}

// Skicka in versionen till granskning och släpp den automatiskt när Apple godkänt (Carl 2026-11-24: "släpp om det
// krävs en ny app släpp ut den automatiskt"). Bygget ska vara kopplat (bygge) och texterna ifyllda (uppdatering).
if (cmd === 'skicka') {
  const alla = (await get(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS`)).data;
  const ver = alla.find((x) => x.attributes.versionString === VERSION);
  if (!ver) { console.log(`version ${VERSION} finns inte, kör uppdatering först`); process.exit(2); }
  await steg('släpps automatiskt efter godkännandet', async () => {
    await call('PATCH', `/v1/appStoreVersions/${ver.id}`, { data: { type: 'appStoreVersions', id: ver.id, attributes: { releaseType: 'AFTER_APPROVAL' } } });
  });
  await steg(`version ${VERSION} till granskning`, async () => {
    const utkast = (await get(`/v1/apps/${APP}/reviewSubmissions?filter[platform]=IOS&filter[state]=READY_FOR_REVIEW`)).data[0];
    const sub = utkast || (await call('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP } } } } })).data;
    await call('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } })
      .catch((e) => { if (!/already|ENTITY_ERROR.RELATIONSHIP.INVALID|duplicate/i.test(e.message)) throw e; });
    await call('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
    return `inskickad (${sub.id})`;
  });
}

if (cmd === 'bygge') {
  const ver = await version();
  const b = await get(`/v1/builds?filter[app]=${APP}&filter[preReleaseVersion.version]=${VERSION}&sort=-uploadedDate&limit=10`);
  const nr = process.argv[3];
  const build = b.data.find((x) => (!nr || x.attributes.version === nr) && x.attributes.processingState === 'VALID' && !x.attributes.expired);
  if (!build) { console.log(`inget giltigt ${VERSION}-bygge än:`, b.data.map((x) => `${x.attributes.version} ${x.attributes.processingState}`).join(', ') || 'inga'); process.exit(2); }
  await steg(`bygge ${build.attributes.version} kopplat till version ${VERSION}`, async () => {
    await call('PATCH', `/v1/appStoreVersions/${ver.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
  });
}
