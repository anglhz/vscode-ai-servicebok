# Integrationsrapport – stagingförberedelse 2026-09-22

**Inte production ready. Inga hosted tester kördes i denna uppgift.** Miljön saknar
konfigurerade Supabase/Vercel/Stripe-stagingcredentials och testprovider. Ingen
produktion har migrerats, inga livebetalningar eller produktionsrader har ändrats.
PR:n förbereder reproducerbar staging; [STAGING.md](../STAGING.md),
[SMOKE_TEST.md](SMOKE_TEST.md) och [PRODUCTION_CHECKLIST.md](../PRODUCTION_CHECKLIST.md)
är den återstående körplanen. Bas: main `70b71a349e3933c99ff0a7c07e258be58870b103`.

## Faktiskt körda kontroller

| Kontroll | Resultat och begränsning |
| --- | --- |
| `npm test -- --maxWorkers=2` | **400/400**, 31 filer. Tidigare 382 + 15 config/logg/headerfall + 3 PDF-skalningsfall. Samma hela svit, endast begränsat workerantal. |
| `npm run typecheck` | PASS, Next route types + strict TypeScript. |
| `npm run lint` | PASS, noll warnings. |
| `npm run build` | PASS, Next 16.3.5/Node 24, inga riktiga secrets vid build. |
| Native PostgreSQL | **8/8**, PostgreSQL **17.10**. Nio migrationer från tom engångsdatabas, utan mellansteg. Ny read-only audit + sju befintliga verkliga lås-/samtidighetstester. |
| Schemaaudit | 14 app-tabeller med RLS, 23 policies totalt i public/storage, 31 public SECURITY DEFINER med tom search_path, två invoker-vyer; bucket, helpers, trigger/index/constraint- och privilegiekontroller passerar. Supabase Auth/Storage-plattformskontrakt är lokala fixtures. |
| `npm audit` | **0 critical, 0 high, 0 moderate, 0 low** (533 dependencies i auditrapporten). Inga paketuppgraderingar/nya appberoenden. |
| Secrets/Git | 212 textfiler granskade med nyckel/JWT/private-key/anslutningssträngmönster, inga kandidater. Referenser till lösenord/tokens och korta testnycklar är fixtures/variabelnamn. Ingen riktig secret hittad; mönstersökning är ingen garanti för all historik/alla format. Env, QA-output, CLI-state och loggar ignoreras. |
| Readiness | CLI utan env returnerar fel med enbart fasta namn/orsaker. Komplett och felaktig config täcks av tester; nycklars giltighet mot externa tjänster ej prövad. |
| Lokal UI | Edge/Playwright mot lokalt produktionsbygge vid **320/390/1280**. Åtta kärnvyer utan horisontell overflow; labels, synligt Tab-fokus, login/signup och utloggat routeskydd. Aktuella skärmbilder för ny händelse och konto visuellt granskade. |
| Lokal interaktion | Service create/edit/delete, bevarad input vid validerings-/savefel; serviceplan create/edit/complete/deactivate, reminder complete/dismiss och dashboard; transfer create/select/copy/login continuation/accept/A förlorar access/cancel/expiry; Free/Premium-konto, pending success, generiskt Checkoutfel, Free PDF nekad/Premium download. |
| UI-testgräns | Auth/HTTP är syntetiska fixtures, inte Supabase/PostgREST. Plan/Billing kör PGlite SQL; transfer kör native PostgreSQL; serviceformulär använder API-fixtures. Äldre lokal servicefixture saknade dokumentendpoints och gav först timeout; endast QA-fixturen uppdaterades till aktuellt API-kontrakt, appkod ändrades inte för att få testet grönt. |
| Headers/loggar lokalt | Faktiska responses: global no-referrer/nosniff/frame denial och transfer no-store/noindex. Fyra lokala produktionsloggar efter transfer/billingflöden innehöll noll transfercapability/JWT-mönster. Vercel/proxyloggar ej åtkomliga. PDF responsepolicy täcks också av befintliga routetester. |

Native samtidighet täcker: Free vehicle create, dokumentreservation över flera
fordon, transfer mot Free create, Billing lease takeover, två acceptanrop,
cancel mot accept och serviceevent mot transfer. Den nya åttonde kontrollen kör
`supabase/verification.sql` efter hela migrationskedjan. Testdatabasen raderades
av testharnessen och den separata PostgreSQL 17-servern stoppades efter QA.

## PDF-mätning lokalt

`SERVICEBOK_PDF_BENCHMARK=1` med `vitest run tests/pdf-scale.test.ts --reporter=verbose
--disableConsoleIntercept` ger följande enstaka körning. Unicode i make/model,
titel, provider och beskrivning, cirka 300 tecken beskrivning per post:

| Poster | Sidor | Bytes | Generering | RSS före → efter |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 26 335 | 180 ms | 85,3 → 117,1 MB |
| 100 | 26 | 66 533 | 391 ms | 117,5 → 164,6 MB |
| 1000 | 251 | 419 628 | 3 682 ms | 166,0 → 318,4 MB |

RSS är hela testprocessens ögonblicksbilder, **inte peak memory** eller isolerad
PDF-allokering. Ingen Vercel cold start/memory/svarsstorleksgräns mättes. Befintliga
Unicode- och långa-texttester passerar. Nexts export-route-trace innehåller
DejaVuSans.ttf, DejaVuSans-Bold.ttf och LICENSE från projektassets; ingen runtime
fontdownload används i koden. Faktisk paketering/rendering i Vercel återstår.

## Status per extern integration

| Område | Lokalt verifierat | Hosted som återstår |
| --- | --- | --- |
| Supabase/RLS | Alla migrationer, security audit, SQL-rolltester och lås på native PG17/PGlite | Verkligt plattformsschema, migration deploy, PostgREST-behörighet A/B/C, project version |
| Auth | Validering, explicit callback, HTTPS-helper, proxy/actiontester, UI och fixture-login-continuation | Signup/email/SMTP, riktiga cookies/session refresh/logout och redirects på stagingorigin |
| Storage | SQL metadata/policies/quota/transfer, service- och felhanteringstester; dokumentvyns layout | Riktiga PDF/JPEG/PNG-bytes, signed upload/finalize/read/delete/cleanup, direkta Storage API-nekanden |
| Signed URL | Appen begär 300 s download TTL; ny åtkomst kontrolleras efter transfer | **Ingen observerad hosted livslängd**; mät redan utfärdad URL/CDN efter transfer separat |
| Stripe | Mockade API-anrop, riktiga SDK-testsignaturer, idempotency/entitlement/lease och generiska fel | Test-Checkout/Customer/subscription/Portal, riktig webhook/resend/retry/ordning/cancel/payment failure |
| PDF/Vercel | Lokal Node-generator och Premium-download, skalning, Unicode-svit, font trace | Deploy/runtime/cold/warm/memory, 1000+ poster, ägarbyte under verklig export |
| Transfer | Native lås och UI med SQL/RLS, Free atomic denial i sviten | Riktiga sessioner + PostgREST + Storage, samtidighet med hosted testkonton |
| Lookup | Disabled fallback och fel-/konfigurationssvit | Riktig adapter endast om testprovider finns; inget krav på provider för manuell staging |

## Fixade integrationsrisker

- Halvkonfigurerad Billing kunde nå Stripe innan senare konfigurationsfel. Nu
  kontrolleras app/Supabase/Billing vid featuregränsen, före SDK-anrop.
- Lookup med ofullständig konfiguration var tyst. Nu får drift fasta diagnoser,
  medan användaren behåller manuell registrering och generiska fel.
- APP_URL tillät loopback HTTP även i Vercel. Preview/production kräver nu HTTPS.
  Ingen request Host/Origin används som redirectkälla.
- Webhook saknade minimal driftlogg. Nu loggas utfall, och enbart tillåtna event-ID
  och typer efter signaturkontroll; inte payload/SDK-error/person-/betaldata.
- Global nosniff/no-referrer/anti-framing tillagt. Begränsad `frame-ancestors`
  policy, ingen riskfylld full CSP-omläggning.
- Inaktuella README-påståenden om service role och feature-scope rättade. Preview,
  env, migrationsordning och releaseansvar beskrivs samlat.

## Kvar före offentlig release

1. Kör hela hosted A/B/C-protokollet i separat Supabase/Vercel/Stripe testmiljö.
   Inga kritiska hosted säkerhetskontroller får ersättas av denna lokala rapport.
2. Kontrollera platform extension/helper-versioner: pgcrypto måste ligga i
   `extensions`; `storage.allow_any_operation(text[])` måste finnas. Nya testprojekt
   föredras framför ad hoc-ändringar i ett äldre delat projekt.
3. Verifiera extern webhookåtkomst genom Vercel Deployment Protection, exakt
   APP_URL/callback, SMTP, Stripe testkonfiguration och oberoende produktionssecrets.
4. Mät signed URL efter transfer och Vercel PDF-resursbehov. Verifiera Vercel/proxy
   tokenmaskning. Appens lokala loggfilter bevisar inte leverantörens accessloggar.
5. Besluta distribuerade rate limits för lookup/PDF/transfer/billing, webhookvolym
   och larm. Befintlig lookup-Map gäller bara per process; lease är ingen full rate limit.
6. Fastställ retention/cleanup för pending/orphaned/deleted dokument, billingevents
   och transferrecords; genomför restoreövning för både DB och Storage-bytes.
   Ingen ny worker, backupmotor eller observabilitytjänst byggdes.
7. Full hosted accessibility-/felinjektionstest återstår, inklusive fördröjda requests,
   verkliga Storagefel, SMTP och dialogfokus där relevant. Lokal layout/labels/Tab
   och fixtures är begränsad evidens, inte en komplett tillgänglighetscertifiering.

Inga nya kända kodblockerare upptäcktes efter lokala kontroller. Punkterna ovan är
**öppna releaseblockerare/driftbeslut**, inte godkända produktionskontroller.

## Exakt filändringslista

Nya:
- `STAGING.md`
- `PRODUCTION_CHECKLIST.md`
- `docs/SMOKE_TEST.md`
- `docs/INTEGRATION_REPORT.md`
- `lib/config/validation.ts`
- `lib/observability/billing.ts`
- `scripts/check-config.mjs`
- `supabase/verification.sql`
- `tests/configuration.test.ts`
- `tests/pdf-scale.test.ts`

Ändrade:
- `.env.example`
- `.gitignore`
- `README.md`
- `app/api/stripe/webhook/route.ts`
- `lib/auth/app-url.ts`
- `lib/stripe/server.ts`
- `next.config.ts`
- `package.json`
- `services/vehicle-data/provider.ts`
- `tests/vehicle-transfer-concurrency.mjs`

Inga migrationer, RLS-policies, entitlement-/quota-/transferregler eller
produktfunktioner ändrades. Lokala QA-harnessar/artifacts och PG17-runtime ligger
utanför apprepot; inga nya appdependencies. Intern readiness är ett lokalt CLI,
inte en publik endpoint. PR:n ska granskas; ingen merge ingår i denna uppgift.
