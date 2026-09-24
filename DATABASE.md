# DATABASE.md

## 1. Syfte

Detta dokument beskriver databasmodellen för Servicebok V2.

Databasen ska stödja:

Användare

Fordon

Ägarhistorik

Servicehistorik

Miltal

Dokument

Serviceintervall

Påminnelser

Ägarbyte

Premiumabonnemang

Datamodellen ska vara byggd för PostgreSQL och Supabase.

Systemet ska från början vara kompatibelt med Row Level Security.

## 2. Grundprinciper

Servicehistorik tillhör fordonet.

Ägande tillhör relationen mellan användare och fordon.

Servicehistorik ska inte försvinna vid ägarbyte.

En användare får endast ändra ett fordon som användaren har aktiv ägarrelation till.

Tidigare ägare ska inte kunna ändra fordonet efter ett genomfört ägarbyte.

Privata dokument ska hanteras separat från själva servicehistoriken.

Historiska data ska bevaras.

Klienten ska aldrig vara ansvarig för säkerhetskritiska behörighetsbeslut.

## 3. Databasstandard

Primärnycklar använder UUID.

Timestamps använder timestamptz.

Pengar lagras i heltal i minsta valutaenhet.

Svenska kronor lagras därför i ören.

Exempel:

49900 betyder 499 kronor.

Miltal lagras som heltal i mil.

Registreringsnummer sparas normaliserat med stora bokstäver och utan mellanslag.

Exempel:

ABC123

Alla tabeller som användaren kan ändra bör ha:

created_at

updated_at

updated_at ska uppdateras automatiskt med trigger där det är lämpligt.

## 4. profiles

Supabase Auth äger autentiseringsinformationen.

Vi skapar en separat profiles tabell för applikationsdata.

### Kolumner

id uuid primary key

display_name text nullable

avatar_path text nullable

preferred_locale text not null default 'sv'

timezone text not null default 'Europe/Stockholm'

created_at timestamptz not null default now()

updated_at timestamptz not null default now()

### Relation

profiles.id refererar till auth.users.id.

Relationen är en till en.

### Säkerhet

Användaren får läsa sin egen profil.

Användaren får uppdatera sin egen profil.

Användaren får inte välja ett annat profile id vid skapande eller uppdatering.

## 5. vehicles

Representerar själva fordonet.

Ett fordon ska kunna existera oberoende av vem som äger det just nu.

### Kolumner

id uuid primary key

registration_number text nullable

vin text nullable

make text not null

model text not null

model_year integer nullable

vehicle_year integer nullable

fuel_type text nullable

power_kw integer nullable

vehicle_type text not null

current_mileage integer nullable

first_registration_date date nullable

color text nullable

external_provider text nullable

external_provider_id text nullable

external_data_fetched_at timestamptz nullable

created_at timestamptz not null default now()

updated_at timestamptz not null default now()

### Constraints

current_mileage får inte vara negativt.

model_year ska ligga inom rimligt intervall.

registration_number ska normaliseras innan lagring.

vin ska vara unikt när det finns tillräcklig tillförlitlighet för detta.

### Kommentar

registration_number får vara nullable eftersom vissa fordon kan sakna svenskt registreringsnummer eller läggas till manuellt.

## 6. vehicle_ownerships

Representerar vem som äger eller administrerar ett fordon under en viss period.

Detta är en av systemets viktigaste tabeller.

### Kolumner

id uuid primary key

vehicle_id uuid not null

user_id uuid not null

role text not null default 'owner'

started_at timestamptz not null default now()

ended_at timestamptz nullable

status text not null default 'active'

created_at timestamptz not null default now()

### Foreign keys

vehicle_id refererar till vehicles.id.

user_id refererar till profiles.id.

### Tillåtna statusvärden

active

ended

pending_transfer

revoked

### Regler

Ett fordon får endast ha en aktiv huvudägare åt gången.

En aktiv ägarrelation har ended_at null.

När ägarskap avslutas sätts ended_at.

Historiska ownership poster ska inte raderas.

### Viktig säkerhetsregel

Alla mutationer av fordonsdata ska kontrollera att användaren har aktiv ownership.

## 7. service_events

Representerar en händelse i fordonets historik.

### Kolumner

id uuid primary key

vehicle_id uuid not null

created_by_user_id uuid not null

category text not null

title text not null

description text nullable

event_date date not null

mileage integer nullable

cost_amount integer nullable

currency text not null default 'SEK'

provider_name text nullable

notes text nullable

source_type text not null default 'owner'

created_at timestamptz not null default now()

updated_at timestamptz not null default now()

deleted_at timestamptz nullable

### Foreign keys

vehicle_id refererar till vehicles.id.

created_by_user_id refererar till profiles.id.

### Exempel på category

service

repair

inspection

tires

oil

brakes

timing_belt

battery

accessory

damage

mileage

other

### Exempel på source_type

owner

previous_owner

imported

system

### Regler

mileage får inte vara negativt.

cost_amount får inte vara negativt.

Servicehistorik ska i normalfallet inte raderas permanent.

Soft delete används genom deleted_at.

### Viktigt

created_by_user_id berättar vem som skapade posten.

Det ska inte användas för att avgöra vem som får läsa eller redigera fordonet.

Behörighet ska avgöras via vehicle_ownerships.

## 8. service_event_items

Används för mer detaljerad serviceinformation.

Detta gör att en servicepost kan innehålla flera utförda arbeten.

### Kolumner

id uuid primary key

service_event_id uuid not null

item_type text not null

name text not null

description text nullable

quantity numeric nullable

unit text nullable

cost_amount integer nullable

created_at timestamptz not null default now()

### Exempel

Motorolja

Oljefilter

Kupéfilter

Bromsbelägg fram

Bromsskivor fram

### Kommentar

Denna tabell behöver inte användas i första UI versionen, men modellen bör stödja den.

## 9. mileage_entries

Separat historik över registrerat miltal.

### Kolumner

id uuid primary key

vehicle_id uuid not null

recorded_by_user_id uuid not null

mileage integer not null

recorded_at timestamptz not null

source text not null default 'manual'

service_event_id uuid nullable

created_at timestamptz not null default now()

### Foreign keys

vehicle_id refererar till vehicles.id.

recorded_by_user_id refererar till profiles.id.

service_event_id refererar till service_events.id.

### Regler

mileage får inte vara negativt.

Ett nytt miltal som är högre än vehicles.current_mileage kan uppdatera current_mileage.

Ett lägre miltal ska inte automatiskt sänka vehicles.current_mileage.

Miltal ska bevaras historiskt.

## 10. documents

Metadata för uppladdade dokument.

Själva filen lagras i Supabase Storage.

### Kolumner

id uuid primary key

vehicle_id uuid not null

uploaded_by_user_id uuid not null

file_name text not null

storage_path text not null

mime_type text not null

file_size_bytes bigint not null

document_type text not null

visibility_scope text not null default 'private'

created_at timestamptz not null default now()

deleted_at timestamptz nullable

### Foreign keys

vehicle_id refererar till vehicles.id.

uploaded_by_user_id refererar till profiles.id.

### Exempel på document_type

receipt

invoice

service_report

inspection_report

photo

other

### Exempel på visibility_scope

private

transferable

shared

### Viktigt

storage_path ska vara genererad av systemet.

Användarens ursprungliga filnamn ska inte användas som säker identifierare.

## 11. service_event_documents

Kopplingstabell mellan servicehändelser och dokument.

### Kolumner

service_event_id uuid not null

document_id uuid not null

created_at timestamptz not null default now()

### Primary key

service_event_id och document_id tillsammans.

### Kommentar

Det gör att samma dokument kan kopplas till flera händelser vid behov.

## 12. service_intervals

Representerar serviceintervall för ett fordon.

### Kolumner

id uuid primary key

vehicle_id uuid not null

name text not null

category text not null

distance_interval integer nullable

month_interval integer nullable

last_completed_date date nullable

last_completed_mileage integer nullable

source text not null

is_active boolean not null default true

created_at timestamptz not null default now()

updated_at timestamptz not null default now()

### Exempel på source

system

external_provider

owner

### Regler

Minst ett av distance_interval eller month_interval ska finnas.

distance_interval måste vara större än noll om det anges.

month_interval måste vara större än noll om det anges.

### Exempel

Motorolja

distance_interval 3000

month_interval 12

Kamrem

distance_interval 15000

month_interval 120

## 13. reminders

Representerar framtida påminnelser.

### Kolumner

id uuid primary key

vehicle_id uuid not null

user_id uuid not null

service_interval_id uuid nullable

title text not null

reminder_type text not null

due_date date nullable

due_mileage integer nullable

status text not null default 'active'

completed_at timestamptz nullable

created_at timestamptz not null default now()

updated_at timestamptz not null default now()

### Exempel på reminder_type

service

inspection

tires

insurance

tax

custom

### Status

active

completed

dismissed

## 14. vehicle_transfers

Representerar ett planerat eller genomfört ägarbyte.

### Kolumner

id uuid primary key

vehicle_id uuid not null

from_user_id uuid not null

to_user_id uuid nullable

transfer_token_hash text not null

status text not null default 'pending'

expires_at timestamptz not null

accepted_at timestamptz nullable

cancelled_at timestamptz nullable

created_at timestamptz not null default now()

### Status

pending

accepted

cancelled

expired

### Viktigt

Själva transfer token ska inte sparas i klartext.

Endast hash ska lagras.

### Flöde

Nuvarande ägare initierar överföring.

Systemet genererar token.

Token visas eller skickas till köparen.

Köparen autentiserar sig.

Servern validerar token.

Servern verifierar att överföringen fortfarande är giltig.

Den gamla ownership posten avslutas.

En ny ownership post skapas.

Transfer status sätts till accepted.

Allt ska ske i en databastransaktion.

## 15. vehicle_transfer_documents

Styr vilka dokument som får följa med vid ägarbyte.

### Kolumner

transfer_id uuid not null

document_id uuid not null

transfer_status text not null

created_at timestamptz not null default now()

### Exempel på transfer_status

included

excluded

pending_review

### Syfte

Servicehistorik följer fordonet.

Originaldokument behöver inte göra det.

Användaren ska kunna välja vilka dokument som överförs.

## 16. subscriptions

Representerar användarens abonnemang.

### Kolumner

id uuid primary key

user_id uuid not null

provider text not null default 'stripe'

provider_customer_id text nullable

provider_subscription_id text nullable

plan text not null

status text not null

current_period_start timestamptz nullable

current_period_end timestamptz nullable

cancel_at_period_end boolean not null default false

created_at timestamptz not null default now()

updated_at timestamptz not null default now()

### Planer

free

premium

### Status

active

trialing

past_due

cancelled

incomplete

### Viktigt

Stripe webhook är den auktoritativa källan för abonnemangsstatus.

Klienten får aldrig själv bestämma om användaren är Premium.

## 17. audit_log

För säkerhetskritiska händelser bör systemet ha en enkel audit log.

### Kolumner

id uuid primary key

actor_user_id uuid nullable

vehicle_id uuid nullable

action text not null

entity_type text nullable

entity_id uuid nullable

metadata jsonb nullable

created_at timestamptz not null default now()

### Exempel på action

vehicle_created

ownership_started

ownership_ended

transfer_started

transfer_accepted

document_uploaded

document_deleted

subscription_changed

### Viktigt

Audit log ska inte innehålla hemligheter eller fullständiga dokumentdata.

## 18. Constraints och index

Index ska finnas på:

vehicles.registration_number

vehicles.vin

vehicle_ownerships.vehicle_id

vehicle_ownerships.user_id

service_events.vehicle_id

service_events.event_date

mileage_entries.vehicle_id

documents.vehicle_id

service_intervals.vehicle_id

reminders.user_id

reminders.vehicle_id

vehicle_transfers.vehicle_id

vehicle_transfers.status

subscriptions.user_id

### Aktiv ägare

Databasen bör ha en partial unique index som förhindrar mer än en aktiv huvudägare för samma fordon.

Konceptuellt:

Unique på vehicle_id där status är active och role är owner.

## 19. RLS principer

Row Level Security ska aktiveras på alla användarnära tabeller.

Klienten ska aldrig förlita sig på filtrering enbart i applikationskod.

## 20. RLS profiles

SELECT

Användaren får läsa sin egen profil.

UPDATE

Användaren får uppdatera sin egen profil.

INSERT

Profil skapas av kontrollerad serverlogik eller auth trigger.

## 21. RLS vehicles

SELECT

Aktiv ägare får läsa fordonet.

Eventuell delad åtkomst kan läggas till senare.

INSERT

Fordonskapande ska ske genom kontrollerad serverlogik.

UPDATE

Endast aktiv ägare får uppdatera fordonet.

DELETE

Permanent borttagning bör inte tillåtas direkt från klienten.

## 22. RLS vehicle_ownerships

SELECT

Användaren får läsa ownership poster för fordon som användaren har legitim åtkomst till.

INSERT

Direkt insert från klienten ska inte tillåtas.

UPDATE

Direkt update från klienten ska inte tillåtas.

DELETE

Ska inte tillåtas.

Ägarrelationer ska hanteras genom serverside funktioner eller RPC med tydliga säkerhetskontroller.

## 23. RLS service_events

SELECT

Aktiv ägare får läsa servicehistorik för fordonet.

UPDATE

Aktiv ägare får redigera poster för fordonet.

INSERT

Aktiv ägare får skapa poster.

created_by_user_id ska härledas från auth.uid().

DELETE

Permanent delete ska inte exponeras.

Soft delete används istället.

## 24. RLS documents

SELECT

Aktiv ägare får läsa dokumentmetadata för fordonet om visibility regler tillåter det.

INSERT

Aktiv ägare får skapa dokumentmetadata.

uploaded_by_user_id ska härledas från auth.uid().

UPDATE

Endast behörig användare får ändra dokumentmetadata.

DELETE

Soft delete ska föredras.

## 25. Storage policies

Alla privata fordonsdokument ska ligga i privat bucket.

Föreslagen bucket:

vehicle_documents

Path format:

vehicle_id/document_id/original_file

Tillgång ska ges genom signed URL.

Signed URL ska ha kort giltighetstid.

Användaren ska inte kunna skapa signed URL för fordon som användaren saknar behörighet till.

## 26. Serverfunktioner

Följande operationer bör hanteras genom kontrollerad serverside logik.

create_vehicle

create_vehicle_with_ownership

transfer_vehicle

accept_vehicle_transfer

cancel_vehicle_transfer

upload_vehicle_document

delete_vehicle_document

generate_document_signed_url

update_subscription_from_webhook

export_vehicle_history

Dessa funktioner ska inte förlita sig på user_id från klienten.

Användarens identitet ska hämtas från autentiserad session.

## 27. Fordonskapande

När ett nytt fordon skapas ska processen vara atomisk.

Steg:

Skapa vehicle.

Skapa aktiv vehicle_ownership.

Skapa första mileage_entry om användaren angivit miltal.

Logga vehicle_created.

Om någon kritisk del misslyckas ska hela operationen rullas tillbaka.

## 28. Servicepost och miltal

När en servicepost skapas med miltal ska systemet:

Skapa service_event.

Skapa mileage_entry kopplad till service_event.

Jämföra miltalet med vehicles.current_mileage.

Om miltalet är högre ska current_mileage uppdateras.

Allt bör kunna ske atomiskt.

## 29. Ägarbyte

Ägarbyte är en databastransaktion.

Vid accept ska systemet:

Verifiera transfer token.

Verifiera expiration.

Verifiera status.

Verifiera att from_user fortfarande är aktiv ägare.

Verifiera att mottagaren är autentiserad.

Avsluta befintlig ownership.

Skapa ny ownership.

Markera transfer som accepted.

Registrera audit log.

Om en del misslyckas ska ingen ägarförändring ske.

## 30. Dubbelregistrerade fordon

Systemet bör försöka undvika att samma fordon skapas flera gånger.

VIN är den starkaste identifieraren när den finns.

Registreringsnummer kan förändras över tid och bör därför inte vara enda globala identifieraren.

Vid fordonslookup bör systemet:

Först kontrollera VIN om det finns.

Sedan kontrollera registreringsnummer.

Om ett matchande fordon redan finns ska systemet inte automatiskt ge användaren åtkomst.

Ägarskap måste fortfarande verifieras genom korrekt transferflöde.

## 31. Extern fordonsdata

Svar från externa fordons API ska normaliseras innan de sparas.

Applikationen ska inte vara beroende av en specifik leverantörs fältnamn.

Föreslaget internt format:

registration_number

vin

make

model

model_year

vehicle_year

fuel_type

power_kw

vehicle_type

first_registration_date

color

Extern rådata kan vid behov sparas till separat cache eller jsonb fält, men ska inte vara primär datamodell.

## 32. Serviceintervall och externa källor

Extern serviceinformation ska normaliseras innan lagring.

Varje service_interval ska ha source.

Om informationen kommer från extern leverantör bör systemet senare kunna kompletteras med:

source_provider

source_reference

source_fetched_at

Det ska gå att byta leverantör utan att ändra hela systemets datamodell.

## 33. Soft delete

Historisk data ska i första hand soft delete.

Soft delete bör användas på:

service_events

documents

eventuellt reminders

Fordon och ownership historik bör normalt inte raderas.

Permanent deletion ska hanteras genom separat konto eller dataraderingsflöde.

## 34. GDPR och dataminimering

Servicebok ska endast lagra personuppgifter som behövs.

Fordonshistorik och persondata ska hållas logiskt separerade där det är möjligt.

Originaldokument kan innehålla:

Namn

Adress

Telefonnummer

Kundnummer

Betalningsuppgifter

Därför ska dokument inte betraktas som automatiskt överförbara vid ägarbyte.

Systemet ska senare kunna stödja användarens rätt till dataexport och kontoradering.

## 35. Backup och återställning

Databas och dokumentlagring ska omfattas av backupstrategi.

Ägarhistorik och servicehistorik är särskilt viktiga data.

Systemet ska undvika hårda raderingar som försvårar återställning.

## 36. Första migrationsordning

Första databasmigrationerna bör skapas i denna ordning.

1. profiles

2. vehicles

3. vehicle_ownerships

4. service_events

5. service_event_items

6. mileage_entries

7. documents

8. service_event_documents

9. service_intervals

10. reminders

11. vehicle_transfers

12. vehicle_transfer_documents

13. subscriptions

14. audit_log

15. Index

16. Triggers

17. RLS

18. Storage policies

## 37. Första implementationen

För första fungerande produkten behöver inte alla tabeller användas direkt.

Första kodfasen behöver främst:

profiles

vehicles

vehicle_ownerships

service_events

mileage_entries

documents

service_event_documents

Övriga tabeller kan migreras in när deras funktioner byggs.

## 38. Databasen som source of truth

Klienten ska inte vara source of truth för:

Ägarskap

Premiumstatus

Nuvarande behörighet

Servicehistorik

Dokumentåtkomst

Ägarbyte

Dessa beslut ska alltid baseras på databas och serverside verifiering.

## 39. Viktig arkitekturprincip

Det ska vara möjligt att svara på följande fråga med databasen:

Vilket fordon gäller detta?

Vem äger fordonet just nu?

Vem ägde det tidigare?

Vilken historik tillhör fordonet?

Vilka dokument är privata?

Vilka dokument får överföras?

Vem skapade respektive post?

Vilken information får nuvarande användare ändra?

Om dessa frågor inte kan besvaras tydligt är datamodellen fel.

## 40. Definition av korrekt databasmodell

Databasmodellen är tillräckligt bra för första implementationen när:

Ett fordon kan skapas.

Ett fordon kan ha exakt en aktiv huvudägare.

En användare kan endast ändra egna aktiva fordon.

Servicehistorik överlever ägarbyte.

Tidigare ägare tappar skrivrättighet efter ägarbyte.

Dokument är privata som standard.

Dokument kan behandlas separat vid ägarbyte.

Miltalshistorik kan sparas.

RLS skyddar data även om klienten manipuleras.

Premiumstatus kan valideras serverside.

Datamodellen kräver inte omskrivning för att stödja framtida ägarbyte.

## Implementerad Billing V1

Migration `20260921000900_subscriptions.sql` implementerar subscriptions enligt
avsnitt 16, med explicit statusconstraint, unika user/customer/subscription-ID:n,
periodslut, planerad uppsägning och tidsstämplar för Stripe subscription/event.
RLS tillåter endast användarens egen SELECT. Privilegierade billing-RPC:er är
endast körbara av service_role och skriver aldrig kortdata.

`stripe_webhook_events` innehåller endast event-ID, typ och processed_at.
`billing_operations` innehåller en kortlivad lease med fencing-token samt stabila
Customer/Checkout-idempotency keys och sparade Checkout-parametrar. Båda tabellerna
saknar klientåtkomst. `apply_stripe_subscription` uppdaterar abonnemang och markerar
eventet i samma transaktion. `get_billing_overview` lämnar sessionsbundna plan- och
kvotuppgifter; `is_premium_user` och `plan_limits` är interna centrala regler.

Dokument får `quota_user_id`, backfylld från uppladdare eller uttrycklig aktuell
transfermottagare. Ett partiellt index över ej raderade dokument stödjer kvotsumman.
Pending/ready räknas, soft-deleted räknas inte. Fordons- och dokumenttriggers tar
kontolås och stoppar överskridande reservationer atomiskt. Transfer flyttar bara
utvalda färdiga dokuments kvotkonto och återställs helt om mottagarens gräns överskrids.
Nedgradering ändrar inte befintliga data. Gränser, retentionavvägningar, statusmodell
och test-/driftsinstruktioner finns i README:s Billing-avsnitt.

## Radering av felregistrerat, historikfritt fordon

Migration `20260924001000_delete_empty_vehicle.sql` inför endast RPC:n
`delete_empty_vehicle(uuid)`, inga nya tabeller eller ändrade FK/policies.
SECURITY DEFINER med tom search_path och EXECUTE endast för authenticated
kontrollerar aktiv owner under fordons- och ägarlås. Exakt en ägarrad måste finnas.
Serviceposter, miltal, dokument, intervall, påminnelser och transfers blockerar
oavsett status. Kontrollen omfattar även dolt material och kvarvarande Storage-
objekt. Endast den enda ägarraden och det tomma fordonet raderas atomiskt.
Lookupfält på fordonet är teknisk metadata som följer med vid denna radering.
Fullständig relationsinventering och concurrency-strategi finns i README.

Servicehistorik tillhör fordonet och ownership är separat. Detta snäva undantag
ger därför ingen rätt att radera normal fordonshistorik eller tidigare ägarperioder.

## Distribuerade försöksspärrar

Migration `20260924001100_distributed_rate_limits.sql` inför `private.rate_limits`
med (user_id, scope) som primärnyckel, used och expires_at. User-id refererar till
profiles med ON DELETE CASCADE; högst sex scope-rader kan finnas per konto.
Utgångna fönster skrivs över vid nästa konsumtion. Inga IP-adresser eller tokens
sparas. RLS utan klientpolicies och återkallade tabellgrants skyddar räknarna.

`consume_rate_limit(text,uuid)` är server-only SECURITY DEFINER med tom search_path,
scope-allowlist och fasta gränser. INSERT ON CONFLICT + radlås serialiserar
konsumtion även över flera instanser. Tiden tas efter låset; nekade försök varken
förlänger fönstret eller ökar räknaren över gränsen. Returvärdet innehåller bara
allowed och retry_after, inga nycklar eller räknare.

Preview/accept för transfers förlorar klientexecute och får server-only wrappers
som använder verifierat user-id. Kärnlogik, ägarlås och capability-kontroller
behålls. Appen committar limiteranropet separat före transfer så misslyckade
acceptförsök inte återställer budgeten. Scopes och driftkrav finns i README.

## Dokumentretention och global driftstädning

Migration `20260924001200_document_retention_cleanup.sql` återanvänder documents
created_at/upload_status/deleted_at/storage_deleted_at/storage_path. Kandidater:
äldre än tre timmar, ingen storage_deleted_at, och antingen pending eller redan
soft-deleted. Pending markeras deleted atomiskt med claim. Ready + deleted_at null
är aldrig kandidat, även efter transfer utan dokumentgrant. Ägarbyte är ingen
raderingsregel; ej överförda otillgängliga dokument kräver separat framtida policy.
Oavslutade pending-uploadreservationer följer den befintliga tretimmarsregeln.

`private.document_cleanup_claims` innehåller bara document_id (PK/FK RESTRICT),
slumpmässig lease_token och expires_at. Tabellen har RLS och inga direkta grants,
inte ens till service_role. Beständig state behövs eftersom Storage API ligger
utanför SQL-transaktionen. `claim_document_cleanup_batch(integer)` låser dokument
med SKIP LOCKED och skapar/ersätter bara utgångna femminutersleases. Konfliktvillkoret
kontrolleras igen under unikt radlås, även för commits efter SELECT-snapshoten.
Ett partiellt index på (created_at,id) begränsar sökning till möjliga kandidater.
RPC accepterar 1–100; servern väljer alltid 50.

`complete_document_retention_cleanup(uuid,uuid)` låser dokumentet, kräver deleted,
säkert gammal reservation, aktuell oexpired token och att Storage-objektet saknas.
Den sätter storage_deleted_at och tar bort teknisk claimstate; upprepad completion
är idempotent. Redan slutförd användarcleanup godtas utan ny metadataändring.
Båda RPC:erna är SECURITY DEFINER med tom search_path och service_role-only EXECUTE.
auth.uid är inte auktoritet. Inga användar-RPC:er, grants eller Storage-policies ändras.

Bytes raderas genom Storage API, aldrig genom SQL DELETE i storage.objects.
Documents-raden och historiska kopplingar behålls även efter lyckad cleanup;
visibility_scope, ownership och quota_user_id ändras inte. Metadata har ingen
automatisk permanent radering i V1. Dokumentmetadata blockerar fortsatt funktionen
för radering av ett felregistrerat fordon. DB-backup och Storage-backup är separata;
DB-backup ensam återställer inte borttagna bytes.
