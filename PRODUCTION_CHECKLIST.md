# Releasechecklista

Ingen releaseklar-status förrän hosted-raderna har PASS och namngiven granskare.
Se [STAGING.md](STAGING.md) och [testprotokoll](docs/SMOKE_TEST.md).

## Staging före release

- [ ] Registrera commit, Node/npm/CLI/PG-version, staging-origin och separat projekt-ref.
- [ ] Miljömatrisen är komplett; readiness-kommandot passerar utan värden i loggen.
- [ ] Preview använder Stripe testnycklar och egen Supabase. Ingen livebetalning.
- [ ] Alla migrationer till och med 12 på tom hostad Supabase, migration list och verification.sql PASS.
- [ ] APP_URL/Site URL/exakt callback fungerar från stabil HTTPS-staging-origin.
- [ ] Signup, mailbekräftelse, login, refresh, logout och skyddad route PASS.
- [ ] A/B/C PostgREST och direkt Storage: åtkomst nekas för fel användare.
- [ ] PDF/JPEG/PNG: signed upload, bytes, finalize, läsning, download, delete och cleanup PASS.
- [ ] Transfer, valda/icke valda dokument, Free-gräns och samtidiga acceptanrop PASS.
- [ ] Faktisk livslängd för redan utfärdad signed URL efter transfer uppmätt.
- [ ] Servicehistorik, miltal, intervall och reminders inklusive svensk midnatt PASS.
- [ ] Vercel PDF: Unicode, fontassets offline, lång historik, tid/storlek/minne dokumenterade.
- [ ] Stripe Checkout/Portal, sex eventtyper, duplicate/retry/order, downgrade PASS.
- [ ] Två samtidiga Checkout skapar inte dubbla Customers/subscriptions.
- [ ] Mobil 320/390/1280, tangentbord, fokus, labels och lokala loading/fel PASS.
- [ ] Full testsvit, typecheck, lint, build, native PG och npm audit godkända.
- [ ] Secret-/Gitignore-granskning utan riktiga nycklar i Git, output eller klientbundle.

## Drift och säkerhet

- [ ] Namnge ansvarig för 5xx, Auth/SMTP-fel, Storage upload/finalize/delete/cleanup,
  PDF-fel, transfer-fel, quota-fel och misslyckade/uteblivna Stripe-webhooks.
- [ ] Stripe-loggar: `stripe_webhook` + outcome + tillåtet event-ID/type. `processed`
  betyder accepterad hantering, även dubblett/ignorerat event, **inte** att Premium
  beviljats. Larma på processing_error/configuration_error, Stripe retry-backlog
  och ökande invalid_signature. Rate-limitera logginsamling vid signaturspam.
- [ ] Billing-/lookup-konfigurationsloggar innehåller bara fasta variabelnamn/orsaker.
  Larma på dessa; logga aldrig exceptions/raw SDK payloads för att felsöka.
- [ ] Vercel/WAF/access-loggar maskar `/transfer/<token>`, query-parametrar i
  auth-callback/signed Storage URLs, cookies och Authorization. Appens Next-devlogg
  ignorerar transfer-path och serverfunctions; leverantörsloggar har egen policy.
- [ ] Global no-referrer, nosniff och frame-ancestors 'none'/DENY verifierade externt.
  Transfer: private/no-store + noindex. PDF: private/no-store även CDN/Vercel.
- [ ] Full script-src-CSP är separat framtida arbete (Next-nonce/SSR-kompatibilitet).
  HSTS/TLS kontrolleras på den faktiska domänen; aktivera inte preload blint.
- [ ] Staging noindex/åtkomstskydd och webhookundantag granskade. Robots är inte auth.

## Rate limits före publik lansering

| Yta | Befintligt skydd | Åtgärd att verifiera före publik release |
| --- | --- | --- |
| Auth/signup | Supabase Auth-gränser, inputvalidering | Projektets SMTP/signup/login-gränser, CAPTCHA vid behov, kontrollerat missbrukstest |
| Lookup | Auth, PostgreSQL 10/min/konto, fail closed, timeout/body-limit | Global providerquota/kostnadsgräns och WAF mot masskonton |
| Transfer preview/accept | Auth, PostgreSQL preview 30/min och accept 10/10 min/konto, server-only RPC, capability och transaktionslås | Flood-test; WAF för anonym trafik och masskonton, inga råa capability-loggar |
| PDF | Auth, Premium, ägarskap, PostgreSQL 5/min/konto, 429, 60s route | Samtidighets-/kostnadsgräns och WAF; långhistorik kan förbruka minne |
| Checkout/Portal | Auth, PostgreSQL 5 respektive 10/10 min/konto, konto-lease, idempotency | Providerbudget och flerinstanstest; även Checkout-reuse konsumerar försök |
| Webhook | Signatur, idempotency, korta nätverkstimeouts | Skydda body/volym/loggkostnad; blockera inte legitima retries med för snäv WAF |

Rate limiting är distribuerad via PostgreSQL, utan Redis eller extern tjänst.
Verifiera migration 11, servernyckeln och fail-closed-beteende över flera instanser
i staging. Alla fönster/gränser finns i consume_rate_limit. Anonym IP-limitering
är inte implementerad; godtycklig x-forwarded-for används inte som identitet.
Webhook-retries omfattas inte av användarlimitern. Kvarvarande driftgränser ovan
ska fortfarande beslutas och verifieras före publik lansering.

## Retention, backup och återställning

- [ ] Applicera migration 12 och verifiera global dokumentstädning i STAGING:s testplan.
  Soft-deleted bytes och abandoned pending >3h städas; metadata behålls permanent i V1.
  Kvotan släpper vid soft-delete; fysisk lagring kan släpa efter.
- [ ] Konfigurera extern POST-scheduler varje timme och CRON_SECRET separat per miljö.
  Inget schema aktiveras av repo-konfigurationen; Vercel Cron använder GET.
  Verifiera fel secret, uteblivna körningar, felantal, upprepade fulla batcher och
  fem minuters lease/retry. Namnge driftansvarig; 50 objekt/timme kan kräva fler
  kontrollerade körningar vid backlog. Dölj Authorization och requestdata i driftloggar.
- [ ] Privata, ej valda filer efter transfer kan sakna åtkomlig ägare men fortfarande
  belasta tidigare kvotkonto. Besluta retention och administrativ borttagning; gör
  inte filerna publika och överför dem inte automatiskt. Ready + deleted_at null
  omfattas inte av automatisk cleanup; ägarbyte är aldrig i sig skäl att radera.
- [ ] Behåll billing event-ID:n tillräckligt länge för återleverans/restore; radering
  kan återöppna behandlingen av gamla events. Bevara Customer-idempotency state.
- [ ] Bestäm retention för utgångna/avbrutna transferrecords och hashcapabilities.
  Historiska ownerships och accepted grants används fortfarande av behörighetsmodellen.
- [ ] Backa upp PostgreSQL (schema/data/ownership/mappings) **och Storage-bytes separat**.
  Supabase databasbackup innehåller inte själva Storage-filerna.
- [ ] Genomför restoreövning till nytt isolerat projekt; jämför objekt/metadata,
  policies, triggers, auth/projektsecrets och miljöer före åtkomst.
- [ ] Stripe är extern källa. Efter DB-restore: stoppa nya billingförsök, stäm av
  Customer/subscription-id:n och aktuell Stripe-status genom betrodd serveradministration
  innan betalning öppnas. Replay ensam återställer inte alla tappade mappings.
- [ ] En kodrollback återställer inte databasen. Behåll bakåtkompatibilitet och
  dokumentera migrations-/backupåterställning; kopiera aldrig produktionsdata till preview.

## Produktionsöverlämning (separat godkännande)

- [ ] Alla hosted-blockerare stängda; ändringar granskade och PR mergad.
- [ ] Godkänd produktionsmigration med backup/restoreplan och kontrollerad destination.
- [ ] Separata produktionssecrets/Price/webhook, exakt APP_URL/redirects, ingen wildcard.
- [ ] Inga CLI testsecrets i liveendpoint; public anon-key är korrekt och ej privilegierad.
- [ ] Larm, rate limits, retentionansvar och incident-/rollbackkontakt aktiverade.
- [ ] Produktions-smoke utan destruktiva tester eller oauktoriserade livecharges.
