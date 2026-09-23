# Staging smoke och integrationsprotokoll

Detta är ett **protokoll att köra**, inte ett påstående om godkända hosted tester.
Förbered staging enligt [STAGING.md](../STAGING.md). Använd endast syntetiska
uppgifter och tre separata webbläsarprofiler A (ägare), B (mottagare), C (obehörig).
Börja med Free-konton utan fordon. Spara UUID:n lokalt, aldrig lösenord, JWT,
transferlänkar, signed URLs eller Stripe-payloads i rapporten.

För varje rad: anteckna commit/deployment, UTC-tid, miljö, testkonto A/B/C,
förväntat/faktiskt resultat och PASS/FAIL/BLOCKED. Sanitera skärmbilder och loggar.
Avbryt hosted körningen om projektet inte säkert identifierats som staging eller
Stripe använder live mode. Rensa bara testdata som skapats av den aktuella körningen.

## Snabb smoke, i denna ordning

1. Logga in A via `/login`; `/dashboard` och `/vehicles` ska fungera. I separat
   utloggad profil ska samma skyddade routes skicka till login.
2. Skapa ett manuellt fordon, exempelvis Volvo V60 utan reg/VIN. Läs fordonet
   igen efter omladdning. Andra Free-fordonet ska nekas även via RPC.
3. Skapa servicehändelse med titel `Staging Åäö Müller Łódź`, dagens datum och
   miltal 12000. Läs tillbaka; redigera titel; lägg historisk post med miltal 8000.
   Current mileage ska förbli 12000. Soft delete den historiska posten.
4. Öppna serviceplan. Skapa kombinerat intervall 1000 mil/12 månader med båda
   baslinjerna. Läs serviceplan, `/reminders` och dashboard. Markera utfört och
   kontrollera uppdaterad baslinje och samma synkroniserade reminder.
5. Ladda upp en liten riktig PDF under Dokument. Kontrollera metadata efter
   omladdning och öppna signed download. Kontrollera att B/C inte kan läsa posten.
6. Öppna `/account`: Free och korrekt förbrukning. Genomför Stripe test-Checkout,
   vänta på verifierad webhook och läs samma sida igen: Premium. Success-URL ensam
   får inte ändra plan. Testa Portal. Ingen livebetalning.

## Direkt PostgREST/RPC och Storage, inte bara UI

Använd `@supabase/supabase-js` som redan finns i projektet. Kör ett lokalt Node 24
script från projektroten med `node --env-file=.env.staging.local <script>.mjs`.
Lägg script/output under ignorerad `test-results/`. Ladda tillfälliga A/B/C-email
och lösenord från den ignorerade env-filen (t.ex. `QA_A_EMAIL`, `QA_A_PASSWORD`).
Ingen service role i användartesterna: det skulle kringgå RLS. Initiera en separat
klient/session per konto och använd samma anrop med B/C för nekande tester.

```js
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
// Visa inte SDK-felobjekt/sessioner; rapportera bara fasta steg och PASS/FAIL.
async function ok(result, step) {
  const { data, error } = await result;
  if (error) throw new Error(`FAIL: ${step}`);
  return data;
}
await ok(client.auth.signInWithPassword({ email: process.env.QA_A_EMAIL,
  password: process.env.QA_A_PASSWORD }), 'login A');
const vehicleId = process.env.QA_VEHICLE_ID; // A:s nyss skapade stagingfordon.
const vehicles = await ok(client.from('vehicles').select('id,current_mileage')
  .eq('id', vehicleId), 'vehicle read');
if (vehicles.length !== 1) throw new Error('FAIL: vehicle visible to A');
const eventId = await ok(client.rpc('create_service_event', {
  p_vehicle_id: vehicleId, p_category: 'service', p_title: 'Staging API smoke',
  p_event_date: '2026-09-22', p_mileage: 12000, p_cost_amount: 10000,
  p_provider_name: 'Testverkstad', p_description: 'Syntetisk testdata', p_notes: null,
}), 'create event');
await ok(client.rpc('save_service_interval', {
  p_vehicle_id: vehicleId, p_name: 'Staging olja', p_category: 'service',
  p_distance_interval: 1000, p_month_interval: 12,
}), 'service interval');
await ok(client.from('service_interval_overview').select('id,urgency')
  .eq('vehicle_id', vehicleId), 'interval read');
const bytes = await readFile(process.env.QA_DOCUMENT_PATH);
const reserved = await ok(client.rpc('create_document', {
  p_vehicle_id: vehicleId, p_event_id: eventId, p_file_name: 'staging.pdf',
  p_mime_type: 'application/pdf', p_file_size_bytes: bytes.length,
  p_document_type: 'service_report',
}), 'document reservation');
const doc = reserved[0], bucket = client.storage.from('vehicle_documents');
const upload = await ok(bucket.createSignedUploadUrl(doc.storage_path,
  { upsert: false }), 'signed upload');
await ok(bucket.uploadToSignedUrl(doc.storage_path, upload.token, bytes,
  { contentType: 'application/pdf' }), 'upload bytes');
await ok(client.rpc('finalize_document', { p_vehicle_id: vehicleId,
  p_document_id: doc.id }), 'finalize');
const metadata = await ok(client.from('documents').select('id,upload_status')
  .eq('id', doc.id), 'document metadata');
if (metadata[0]?.upload_status !== 'ready') throw new Error('FAIL: ready metadata');
const download = await ok(bucket.createSignedUrl(doc.storage_path, 300), 'download URL');
if (!(await fetch(download.signedUrl)).ok) throw new Error('FAIL: download bytes');
await ok(client.rpc('get_billing_overview'), 'billing overview');
await ok(client.auth.refreshSession(), 'refresh');
await ok(client.auth.signOut({ scope: 'local' }), 'logout');
console.info('PASS: staging API smoke');
```

Byt datum till aktuellt testdatum. Byt filnamn/MIME och riktiga bytes för JPEG och
PNG. Scriptet skapar data; kör inte om mot samma fordon utan att räkna med extra
poster/reservationer. För edit/delete/complete används parametrarna i respektive
`services/`-funktion och migrationssignatur, inte direkt privilegierad SQL.
Kör separat alla nekande kontroller: ett tomt SELECT-resultat är korrekt RLS-nekande;
en mutation ska ge fel och ingen ändring. Verifiera alltid kvarvarande state som A.

## Full matris

| Område | Utför och förvänta |
| --- | --- |
| Auth | Signup 8–128 tecken; riktig e-postbekräftelse i samma browser; exakt APP_URL callback; fel/utgången kod ger generiskt fel. Login för befintligt kortare lösenord, logout local, session refresh och skyddad route efter logout. Testa också login/signup som fortsättning från transfer. |
| Fordon | Free första OK, andra nej (UI + RPC), Premium flera OK. Utan lookup credentials fungerar manuell registrering. Om testprovider finns: korrekt träff, timeout, ogiltigt svar och manuellt alternativ. Dubblett av A:s reg/VIN med B/C ger generiskt fel utan fordonsdetaljer/åtkomst. |
| Servicehistorik | A create/edit/soft-delete via riktiga RPC. Högre miltal höjer current; lägre historiskt och delete sänker inte. B/C försöker samma RPC och SELECT med A:s UUID. Ingen mutation/privat data. |
| Dokument | PDF/JPEG/PNG: reservation → signed upload → bytes → finalize → metadata → download → soft delete → fysisk remove → cleanup. Fel MIME/storlek, avbruten upload, Storage timeout. Pending >3 timmar blir cleanup candidate vid nästa användarstyrda cleanup, inte via utlovad worker. |
| Storage RLS | B/C försöker `.list()` på A:s prefix, `.download(path)`, `.createSignedUrl(path,300)`, `.remove([path])`, metadata SELECT och finalize/delete RPC. Lista måste vara tom eller nekad; övriga anrop nekade; A:s original kvar. Testa både SDK och dess direkta Storage API-request med respektive user-JWT. Public bucket URL ska inte ge åtkomst. |
| Intervall | Distance/date/combined med och utan baslinjer. Prioritet overdue → unknown → due_soon → ok. Datum saknas + snart miltal = unknown; miltal saknas + datum inom 30 dagar = unknown; känd overdue + saknad annan = overdue. Markera utfört uppdaterar baslinjer, inte historiskt current mileage nedåt. |
| Stockholm | Kör precis före/efter midnatt Europe/Stockholm och vid sommar/vintertid. Jämför datum i SQL-overview och UI med Stockholm, inte browserns lokala zon. Spara UTC-tid och förväntat Stockholmsdatum. Lokala unitgränsfall ersätter inte detta deploymenttest. |
| Reminders | Interval-reminder synkas efter edit/complete, custom kan complete/dismiss; dashboard max tre; `/reminders` visar rätt prioritet och generiska tom-/felstates. |
| Transfer | A skapar, kopierar; B oinloggad öppnar, login eller signup/confirmation fortsätter; B accepterar. A förlorar läs/skriv/PDF/nya signed URLs, B får förväntad access, C saknar. Utgången/avbruten/återanvänd capability nekas. Token sparas inte i bevismaterial. |
| Free transfer | B har redan ett Free-fordon: accept nekas atomiskt, A kvar som owner, transfer pending, inga dokument/ägarrader delvis flyttade. |
| Transferdokument | Kör separata fordon/scenarier: noll, ett, flera valda; icke valt och raderat dokument. Endast uttryckligen valda giltiga dokument följer B. Verifiera metadata och Storage separat. |
| Samtidighet | Två användarsessioner accepterar samma länk parallellt; exakt en vinnare. Accept mot cancel och eventmutering. Lokal native-svit körs enbart mot isolerad lokal DB; koppla aldrig dess destruktiva fixtures till hosted projekt. Hosted variant använder avgränsade testkonton och riktiga RPC. |
| PDF | Free 403, Premium eget OK, C nekad, auth krävs; testa ägarbyte medan exporten pågår så recheck inte lämnar ut PDF. Läs faktiskt Vercel-svar, inte bara lokal generator. Kort/100/1000 poster, långa beskrivningar, svenska/polska/arabiska/kyrilliska. |
| Stripe | Test-Checkout skapar Customer/subscription, signerad webhook aktiverar Premium, Portal och cancel-at-period-end, slutlig cancel/payment failure ger korrekt entitlement. Befintliga fordon/dokument bevaras vid downgrade; nya Premium-actions nekas. |
| Stripe retry | Ogiltig signatur 400 utan data i logg; giltig 200; resend samma event, återförsök efter 500 och äldre event efter nyare. Dagens Stripe-state ska styra. Dubbelklick, två samtidiga Checkout och redan aktiv sub får inte skapa onödiga dubbla subscriptions. |
| Customer recovery | Portal utan Customer startar inte creation-tid. Första Checkout efter >23h får skapa; verklig äldre tvetydig creation blockeras; retry inom fönstret återanvänder nyckel. Manipulera inte produktion; använd lokala regressionstester och isolerade testfixtures. |
| Success före webhook | Pausa stagingendpointens leverans, slutför testbetalning: success-sidan visar pending/Free. Återaktivera/resend, verifiera Premium. URL-query får aldrig räcka. Återställ endpointen efter testet. |

## Mätningar och säkerhetskontroller

- Signed download efter transfer: skapa URL som A, notera endast utfärdandetid,
  TTL 300 s och status/byteantal vid t=0,60,299,301 samt efter faktisk sista framgång.
  Prova samma redan utfärdade URL och en ny begäran separat. Redovisa observerad
  livslängd; anta inte att applikationens TTL ensam bevisar CDN-/revokeringsbeteende.
  Ny URL från A ska nekas direkt. Undvik browsercache i mätningen.
- Vercel PDF: notera cold/warm, eventantal, sidor, tid, bytes, peak memory om
  plattformen visar det; annars skriv ej uppmätt. Kontrollera de två DejaVu TTF och
  licensen i deployment/server trace. Bekräfta inga runtime fontrequests. Öppna och
  läs text visuellt, kontrollera sista posten/radbrytningar. Lokal RSS före/efter är
  inte peak memory och säger inget om Vercels tids-/svarsstorleksgränser.
- Headers: transfer `Referrer-Policy: no-referrer`, `Cache-Control: private,
  no-store`, robots noindex; PDF private/no-store; global nosniff/frame denial.
  Kontrollera faktisk HTTP-response, även fel, och inte bara Next-konfiguration.
- Loggar: använd en unik syntetisk transfer capability, försök giltig/ogiltig/expiry,
  och sök lokalt efter den utan att skriva värdet till rapport. Kontrollera Next-,
  Vercel request/error- och eventuell proxylogg separat. Maskning hos plattformen
  kan krävas trots appens request-loggfilter. Samma sak för auth code/signed URLs.
- Fel: bryt en dependency i dedikerad preview (fel testkonfiguration eller
  blockerad testrequest), inte i delad prod. Supabase, Storage, Stripe, provider,
  PDF ska ge generiska svenska fel utan SQL/stack/secret och med lokal retry.
- UI vid 320/390/1280: dashboard, fordon, ny händelse, dokument, serviceplan,
  reminders, transfer, account. Kontrollera ingen horisontell scroll, synlig
  navigation, labels, Tab/Shift-Tab/Enter/Space, synlig fokusmarkering, disabled
  submit medan request väntar, inlinefel/status, återställd dialogfokus/Escape där
  dialog används. Fördröj requests för att se lokal loading utan helsidesspinner.

Skriv slutligen resultat per område i en ny daterad körningsrapport. Det som är
BLOCKED/NOT RUN ska förbli öppet i [PRODUCTION_CHECKLIST.md](../PRODUCTION_CHECKLIST.md).
