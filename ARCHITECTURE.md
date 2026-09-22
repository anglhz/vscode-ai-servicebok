# ARCHITECTURE.md

## 1. Syfte

Detta dokument beskriver den tekniska arkitekturen för Servicebok V2.

Arkitekturen ska göra systemet:

Snabbt

Säkert

Mobile first

Lätt att förstå

Lätt att vidareutveckla

Lämpligt för AI assisterad utveckling med Codex

Systemet ska prioritera enkla, tydliga flöden framför avancerad teknisk komplexitet.

## 2. Teknisk översikt

Frontend och applikationsserver:

Next.js

React

TypeScript

Databas och backendtjänster:

Supabase

PostgreSQL

Supabase Auth

Supabase Storage

Row Level Security

UI:

Tailwind CSS

shadcn ui

Hosting:

Vercel

Betalningar:

Stripe

Fordonsdata:

Extern svensk fordonsdataleverantör

PDF:

Serverside generering

AI funktioner:

Serverbaserade integrationer

AI funktioner ska vara separerade från kärnlogiken.

## 3. Arkitekturprincip

Systemet ska i första hand vara en monolitisk Next.js applikation.

Vi ska inte skapa separata microservices i början.

Next.js hanterar:

UI

Serverrendering

Server actions

API routes vid behov

Auth integration

Affärslogik

Integrationer

PDF generering

Stripe webhooks

Supabase används främst för:

Databas

Authentication

Storage

RLS

Databasfunktioner

Detta håller systemet enkelt att förstå och distribuera.

## 4. App Router

Projektet ska använda Next.js App Router.

Föreslagen struktur:

app/

auth/

dashboard/

vehicles/

vehicles/[vehicleId]/

vehicles/[vehicleId]/events/

vehicles/[vehicleId]/documents/

vehicles/[vehicleId]/settings/

reminders/

account/

api/

components/

lib/

services/

types/

supabase/

## 5. Route struktur

Publika routes:

/

login

signup

forgot-password

terms

privacy

Skyddade routes:

/dashboard

/vehicles

/vehicles/[vehicleId]

/vehicles/[vehicleId]/events/new

/vehicles/[vehicleId]/events/[eventId]

/vehicles/[vehicleId]/documents

/reminders

/account

Skyddade routes ska verifiera session serverside.

## 6. Server Components

Server Components används som standard.

De passar bra för:

Dashboard

Fordonslistor

Fordonsdetaljer

Servicehistorik

Påminnelser

Kontodata

Server Components ska läsa data direkt från Supabase via serverklient.

Fördelar:

Mindre JavaScript till klienten

Snabbare initial rendering

Bättre säkerhetsmodell

Mindre duplicerad datahämtning

## 7. Client Components

Client Components används när interaktivitet krävs.

Exempel:

Formulär

Dialoger

Bottom sheets

Filuppladdning

Optimistiska uppdateringar

Lokala filter

Interaktiva tabs

Navigation med lokal state

Undvik att göra hela sidor till Client Components.

## 8. Dataflöde

Normalt dataflöde:

Browser

Next.js Server Component

Supabase

PostgreSQL

Resultat renderas på servern

HTML skickas till klienten

Interaktiva mutationer går via:

Browser

Server Action

Validering

Auth kontroll

Databas

Resultat

UI uppdateras

## 9. Server Actions

Server Actions bör användas för vanliga mutationer.

Exempel:

createVehicle

updateVehicle

createServiceEvent

updateServiceEvent

deleteServiceEvent

updateMileage

createReminder

deleteReminder

Server Actions ska:

Validera input

Verifiera session

Kontrollera behörighet

Utföra mutation

Returnera tydligt resultat

Revalidate relevant route

Server Actions får inte lita på userId från klienten.

## 10. API Routes

API Routes används när Server Actions inte är lämpliga.

Exempel:

Stripe webhook

Extern fordonslookup

AI dokumenttolkning

PDF download

Eventuella callbacks från externa tjänster

Föreslagen struktur:

app/api/vehicle-lookup/route.ts

app/api/stripe/webhook/route.ts

app/api/documents/analyze/route.ts

app/api/export/[vehicleId]/route.ts

## 11. Supabase klienter

Projektet ska ha separata Supabase klienter för:

Browser

Server

Admin

Browser klienten används för:

Auth UI där det behövs

Klientbaserade realtidsfunktioner om de senare införs

Server klienten används för:

Server Components

Server Actions

Route Handlers

Admin klienten får endast användas där service role faktiskt behövs.

Admin klienten får aldrig importeras i klientkod.

## 12. Auth

Supabase Auth används.

Första versionen bör stödja:

E post och lösenord

Magic link kan övervägas

OAuth kan läggas till senare

När användaren skapas ska en profile post skapas automatiskt.

Detta kan göras med databas trigger eller kontrollerad serverlogik.

## 13. Middleware

Middleware ska användas försiktigt.

Den kan användas för:

Grundläggande kontroll av autentisering

Redirect från publika till skyddade områden

Men middleware ska inte vara enda säkerhetslager.

RLS och serverkontroller är auktoritativa.

## 14. Behörighetsmodell

Behörighet ska bygga på vehicle_ownerships.

När en användare försöker:

Läsa ett fordon

Ändra ett fordon

Skapa en servicepost

Ladda upp ett dokument

Generera PDF

ska systemet kontrollera aktiv ownership.

Kontrollen ska helst kunna ske både genom RLS och serverside helper.

## 15. Gemensamma auth helpers

Skapa gemensamma funktioner för exempelvis:

getCurrentUser

requireUser

requireVehicleAccess

requireVehicleOwner

requirePremiumUser

Det minskar duplicerad säkerhetslogik.

Exempelstruktur:

lib/auth/

lib/permissions/

## 16. Databasaccess

Databasaccess ska inte spridas slumpmässigt över hela projektet.

Skapa tydliga datafunktioner.

Exempel:

services/vehicles/

getVehicle

getVehiclesForUser

createVehicle

services/service-events/

getServiceEvents

createServiceEvent

updateServiceEvent

services/documents/

getDocuments

createDocumentMetadata

services/reminders/

getReminders

Det gör systemet lättare att testa och lättare för Codex att förstå.

## 17. Validering

All extern input ska valideras.

Använd Zod eller motsvarande etablerad validering.

Validering ska finnas för:

Formulär

Route Handlers

Server Actions

Webhook payloads där lämpligt

Fordons API svar

AI resultat

Klientvalidering är för användarupplevelse.

Servervalidering är den riktiga säkerhetskontrollen.

## 18. Fordonslookup

Fordonslookup ska ske genom vår server.

Flöde:

Användare skriver registreringsnummer

Klienten anropar vår server

Servern normaliserar registreringsnumret

Servern anropar extern fordonsleverantör

Svar valideras

Svar normaliseras till vår interna modell

Relevant data skickas till klienten

Vid skapande sparas fordonsinformationen i vår databas

Frontend ska aldrig anropa fordonsleverantören direkt.

## 19. Fordonsprovider abstraction

Extern fordonsdata ska ligga bakom ett provider interface.

Exempel:

VehicleProvider

lookupByRegistrationNumber

getVehicleDetails

Det gör det möjligt att byta leverantör senare.

Intern modell ska inte spegla extern leverantör exakt.

Exempelstruktur:

services/vehicle-data/

provider.ts

providers/

normalizers/

types.ts

## 20. Caching av fordonsdata

Fordonsdata ska inte hämtas externt varje gång.

Efter lookup sparas relevant data lokalt.

Systemet kan senare stödja refresh.

Exempel:

Om fordonsdata är äldre än 30 dagar kan användaren eller systemet uppdatera den.

Refresh ska inte blockera visning av redan sparad data.

## 21. Servicehistorik

Servicehistorik ska laddas från vår databas.

Föreslagen sortering:

event_date descending

created_at descending som sekundär sortering

För stora historiker ska pagination användas.

Första versionen kan använda begränsat antal events och sedan load more.

## 22. Miltal

Miltal är en separat historisk dataström.

När en servicepost innehåller miltal ska systemet kunna skapa en mileage_entry.

vehicles.current_mileage är en cache av senaste relevanta miltal.

Historisk sanning finns i mileage_entries.

## 23. Dokumentuppladdning

Dokumentuppladdning bör använda signed upload eller kontrollerad serverlogik.

Flöde:

Användaren väljer fil

Filtyp och storlek valideras

Systemet skapar dokumentmetadata

Unik storage path genereras

Fil laddas upp till privat bucket

Upload bekräftas

Dokument kopplas till servicepost

Felaktiga halvfärdiga uploads ska kunna städas bort.

## 24. Filregler

Tillåtna filtyper i första versionen:

PDF

JPEG

PNG

HEIC om stödet är stabilt

Filstorlek ska begränsas.

Exempelvis 10 till 20 MB per fil.

Exakt gräns beslutas senare.

## 25. Dokumentvisning

Privata filer ska öppnas via kortlivad signed URL.

Signed URL genereras på servern efter behörighetskontroll.

Klienten får aldrig direkt tillgång till generell bucket access.

## 26. Ägarbyte

Ägarbyte ska ske via en kontrollerad serverside operation.

Flöde:

Ägare initierar överföring

Servern skapar transfer

Säker token genereras

Hash sparas i databasen

Köparen öppnar transferlänk

Köparen loggar in

Servern verifierar token

Servern genomför databastransaktion

Ownership byts

Audit log skapas

Historiken ligger kvar på samma vehicle

## 27. Transfer routes

Exempel:

/transfer/[token]

Den route ska:

Visa grundläggande fordonsinformation

Inte visa privat historik innan transfer är accepterad

Kräva inloggning innan accept

Visa tydligt vad användaren accepterar

## 28. Dokument vid ägarbyte

Servicehistorik följer fordonet.

Dokument ska behandlas separat.

Vid transfer ska säljaren kunna välja:

Överför dokument

Överför vissa dokument

Överför inga originaldokument

Metadata som behövs för servicehistoriken kan finnas kvar även om originalfilen inte överförs.

## 29. Påminnelser

Påminnelser ska baseras på lagrad data.

Första versionen kan visa reminders i appen.

Senare kan vi lägga till:

E post

Push

Scheduled jobs

Om schemalagda jobb behövs kan Vercel Cron eller motsvarande användas.

## 30. Serviceintervall

Serviceintervall ska vara separata från service_events.

Ett intervall beskriver vad som bör göras.

En service_event beskriver vad som faktiskt har gjorts.

Detta är en viktig separation.

Systemet kan räkna nästa förfallodatum från:

last_completed_date

month_interval

och nästa miltal från:

last_completed_mileage

distance_interval

## 31. PDF export

PDF ska genereras på servern.

Flöde:

Användaren begär export

Servern kontrollerar ownership

Servern kontrollerar premiumstatus om funktionen kräver premium

Servern hämtar fordon

Servern hämtar historik

Servern hämtar relevanta kostnader

PDF genereras

PDF returneras eller sparas temporärt

Klienten ska inte generera den auktoritativa PDF rapporten.

## 32. PDF implementation

PDF implementationen ska ligga bakom ett tydligt interface.

Exempel:

generateVehicleHistoryPdf

Det ska vara möjligt att byta PDF bibliotek utan att övrig kod påverkas.

Rapportdata bör först transformeras till en ren report model.

Exempel:

VehicleHistoryReport

Sedan renderas report modellen till PDF.

## 33. Stripe

Stripe ska användas för premiumabonnemang.

Checkout och Customer Portal ska skapas server side.

Stripe webhook är source of truth.

Webhook uppdaterar subscriptions tabellen.

Frontend ska läsa premiumstatus från vår databas.

Frontend ska inte fråga Stripe direkt för varje sida.

## 34. Premium gate

Premiumfunktioner ska kontrolleras på servern.

Exempel:

PDF export

Flera fordon

Utökad dokumentlagring

AI dokumenttolkning

Premiumkomponenter i UI får gärna visa upgrade prompt.

Men UI gate är inte tillräcklig.

## 35. Webhooks

Stripe webhook endpoint ska verifiera signaturen.

Webhook events ska vara idempotenta.

Systemet ska kunna ta emot samma event flera gånger utan att skapa felaktigt tillstånd.

Relevant webhook metadata ska loggas utan känsliga uppgifter.

## 36. AI dokumenttolkning

AI dokumenttolkning ska vara en senare funktion.

Flöde:

Användaren laddar upp dokument

Användaren väljer analysera

Servern hämtar filen

AI extraherar föreslagna fält

Resultatet valideras mot schema

Användaren får granska

Användaren godkänner

Först därefter skapas eller uppdateras servicepost

AI ska aldrig automatiskt skriva permanent historik utan bekräftelse.

## 37. AI output schema

AI svar ska vara strukturerade.

Exempel:

document_type

event_date

mileage

provider_name

total_cost

currency

service_items

notes

Alla fält ska betraktas som förslag.

## 38. Felhantering

Fel ska delas in i ungefär:

ValidationError

AuthenticationError

AuthorizationError

NotFoundError

ExternalServiceError

RateLimitError

DatabaseError

StorageError

Användaren ska få vänliga felmeddelanden.

Intern teknisk information ska loggas separat.

## 39. Loading states

Undvik globala loading screens.

Använd route loading där det behövs men håll den enkel.

Komponenter som laddar sekundär data kan ha lokala skeletons.

Primär data ska prioriteras.

Exempel:

Fordonets namn och registreringsnummer visas direkt.

Sekundär extern status kan laddas efteråt.

## 40. Optimistic UI

Optimistic UI kan användas där operationen är enkel och säker.

Exempel:

Markera reminder som klar

Uppdatera enkel metadata

Var försiktig med optimistic UI för:

Ägarbyte

Dokumentuppladdning

Betalning

Radering

Säkerhetskritiska ändringar

## 41. Cache och revalidation

Använd Next.js cachefunktioner med försiktighet.

Privat användardata får inte oavsiktligt delas mellan användare.

Efter mutation ska relevanta paths revalidateras.

Överdriven caching av användarspecifik data ska undvikas.

## 42. State management

Undvik global state library i början.

Använd:

Server data

URL state

Local component state

React context endast när det finns ett tydligt behov

Lägg inte till Redux, Zustand eller liknande utan konkret problem.

## 43. Design system

UI komponenter ska byggas ovanpå shadcn ui och Tailwind.

Projektet ska ha egna wrapper komponenter när gemensamt beteende behövs.

Exempel:

PageHeader

VehicleCard

ServiceEventCard

EmptyState

LoadingSkeleton

CurrencyDisplay

MileageDisplay

DocumentCard

## 44. Mobile first navigation

Mobil navigation är primär.

Bottom navigation:

Hem

Fordon

Ny

Påminnelser

Konto

Desktop kan använda sidebar eller utökad navigation.

Navigation ska återanvända samma route struktur.

## 45. PWA

Servicebok ska kunna utvecklas till PWA.

PWA behöver inte vara komplett i första byggfasen.

Arkitekturen ska dock undvika beslut som försvårar:

Add to Home Screen

Push notifications

Offline fallback

App like navigation

## 46. Offline

Full offline funktionalitet är inte krav i första versionen.

Vi ska inte bygga komplex offline sync från början.

Senare kan enklare offlinefunktioner införas för exempelvis:

Läsa senast cachad fordonsdata

Påbörja ett formulär

## 47. Observability

Systemet bör ha grundläggande observability.

Fel från servern ska kunna spåras.

Senare kan exempelvis Sentry eller liknande användas.

Loggar ska aldrig innehålla hemligheter eller fullständig privat dokumentdata.

## 48. Analytics

Analytics ska införas försiktigt.

Mät produktbeteenden snarare än känslig fordonsdata.

Exempel på events:

vehicle_created

service_event_created

document_uploaded

pdf_exported

transfer_started

transfer_completed

upgrade_started

subscription_activated

Skicka inte privata anteckningar eller dokumentinnehåll till analytics.

## 49. Miljöer

Minst tre miljöer rekommenderas:

Local

Preview

Production

Preview deployments används för att testa features innan merge.

Separata Supabase projekt kan användas för produktion och utveckling när projektet växer.

## 50. Environment variables

Exempel:

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY

VEHICLE_API_KEY

STRIPE_SECRET_KEY

STRIPE_WEBHOOK_SECRET

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

Secrets får aldrig committas.

`.env.example` ska innehålla variabelnamn men inga riktiga nycklar.

## 51. Git workflow

Varje feature utvecklas separat.

Förslag:

main

feature branches

pull request

preview deployment

review

merge

Små PRs föredras framför stora.

## 52. Codex workflow

Codex ska få en tydligt avgränsad uppgift.

Exempel:

Implementera fordonslistan enligt PRODUCT.md och DESIGN.md.

Innan implementation ska Codex läsa:

AGENTS.md

PRODUCT.md

DATABASE.md

ARCHITECTURE.md

relevanta befintliga filer

Efter implementation ska Codex:

Köra TypeScript kontroll

Köra lint

Köra relevanta tester

Sammanfatta ändrade filer

Rapportera eventuella begränsningar

## 53. Mappstruktur

Föreslagen struktur:

app/

components/

components/ui/

components/vehicles/

components/service-events/

components/documents/

components/reminders/

lib/

lib/auth/

lib/permissions/

lib/validation/

lib/utils/

services/

services/vehicles/

services/service-events/

services/documents/

services/vehicle-data/

services/reminders/

services/subscriptions/

services/pdf/

types/

supabase/

supabase/migrations/

public/

tests/

## 54. Services ansvar

Service lagret ska innehålla applikationslogik som inte hör hemma i UI.

Exempel:

Vehicle service hanterar fordonsoperationer.

Service event service hanterar historik.

Document service hanterar dokumentmetadata och storage.

Subscription service hanterar premiumstatus.

UI komponenter ska inte innehålla stor affärslogik.

## 55. Utility funktioner

Utilities ska vara små och generella.

Exempel:

normalizeRegistrationNumber

formatMileage

formatCurrency

formatVehicleName

normalizeVehicleApiResponse

Undvik en enda stor utils fil.

## 56. Types

Delade typer ska organiseras per domän.

Exempel:

types/vehicle.ts

types/service-event.ts

types/document.ts

types/reminder.ts

types/subscription.ts

Databastyper kan genereras från Supabase.

Genererade typer ska inte manuellt redigeras.

## 57. Teststrategi

Unit tests:

Utilities

Normalizers

Validering

Affärslogik

Integration tests:

Databasoperationer

Permissions

Server Actions

Transferflöde

End to end:

Login

Skapa fordon

Skapa servicepost

Ladda upp dokument

Exportera PDF

Ägarbyte

Premiumflöde

## 58. Kritiska testfall

Systemet måste särskilt testa att:

Användare A inte kan läsa användare B:s fordon.

Användare A inte kan ändra användare B:s servicehistorik.

Tidigare ägare tappar skrivrättigheter efter transfer.

Transfer token inte kan användas två gånger.

Utgången transfer token nekas.

Privata dokument inte är publika.

Premiumfunktioner nekas på servern för gratisanvändare.

## 59. Prestandamål

Vanliga vyer ska kännas omedelbara.

Prioritera:

Snabb första rendering

Få klientbundles

Få nätverksanrop

Lokal databas framför externa API anrop

Bildoptimering

Lazy loading av sekundärt innehåll

Undvik waterfall requests.

## 60. Vad vi inte ska göra

Vi ska inte bygga microservices i första versionen.

Vi ska inte skapa en separat backend om Next.js och Supabase räcker.

Vi ska inte införa GraphQL utan tydligt behov.

Vi ska inte införa komplex event driven arkitektur.

Vi ska inte införa global state bara för bekvämlighet.

Vi ska inte lägga affärslogik direkt i UI komponenter.

Vi ska inte låta klienten fatta säkerhetskritiska beslut.

## 61. Definition av bra arkitektur

Arkitekturen är tillräckligt bra när:

Codex enkelt kan förstå var ny kod ska placeras.

En utvecklare kan följa dataflödet från UI till databas.

Behörighetskontroller är tydliga.

Extern fordonsleverantör kan bytas.

PDF bibliotek kan bytas.

Stripe är isolerat från övrig produktlogik.

AI funktioner kan läggas till utan att kärnprodukten blir beroende av AI.

Appen fungerar bra på mobil.

Vanliga sidor kräver få externa anrop.

Kodbasen kan växa utan att strukturen blir kaotisk.

## 62. Arkitekturens slutprincip

Servicebok V2 ska byggas som en enkel, säker och snabb produkt.

Teknik ska väljas för att minska komplexitet, inte för att visa teknisk sophistication.

Kärnflödet ska alltid prioriteras:

Logga in

Lägg till fordon

Registrera historik

Ladda upp dokument

Följ servicebehov

Exportera historik

Överför fordon till nästa ägare

## Implementerad Billing V1

`lib/stripe/server.ts` kapslar den officiella Stripe Node-klienten. Serveractions
på konto använder `services/subscriptions/checkout.ts` för hosted Checkout och
Customer Portal. Klienten får aldrig ange customer, price eller returadress.
`services/subscriptions/index.ts` läser sessionsbunden lokal plan genom RLS/RPC och
exponerar `getUserPlan` och `requirePremiumUser`. PDF-routen använder samma helper.

`app/api/stripe/webhook/route.ts` verifierar rå signatur och delegerar till
`services/subscriptions/webhook.ts`. Aktuell Stripe subscription hämtas inom en
kontolease. `services/subscriptions/backend.ts` är enda konsumenten av service-role-
fabriken `lib/supabase/admin.ts`; båda är server-only. Det lagret hanterar enbart
privilegierade billingoperationer, mapping och atomisk webhookpersistens.

Databasmigrationen centraliserar kvoter och serialiserar nya ägarrelationer och
dokumentreservationer. Vanliga fordon/dokument/transfer-services behåller sina
sessionsklienter och hanterar bara begripliga gränsfel. Checkout-returen kan visa
väntestatus men kan inte aktivera Premium. Detaljer och miljökonfiguration finns
i README:s Billing-avsnitt.
