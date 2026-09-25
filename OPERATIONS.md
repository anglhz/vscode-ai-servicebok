# Driftansvar V1

## Primär ansvarig

- Produktägare/admin för Servicebok.

En namngiven person och kontaktväg kan fyllas i här senare. Rollen ansvarar för
att granska driftstörningar, samordna åtgärder och dokumentera verifieringen.
Planen dokumenterar ansvar och rutiner; den innebär inte att övervakning eller
schemaläggning har aktiverats eller verifierats. Releasekontroller följs i
[PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

## Bevakas

- Vercel 5xx.
- Deployment-fel.
- Supabase Auth/SMTP-fel.
- Storage upload/finalize/delete/cleanup-fel.
- PDF-exportfel.
- Transfer-fel.
- Quota/plan-limit-fel.
- Stripe webhook `processing_error`.
- Stripe webhook `configuration_error`.
- Stripe retry-backlog.
- Ökande `invalid_signature` på Stripe webhook.
- `document_cleanup` där `failed > 0`.
- Upprepade fulla cleanup-batcher, exempelvis `claimed = 50`.
- Uteblivna schemalagda cleanup-körningar.

## Första åtgärd vid incident

1. Kontrollera Vercel logs och deployment-status.
2. Kontrollera Supabase logs/status.
3. Kontrollera Stripe webhook deliveries om billing påverkas.
4. Kontrollera cron/schedulerhistorik om cleanup påverkas.
5. Pausa nya billing-/cleanup-försök om incidenten riskerar dubbla betalningar
   eller felaktig dataradering.
6. Dokumentera tid med tidszon, miljö, påverkan, senaste lyckade körning, åtgärd
   och verifiering efter fix. Ange om senaste lyckade körning ännu är okänd.

Återuppta pausade försök först när orsaken är hanterad och resultatet verifierat
i den berörda miljön. En lyckad deployment ensam bevisar inte att incidenten är löst.

## Sekretess i incidenthantering

Följande får aldrig kopieras till incidentanteckningar, issue-kommentarer eller
screenshots:

- Service role key.
- Stripe secret eller webhook secret.
- `CRON_SECRET`.
- Authorization headers.
- Cookies och session tokens.
- Transfer capabilities/tokens.
- Signed Storage URLs.
- Råa webhook payloads med betaldata.
- Kompletta råa SDK-felobjekt om de kan innehålla känsliga värden.

Sammanfatta felet med säkra statusar, counts och tidpunkter. Maskera känsliga
värden innan material delas; kopiera inte råa felobjekt för att felsöka.

## Billing incident

- Stoppa inte Stripe retries permanent. Skilj på att pausa nya billingförsök
  och att kunna ta emot legitima webhook-retries.
- Radera inte idempotency-/event-state för att ”fixa” problem.
- Kontrollera aktuell Stripe subscription som extern källa innan lokal
  billing-state ändras manuellt. Bevara Customer-/subscription-mappningar.
- Vid osäkerhet: stoppa nya billingförsök hellre än att skapa dubbla Customers
  eller subscriptions.

## Cleanup incident

- `failed > 0` ska granskas. Enstaka transienta fel kan återförsökas automatiskt
  av nästa schemalagda körning efter att reservationen löpt ut.
- Upprepade fulla batcher kan indikera backlog. Kontrollera även om samma
  permanenta fel hindrar kön från att minska.
- Höj inte batchstorlek eller cron-frekvens blint; granska först Storage/API-
  belastning och felorsak.
- Inga dokument med `upload_status = 'ready'` och `deleted_at is null` ska
  raderas av cleanup, inte heller enbart för att ett ägarbyte gjort dem otillgängliga.
- Vid misstänkt felaktig radering: pausa nya scheduleranrop och andra nya
  cleanup-försök. En paus återställer inte bytes som redan har raderats.

Konfiguration, femminutersreservationer och syntetiska verifieringssteg finns i
[STAGING.md](STAGING.md#schemalagd-dokumentstädning-migration-12).

## Backup/restore

**Backup/restore är inte verifierat och får inte markeras som PASS.** Det är ett
kvarvarande produktionskrav i [TODO #18: backup/restore before production launch](https://github.com/anglhz/vscode-ai-servicebok/issues/18).

Databasbackup och Storage-bytes behöver säkerhetskopieras separat. En faktisk
restoreövning i ett nytt isolerat projekt ska verifiera schema/data, objekt och
metadata, policies, triggers, Auth/projektkonfiguration och miljövariabler.
Efter restore ska aktuellt Stripe-state och Customer-/subscription-mappningar
stämmas av innan nya billingförsök öppnas. Dokumentera ansvar, retention,
frekvens, återställningssteg och rollback enligt issue #18.

Verifierad staging-cleanup eller gröna lokala tester ersätter inte restoreövningen.
