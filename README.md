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
Supabase-utvecklingsprojekt. Billing kräver även servervariabeln
`SUPABASE_SERVICE_ROLE_KEY` och de fyra Stripe-variablerna i `.env.example`.
Service role får aldrig exponeras för webbläsaren.

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
- Redirects är fasta interna routes, med en strikt validerad överföringsroute som
  fortsättning efter inloggning. Godtyckliga next-parametrar används inte.
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
Projektet innehåller nu även dokument, valfri fordonslookup, serviceplan,
ägarbyte, PDF-export och Stripe Billing. AI ingår inte.
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
  återkallelse av ägarskapet mitt i operationen. Ägaröverföringen följer
  samma låsordning: vehicle först, ownership därefter.
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

Ägaröverföringsmigrationen skärper nedanstående dokumentåtkomst till aktiv owner
som själv laddat upp filen eller fått den via explicit accepterad transfer.
Samma regel gäller metadata, Storage och cleanup; se Säker ägaröverföring nedan.

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

Global driftstädning kompletterar detta även för inaktiva konton; se
”Schemalagd dokumentstädning” nedan. Användarflödet och dess behörigheter är
oförändrade. Radera aldrig storage.objects med SQL för att radera filbytes.
Soft deleted metadata bevaras som spårbarhet även efter fysisk städning.

### Schemalagd dokumentstädning

Migration `20260924001200_document_retention_cleanup.sql` och serverrutinen
`services/document-cleanup` städar globalt utan användarcookie/aktuellt ägarskap.
`POST /api/internal/document-cleanup` kräver `Authorization: Bearer <CRON_SECRET>`.
Generera minst 32 slumpbytes (t.ex. base64-kodade) och lagra som serversecret,
separat för local/staging/production. Ingen `NEXT_PUBLIC_`-variant. Även
`SUPABASE_SERVICE_ROLE_KEY` krävs. `npm run check:config` kontrollerar konfigurationens
form utan att visa värden. Saknad/svag cron-secret stänger endpointen (503);
saknad/fel Authorization ger 401. Body, querystring och cookies väljer inga dokument.

- Pending äldre än tre timmar markeras soft-deleted och filbytes städas.
- Redan soft-deleted dokument med `storage_deleted_at is null` städas först när
  `created_at` är äldre än tre timmar, så gamla upload-capabilities har gått ut.
- Aktiva ready-dokument och transfer-orphaned, otillgängliga ready-dokument med
  `deleted_at is null` städas aldrig. Ägarbyte i sig är aldrig en raderingsgrund.
  Oavslutade pending-uppladdningar följer samma tretimmarsregel oavsett ägare.
- Dokumentraden och dess historiska kopplingar behålls; endast bytes raderas och
  `storage_deleted_at` sätts. Ingen visibility, ownership eller quota-attribution ändras.
  Soft-delete frigör logisk kvot som tidigare; fysisk lagring kan släpa efter.

Högst 50 dokument per HTTP-körning, fem samtidiga Storage-anrop, fem sekunders
timeout per nätverksanrop och gemensam deadline 45 sekunder inom routens 60 sekunder.
SQL begränsar RPC-batchen till 1–100 och använder ett partiellt kandidatindex.
`FOR UPDATE SKIP LOCKED` kombineras med fem minuters beständig reservation i
`private.document_cleanup_claims`. Token och expiry skyddar completion efter att
claimtransaktionen committats. En krasch/fel lämnar jobbet retrybart när reservationen
går ut; gamla workers kan inte slutföra en ny workers reservation.

Storage remove körs via privat bucket `vehicle_documents`. Lyckat svar (även tomt)
eller explicit `NoSuchKey` följs av completion-RPC, som dessutom kontrollerar att
objektet saknas i `storage.objects`. Generisk 404 och andra fel är inte bevis på
att rätt objekt saknas. Fel för en fil stoppar inte andra; logg/response innehåller
bara status och claimed/deleted/failed. Crash efter delete men före completion
återhämtas med idempotent remove och completion. Metadata raderas aldrig.

**Schemat är inte aktiverat av koden.** Vercel Cron skickar GET och passar därför
inte denna POST-only-endpoint ([officiell dokumentation](https://vercel.com/docs/cron-jobs)).
Konfigurera en betrodd extern scheduler varje timme enligt STAGING. Ingen GET-brygga
eller `vercel.json`-cron tillkommer. Övervaka missade körningar, failed > 0 och
upprepade fulla batcher; 50/timme är en kapacitetsgräns, inte en garanti för rensad kö.
Stoppa schemat för att pausa framtida borttagning; redan raderade bytes återställs
bara från separat Storage-backup. Databasbackup innehåller inte filbytes.

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

## Fordonslookup

`/vehicles/new` erbjuder Sök fordon och Lägg till manuellt. Sökningen skapar aldrig
ett fordon: förhandsvisningen måste först bekräftas med Lägg till fordon. Användaren
kan korrigera märke, modell, årsmodell, miltal i mil, bränsle och fordonstyp.
Registreringsnummer och VIN är låsta vid lookup, både i UI och vid serversparande.
För att använda andra identifierare väljer användaren manuell registrering, utan
extern proveniens. Befintlig ownership-kontroll gäller i båda fallen.

### Provider och konfiguration

`services/vehicle-data/provider.ts` definierar VehicleProvider med
`lookupByRegistrationNumber`. `types.ts` är den interna modellen och
`normalizers/http.ts` översätter adapterfält till våra fältnamn. UI och vehicles
är oberoende av externa svar. Ingen namngiven kommersiell leverantör har valts eller
liveanslutits i denna PR; `http-json` är en konfigurerbar HTTP-adapter med följande
uttryckliga kontrakt, inte en utfästelse om kompatibilitet med valfritt fordons-API.
När leverantör och dokumentation finns implementeras dess adapter bakom samma interface.
Produktionskod innehåller inga exempelregistreringar eller mockfordon.

Alla variabler nedan är server-only och valfria för manuell registrering:

| Variabel | Användning |
| --- | --- |
| `VEHICLE_PROVIDER` | `http-json` aktiverar HTTP-adaptern; tomt eller okänt värde stänger av lookup. |
| `VEHICLE_API_BASE_URL` | Betrodd HTTPS-basadress till en tjänst som uppfyller kontraktet. |
| `VEHICLE_API_KEY` | Skickas endast från servern som Bearer-header. |
| `VEHICLE_LOOKUP_SIGNING_SECRET` | Slumpmässig hemlighet med minst 32 bytes, samma värde i servermiljön och databasens privata konfiguration. |

Inga variabler har NEXT_PUBLIC-prefix. Konfigurera separata nycklar för lokal,
preview och produktion. Instanser som delar databas måste använda samma signeringsnyckel.
Nyckelbyte ogiltigförklarar tidigare förhandsvisningar; användaren kan söka igen.
HTTP till localhost är endast tillåtet utanför production. URL från klienten,
credentials/query/fragment i basadressen och HTTP-redirects accepteras inte.

Adaptern skickar `GET <base>/vehicles/<normaliserat registreringsnummer>` med
`Authorization: Bearer <VEHICLE_API_KEY>` och `Accept: application/json`.
200-svaret ska vara JSON med ett `vehicle`-objekt:

| Externt fält | Typ och betydelse |
| --- | --- |
| registrationNumber, make, model, vehicleType | Obligatoriska strängar. Fordonstyp är car, motorcycle, moped, motorhome, caravan eller other. |
| vin, fuelType, color, id | Valfria strängar eller null. id blir external_provider_id. |
| modelYear, vehicleYear, powerKw | Valfria heltal eller null. År 1886–2100, effekt i kW ≥ 0. |
| firstRegistrationDate | Valfritt giltigt ISO-datum YYYY-MM-DD eller null. |

Registreringsnummer normaliseras med befintlig helper (`abc 123` → `ABC123`).
Lookup accepterar 2–32 alfanumeriska tecken efter normalisering; manuell registrering
behåller tidigare friare regler för äldre/andra fordon. VIN normaliseras också.
Ett svar för ett annat registreringsnummer nekas. Stränglängder, kontrolltecken,
år, effekter, datum, externa svar och den interna modellen valideras med Zod.
Okända råfält, inklusive eventuell ägarinformation, sparas eller returneras inte.
Extern MIME/JSON kontrolleras och svaret begränsas till 64 KiB även vid streaming.

Server action `searchVehicle` verifierar requireUser innan provideranrop. Request och
body har fem sekunders timeout; ingen automatisk retry eller refresh görs. 404,
429, timeout, nätverksfel, felaktiga svar och providerfel ger svenska meddelanden
och manuell fallback utan rå feltext. Lookup har högst tio försök per användare
och minut via en atomisk PostgreSQL-räknare som delas av alla serverinstanser.
DB-fel stoppar lookup före provideranrop. Se ”Distribuerad rate limiting” nedan;
leverantörens globala kontokvot/kostnadsgräns behövs fortfarande före publik drift.

### Migration, proveniens och säkerhet

Kör `supabase/migrations/20260913000500_vehicle_lookup.sql` efter dokumentmigrationen
i en utvecklingsmiljö. Den använder pgcrypto/HMAC-SHA256 i `extensions`; om pgcrypto
redan är installerat i annat schema behövs administrerad anpassning före migration.
Ingen hostad databas ändras av PR:en.

Migrationen skapar `private.vehicle_lookup_config` med en singleton-rad och
`signing_secret`. Den har RLS utan klientpolicies och inga rättigheter för
public/anon/authenticated; private ska inte exponeras som API-schema. Lägg separat
in samma slumpmässiga hemlighet som serverns `VEHICLE_LOOKUP_SIGNING_SECRET` genom
en betrodd administrativ databasanslutning. Ett parameteriserat administrationsanrop är:

```sql
insert into private.vehicle_lookup_config(singleton, signing_secret)
values (true, $1)
on conflict (singleton) do update set signing_secret = excluded.signing_secret;
```

Bind $1 till den hemliga strängen via administrationsverktyget; lägg aldrig värdet i
migrationsfil, Git, klientkod eller logg. Lookupens distribuerade limiter kräver
serverns service role; fordon sparas fortfarande med användarens session. Utan
konfiguration fungerar manuell registrering, men lookup-resultat kan inte sparas.

Förhandsvisningen bär ett signerat kvitto som binder normaliserad data, auth-user,
hämtningstid och 15 minuters utgångstid. Det innehåller fordonsförslaget, inte någon
API-nyckel eller privat servicehistorik, och ska inte loggas. Både servern och RPC
verifierar kvittot och att registreringsnummer/VIN är oförändrade. Databasens privata
verifieringsfunktion kan inte anropas av klienter. Detta hindrar även direkta RPC-anrop
från att förfalska external_provider eller external_data_fetched_at.

`create_vehicle` får ett nytt valfritt sista argument `p_lookup_receipt`; tidigare
åtta argument fungerar fortfarande utan kvitto. Funktionen ersätts, inte överlagras.
Den använder fortfarande auth.uid(), SECURITY DEFINER, tom search_path och atomisk
vehicle + ownership + initial mileage_entry. Extra fordonskolumner fanns redan och
fylls nu från signerat underlag. Inga godtyckliga provenance-argument accepteras.
Användarens tillåtna korrigeringar sparas, medan proveniensen anger källan till det
ursprungliga förslaget; den är ingen garanti om fordonsidentitet eller äganderätt.

Triggern `vehicles_validate_identifiers` kör efter befintlig normalisering och
nekar nya matchande VIN/registreringsnummer med ett generiskt fel. Den gäller även
direkta behöriga identifieraruppdateringar och använder ett transaktionslås för att
serialisera kontrollen. Befintliga index återanvänds. Historiska dubbletter raderas,
slås ihop eller överförs inte; normala uppdateringar utan identifierarändring fungerar.
Manuella felregistreringar kan därmed blockera ett senare legitimt skapande och behöver
administrativ utredning tills ett separat transferflöde finns. Ingen matchning ger
ägarskap, fordons-id, namn på ägare eller servicehistorik till den sökande.

Efter sparande ligger normaliserade data och proveniens i vehicles. Vanliga appvyer
läser enbart databasen. Ingen providerfråga per sidvisning, automatisk uppdatering,
ägaröverföring eller serviceintervall införs.

### Verifiering och återstående tester

`npm test` täcker provider-normalisering, timeout, fel/fallback, begränsning,
bekräftelse och signaturer samt PostgreSQL/RLS med alla fem migrationer och riktig
pgcrypto i PGlite. A/B-isolering, dubbletter, direkt RPC-förfalskning, hemlighetens
privilegier, manuell registrering och atomisk rollback testas. Typecheck, lint och
build körs separat. Webbläsartester använder lokal HTTPS-provider och Auth/RPC-testdata.

Före livebruk återstår namngiven leverantör, avtal/kvot, riktig API-nyckel och kontroll
av dess verkliga datakontrakt. Testa migration, hemlighetskonfiguration, riktiga
sessioner/PostgREST, samtidiga registreringar och identifieraruppdateringar i hostad
Supabase. PGlite verifierar SQL/pgcrypto men ersätter inte hela Supabase-tjänsten.

## Serviceplan och påminnelser

Migration `supabase/migrations/20260913000600_service_reminders.sql` körs efter
lookup-migrationen. Den skapar `service_intervals`, `reminders`, index, RLS,
mutationsfunktioner och två vyer. Inga nya miljövariabler, npm-beroenden eller
service role behövs. Ingen hostad databas migreras automatiskt.

### Beräkning och exakta statusregler

PostgreSQL-funktionen `service_due` är gemensam för serviceplanen och synkningen:

- nästa datum = last_completed_date + month_interval kalendermånader;
- nästa miltal = last_completed_mileage + distance_interval, i svenska mil;
- utan utgångsvärde eller motsvarande intervall blir den gränsen null;
- månadsslut begränsas till sista giltiga dagen: 31 januari + en månad blir
  28/29 februari, och 29 februari + tolv månader blir 28 februari följande år.

`service_due_status` beräknar båda återstående värdena och en central status.
Datum jämförs som kalenderdagar mot `(now() at time zone 'Europe/Stockholm')::date`,
inte som timmar delat med 24. Miltal jämförs med befintliga vehicles.current_mileage.
Samma funktion används av båda vyerna; frontend formaterar bara resultatet.

| Status | Regel |
| --- | --- |
| overdue / Försenad | Minst en känd gräns har passerats: dagar < 0 eller mil < 0. |
| unknown / Uppgifter saknas | Ingen känd gräns är försenad, men någon konfigurerad gräns saknar utgångsvärde eller aktuellt miltal. Även helt okända gränser är unknown. |
| due_soon / Snart dags | Alla konfigurerade gränser kan bedömas och ingen är passerad, men 0–30 dagar återstår eller 0–ceil(distance_interval × 0,10) mil återstår. |
| ok / Kommande | Alla konfigurerade gränser kan bedömas och ligger längre bort. |

För egna påminnelser utan körsträckeintervall används 500 mil som snart-gräns.
Precis på förfallodagen eller förfallomiltalet visas Snart dags med Idag/Dags nu;
Försenad används först när gränsen passerats. Med två gränser gäller den som nås
först. Status bedöms i ordningen overdue, unknown, due_soon, ok. En känd försenad
gräns väger tyngre än en okänd andra gräns. Om ingen gräns är försenad och en
konfigurerad gräns är okänd visas Uppgifter saknas, även om den kända gränsen är snart.
Detta är påminnelsetrösklar, inte tillverkarrekommendationer.

Listor sorteras efter Försenad, Snart dags, Kommande, Uppgifter saknas; inom samma
grupp sorteras känt datum först, därefter återstående mil, sedan id för stabil
ordning. Kalenderdatum prioriteras framför poster med enbart körsträcka inom samma
grupp; vi uppskattar inte när ett fordon kommer att nå ett visst miltal.

### Spara, markera utfört och synka

Alla mutationer verifierar requireVehicleAccess och anropar RPC genom användarens
Supabase-session. RPC återanvänder lock_service_vehicle, auth.uid(), SECURITY DEFINER,
tom search_path och samma låsordning för vehicle/ownership som servicehistoriken.
RLS visar intervall endast för aktiva ägare. Påminnelser kräver dessutom user_id =
auth.uid(). Tabellerna har bara SELECT för klienter; inga direkta INSERT/UPDATE/DELETE.
Vyerna `service_interval_overview` och `reminder_overview` använder security_invoker,
så underliggande RLS gäller även via vyerna.

- `save_service_interval` skapar/redigerar och synkar påminnelsen i samma transaktion.
  Appen skapar bara source=owner; modellen tillåter system/external_provider för senare
  faser. Befintliga servicekategorier återanvänds, utan en konkurrerande kategorilista.
- `complete_service_interval` uppdaterar last_completed_date/last_completed_mileage
  och räknar om samma påminnelse. Formuläret föreslår dagens svenska datum och fordonets
  kända miltal, men användaren kan ange historiska värden. Minst ett värde krävs.
- Markera som utfört uppdaterar bara serviceplanens manuella baslinje. Det skapar ingen
  servicehändelse/miltalspost och ändrar aldrig current_mileage. Ett historiskt lägre
  värde sänker därför inte fordonets etablerade miltal. En framtida explicit koppling
  till serviceevent kan läggas i detta flöde; ingen automatisk klassificering görs.
- `sync_interval_reminder` är en privat helper. Unikt service_interval_id ger högst en
  kopplad påminnelserad totalt. Upsert återanvänder raden i stället för att skapa nya.
  Skapa, redigera och markera utfört återaktiverar påminnelsen även om den avfärdats.
  Avfärdning betyder alltså dölj aktuell påminnelse, inte stoppa serviceintervallet.
- Saknad baslinje ger en kopplad reminder med okänt förfallo. Egna reminders måste
  alltid ha datum eller miltal. En sammansatt foreign key nekar olika fordon för
  intervallet och dess reminder. Index täcker fordon, användare/status och intervall-id.
- `deactivate_service_interval` sätter is_active=false och avfärdar den kopplade
  påminnelsen atomiskt. Rader behålls. UI har separat bekräftelse och ingen permanent
  borttagning eller återaktiveringsfunktion i denna fas.
- `create_custom_reminder` sätter user_id från auth.uid(). `set_reminder_status` tillåter
  completed/dismissed för egna aktiva påminnelser. Completed sätter completed_at.
  Kopplade reminders får inte markeras completed genom denna RPC: UI leder till
  intervallets Markera som utfört, så serviceplan och reminder inte motsäger varandra.

Nuvarande miltal och brådskande status läses från databasen vid varje sidrendering.
En servicehändelse med nytt miltal påverkar därför status via den befintliga
miltalshistoriken, utan separat synkmodell. Servicehistorikens actions invaliderar
även /reminders. Planmutationer invaliderar fordonsvyer, dashboard och påminnelser.

### UI och avgränsningar

- `/vehicles/[vehicleId]/service`: aktiva intervall, nästa förfallo, status och senaste
  utförande. `?new=1`, `?edit=<id>` och `?complete=<id>` använder samma route.
- `/reminders`: aktiva påminnelser med fordon, status och åtgärder. `?new=1` skapar en
  egen reminder; utan fordon får användaren först lägga till ett.
- Dashboard visar högst tre prioriterade reminders över användarens fordon.
  Fordonssidan visar ett prioriterat intervall i Nästa service och länk till serviceplanen.
  Sekundära sektioner har lokal laddning/felhantering och blockerar inte huvudinformationen.
- Båda listorna har 30 poster per sida och databasbaserad sortering. Fordon och
  status hämtas samlat i vyerna, utan separat anrop per intervall/påminnelse.
- Namn/titel max 150 tecken, heltalsintervall i mil > 0 och månader 1–1200.
  Senaste datum och egna påminnelsedatum ligger inom 1886–2100. Miltal är 0–2147483647;
  även nästa förfallomiltal måste rymmas i PostgreSQL integer. Tomma valfria värden
  blir null. Inga faktiska servicegränser förifylls som generella rekommendationer.
- Inga e-post-/push-utskick, externa serviceanvisningar, schemalagda jobb eller
  ändringar i auth, lookup eller dokumentflödet införs. Ingen global klientstate.

### Verifiering och öppna frågor

Tester kör alla sex migrationerna i PGlite och verifierar databas/RLS, A/B-isolering,
avslutat ägarskap, constraints, oförändrad mileage history, atomisk rollback,
synkning utan dubbletter samt centrala datum/miltal/statusgränser och skottår.
Server-/formulärtester kontrollerar validering, identitet, rättigheter och revalidation.
Webbläsartester använder verklig lokal PostgreSQL för RPC/vyer med Auth/PostgREST-
testadapter och kontrollerar flödena vid 320, 390 och 1280 px.

Före produktion återstår migrering och test med riktiga Supabase-sessioner/PostgREST,
RLS genom vyerna, samtidig redigering/utförande och återkallat ägarskap mitt i mutation.
Schema-genererade typer skapas först från verkligt migrerad Supabase. Ingen hostad
databas har ändrats här. SQL-vyerna kräver PostgreSQL med security_invoker-stöd (15+).

Avfärdade påminnelser och tidigare utföranden har ingen separat historikvy; den senaste
manuella baslinjen ersätter den gamla i serviceplanen, medan riktiga servicehändelser
bevaras i befintlig historik. Ägaröverföringen nedan flyttar kopplade reminders till
mottagaren atomiskt. Egna personliga reminders följer aldrig med.

## Säker ägaröverföring

Migration `supabase/migrations/20260914000700_vehicle_transfers.sql` körs efter
service reminders. Den skapar `vehicle_transfers` och `vehicle_transfer_documents`
med RLS, index, constraints och kontrollerade RPC-funktioner. Ingen hostad miljö
ändras automatiskt och inga nya appberoenden behövs. Migration 11 kräver serverns
service role för limitering och preview/accept; se distribuerad rate limiting nedan.

### Token och livscykel

- `create_vehicle_transfer` genererar 32 kryptografiskt slumpmässiga bytes på
  databasservern med pgcrypto `gen_random_bytes`, representerade som 64 hextecken.
  Bara SHA-256-hashen sparas i `token_hash`. Klartext returneras en enda gång från
  skapandet. Appservern bygger länken från betrodd `APP_URL`; klienten kan inte
  bestämma basadress, token, säljare eller giltighetstid.
- Länken gäller sju dagar. Token finns bara i skapandesvarets lokala komponentstate;
  efter omladdning/sidbyte behöver säljaren avbryta och skapa en ny om länken saknas.
  Webbläsarens kopierade länk kan naturligtvis delas med den avsedda mottagaren.
- Högst en pending-rad per fordon tillåts av ett partial unique index. Utgångna
  pending-rader markeras expired när en ny skapas. Vid läsning visas de som expired
  och accept kontrollerar alltid verklig tid efter låsning; ingen cron behövs.
- Säljaren får läsa sina statusrader, men SELECT av `token_hash` nekas även säljaren.
  Mottagaren kan inte generellt läsa tabellen. `preview_vehicle_transfer` kräver
  auth.uid och rätt tokenhash och returnerar enbart status, märke, modell,
  registreringsnummer, giltighet, dokumentantal och en flagga för egen överföring.
- Direkt INSERT/UPDATE/DELETE på båda tabellerna är återkallat. Alla publika RPC
  kräver authenticated och verifierar auth.uid; SECURITY DEFINER har tom search_path.
  Ingen operation accepterar ett auktoritativt user_id från klienten.

### Atomiskt ägarbyte och samtidighet

`accept_vehicle_transfer` låser vehicle → aktiv ownership → transfer i samma
ordning som service-, dokument- och intervallmutationerna. Status, hash, utgång,
självaccept och den ursprungliga aktiva ownership-raden verifieras under lås.
`from_ownership_id` hindrar en gammal länk från att fungera om samma säljare senare
återkommer som ägare under en ny period.

Gamla relationen får ended/ended_at, en ny active owner skapas och överföringen
får accepted, to_user_id, to_ownership_id och accepted_at i samma transaktion.
Det unika active owner-indexet behålls; det finns aldrig två aktiva ägare.
Misslyckas ett steg rullas hela operationen tillbaka. Konkurrerande accepteringar
väntar och bara en kan lyckas. Cancel använder samma vehicle-lås och kan bara
avbryta säljarens pending-transfer. Accepterade överföringar kan inte avbrytas.

Överföringsraden med tidsstämplar och båda ownership-id:n, dokumentvalet och de
bevarade ownership-perioderna utgör revisionsspåret. Ingen separat generell
audit-logg eller ny vy över tidigare ägares personuppgifter införs.
Fordon, service_events, mileage_entries och service_intervals kopieras aldrig.
De behåller samma vehicle_id. Befintlig RLS tar omedelbart bort säljarens aktiva
läs-/skrivåtkomst och ger den till mottagaren efter commit.

### Privata dokument

Standard är **inga privata dokument**. Säljaren väljer uttryckligen dokument och
bekräftar därefter överföringen. Högst 100 dokument väljs per överföring; endast
ready, ej borttagna och för säljaren åtkomliga dokument från samma fordon godtas.
En databastrigger skyddar även kopplingar mellan olika fordon vid privilegierade inserts.

`visibility_scope` och ursprunglig uppladdare ändras aldrig. En accepterad
transferrelation ger dokumentåtkomst för just mottagarens `to_ownership_id`.
För fortsatt åtkomst krävs alltid den aktiva ägarrelationen. Dokument måste
väljas igen vid nästa överföring, även om de tidigare mottagits från någon annan.
Gamla transfergrants återupplivas inte om en tidigare mottagare senare återkommer.
Egna uppladdade dokument kräver också aktiv ownership; gammal ownership räcker aldrig.

`document_access_granted` används av metadata-RLS och Storage-helpern. Dolda dokument
kan inte läsas, signeras eller röjas via eventkopplingar, radering eller cleanup-RPC.
Uppladdning/finalize är fortfarande bundet till den ursprungliga uppladdaren och
aktiv ägare. En vald fil som raderas före accept återuppstår inte. Ny ägare kan
läsa och hantera valda dokument; icke valda filer är fortsatt privata.

Signerad nedladdning använder befintliga 300 sekunder och kontrollerar både
metadata-RLS och Storage-RLS vid utfärdande. **En redan utfärdad signerad URL kan
fungera tills dess giltighet löper ut även efter ett ägarbyte.** Ägarbytet kan inte
återkalla en redan nedladdad kopia. Nya signerade URL:er nekas direkt för säljaren.
Tidigare uppladdningstokens kan även leva till utgång, men kan inte finalize:a
eller göra en fil synlig efter att ägarskapet upphört.

Icke valda dokument bevaras utan att nästa ägare får åtkomst. Övergivna uppladdningar
och gamla privata filer utan behörig aktiv uppladdare behöver separat administrerad
retention/städning. Den nya ägarens cleanup får inte röja eller radera dem.

### Påminnelser

Kopplade servicepåminnelser behåller id, förfallo och status, men får mottagarens
user_id inom accept-transaktionen. Inaktiva/avfärdade intervall återaktiveras inte.
Aktiva personliga reminders blir dismissed och behåller gamla user_id; redan
avslutade personliga reminders behåller status. De blir aldrig synliga för mottagaren.
Serviceintervall ligger kvar och kan ändras av den nya ägaren.

### Routes och inloggning

- Fordonsprofilens Ägarskap länkar till `/vehicles/[vehicleId]/transfer`.
  Säljaren ser dokumentval, varning, separat bekräftelse, en engångsvisad länk,
  giltighetstid och bekräftad avbrytning. Det sker ingen optimistisk ägarändring.
- `/transfer/[token]` är dynamisk. Oinloggade ser en generisk förklaring och
  inloggningsval; ingen fordons-, ägar-, dokument- eller historikdata hämtas åt dem.
  Efter login visas begränsad fordonsinformation och antal dokument, aldrig filnamn
  eller innehåll före accept. Mottagaren måste uttryckligen bekräfta.
- `/transfer/[token]/continue` sparar en strikt validerad token i en HttpOnly,
  SameSite=Lax-cookie (Secure i produktion), max sju dagar, och skickar till enbart
  `/login` eller `/signup` på APP_URL. Inga godtyckliga next-parametrar tillåts.
  Efter lyckad login eller omedelbar signup-session förbrukas cookien och samma
  transferroute öppnas. Vid e-postbekräftelse förbrukas den först efter lyckad PKCE.
  E-postens callback-URL är fortfarande exakt APP_URL + `/auth/callback` utan token.
  Bekräftelse behöver öppnas i samma webbläsare; annars får mottagaren öppna
  överföringslänken igen efter inloggning. Ingen accept sker genom GET/login.
- Accept leder till befintliga `/vehicles/[vehicleId]?transferred=1` med bekräftelse
  och invaliderar appens routercache. Ogiltig, utgången, avbruten och använd länk
  ger begripliga tillstånd. Fel innehåller aldrig token eller rå databastext.

Transferroutes har private/no-store, no-referrer och noindex/nofollow/noarchive.
Det finns inga analytics på dem. Next:s lokala requestlogg undantar transferpaths
och funktionsargument loggas inte. Konfigurera även Vercel/proxy/observability att
maskera hela tokensegmentet och cookies; applikationskoden styr inte plattformens
åtkomstloggar. Lägg aldrig överföringslänkar i publika ärenden eller skärmbilder.

### Verifiering

`npm test` kör PostgreSQL/PGlite med alla sju migrationer samt tester för
serverfunktioner, validering, identitet, dokumentval, privat Storage, vidareöverföring,
rollback och auth-fortsättning. Typecheck, lint och build körs separat.
Vid denna implementation passerade 278 tester (40 nya), alla tre kontroller och
de tre separata samtidighetstesterna nedan.

`tests/vehicle-transfer-concurrency.mjs` kör dessutom tre tester med separata
anslutningar till vanlig lokal PostgreSQL: två acceptförsök, cancel mot accept,
och serviceändring mot accept. Testet observerar riktiga låsväntningar och skapar
och raderar endast sin egen slumpmässigt namngivna testdatabas. En isolerad lokal
PostgreSQL och npm-paketet `pg` behövs i testverktygsmiljön, inte som appberoenden:

```powershell
$env:TRANSFER_TEST_PG_MODULE = 'C:\path\to\test-tools\node_modules\pg'
$env:TRANSFER_TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:55439/postgres'
node --test tests/vehicle-transfer-concurrency.mjs
```

Lokal webbläsarverifiering använder riktiga SQL/RLS-operationer med en Auth/PostgREST-
testadapter vid 320, 390 och 1280 px. Före produktion återstår migration i hostad
Supabase, riktiga A/B/C-sessioner/JWT, PKCE och SMTP i samma browser, PostgRESTs
kolumnprivilegier, Storage-signering samt redan utfärdade URL:er efter transfer.
Verifiera även loggmaskering, backup/retention och samtidighet under verklig trafik.
Länken är en bearer capability: vem som har länken och ett inloggat konto kan
acceptera. Ingen myndighetsverifiering, mottagarbindning, e-post/SMS, betalning,
familjedelning eller claim discovery införs.

## PDF-export av servicebok

Fordonsprofilens **Exportera servicebok** hämtar en PDF via
`POST /vehicles/[vehicleId]/export`. Knappen visar lokal laddning, bekräftelse och
ett återförsökbart fel. Exporten använder PDFKit i Next.js Node-runtime, utan
browserprocess eller externa fontanrop. Fordonsdata läses med användarens RLS;
den separata rate-limit-kontrollen använder service role. DejaVu Sans 2.37 Regular/Bold
ligger som oförändrade TTF-assets i `assets/fonts/dejavu/`, med upstreamlicens och
SHA-256. Licensen är Bitstream Vera med DejaVu-ändringar i public domain; hela
licensfilens övriga glyphnotiser följer med. `outputFileTracingIncludes` tar med
TTF-filerna och licensen i exportens serverpaket; PDFKit bäddar in använda glypher.
Varken användarens systemfonts eller nedladdning vid runtime används.

Applicera migration `20260920000800_vehicle_export.sql` efter tidigare migrationer.
Den inför endast läsfunktionen `get_vehicle_export_data(uuid)`, med SECURITY
INVOKER och exekveringsrätt för authenticated. Befintlig RLS gäller oförändrad.
Fordon, händelser och aktiva intervall läses i en SQL-snapshot. JSON-aggregatet
undviker PostgRESTs radgräns utan separata anrop per händelse. Servern kräver aktivt
ägarskap både före läsningen och efter PDF-genereringen. Oinloggade får 401;
andra exportfel får ett generiskt fel utan databasdetaljer eller fordonsdata.

PDF innehåller registreringsnummer om det finns, märke/modell, årsmodell, typ,
VIN, registrerat aktuellt miltal, genereringsdatum, sammanfattning och synliga
servicehändelser äldst först. Händelser visar datum, kategori, titel, miltal,
angiven kostnad, utförare, beskrivning, saklig källmarkering och dokumentindikator.
Aktiva serviceintervall använder befintlig beräkning av nästa förfall och status.
Antal händelser samt första/senaste datum gäller exporterad historik. Kostnaden
summerar endast angivna belopp, inklusive noll, som heltalsöre med BigInt och
formateras till SEK utan flyttalsavrundning. Saknad kostnad räknas inte som noll.

Privata anteckningar, användar-/ägaruppgifter, interna ID:n, custom reminders,
filnamn, storage paths, signerade URL:er och dokumentinnehåll exporteras inte.
Dokumentindikatorn kontrollerar endast länkar som dokument-RLS låter aktuell ägare
läsa: färdiga, ej raderade dokument med giltig åtkomst, inklusive uttryckligen
överförda dokument. Inga originalfiler hämtas. Historiken påstås inte vara externt
verifierad. Beskrivningar och utförarnamn är registrerad fritext och inkluderas
som sådana; användaren behöver granska innehållet före vidare delning.

PDF använder A4, automatisk radbrytning/sidbrytning och sidnummer med totalt antal
sidor. Historik och beskrivningar trunkeras inte. Unicode-text och typografiska
tecken bevaras, inklusive svenska, polska, arabiska och kyrilliska. Arabisk text
formas av Fontkit och bidi-js ordnar textsegmentens läsriktning per rad, med
bibehållen styckeriktning. Endast kontroll-/bidi-styrtecken saneras; ZWJ/ZWNJ
bevaras. 😀 stöds i svartvitt. Fonten täcker inte varje skriftsystem eller emoji:
tecken utan glyph stoppar exporten med befintligt generiskt fel, utan att någon
ofullständig PDF lämnas ut. Ingen giltig språktext ersätts tyst med `?`.
Filnamnet består endast av säkra
ASCII-tecken och faller tillbaka på `servicebok_fordon_<år>.pdf` när regnummer saknas.
Svaret har `Content-Type: application/pdf`, `Content-Disposition: attachment`,
`Cache-Control: private, no-store`, CDN-/Vercel-CDN-Cache-Control `no-store` och
`X-Content-Type-Options: nosniff`. Ingen exporterad PDF sparas på servern.

Exporttester finns i `tests/vehicle-export.test.ts`, `tests/vehicle-export-rls.test.ts`
`tests/vehicle-export-unicode.test.ts` och `tests/vehicle-export-visual.test.ts`.
De täcker datamodell, exakt kostnad,
åtkomst/RLS, ägarbyte, dokumenturval/radering, fler än 1 000 poster, headers,
felhantering, Unicode-glypher/inbäddning och fem PDF-scenarier. Sätt `SERVICEBOK_PDF_QA_DIR` till en lokal
testkatalog när visuella test-PDF:er ska sparas; annars skapas inga filer.
Efter Unicode-korrigeringen passerade 319 tester (41 nya för export, varav åtta
tillkom i Unicode-korrigeringen). Typecheck, lint och build passerade. Hela sviten kördes med
`npm test -- --maxWorkers=2` efter att standardkörningen fastnat lokalt. De fyra
ursprungliga PDF-exemplens 23 sidor och Unicode-exemplets två sidor granskades visuellt, och fullständiga långa beskrivningar
kontrollerades med textextraktion. Produktionsbyggets nedladdning samt knappens
laddnings-/feltillstånd verifierades i browser vid 320, 390 och 1280 px, med lokal
Auth/PostgREST-testadapter och riktiga PostgreSQL/RLS-operationer.
Unicode-kontrollen verifierar `Müller Łódź`, `محمد`, `Сервис` och `😀` i make,
model, title, provider_name, description och interval name, inklusive PDF:ens
ToUnicode-mappning och FontFile2-inbäddning. Produktionsbyggets route trace
innehåller båda TTF-filerna och licensen. PDF-nedladdning från produktionsbygget
passerade även med externa HTTP/fetch-anrop blockerade i den lokala testkörningen.

Före release: applicera migrationen i hostad Supabase och verifiera export med
riktiga ägarsessioner, Vercel-preview/produktion och stora verkliga historiker.
PDF och SQL-snapshot hålls i minnet; plattformens minnes-, svarsstorleks- och
tidsgränser gäller även om appen inte trunkerar historiken. Route anger 60 sekunders
maxDuration. Ingen bakgrundskö, permanent exportlagring eller alternativ exportväg
införs. Kontrollera därför gränserna för den aktuella hostingplanen.

## Free/Premium och Stripe Billing (V1)

Migration `20260921000900_subscriptions.sql` läggs efter PDF-migrationen. Applicera
alla migrationer i ordning före driftsättning av denna kod. Befintliga konton utan
subscription-rad räknas som Free. Inga befintliga fordon eller dokument tas bort.

Officiella Stripe Node SDK **22.6.2**, API-version **2026-08-26.dahlia**, används
enbart serverside via `lib/stripe/server.ts`. Hosted Checkout kräver ingen
publishable key eller Stripe-kod i browsern. Inga Product/Price skapas automatiskt.

### Konfiguration och lokal testning

1. Använd en Premium Product med två återkommande priser i Stripe testläge:
   **39 SEK/månad** (`month`, `interval_count=1`) och **349 SEK/år** (`year`,
   `interval_count=1`). Konto visar dessa belopp; konfigurera motsvarande priser
   i Stripe, som är källan för själva debiteringen. Konfigurera
   Customer Portal för betalmetod, fakturor och uppsägning. Tillåt inte byte till
   orelaterade produkter eller antal platser i portalen.
2. Ange `STRIPE_SECRET_KEY`, `STRIPE_PREMIUM_MONTHLY_PRICE_ID`,
   `STRIPE_PREMIUM_YEARLY_PRICE_ID` och
   `SUPABASE_SERVICE_ROLE_KEY` på servern. Behåll `NEXT_PUBLIC_SUPABASE_URL` och
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `APP_URL` är miljöns fasta bas-URL, exempelvis
   `http://localhost:3000`; aldrig en request Host header eller formulärparameter.
3. Starta appen och kör `stripe login`, därefter:

   ```sh
   stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed --forward-to localhost:3000/api/stripe/webhook
   ```

   Sätt det **egna** listener-secretet i `STRIPE_WEBHOOK_SECRET` och starta om appen.
   Lokalt listener-secret och hostad endpoints secret är olika.
4. Logga in med ett riktigt testkonto, välj Uppgradera på `/account` och genomför
   hosted Checkout med Stripes testbetalningsmetod. Kontrollera plan via webhook,
   portal/uppsägning, dubbla klick och återleverans med Stripe CLI/Dashboard.
   `stripe trigger` med en slumpmässigt genererad Customer aktiverar inte ett
   Servicebok-konto: en lokal customer-koppling måste redan finnas.
5. Preview ska ha explicit HTTPS `APP_URL`, testnycklar, egen webhookendpoint och
   helst separat Supabase/Stripe-testmiljö. Produktion ska ha sina egna serverkeys,
   Price och endpoint `https://<egen-domän>/api/stripe/webhook`. Registrera de sex
   eventtyperna ovan med kompatibel API-version. Kör aldrig utvecklingstester mot
   livebetalningar. Auth Site URL/Redirect URLs konfigureras separat enligt
   autentiseringsavsnittet; billing kräver inga wildcard-returadresser.

### Checkout, portal och lokal status

`services/subscriptions/checkout.ts` kräver verifierad session innan privilegierad
åtkomst. Samma Stripe Customer återanvänds. Ny Customer får intern user-ID som
metadata; e-post används inte som identitet och skickas inte i denna V1.
Customer-ID sparas lokalt före Checkout. Pris, antal (1), subscription-mode och
success/cancel/portal-return kommer enbart från serverkod. Retur sker till
`/account?checkout=success`, `/account?checkout=cancelled` respektive `/account`.
Success-parametern visar bara ett meddelande och kan aldrig ändra planen.

En databaslease per konto serialiserar billing över flera serverinstanser.
Customer-nyckeln är beständig.
`customer_started_at` sätts endast av den explicita operationen `customer_start`
under giltig kontolease, omedelbart före första Stripe Customer-anropet. Att öppna
portalen eller ta en vanlig lease startar ingen 23-timmarsperiod. Återförsök
behåller både ursprunglig Customer-nyckel och tidsstämpel; befintligt Customer-ID
återanvänds utan nytt Customer-försök.
Klienten skickar endast `plan=monthly` eller `plan=yearly`; servern validerar valet
 och mappar till respektive Price-ID. Andra värden nekas; extra Price-ID-fält ignoreras.
Varje Checkout-försök har en sparad idempotency key, serverkonfiguration och en timmes sessionstid. En öppen session för samma pris återanvänds.
Vid byte mellan månads-/årsval [stängs den gamla öppna sessionen först via Stripe](https://docs.stripe.com/api/checkout/sessions/expire)
under samma lease, innan en ny nyckel skapas. Ett tvetydigt tidigare försök
återhämtas med ursprungliga parametrar före bytet. Misslyckad stängning blockerar
ny Checkout; redan slutförd betalning inväntar webhook.
Förlorade svar återhämtas med samma nyckel/parametrar. Ett fullbordat Checkout med
väntande subscription återgår till kontosidan. Befintlig icke-terminal Stripe
subscription, inklusive försenad/incomplete, går till portalen i stället för att
skapa en ny. Avslutade subscriptions tillåter ett nytt försök.

Stripes nycklar kan gallras efter 24 timmar. En osäker Customer-skapning äldre än
23 timmar blockeras för manuell avstämning i stället för att riskera dubblering.
Kontrollera då Customer metadata i Stripe och den lokala raden genom betrodd
administration innan nästa försök. Även fler än 100 historiska subscriptions eller
sessions i en återhämtningssituation kräver avstämning. Inga råa Stripe-fel visas.

### Webhook och behörighet

`POST /api/stripe/webhook` kör i Node runtime, verifierar `Stripe-Signature` mot
oförändrad raw body och behandlar de sex registrerade eventtyperna. Invoice- och
Checkout-event används endast för att hitta subscription. Aktuell subscription
hämtas från Stripe **efter** att kontots lease erhållits. Lokal Customer-relation
måste matcha; metadata ensam auktoriserar aldrig. Orelaterade kunder ignoreras.
Felaktig signatur ger 400, tillfälligt behandlingsfel 500 för Stripes återförsök.
Rå eventbody eller betaluppgifter sparas/loggas inte.

`apply_stripe_subscription` skriver subscription och event-ID/typ/processed_at i
samma SQL-transaktion. Dubbletter ändrar inte state. Försenade event för samma
subscription hämtar dagens Stripe-status i stället för att återspela payloaden.
Eventtid sparas för spårbarhet. En äldre ersatt subscription får inte tränga undan
en nyare; vid exakt samma skapandesekund behålls den redan lagrade subscriptionen.
Leasen gäller två minuter och kontrolleras igen vid mutation så en försenad worker
inte kan skriva efter att en ny tagit över. Stripe-anrop har begränsad timeout/retry.

Billing använder service role i `services/subscriptions/backend.ts`, via den
`server-only`-markerade fabriken `lib/supabase/admin.ts`. Det är det uttryckligt
privilegierade lagret för billinglease, Customer-koppling, webhookuppslag och
atomisk synkning. Vanliga produktservices fortsätter använda användarsession/RLS.
`subscriptions` har endast own-SELECT för användare; INSERT/UPDATE/DELETE och
backend-RPC:er är spärrade. Eventtabell och lease-tabell är helt privata.

### Entitlement och gränser

Webhook accepterar endast månadsprisets ID med `month`/1 eller årsprisets ID med
`year`/1, exakt en subscription item med antal 1. Okänt ID eller fel intervall
ger inte Premium. Den centrala SQL-regeln `is_premium_user` kräver lokal plan
Premium, `active` eller `trialing` och
`current_period_end > now()`. Pris-matchning sker vid webhookens synkning.
`past_due` ger **omedelbart Free** i denna enkla V1. `canceled`, `unpaid`,
`incomplete`, `incomplete_expired`, `paused` och `inactive` ger också Free.
Okända framtida Stripe-statusar mappas till inactive. Planerad uppsägning behåller
Premium fram till periodslutet när status fortfarande kvalificerar.
Ändrat Price-ID i environment kräver omsynkning av befintliga subscriptions.

`get_billing_overview`, `getUserPlan` och `requirePremiumUser` är gemensamma
ingångar; produktfeatures tolkar aldrig Stripe-objekt själva.

| Gräns | Free | Premium |
| --- | --- | --- |
| Aktiva ägda fordon | 1 | Obegränsat |
| Dokumentmetadata som reserverar bytes | 50 MiB | 1 GiB |
| PDF-export | Nekas serverside (403) | Tillåts med befintlig ägarkontroll |

Konstanterna finns enbart i SQL-funktionen `plan_limits`; UI får dem genom overview.
Den befintliga filgränsen 15 MiB och tillåtna filtyper ändras inte. Pending och ready
dokument som inte är soft-deleted räknas. Soft-deleted räknas inte; fysisk Storage
cleanup kan släpa efter och den logiska kvotan är därför inte ett exakt mått på
leverantörens fakturerade lagring. Övergivna reservationer räknas tills befintlig
cleanup hanterar dem. Nuvarande tre timmars cleanup-livscykel behålls.

Databastriggers tar kontolås före ny ägarrelation eller dokumentreservation.
Det skyddar även direkta RPC-anrop och samtidiga anrop över olika fordon.
Avslutade ownerships räknas inte. En Free-mottagare med ett fordon nekas atomiskt
vid transfer; ägarskap/överföring blir inte halvfärdiga. Uttryckligen utvalda,
färdiga dokument flyttar sin kvotbelastning till mottagaren. Om dennes utrymme
inte räcker återställs hela transfertransaktionen. Ej överförda privata dokument
ligger kvar på tidigare kvotkonto och får ingen ny åtkomst. Retention/cleanup av
sådana otillgängliga filer kräver ett separat administrativt livscykelflöde.

Downgrade raderar ingenting och ändrar inte tidigare ägares åtkomstregler.
Befintlig historik och tillgängliga dokument går fortsatt att läsa; nya fordon/
reservationer nekas över aktuell gräns. Kontosidan visar plan, status, periodslut,
planerad uppsägning, utrymme och diskreta billingknappar. Nekade funktioner visar
ett lokalt meddelande med länk till konto, utan helsidesspinner.

### Verifiering och kvarvarande driftskontroller

`tests/billing.test.ts` använder mockad Stripe API och riktiga SDK-signaturer.
`tests/subscriptions-rls.test.ts` kör alla migrationer i PostgreSQL/PGlite och
kontrollerar RLS, entitlement, idempotency, lease, quota, transfer och downgrade.
PDF-testet verifierar också direkt Free-anrop. Befintliga transferfixtures har
Premium så deras tidigare säkerhetstester fortsätter gälla oberoende av ny gräns.
`tests/vehicle-transfer-concurrency.mjs` kör dessutom riktiga överlappande
transaktioner i isolerad lokal PostgreSQL (se tidigare instruktion för pg-modul).

Kör `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` före merge.
Verifierat i denna ändring: **382 tester** i 29 filer (63 fler än föregående
version), samt **7 separata native PostgreSQL-samtidighetstester** (4 nya).
Typecheck, lint och produktionsbygge passerar. Hela Vitest-sviten kördes med
`npm test -- --maxWorkers=2`. Produktionsbyggets Free/Premium-konto, väntestatus,
generiskt Checkout-fel, Free PDF-spärr och Premium PDF-nedladdning kontrollerades
vid 320, 390 och 1280 px med lokal Auth/PostgREST-fixture och riktiga SQL/RLS-regler.
Ingen horisontell overflow eller JavaScript-krasch upptäcktes. Customer-start-korrigeringen lägger till sex regressionstester: Portal följt av första Checkout efter 24 timmar, återförsök med samma nyckel/tid, misslyckad customer_start, vanlig lease utan Customer-start, atomisk start/retry under lease och befintlig Customer. Testet för verkligt tvetydiga försök äldre än 23 timmar behålls.

Lokala Stripe credentials och Stripe CLI saknas i denna arbetsmiljö; riktiga
hosted Checkout/Portal-betalningar och webhookleverans måste därför verifieras
i Stripe testläge samt hostad Supabase/Vercel före release. Kontrollera även
förnyelse, misslyckad betalning, uppsägning och återleverans. Förnyelser som inte
synkas i tid tappar Premium vid lokalt periodslut (fail closed). Övervaka misslyckade
webhooks; denna V1 har ingen separat schemalagd reconciliation-worker.

## Referenser

- [Stripe webhooks och leveransordning](https://docs.stripe.com/webhooks)
- [Stripe idempotency keys](https://docs.stripe.com/api/idempotent_requests)
- [Stripe hosted Checkout](https://docs.stripe.com/api/checkout/sessions/create)

- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [PostgreSQL pgcrypto och HMAC](https://www.postgresql.org/docs/18/pgcrypto.html)
- [Supabase användardata](https://supabase.com/docs/guides/auth/managing-user-data)
- [Signerad uppladdning och tokenlivslängd](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl)
- [Signerad nedladdning](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl)
- [Storage RLS och operationskontroller](https://supabase.com/docs/guides/storage/schema/helper-functions)

## Ta bort felregistrerat fordon

Servicehistoriken tillhör fordonet; ownership är en separat relation. Normal
fordonshistorik får därför inte raderas när ett fordon byter ägare. Åtgärden
”Ta bort felregistrerat fordon” på fordonsdetaljen är endast för historikfria
fordon och kräver en bekräftelsedialog. Raderingen kan inte ångras.

Migration `20260924001000_delete_empty_vehicle.sql` lägger till
`delete_empty_vehicle(uuid)`. Endast autentiserad, nuvarande aktiv owner får
anropa funktionen, och fordonet måste ha exakt en ownership-rad. Alla ytterligare
ägarperioder blockerar, även om samma användare återkommit som ägare.

Kontrollen läser utan klientens RLS-filter och blockerar **alla** rader i
`service_events`, `mileage_entries`, `documents`, `service_intervals`, `reminders`
och `vehicle_transfers`. Det inkluderar soft-deleted serviceposter/dokument,
pending eller städade uppladdningar, inaktiva intervall, klara/avfärdade påminnelser
och pending/accepted/cancelled/expired transfers. Även miltal som angavs vid
registrering, inklusive 0, är miltalshistorik och blockerar. Ett kvarvarande
`current_mileage` eller objekt under fordonets prefix i privata dokumentbucketen
blockerar också konservativt.

Relationsinventeringen omfattar även `service_event_documents` och
`vehicle_transfer_documents`: deras RESTRICT-FK kräver föräldrar som redan
blockerar radering. PDF-exporten är en läsande snapshot utan sparad exporttabell.
Lookup/provenance är tekniska identifieringsfält på `vehicles` och tas bort med
ett annars tomt fordon. Den globala `private.vehicle_lookup_config`, profiler,
abonnemang och billing-state påverkas inte.

Funktionen använder befintligt `lock_service_vehicle`: först FOR UPDATE på
fordonet, sedan ägarrelationen, med samma ordning som service-, dokument-,
intervall- och transfermutationer. Ägarraderna låses dessutom FOR UPDATE före
kontrollen. Om historiken sparas först nekas radering; om raderingen committar
först nekas den väntande mutationen vid ägarkontrollen. Befintliga RESTRICT-FK
behålls som ytterligare skydd. Endast den enda ägarraden och fordonsraden tas
bort, i samma transaktion. Ingen generell DELETE-policy eller DELETE-grant ges.
Free-gränsen räknar aktiva ägarrelationer och frigörs efter lyckad commit.

Regressioner finns i `tests/delete-empty-vehicle-rls.test.ts` och
`tests/vehicle-services.test.ts`. Native PostgreSQL-sviten
`tests/vehicle-transfer-concurrency.mjs` testar båda låsordningarna mot skapande
av servicepost, dokumentmetadata och transfer. Dessutom kräver ett schema-test
att beroendeinventeringen granskas om nya FK till `vehicles` tillkommer.

## Distribuerad rate limiting

Migration `20260924001100_distributed_rate_limits.sql` ersätter lookupens lokala
Map med gemensam PostgreSQL-limitering. Alla Vercel-instanser i samma miljö använder
samma atomiska räknare. Gränserna är definierade endast i SQL-funktionen
`consume_rate_limit`, utan klientstyrda limit/window-parametrar:

| Scope | Gräns per verifierat konto |
| --- | --- |
| vehicle_lookup | 10 / 60 sekunder |
| pdf_export | 5 / 60 sekunder |
| billing_checkout | 5 / 600 sekunder |
| billing_portal | 10 / 600 sekunder |
| transfer_preview | 30 / 60 sekunder |
| transfer_accept | 10 / 600 sekunder |

`private.rate_limits` lagrar endast user UUID, scope, använd räknare och sluttid.
Primärnyckeln är konto/scope, högst sex rader per registrerat konto. Gamla fönster
återanvänds vid nästa försök, inaktiva rader försvinner när profilen tas bort.
Det finns ingen rad per försök eller tidsfönster och ingen cron behövs. Tabellens
RLS är aktiverad utan klientpolicies; inte heller service role har direkt
tabellåtkomst. En SECURITY DEFINER-funktion med tom search_path och EXECUTE endast
för service_role utför INSERT ON CONFLICT och FOR UPDATE. Databasklockan läses
efter låset. Fönstret startar vid första tillåtna försöket och återställs först
när det löpt ut; detta är inte ett glidande fönster.

`lib/rate-limit.ts` härleder subject från requireUser och gör ett separat,
committat RPC-anrop före dyrt arbete. Alla scopes är **fail closed** vid DB-fel,
saknad servernyckel eller felaktigt svar. Providerfel, avbrutna försök och retry
återbetalar inte en slot. Lookup stoppar före providern, PDF före snapshot och
rendering, Checkout/Portal före billing-lease och alla Stripe-anrop. Även reuse
av öppen Checkout räknas: subscriptions/session måste fortfarande hämtas från
Stripe. Lease/fencing, Customer-reconciliation och idempotency är oförändrade.
PDF svarar med 429, säkert heltals-Retry-After och befintliga no-store-headers.
Auth, Premium och ownership kontrolleras fortfarande; RLS används för PDF-data.

Transfer-preview hämtar fordonsuppgifter endast efter inloggning. Ingen IP-limit
påstås: vi använder inte x-forwarded-for eller sparar IP, token eller token-hash
i limiter-tabellen. Gamla preview/accept-RPC:ers klientgrants återkallas för att
förhindra bypass. Nya server-only wrappers tar verifierat user UUID och befintlig
SHA-256-digest. De kör de oförändrade kärnfunktionerna med denna transaktionslokala
identitet och återställer identiteten efteråt. Endast den betrodda servern får
anropa dem. Ett nekat limiterförsök når aldrig tokenuppslag; användarfelet är
generiskt oavsett om token finns. Misslyckad accept rullar tillbaka ownership-
transaktionen men inte det tidigare limiteranropet.

SUPABASE_SERVICE_ROLE_KEY krävs nu även utan Stripe för dessa skyddade flöden och
får aldrig exponeras som NEXT_PUBLIC. Migration och kompatibel serverkod måste
deployas samordnat eftersom äldre transferkod förlorar direkt RPC-execute.
Stripe-webhook använder **inte** användarlimitern: signaturkontroll, lease och
idempotency fortsätter skydda retries. WAF mot anonym trafik/masskonton, maskning
av capability-paths i driftsloggar, global providerbudget och PDF-samtidighet/
minnesgränser återstår som driftansvar. Kontoräknare ersätter inte dessa skydd.

SQL-gränser/grants/retention testas i `tests/rate-limit-rls.test.ts`. Native
PostgreSQL-sviten provar två transaktioner om sista sloten, tolv anslutningar om
fem slots samt nytt fönster och konto/scope-isolering. App-tester verifierar
fail closed före provideranrop och att webhooken lämnas utanför.

## Preview/staging och release

Följ [STAGING.md](STAGING.md) för miljövariabler, stabil Vercel-preview,
Auth-redirects, hela migrationskedjan och Stripe testläge.
[Smoke-testprotokollet](docs/SMOKE_TEST.md) täcker A/B/C och direkta API-anrop.
[Verifieringsrapporten](docs/INTEGRATION_REPORT.md) skiljer lokal evidens från
hosted tester som återstår. Använd [releasechecklistan](PRODUCTION_CHECKLIST.md)
före public launch; en lokal grön testsvit ersätter inte hosted verifiering.

Med Node 24 kan konfiguration kontrolleras utan nätverksanrop:

```sh
node --env-file=.env.staging.local scripts/check-config.mjs --staging
```

Kommandot visar endast variabelnamn/felkategorier, aldrig värden. Det verifierar
format och fullständig featurekonfiguration, inte att nycklarna fungerar.
Billing stoppar före Stripe-anrop om någon nödvändig variabel saknas. Delvis
konfigurerad lookup ger en säker driftvarning och behåller manuell registrering.
Preview/production i Vercel kräver HTTPS även om APP_URL råkar ange localhost.
Webhooks loggar endast utfall och tillåtna event-ID/typer; `processed` inkluderar
ignorerade/dubbla event och är inte ett bevis på Premium-aktivering.

### Schemalagd uppsägning från Customer Portal

I den aktuella Stripe-API-versionen kan Portal representera uppsägning vid
periodslut genom `cancel_at`, även när `cancel_at_period_end=false`. Webhooken
normaliserar vår befintliga boolean till true för Stripes explicita flagga, eller
för active/trialing med `ended_at=null` och ett giltigt Unix-tidsvärde i `cancel_at`
som exakt matchar samma items `current_period_end` som sparas i state. Andra datum
eller avslutade abonnemang tolkas inte som planerad uppsägning via `cancel_at`.
Befintligt UI visar då ”Uppsägning planerad till …”. Ingen migration krävs.

Redan behandlade event-ID:n hoppas fortfarande över. En resend av ett tidigare
behandlat event reparerar därför inte äldre state; nästa nya relevanta Stripe-event
hämtar och normaliserar aktuell subscription. Ingen idempotency-state ska raderas
för att kringgå detta.
