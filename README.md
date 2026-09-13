# Servicebok V2

Next.js App Router, strikt TypeScript, Tailwind och shadcn/ui.
Läs PRODUCT.md, AGENTS.md, DATABASE.md, ARCHITECTURE.md och DESIGN.md före större ändringar.

## Lokal setup

Node.js 24 LTS (`.nvmrc`) och npm krävs.

```sh
npm ci
```

Kopiera `.env.example` till `.env.local` (PowerShell: `Copy-Item .env.example .env.local`).
Ange servervariabeln `APP_URL=http://localhost:3000` samt
`NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY` från ett
Supabase-utvecklingsprojekt. Lämna `SUPABASE_SERVICE_ROLE_KEY` tom; den används inte.

Applicera migrationerna i en utvecklingsmiljö före signup och fordonsregistrering. Lokal Supabase kräver Docker
Desktop med Linux-motorn igång. Vid första installationen:

```sh
npx supabase init
npx supabase start
```

Init skapar CLI-konfiguration. Start applicerar migrationer vid första starten.
För en redan startad lokal databas används `npx supabase migration up --local`.
Kopiera lokal API-URL och anon-nyckel från CLI till `.env.local`.
Ingen hostad databas ändras automatiskt av denna kodändring.

```sh
npm run dev
```

Öppna http://localhost:3000. Utan session skickas användaren till /login.
Saknad konfiguration ger aldrig åtkomst till skyddade routes.
Committa aldrig lokala env-filer eller riktiga nycklar.

## Auth-inställningar

Aktivera e-post/lösenord i Supabase. Sätt minsta lösenordslängd till 8 tecken även i
Supabases projektinställningar; signup accepterar 8–128 tecken i applikationen.
Behåll e-postbekräftelse i produktion; utan bekräftelsekrav loggas nya konton in direkt.

Supabase Auth **Site URL** är applikationens bas-URL, inte callback-sökvägen.
Signup skickar explicit `options.emailRedirectTo = APP_URL + /auth/callback`.
Lägg callback-URL:en bland Supabases tillåtna **Redirect URLs**.

| Miljö | Servervariabel APP_URL / Site URL | Tillåten Redirect URL |
| --- | --- | --- |
| Local | `http://localhost:3000` | `http://localhost:3000/auth/callback` |
| Vercel preview | Preview-deploymentens exakta HTTPS-bas-URL | Samma bas-URL följd av `/auth/callback` |
| Production | Applikationens ordinarie HTTPS-bas-URL | Samma bas-URL följd av `/auth/callback` |

Konfigurera APP_URL separat för Development, Preview och Production i Vercel.
För preview används en exakt deployment-URL eller en stabil branch-alias som
öppnas i webbläsaren. Lägg till dess exakta callback i Supabase innan auth testas;
uppdatera APP_URL och gör en ny deployment om adressen ändras. Använd gärna en
separat Supabase-utvecklingsinstans för preview. Om preview delar Supabase med
produktion behåll Site URL som produktionsbasen och tillåt även exakt preview-callback.
Använd exakta redirects utan wildcard i produktion.

APP_URL är server-only och måste vara en bas-URL utan sökväg, query, fragment eller
inloggningsuppgifter. HTTPS krävs utom för localhost. Ingen fallback till request
Host, Origin eller formulärdata finns. Saknad/ogiltig APP_URL stoppar signup.
Även callbackens vidarekopplingar till dashboard/felsida använder denna konfiguration.
Använd bekräftelsemallen med `{{ .ConfirmationURL }}`. SSR använder PKCE;
callback utbyter koden mot session. Öppna bekräftelsen i samma webbläsare som signup.
Testa SMTP, bekräftelse och rate limits i utvecklingsprojektet före produktion.

## Session och säkerhet

- `proxy.ts` använder Supabase SSR och `getClaims()` för förnyelse. Cookies
  vidarebefordras till både request och response. Auth-svar använder private/no-store.
- `requireUser()` verifierar med `getUser()` på servern. Skyddad layout samt
  konto- och profilåtkomst använder kontrollen. Proxy är inte enda säkerhetslagret.
- React cache återanvänder verifieringen inom en rendering, inte mellan användare.
  App- och auth-layout är dynamiska.
- Cookies använder path /, SameSite=Lax och Secure i produktion. Produktion kräver HTTPS.
  Cookies är browser-läsbara för kompatibilitet med Supabases browserklient.
- Skrivbar serverklient används i actions/callback; skrivskyddad klient används i
  Server Components efter proxyn. Ingen klient använder service role.
- Zod validerar auth-input serverside. Signup kräver 8–128 tecken och matchande
  lösenord. Login tillåter även äldre kortare lösenord. Inget lösenord trimmas.
- Formulär behåller inmatning vid fel. Lösenord returneras aldrig i action-state.
  Råa auth-fel, tokens och lösenord loggas inte.
- Redirects är fasta interna routes. Godtyckliga next-parametrar används inte.
- Logout återkallar aktuell session, rensar SDK-cookies och invaliderar routercache.
  Andra enheter påverkas inte. Redan utfärdade JWT:er kan vara giltiga till utgång;
  använd rimlig tokenlivslängd i Supabase.

## Migration och RLS

`supabase/migrations/20260913000100_profiles.sql` skapar endast profiles.

- UUID refererar till auth.users(id), med cascade vid separat administrerad kontoradering.
- Fält och standardvärden följer DATABASE.md.
- SECURITY DEFINER-trigger med tom search_path skapar profilen med new.id i
  samma transaktion som Auth-användaren. Befintliga användare får profiler via backfill.
- Ingen klientstyrd metadata används för identiteten.
- profiles_select_own: SELECT endast när auth.uid() = id.
- profiles_update_own: samma villkor före och efter UPDATE.
- Kolumnprivilegier tillåter bara display_name, avatar_path, preferred_locale och timezone.
  Klienter saknar INSERT/DELETE-rättigheter.
- Trigger skyddar id och created_at. Återanvändbar set_updated_at sätter updated_at.
- Triggerfunktionerna får inte anropas direkt av anon/authenticated.

Kontovyn visar verifierad e-post och display name om det finns. Vid profilfel visas
ett begripligt meddelande och utloggning finns kvar.

## Databastyper

Generera från migrerad databas:

```sh
npx supabase gen types typescript --local --schema public > types/database.generated.ts
```

För hostad utvecklingsdatabas används --project-id i stället för --local.
Säkerställ UTF-8 vid omdirigering på äldre Windows PowerShell.
Granska och committa filen, koppla sedan Database till Supabase-klienternas generics.
Ingen genererad typfil har fabricerats: lokal Supabase var inte tillgänglig under
uppgiften. Profil- och fordonsvyerna använder Zod för sina begränsade svar tills typer kan genereras.

## Kontroller

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm start
```

Vitest testar validering, actions, serversession och cookie-förnyelse.
PGlite kör migrationsfilen i PostgreSQL via WASM under authenticated/anon.
Testet ersätter auth.users/auth.uid med ett minimalt testkontrakt och testar riktig
SQL, triggers och RLS. Det ersätter inte ett integrationstest av Supabase Auth/GoTrue.

Sluttest i separat Supabase-utvecklingsmiljö:
1. Skapa konton A/B, bekräfta e-post och kontrollera att profiler skapats.
2. Logga in som A; öppna alla fem skyddade routes och /account.
3. Läs egen profil via direkt Supabase-anrop; försök läsa/ändra B:s profil.
   B ska inte returneras eller ändras. Ändring av id, insert och delete ska nekas.
4. Kontrollera att utgångna sessioner förnyas och cookies sparas.
5. Logga ut; /dashboard och /vehicles ska leda till /login, även efter bakåtnavigation.
6. Kontrollera felaktiga lösenord, utgångna bekräftelser och återkallad session.

## Struktur och scope

- app/(auth): login, signup och Server Actions.
- app/auth: PKCE-callback och bekräftelsefel.
- app/(app): skyddad AppShell och fem appvyer.
- components/auth och components/ui: formulär, logout och primitives.
- lib/auth, lib/validation, lib/supabase: verifiering, schemas och klienter.
- services/profiles: egen profil från verifierad identitet.
- supabase/migrations och tests: SQL och säkerhetstester.

Fordonslistan, manuell registrering och fordonsprofil använder lagrad data.
Dashboard visar senast skapade aktiva fordon eller en action för att lägga till ett.
Globala Ny leder till en ny servicehändelse eller ett fordonsval. Fordonsprofilen
visar servicehistorik med skapa, redigera och soft delete, samt privata dokument.
Ingen Stripe, PDF-export, externa fordons-API:er eller AI ingår.
Theme i app/globals.css, spacing med 4 px-bas, sidebar från 768 px.
Laddningsindikering är lokal på submitknappen.

## Fordon och ägarskap

`supabase/migrations/20260913000200_vehicles.sql` körs efter profiles-migrationen.
Den skapar `vehicles`, `vehicle_ownerships`, normaliseringstrigger, updated_at-trigger,
constraints, index och följande policies:

- `vehicles_select_active_owner`: SELECT kräver egen aktiv owner-relation utan ended_at.
- `vehicles_update_active_owner`: samma villkor före och efter UPDATE.
- `vehicle_ownerships_select_own`: användaren kan läsa egna aktuella och historiska relationer.

Klienter saknar INSERT/DELETE på vehicles och alla skrivrättigheter på ownerships.
Vehicle UPDATE begränsas till fordonsfält; id, timestamps och extern datakällas
proveniens är inte klientredigerbara. Servicehistorik-migrationen återkallar även
direkt UPDATE av current_mileage, eftersom värdet nu beräknas från miltalshistoriken.
Ingen redigeringsvy för hela fordonet ingår ännu.
Ownership-policy gör ingen join tillbaka till vehicles, vilket undviker RLS-rekursion.

RPC `create_vehicle` skapar fordon och ownership i samma PostgreSQL-transaktion.
Den använder enbart `auth.uid()` och har inget user_id-argument. Misslyckad ownership
rullar tillbaka fordonet. Funktionen är SECURITY DEFINER med tom search_path och
kvalificerade tabellnamn; endast authenticated har EXECUTE, och null-identitet nekas.
Ingen service role används. Vanliga klienter kan inte ändra ägare efter skapandet.

`lib/permissions/vehicle.ts` verifierar användaren med requireUser och kontrollerar
aktiv ägarrelation. Ogiltigt UUID, saknad eller annan ägares relation ger samma
Not Found. Läsningen efter kontrollen omfattas också av RLS om ägarskap ändras under
anropet. Databasfel behandlas som fel, aldrig som tomma listor eller godkänd åtkomst.
`services/vehicles` hanterar databasåtkomst och serverside Zod-validering.

Routes: `/vehicles`, `/vehicles/new`, `/vehicles/[vehicleId]` och minimal `/dashboard`.
Formuläret behåller inmatning vid fel och visar lokal sparstatus. Fordonsprofilen
visar nu tidslinjen från service_events.

Beslut för denna fas:

- Årtal 1886–2100 i både servervalidering och databas; stabil gräns utan tidsberoende CHECK.
- Registreringsnummer högst 32 tecken, VIN högst 64, märke/modell 100, bränsle 50.
  Identifierare normaliseras med versaler och borttagen whitespace; tomma värden blir null.
  Ingen strikt modern VIN- eller registreringsnummermall och ingen global unikhet införs
  för obekräftade manuella identifierare. Dubbletter ger aldrig åtkomst till befintliga fordon.
- Heltalsmiltal i svenska mil, 0–2147483647 enligt PostgreSQL integer. Tomma nummerfält
  blir null. Mileage history tillkom i migrationen för servicehistorik nedan.
- Partial unique index garanterar en aktiv owner per fordon. Ended/revoked kräver ended_at.
  Foreign keys använder RESTRICT för att bevara ägarhistorik. Kontoradering för konton
  med ägarhistorik kräver därför ett separat administrerat bevarandeflöde.
- Native select används för fordonstyp tillsammans med befintliga shadcn-primitives.
  Inga nya beroenden eller ändringar i auth-grunden.

Fordonskontroller ingår i `npm test`: Zod/normalisering, service/actions/permissions
och PostgreSQL-tester i PGlite med två användare. SQL-testerna kör båda migrationerna,
atomisk rollback vid FK-fel, läs-/skrivisolering, gamla ägares förlorade åtkomst,
unika aktiva ägare, direkta klientmutationer, constraints och RPC-rättigheter.

Återstår i hostad Supabase-utvecklingsmiljö före produktion:

1. Applicera båda migrationerna och generera databastyper enligt avsnittet ovan.
2. Logga in som A, skapa fordon med och utan valfria fält; kontrollera listan och profilen.
3. Logga in som B och prova A:s URL samt direkta Supabase SELECT/UPDATE-anrop.
4. Försök direkta ownership INSERT/UPDATE/DELETE och RPC med falskt user_id; alla ska nekas.
5. Bekräfta PostgREST-schema/RPC, riktiga JWT/GoTrue-sessioner och formulärflödet på mobil.
   PGlite-tester verifierar PostgreSQL men ersätter inte dessa tjänsteintegrationer.

## Servicehistorik och miltal

Migration `supabase/migrations/20260913000300_service_history.sql` skapar
`service_events` och `mileage_entries`. Kör den efter de två tidigare migrationerna
i en utvecklingsmiljö. Ingen hostad databas ändras automatiskt.

Serviceposter har kategorier enligt DATABASE.md, datum, titel, miltal, kostnad i
ören (endast SEK), utförare, beskrivning, anteckningar, källa och deleted_at.
Miltalsposter har författare, miltal i mil, tidpunkt, källa och eventuell event-koppling.
En unik event-koppling och sammansatt foreign key förhindrar dubbla kopplade poster
eller att en miltalspost hör till ett annat fordon än sin servicehändelse.
Tidslinjeindex följer vehicle_id, event_date och created_at; mileage-index stödjer
fordon och event. updated_at använder befintlig trigger.

### Mutationer och säkerhet

- `create_service_event`, `update_service_event` och `soft_delete_service_event`
  kör atomiskt. Alla använder auth.uid(), kontrollerar aktiv owner och tar inget
  auktoritativt user_id. Event-id binds alltid till vehicle-id även på databasnivå.
- Endast authenticated har EXECUTE. SECURITY DEFINER används för att skriva till
  tabeller där klienten saknar skrivrättigheter. Alla funktioner har tom search_path
  och kvalificerade tabellnamn; service role används inte.
- Privata helpers `lock_service_vehicle` och `sync_service_mileage` är inte
  anropbara av klienter. Mutationerna låser fordonet och den aktiva ägarrelationen
  före skrivning. Det serialiserar miltalsändringar per fordon och hindrar samtidig
  återkallelse av ägarskapet mitt i operationen. Ett framtida transferflöde måste
  följa samma låsordning: vehicle först, ownership därefter.
- RLS `service_events_select_active_owner` tillåter endast aktiv ägare att läsa
  ej borttagna händelser. `mileage_entries_select_active_owner` använder samma
  ägarmodell och döljer rader kopplade till borttagna händelser.
- Klienter har enbart SELECT på de två tabellerna, inga direkta INSERT/UPDATE/DELETE.
  Mutationer går genom RPC. created_by_user_id, vehicle_id, source_type, currency
  och timestamps kan inte ändras genom redigeringsfunktionen.
- Befintlig requireVehicleAccess återanvänds för all serviceåtkomst på servern.
  Ogiltig/saknad/borttagen/otillgänglig event-route ger Not Found utan privat data.
  Råa databasfel och anteckningar visas eller loggas inte.

### Miltalssynkronisering

Migrationen bevarar varje befintligt current_mileage som en manuell grundpost,
med nuvarande eller senaste ägare och fordonets updated_at som känd tidpunkt.
Om ett befintligt fordon har miltal men ingen ägarhistorik avbryts migrationen av
NOT NULL/FK i stället för att tappa grundvärdet. Tabellerna låses under backfill.

create_vehicle behåller signatur och ägarskapskontroll, men registrerar nu även
angivet initialt miltal i samma transaktion som fordon och ägare. Detta är den
enda ändringen av skapaflödet utöver att direkt klientuppdatering av den härledda
current_mileage-kolumnen återkallas. Auth och ownership-policies ändras inte.

Ett event med miltal skapar en länkad mileage_entry. Vid redigering uppdateras
samma rad och datumet följer event_date (midnatt Europe/Stockholm). Om miltalet
tas bort avlägsnas dess länkade miltalsrad. Vid soft delete bevaras event och
länkad rad fysiskt, men de exkluderas från normal läsning och beräkningen.
Originalförfattarens attribution bevaras även när en senare ägare redigerar.

Efter varje mutation är current_mileage MAX av fristående poster och poster
kopplade till ej borttagna events, eller null om inga relevanta poster finns.
Ett gammalt event vid 8 500 mil sänker därför aldrig en grundpost på 12 000 mil.
Om ett event vid 15 000 mil tas bort återgår värdet till högsta återstående post.
Alla steg rullas tillbaka om någon del misslyckas. Manuella mätarställningskorrigeringar
är inte ett separat flöde i denna uppgift; grundposten ska inte raderas från klienten.

### UI och beslut

- Routes `/vehicles/[vehicleId]/events/new` och `/vehicles/[vehicleId]/events/[eventId]`.
  Redigering använder samma route med `?edit=1` och samma formulärkomponent.
- Fordonsprofilen visar tidslinje, nyast event_date först, därefter created_at och
  id som stabil tredje sortering. Enkel sidindelning med 30 poster förhindrar att
  äldre historik kapas tyst av Supabases gräns. Nyare/äldre länkar finns vid behov.
- `/new`: noll fordon ger Lägg till fordon, ett fordon leder direkt till formuläret,
  flera ger ett enkelt fordonsval. Dashboard behåller sin begränsade fordonsöversikt.
- Datum föreslås som dagens svenska datum, kategori Service och miltal från fordonet.
  Miltal kan lämnas tomt eller ersättas med lägre historiskt värde.
- Datum 1886-01-01–2100-12-31 accepteras; framtida datum inom intervallet blockeras inte.
  Titel/utförare högst 150 tecken, beskrivning/anteckningar 5 000.
- Kostnad anges i kronor med punkt eller komma och högst två decimaler, utan
  tusentalsavskiljare. `kronorToOre` använder decimaltext och BigInt, aldrig
  flyttalsmultiplikation. Gräns 21 474 836,47 kr motsvarar PostgreSQL integer i ören.
- Mer information innehåller sekundära fält. Valideringsfel bevarar inmatning,
  submit visar lokal status och borttagning kräver separat bekräftelse.
- Inga nya beroenden, dokument, lookup, transfer, serviceintervall, Stripe, PDF,
  AI eller service_event_items ingår. Inga fabricerade genererade databastyper.

### Verifiering och kvarstående integration

`npm test` omfattar pengar, datum, validering, services/actions och PGlite med
samtliga tre migrationer. SQL-testerna täcker A/B-isolering, avslutat ägarskap,
klientmutationer, privata funktionsrättigheter, baseline/backfill, skapa/redigera/
soft delete, max-omräkning, null/0 och rollback om slutuppdateringen misslyckas.
Typecheck, lint och produktionsbygge körs separat.

Lokal webbläsarkontroll använder API-testdata vid 320, 390 och 1280 px för formulär,
tidslinje, detalj, redigering, bekräftad borttagning, tomt läge och globala Ny.
Den ersätter inte riktig Supabase-integration. Före produktion behövs:

1. Applicera migrationen i Supabase-utvecklingsinstansen och generera databastyper.
2. Testa riktiga sessioner/JWT och PostgREST-RPC med två konton, inklusive direkta
   otillåtna SELECT/INSERT/UPDATE/DELETE-anrop och avslutad ownership.
3. Testa samtidiga händelseändringar och kontrollera låsning/omräkning i hostad PostgreSQL.
4. Genomför skapa, redigera och ta bort på mobil med riktig data; verifiera att
   grundmiltal och tidigare historik bevaras. Ingen återställnings-UI för borttagna poster ingår.

## Privata dokument

Migration `supabase/migrations/20260913000400_documents.sql` körs efter servicehistoriken.
Den skapar documents och service_event_documents med foreign keys, index och RLS,
samt den privata bucketen `vehicle_documents`. Ingen hostad miljö ändras automatiskt.
Storage måste finnas med `storage.allow_any_operation(text[])`. Kontrollera med:

```sql
select to_regprocedure('storage.allow_any_operation(text[])');
```

Om resultatet är null behöver Storage uppdateras innan migrationen körs. Ta inte
bort operationskontrollen för att få migrationen att passera: den skiljer radering
från nedladdning av redan dolda filer. Befintliga globala Storage-policies bör också
granskas i utvecklingsinstansen.

### Uppladdning

1. Användaren väljer dokumenttyp och en fil. Klient och server validerar filnamn,
   MIME och storlek. PDF, JPEG och PNG stöds, max 15 MiB (15 728 640 bytes; visas som
   15 MB i UI). HEIC skjuts upp eftersom webbläsarstöd/konvertering kräver separat arbete.
2. Servern verifierar requireVehicleAccess. RPC `create_document` verifierar också
   auth.uid() och aktiv owner under befintlig vehicle/ownership-låsning, och skapar
   pending metadata med uploaded_by_user_id från auth.uid(). Event-koppling valideras
   och sparas atomiskt med metadata om eventId angavs.
3. Databasen genererar dokumentets slumpmässiga UUID. Path blir
   `vehicle_id/document_id/original`, aldrig användarens filnamn. CHECK och unikhet
   skyddar formatet. Inga filbytes laddas upp om metadata misslyckas.
4. Servern utfärdar en signerad upload-token för exakt path, utan upsert. Browsern
   använder Supabase uploadToSignedUrl. Filbytes går direkt till privat Storage,
   vilket undviker stora filkroppar genom Next.js/Vercel-funktioner. Ingen service role.
5. RPC `finalize_document` kontrollerar verklig Storage-objektmetadata: exakt storlek
   och MIME måste matcha reserverad metadata. Ägarskap, uppladdare, timeout och att
   kopplad servicehändelse fortfarande finns kontrolleras igen. Först då blir dokumentet
   ready och synligt. Bekräftelse kan upprepas utan dubbelregistrering om svaret tappas.

Extra lifecycle-fält är upload_status (pending/ready) och storage_deleted_at för
bekräftad fysisk städning. Övriga fält följer DATABASE.md. UI skapar bara private;
datamodellen accepterar även transferable/shared utan att ge nya delningsrättigheter.
Dokumentkopplingens trigger nekar olika vehicle-id även vid privilegierade inserts.
Klienter har ingen direkt skrivrätt till metadata eller kopplingar.

### RLS och Storage-policies

- `documents_select_active_owner` visar endast ready, ej borttagna dokument för
  aktiv owner. `service_event_documents_select_active_owner` kräver synligt dokument
  och synlig servicehändelse. Pending/deleted metadata är inte normalt läsbar.
- `vehicle_documents_insert` tillåter endast exakt reserverad pending-path för
  uppladdaren som fortfarande är aktiv owner. Signering tillåts de första 15 minuterna.
- `vehicle_documents_read` kräver ready, ej borttaget dokument och aktiv owner.
- `vehicle_documents_delete` tillåter fysisk borttagning först efter soft delete.
  `vehicle_documents_delete_select` ger den SELECT som Storage remove behöver enbart
  under `object.delete`/`object.delete_many`, aldrig för signering eller nedladdning.
- Restriktiva read/insert/delete-fences, no_update och no_anon skyddar denna bucket
  även om andra features har breda permissiva Storage-policies. Andra buckets påverkas inte.
- `document_object_access` är en begränsad SECURITY DEFINER-helper med tom search_path,
  kvalificerade tabeller och kontroll av auth.uid(). Den returnerar bara boolean och
  undviker RLS-rekursion. Mutations-RPC:er har EXECUTE endast för authenticated.
- Ingen offentlig URL, ingen UPDATE/upsert av objekt och ingen permanent klient-DELETE
  av metadata. Auth, ownership och servicehistorikens mutationsarkitektur ändras inte.

### Öppna och ta bort

`createDocumentDownloadUrl` verifierar vehicle access och hämtar exakt ready/ej borttaget
dokument inom fordonet. Storage RLS kontrollerar åtkomst igen vid signering. URL gäller
i 300 sekunder och använder attachment/filnamn för vanlig nedladdning; ingen inbäddad
PDF/bildvisare eller offentlig thumbnail byggs. Länkar sparas inte i databasen eller loggar.
En redan utfärdad URL är en tidsbegränsad åtkomstnyckel och kan fortfarande fungera till
utgång om fysisk filradering misslyckas. Nya URL:er för soft deleted dokument nekas.

Borttagning kräver bekräftelse. `soft_delete_document` sätter deleted_at först;
kopplingar ligger kvar för spårbarhet men försvinner ur normala queries. Servern
anropar därefter Storage remove. Misslyckad fysisk radering lämnas som retrybar
städpost. Ingen återställnings-UI ingår och lyckad fysisk radering tar bort filbytes.

### Avbrutna uppladdningar och driftstädning

Vid signerings-/uploadfel avbryts pending metadata där anropet når servern. Om
bekräftelsen misslyckas kan samma uppladdning bekräftas igen. En stängd flik kan lämna
pending metadata/filer, vilket hanteras av cleanupDocuments före nästa uppladdning.
Den behandlar högst 20 kandidater per körning för det behöriga fordonet:

- `document_cleanup_candidates` soft deletar pending äldre än tre timmar och returnerar
  dessa samt tidigare soft deleted dokument som inte är färdigstädade.
- Storage remove körs via användarsession, därefter `complete_document_cleanup`.
  Databasen markerar städning först när Storage-objektet verkligen saknas.
- Tre timmar ger marginal för signerade upload-token: de gäller två timmar och kan
  utfärdas under de första 15 minuterna. En gammal token kan återlägga en fysiskt raderad
  fil före utgång, men aldrig göra deleted metadata synlig. Slutstädningen sker efteråt.

För konton som inte laddar upp igen behövs en återkommande driftstädning före produktion.
Den är inte schemalagd av denna PR. Kör samma kandidater → Storage API remove → complete
med behörig användarsession. Historiska fordon utan aktiv ägare kräver ett separat
administrerat städflöde. Radera aldrig storage.objects med SQL för att radera filbytes.
Soft deleted metadata bevaras som spårbarhet även efter fysisk städning.

### UI, queries och validering

- Route `/vehicles/[vehicleId]/documents` visar dokumenttyp, filnamn, datum, filtyp,
  storlek och kopplad servicehändelse. Listan har 30 poster per sida.
- Servicehändelsens detaljsida visar DocumentCard och uppladdning. Skapa/edit-formuläret
  hänvisar till uppladdning efter sparad händelse; databastran­saktionen blandas inte med filöverföring.
- ServiceEventCard visar Dokument finns via en inbäddad relation i samma listquery.
  Dokumentlistans eventtitlar hämtas också som relation; inga separata frågor per event.
- Standard file input låter mobilen välja fil/bild och ta foto när webbläsaren stöder
  detta. Status och fel är lokala, vald fil behålls vid fel, och slutbekräftelse kan återförsökas.
- Filnamn max 180 tecken efter att kontrolltecken/bidi-kontroller rensats och slash ersatts.
  Läsbart originalnamn sparas som metadata och visas som React-text, aldrig HTML eller path.
- MIME valideras i browser, serverschema, DB och bucket; verklig lagrad storlek/MIME
  kontrolleras vid finalize. Ingen fullständig content sniffing, antivirus eller PDF-
  innehållsanalys ingår: MIME kan förfalskas, och en tillåten MIME garanterar inte ofarligt
  filinnehåll. Signed upload gör att bytes inte passerar appservern. Utvärdera separat
  filskanning före bred publik lansering. SVG/HTML/scripts/executables accepteras inte som typer.

### Verifiering före produktion

Tester täcker metadata/RPC, två användare, cross-vehicle-kopplingar, pending/ready/deleted,
Storage-policyoperationer, breda befintliga policies, MIME/storlek, paths, cleanup och
signerad nedladdning. PGlite kör alla fyra migrationer med minimala Auth/Storage-tabeller
och en fixture för Storage-operation-helpern. Det testar PostgreSQL-regler, inte Storage-
tjänstens tokenverifiering, objektlagring, CORS, CDN eller HTTP-implementation.

Lokal Edge-kontroll med API-testdata kör upload från event, dokumentlista, signed download,
delete-bekräftelse, tomt state och filfel vid 320/390/1280 px. Inga riktiga privata filer används.

I riktig Supabase-utvecklingsmiljö återstår att applicera migrationen, generera typer
från verkligt schema och testa signerad upload/download, MIME/storleksgränser, CORS,
RLS med A/B, förlorat ägarskap, expired tokens, direkt Storage overwrite/sign/delete,
borttagen event under upload samt fysisk radering och återförsök efter Storage-fel.
Ingen hostad databas har migrerats och inga genererade typer har fabricerats.

## Referenser

- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase användardata](https://supabase.com/docs/guides/auth/managing-user-data)
- [Signerad uppladdning och tokenlivslängd](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl)
- [Signerad nedladdning](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl)
- [Storage RLS och operationskontroller](https://supabase.com/docs/guides/storage/schema/helper-functions)
