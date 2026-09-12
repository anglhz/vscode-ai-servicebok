# Servicebok V2

## 1. Produktidé

Servicebok är en digital servicebok för fordon i Sverige.

Primär målgrupp är privatpersoner som vill dokumentera service, reparationer, kostnader, dokument och viktig historik för sina fordon.

Tjänsten ska fungera för:

Bil

MC

Moped

Husbil

Husvagn

Andra fordon kan läggas till senare.

Serviceboken ska följa fordonet även när fordonet säljs till en ny ägare.

Produkten ska vara mobil först och kännas mer som en app än en traditionell webbplats.

## 2. Produktens kärna

Varje användare kan ha ett eller flera fordon.

Varje fordon har en tidslinje med historiska händelser.

Exempel:

Service

Reparation

Besiktning

Däckbyte

Däckköp

Olja och filter

Bromsar

Kamrem eller kamkedja

Batteri

Tillbehör

Skada

Miltalsregistrering

Övrigt

Varje händelse kan innehålla:

Datum

Miltal

Rubrik

Beskrivning

Kategori

Kostnad

Verkstad eller utförare

Dokument

Bilder

Noteringar

## 3. Viktig produktprincip

Servicehistoriken tillhör fordonet.

Användaren administrerar fordonet under tiden personen äger det.

När fordonet säljs ska historiken kunna överföras till nästa ägare.

Den tidigare ägaren ska därefter inte längre kunna ändra information om fordonet.

## 4. Lägg till fordon

Primärt flöde:

Användaren trycker på Lägg till fordon.

Användaren skriver registreringsnummer.

Systemet söker fordonsinformation.

Användaren får se:

Registreringsnummer

Märke

Modell

Årsmodell

Fordonsår

Bränsle

Motoreffekt

VIN om tillgängligt

Fordonstyp

Användaren bekräftar att det är rätt fordon.

Fordonet sparas därefter i vår egen databas.

Extern fordonsdata ska inte behöva laddas varje gång användaren öppnar fordonet.

Manuell registrering ska också finnas om automatisk fordonsdata saknas.

## 5. Fordonssidan

Fordonssidan är en av produktens viktigaste skärmar.

Överst visas:

Bild eller fordonsikon

Märke och modell

Registreringsnummer

Årsmodell

Nuvarande miltal

Nästa rekommenderade service

Därefter visas snabbval:

Ny händelse

Uppdatera miltal

Dokument

Serviceintervall

Exportera

Sedan visas fordonets tidslinje.

Nyaste händelsen visas först.

## 6. Tidslinje

Exempel:

12 augusti 2026

8 420 mil

Ordinarie service

Motorolja, oljefilter och kupéfilter

4 295 kr

Dokument finns


18 januari 2026

6 930 mil

Bromsar fram

Skivor och belägg

6 800 kr

Dokument finns


17 november 2025

5 850 mil

Besiktning

Godkänd

## 7. Skapa servicepost

Användaren ska kunna registrera allt manuellt.

Formuläret innehåller:

Kategori

Datum

Miltal

Rubrik

Beskrivning

Kostnad

Utförare eller verkstad

Anteckningar

Dokument

Bilder

Fält som inte behövs ska kunna lämnas tomma.

Vi ska optimera formuläret för mobil så att en vanlig service kan registreras snabbt.

## 8. Dokument

Användaren ska kunna ladda upp:

PDF

Fotografi

Kvitto

Faktura

Serviceprotokoll

Besiktningsprotokoll

Dokument lagras separat från serviceposten men kan kopplas till en eller flera händelser.

Originalfilen ska aldrig behöva vara publik.

## 9. Dokumentstatus

Vi använder inte termen verifierad i första versionen.

Poster kan istället visa exempelvis:

Registrerad av ägaren

Dokument bifogat

Importerad från tidigare ägare

Det gör tydligt var informationen kommer från utan att Servicebok garanterar att arbetet faktiskt utförts.

## 10. Miltal

Varje fordon har ett aktuellt miltal.

Miltal kan uppdateras manuellt.

När en servicehändelse registreras med ett högre miltal uppdateras fordonets aktuella miltal automatiskt.

Miltalshistoriken ska sparas så att utvecklingen kan visas senare.

## 11. Serviceintervall

Systemet ska stödja både tid och körsträcka.

Exempel:

Motorolja

3 000 mil

12 månader


Bromsvätska

24 månader


Kamrem

15 000 mil

120 månader

Varje intervall kan komma från:

Systemdata

Användaren själv

Användaren ska kunna ändra ett intervall för sitt eget fordon.

Systemet ska kunna räkna ut nästa servicetillfälle från senaste relevanta servicehändelsen.

## 12. Påminnelser

Användaren ska kunna få påminnelse baserat på:

Datum

Serviceintervall

Besiktning

Däckbyte

Försäkring

Skatt

Egna händelser

Första versionen kan börja med påminnelser inne i appen.

E post och push kan byggas därefter.

## 13. Ägarbyte

Ägarbyte är en kärnfunktion.

Nuvarande ägare väljer:

Överför fordon

Systemet skapar en tillfällig överföringskod eller länk.

Den nya ägaren loggar in eller skapar konto.

Den nya ägaren accepterar överföringen.

Ett ägarbyte registreras.

Den gamla ägaren förlorar rättigheten att ändra fordonet.

Historiken följer med fordonet.

Privata dokument behöver behandlas separat.

Det ska gå att välja om originaldokument överförs till den nya ägaren.

Information som namn, adress och personliga uppgifter på fakturor ska inte automatiskt betraktas som en del av den offentliga fordonshistoriken.

## 14. PDF export

Premiumanvändare ska kunna skapa en professionell PDF över fordonets historik.

PDF ska kunna innehålla:

Märke och modell

Registreringsnummer

Årsmodell

Miltal

Servicehistorik

Reparationer

Besiktningar

Dokumentstatus

Kostnader

Serviceintervall

Datum då rapporten skapades

PDF ska vara utformad så att den kan lämnas till en potentiell köpare av fordonet.

Originalkvitton ska inte automatiskt läggas in i rapporten.

## 15. Kostnader

Systemet ska summera kostnader per fordon.

Senare kan premiumanvändare få statistik som:

Total kostnad

Kostnad per år

Servicekostnad

Reparationskostnad

Däckkostnad

Genomsnittlig kostnad per månad

## 16. Gratisplan

Gratisversionen bör innehålla tillräckligt mycket funktionalitet för att användaren ska kunna lita på tjänsten.

Förslag:

1 fordon

Obegränsad servicehistorik

Miltal

Grundläggande serviceintervall

Grundläggande påminnelser

Ägarbyte

Begränsad dokumentlagring

Historiken ska inte försvinna om användaren slutar betala.

## 17. Premium

Premium kan innehålla:

Flera fordon

Större dokumentlagring

PDF export

Avancerade påminnelser

Kostnadsstatistik

Serviceanalys

AI tolkning av kvitton och fakturor

Familjedelning

Utökad fordonsinformation

Framtida värdehistorik

Prissättning beslutas senare.

## 18. Huvudnavigation

Mobil navigation längst ner:

Hem

Fordon

Ny

Påminnelser

Konto

Ny knappen ska vara tydlig eftersom registrering av nya händelser är en av de vanligaste aktiviteterna.

## 19. Hemskärm

Hemskärmen ska visa det viktigaste direkt.

Exempel:

God kväll

Volvo V60

8 420 mil

Service om cirka 580 mil

Besiktning om 42 dagar

Senaste aktivitet

Snabbknapp för ny händelse

Har användaren flera fordon ska de kunna växla mellan dem.

## 20. Designprinciper

Mobile first.

Snabb upplevd laddning.

Så få helsidesspinners som möjligt.

Data som redan finns i vår databas ska visas direkt.

Skeletons används endast för den del av gränssnittet som faktiskt laddas.

Optimistiska uppdateringar där det är säkert.

Stora tryckytor.

Enkla formulär.

Tydlig typografi.

Låg visuell komplexitet.

Appen ska kännas lugn och pålitlig.

## 21. Rekommenderad teknik

Frontend och backend:

Next.js

TypeScript

React

Databas:

PostgreSQL

Plattform:

Supabase

Supabase används för:

Databas

Authentication

Storage

Row Level Security

UI:

Tailwind CSS

shadcn ui

Hosting:

Vercel

Betalning:

Stripe

Fordonsinformation:

Extern svensk fordonsdata leverantör

PDF:

Genereras på servern

## 22. Föreslagen datamodell

### users

id

email

display_name

created_at


### vehicles

id

registration_number

vin

make

model

model_year

vehicle_year

fuel_type

power

vehicle_type

current_mileage

created_at

updated_at


### vehicle_ownerships

id

vehicle_id

user_id

started_at

ended_at

status


### service_events

id

vehicle_id

created_by_user_id

category

title

description

event_date

mileage

cost

provider

notes

created_at

updated_at


### documents

id

vehicle_id

service_event_id

uploaded_by_user_id

file_name

file_type

storage_path

document_type

created_at


### mileage_entries

id

vehicle_id

user_id

mileage

recorded_at

source


### service_intervals

id

vehicle_id

name

category

distance_interval

month_interval

last_completed_date

last_completed_mileage

source

created_at

updated_at


### reminders

id

vehicle_id

user_id

title

type

due_date

due_mileage

completed_at

created_at


### vehicle_transfers

id

vehicle_id

from_user_id

to_user_id

transfer_token

status

expires_at

accepted_at

created_at


### subscriptions

id

user_id

provider_customer_id

provider_subscription_id

plan

status

current_period_end

created_at

updated_at

## 23. Säkerhet

Row Level Security ska användas från början.

En användare får endast läsa privata fordonsdata som användaren har behörighet till.

En användare får endast ändra fordon där användaren är aktiv ägare.

Ägarhistorik ska inte kunna manipuleras från klienten.

Ägarbyten genomförs på serversidan.

Storage ska använda privata buckets.

Privata filer ska öppnas genom tidsbegränsade länkar.

API nycklar får aldrig exponeras i klienten.

## 24. Första byggfasen

Första milstolpen är inte hela produkten.

Vi bygger först:

Projektstruktur

Designsystem

Authentication

Databas

Row Level Security

Dashboard

Skapa fordon manuellt

Lista mina fordon

Fordonsprofil

Skapa servicehändelse

Tidslinje

Redigera servicehändelse

Ta bort servicehändelse

Uppdatera miltal

Dokumentuppladdning

När detta fungerar stabilt har vi produktens kärna.

## 25. Andra byggfasen

Registreringsnummer lookup

Serviceintervall

Påminnelser

PDF export

Ägarbyte

## 26. Tredje byggfasen

Stripe Premium

Kostnadsstatistik

AI dokumenttolkning

Pushnotiser

PWA förbättringar

Familjedelning

Utökad fordonsdata

## 27. Vad som inte ska byggas i första versionen

Verkstadsportal

Marknadsplats

Reservdelsbutik

Sociala funktioner

Chatt

Komplex AI assistent

Automatisk värdering

Native iOS app

Native Android app

Dessa funktioner kan utvärderas senare.

## 28. Definition av lyckad första version

En användare ska kunna:

Skapa konto

Lägga till sin bil

Registrera bilens aktuella miltal

Registrera en service

Lägga till ett kvitto

Se servicehistoriken som en tydlig tidslinje

Komma tillbaka senare och omedelbart se informationen utan onödiga laddningstider

Detta måste fungera riktigt bra innan fler avancerade funktioner byggs.