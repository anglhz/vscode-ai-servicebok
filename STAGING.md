# Reproducerbar staging

Status och faktiskt körda kontroller finns i [integrationsrapporten](docs/INTEGRATION_REPORT.md).
En grön lokal svit är inte bevis på fungerande hostad Auth, Storage eller Stripe.
Använd endast ett dedikerat Supabase-testprojekt, Stripe testläge och syntetiska data.
Den här guiden auktoriserar inga produktionsmigrationer eller livebetalningar.

## Miljövariabler

Konfigurera värden separat per Vercel-environment och staginggren. Inga värden ska
läggas i Git, PR, skärmbilder, shellhistorik eller testprotokoll. `NEXT_PUBLIC_*`
byggs in i klienten: ändring kräver nytt bygge. Övriga variabler är server-only.

| Variabel | Krav | Exponering | Preview/staging | Produktion |
| --- | --- | --- | --- | --- |
| APP_URL | Required för auth/callback/transfer/billing | Server, ej hemlig | Exakt stabil HTTPS-bas-URL för testgrenen | Exakt ordinarie HTTPS-origin |
| NEXT_PUBLIC_SUPABASE_URL | Required | Public | Dedikerat testprojekt | Separat produktionsprojekt |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Required | Public, anon/publishable | Samma testprojekt som URL | Samma produktionsprojekt som URL; aldrig service role |
| SUPABASE_SERVICE_ROLE_KEY | Required för Billing | Server secret | Endast testprojekt | Endast produktionsprojekt |
| STRIPE_SECRET_KEY | Required för Billing | Server secret | sk_test/rk_test; live nekas i Vercel Preview | Avsedd separat livekonfiguration efter releasegodkännande |
| STRIPE_WEBHOOK_SECRET | Required för Billing | Server secret | Stagingendpointens whsec; CLI har eget secret | Produktionsendpointens eget secret |
| STRIPE_PREMIUM_PRICE_ID | Required för Billing | Server | Testpris, recurring/month/antal 1 | Livepris, samma månadsmodell; inget hårdkodat belopp |
| VEHICLE_PROVIDER | Optional | Server | Tomt för manuell registrering, annars http-json | Egen providerkonfiguration |
| VEHICLE_API_BASE_URL | Required om lookup aktiveras | Server | HTTPS-testadapter, ingen query/credentials | Avtalad HTTPS-adapter |
| VEHICLE_API_KEY | Required om lookup aktiveras | Server secret | Provider-testnyckel | Separat produktionsnyckel |
| VEHICLE_LOOKUP_SIGNING_SECRET | Required om lookup aktiveras | Server secret | Minst 32 slumpbyte; samma värde i testprojektets privata DB-konfiguration | Eget värde, aldrig samma som staging |

Lämna **alla fyra** lookupvariabler tomma för att avaktivera lookup. Manuell
fordonsregistrering fungerar då. En halv lookupkonfiguration ger en säker driftlogg
med variabelnamn och användarens befintliga manuella fallback. Lookupnyckeln i
`private.vehicle_lookup_config` provisioneras separat efter migrationerna enligt
README:s lookup-avsnitt; tabellen får vara tom under alla migrationer. Ge inte
klientroller åtkomst till den. Secretrotation ogiltigförklarar tidigare receipts.

Billing validerar APP_URL, Supabase-konfiguration och alla fyra billingvariabler
innan Stripe-klienten används. Generiska användarfel behålls. Detta bevisar inte
nycklarnas giltighet, rätt Stripe-konto eller rätt Supabase-projekt: verifiera dessa
med riktiga testflöden. Ingen validering kräver secrets vid `npm run build`.

Lokal intern readiness, utan HTTP-endpoint eller nätverksanrop:

```sh
node --env-file=.env.staging.local scripts/check-config.mjs --staging
```

Kommandot visar endast variabelnamn och fasta orsaker, aldrig värden. Utan
`--staging` används aktuell VERCEL_ENV; flaggan tvingar HTTPS och Stripe testläge.
`npm run check:config` använder redan inlästa miljövariabler. Exempelfilen är avsiktligt
ofullständig och ska ge fel tills riktiga lokala värden finns.

## Vercel och origin

1. Välj en dedikerad staginggren och stabil branch-domain/custom staging-domain.
   Ange samma origin explicit i Preview-grenens APP_URL och öppna **den adressen**
   vid tester. Blanda inte en unik deploy-URL med auth på en annan alias-origin:
   PKCE/cookies hör till webbläsarens origin.
2. Använd Node 24 och projektets `npm ci`/`npm run build`. Sätt Preview-variabler
   endast på avsedd testgren; nya branches får inte automatiskt produktionssecrets.
3. Om en unik preview-URL måste användas: deploya, registrera exakt callback,
   sätt APP_URL till den URL:en och bygg om. Föredra stabil alias för staging.
   Appen använder aldrig request Host, Origin, next-parameter eller VERCEL_URL
   som auktoritativ redirect-destination.
4. Supabase Site URL = APP_URL. Allowlist = exakt `APP_URL/auth/callback`.
   Ingen `/auth/callback` i Site URL och inga wildcard i produktion. Testprojektet
   ska inte dela produktionsdatabas. Bekräftelsemail öppnas i samma browser som signup.
5. Vercel Deployment Protection måste låta Stripe nå webhooken. Välj ett avsiktligt
   konfigurerat undantag för stagingdomänen enligt Vercels aktuella planstöd och
   verifiera extern POST. Lägg inte bypass-secrets i returadresser eller repo.
   Behåll Supabase Auth/RLS och Stripe-signaturkontrollen även om domänen är nåbar.
   Kontrollera också att e-postcallback och transferlänk fungerar för testpersoner.
6. Kontrollera att `/api/stripe/webhook` inte blockeras av preview-skydd eller WAF.
   En 200/302 från Vercels inloggningssida är **inte** en lyckad webhook.

## Tom Supabase-databas och migrationer

Supabase äger `auth`, `storage`, rollerna anon/authenticated/service_role och
Storage-hjälparen `storage.allow_any_operation(text[])`. En bar PostgreSQL saknar
dessa: lokala native-tester skapar ett dokumenterat minimikontrakt först, inte en
riktig Auth/Storage-server. Kräv PostgreSQL 15+ för security_invoker-vyer; verifiera
testprojektets faktiska version med `select version()` och kör audit där också.

Ordning, utan manuella mellansteg:

1. 20260913000100_profiles
2. 20260913000200_vehicles
3. 20260913000300_service_history
4. 20260913000400_documents
5. 20260913000500_vehicle_lookup
6. 20260913000600_service_reminders
7. 20260914000700_vehicle_transfers
8. 20260920000800_vehicle_export
9. 20260921000900_subscriptions

`pgcrypto` installeras av migration 5 i `extensions`. Om ett äldre projekt redan
har extensionen i annat schema stoppar migrationen tydligt. Flytta inte extensioner
blint; välj ett nytt testprojekt eller granska en separat kontrollerad rättning.
Bucket skapas privat av migration 4; inget manuellt bucketsteg behövs mellan filer.
Lookupsecret, SMTP och Stripe Product/Price är efterföljande featurekonfiguration,
inte dold migrationsstate. Redigera inte redan deployade migrationer.

På en ren arbetskopia, med Supabase CLI installerad och inloggad:

```sh
npx supabase init
npx supabase link --project-ref <ENDAST-STAGING-PROJECT-REF>
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Kontrollera project-ref i Dashboard och CLI före sista kommandot. Kopiera aldrig
produktionsanslutningen till denna session. Kör sedan `supabase/verification.sql`
i staging SQL Editor som databasägare. Den är read-only och visar bara version/
aggregat; den granskar RLS, invoker-vyer, definer-search_path, privilegier,
Storage-konfiguration, triggers, constraints och relevanta index. Detta ersätter
inte A/B/C-tester via PostgREST/Storage. Kontrollera migration list efteråt.

Lokal reproduktion: Docker + Supabase CLI enligt README, eller isolerad native PG:

```sh
# pg-modul installerad i separat testverktygskatalog, inte som appberoende.
# Sätt TRANSFER_TEST_PG_MODULE till modulens absoluta sökväg.
# Sätt TRANSFER_TEST_DATABASE_URL till en lokal engångsserver (loopback).
node --test tests/vehicle-transfer-concurrency.mjs
```

Native-testet skapar en unik databas, applicerar alla filer och tar bara bort den
egna testdatabasen. Ingen remote-server tillåts. Använd inte en lokal tunnel till
produktion som testserver. Lås Supabase CLI-versionen som faktiskt används i
releaseprotokollet; lokala fixture-roller är aldrig migrationsfiler för hosting.

## Auth, Stripe och verifiering

- Aktivera email/password, minst åtta tecken, e-postbekräftelse och fungerande
  staging-SMTP med kontrollerade testadresser. Verifiera sender/delivery/rate limits.
- Skapa tre separata konton A/B/C. Förvara lösenorden utanför Git. Använd separata
  browserprofiler; inga förfalskade JWT:er i hosted-tester.
- Skapa Stripe test Product/monthly Price och konfigurera Portal. Registrera sex
  events från README till `APP_URL/api/stripe/webhook` med API-version
  `2026-08-26.dahlia`. Välj testläge även när Dashboard har ett separat livekonto.
- Kör [smoke-/A/B/C-protokollet](docs/SMOKE_TEST.md). Dokumentera för varje rad:
  commit, miljö, datum, PASS/FAIL/NOT RUN och sanerat bevis. Lägg inga tokens,
  signerade URL:er eller persondata i rapporten.
- Kör därefter [releasechecklistan](PRODUCTION_CHECKLIST.md). Hosted-flöden som
  inte faktiskt körts förblir blockerande för release.

Officiella driftreferenser:
[Vercel Deployment Protection](https://vercel.com/docs/deployment-protection),
[Vercel Git/branch-deployments](https://vercel.com/docs/git),
[Supabase backups](https://supabase.com/docs/guides/platform/backups),
[Stripe webhooks](https://docs.stripe.com/webhooks).
