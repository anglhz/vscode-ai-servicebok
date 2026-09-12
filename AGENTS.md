# AGENTS.md

## Syfte

Detta dokument beskriver hur AI agenter, inklusive Codex, ska arbeta i projektet Servicebok V2.

Målet är att utveckla produkten snabbt utan att offra kvalitet, säkerhet, prestanda eller underhållbarhet.

Läs alltid `PRODUCT.md` innan större ändringar görs.

Om implementationen riskerar att avvika från produktplanen ska agenten välja den enklaste lösningen som fortfarande följer produktens kärnprinciper.

## Projektets grundprinciper

Servicebok V2 ska vara:

Mobile first

Snabb

Enkel att förstå

Säker

Lätt att vidareutveckla

Tydlig för slutanvändaren

Byggd med så lite onödig komplexitet som möjligt

Undvik överarkitektur.

Undvik abstraktioner innan de faktiskt behövs.

Undvik nya beroenden när befintlig funktionalitet räcker.

## Teknisk standard

Projektet använder i första hand:

Next.js

TypeScript

React

PostgreSQL

Supabase

Tailwind CSS

shadcn ui

Vercel

Stripe

Alla nya lösningar ska passa denna stack om inget annat uttryckligen har beslutats.

## Innan arbete påbörjas

Innan en större uppgift implementeras ska agenten:

Läsa relevanta projektfiler.

Förstå befintlig kod innan den ändras.

Kontrollera om motsvarande komponent, utility, hook eller serverfunktion redan finns.

Identifiera vilka filer som faktiskt behöver ändras.

Undvika ändringar utanför uppgiftens scope.

Vid osäkerhet ska agenten föredra en liten och reversibel implementation framför en stor omstrukturering.

## Arbetsprincip

Arbeta feature för feature.

En uppgift ska vara så avgränsad att ändringen går att förstå och granska separat.

Exempel:

Bra uppgift:

Implementera formulär för att skapa en servicehändelse.

Dålig uppgift:

Bygg hela fordonsdelen.

Undvik stora samtidiga omskrivningar.

## TypeScript

TypeScript ska användas strikt.

Använd inte `any` om det inte är absolut nödvändigt.

Om `any` används ska det finnas en tydlig kommentar som motiverar varför.

Type errors får aldrig döljas eller ignoreras för att få bygget att gå igenom.

Använd korrekta typer för:

Databasobjekt

API svar

Formulär

Server actions

Komponentprops

Utilities

## Databas

Databasändringar får aldrig göras ad hoc.

Alla schemaändringar ska göras genom migrationer.

Agenten får inte ändra produktionens databasstruktur direkt.

Nya tabeller, kolumner, constraints och policies ska dokumenteras.

Foreign keys ska användas där relationerna kräver det.

Datatyper ska väljas med omsorg.

Data som kan beräknas på ett säkert sätt ska inte dupliceras i onödan.

## Supabase

Supabase används för:

Authentication

PostgreSQL

Storage

Row Level Security

Serverlogik där lämpligt

Klientkod får aldrig använda service role key.

Privata filer ska ligga i privata buckets.

Signed URLs ska användas för tillfällig åtkomst till privata dokument.

## Row Level Security

Row Level Security ska användas från början.

Alla användarspecifika tabeller ska ha tydliga RLS policies.

En användare får aldrig kunna läsa eller ändra annan användares privata data genom att manipulera klientanrop.

Behörighet ska kontrolleras på databasnivå eller serversidan.

Klientens UI är aldrig en säkerhetsgräns.

Ägarbyten ska aldrig kunna genomföras enbart från klienten.

## Authentication

Använd Supabase Auth.

Serverkod ska verifiera användarens session där skyddad data används.

Anta aldrig att användar ID från klienten är korrekt.

Använd aktuell autentiserad session som källa för användaridentitet.

## Säkerhet

API nycklar, tokens och hemligheter får aldrig exponeras i klientkod.

Secrets ska ligga i miljövariabler.

Logga inte känslig information.

Undvik att logga:

Tokens

Personliga dokument

Betalningsdata

Privata API svar

Fullständiga uppladdade filer

Validera användarinput både i klienten och på serversidan.

Serversidans validering är den auktoritativa valideringen.

## Fordonsdata

Extern fordonsdata ska inte hämtas om i onödan.

När ett fordon har identifierats ska relevant fordonsinformation sparas lokalt i vår databas.

Extern data ska uppdateras endast när det finns ett tydligt behov.

UI ska i första hand läsa fordonsdata från vår egen databas för att minimera laddningstid och beroenden.

## Servicehistorik

Servicehistorik hör till fordonet.

En servicepost ska alltid vara kopplad till ett fordon.

Historiska serviceposter ska kunna överleva ett ägarbyte.

Ägarinformation och servicehistorik ska därför inte modelleras som samma sak.

## Ägarbyte

Ägarbyte är en säkerhetskritisk funktion.

Ägarbyte ska hanteras serverside.

Gamla ägare ska inte kunna fortsätta redigera fordonet efter slutförd överföring.

Ägarhistorik ska bevaras.

Privata dokument ska hanteras separat från själva servicehistoriken.

## Dokument

Dokument ska lagras privat.

Metadata om dokument ska lagras i databasen.

Filer ska inte göras publikt åtkomliga permanent.

Tillåtna filtyper ska valideras.

Filstorlekar ska begränsas.

Filnamn från användaren ska inte användas direkt som lagringsnyckel.

Generera säkra unika filnamn eller paths.

## Formulär

Formulär ska vara optimerade för mobil.

Visa bara fält som användaren behöver.

Valfria fält ska vara tydligt valfria.

Valideringsfel ska visas nära relevanta fält.

Användaren ska inte förlora sin inmatning vid ett vanligt valideringsfel.

## UI

All UI ska byggas mobile first.

Börja med liten skärm.

Desktop ska vara en förbättring av samma gränssnitt, inte en separat produkt.

Använd befintliga komponenter innan nya skapas.

Följ ett konsekvent designsystem.

Undvik onödigt stora dialoger på mobil.

Använd bottom sheets eller fullskärmsflöden när det ger bättre mobilupplevelse.

## Laddning och prestanda

Undvik helsidesspinners.

Använd skeletons endast där information faktiskt laddas.

Visa redan tillgänglig data omedelbart.

Undvik att blockera hela sidan på grund av ett sekundärt API anrop.

Parallellisera oberoende datahämtning där det är säkert.

Undvik onödiga klientanrop.

Använd serverkomponenter där de ger tydlig nytta.

Lägg inte allt i klientkomponenter av bekvämlighet.

## React

Håll komponenter fokuserade.

Flytta inte state högre upp än nödvändigt.

Undvik `useEffect` för dataflöden som bättre kan lösas med serverrendering, props eller server actions.

Undvik duplicerad state.

Derived state ska i första hand beräknas istället för att lagras separat.

## Next.js

Följ aktuell App Router struktur.

Använd serverkomponenter som standard när det passar.

Använd `"use client"` endast när interaktivitet eller klient API kräver det.

Server actions får användas för mutationer där det förenklar arkitekturen.

Skyddade routes ska verifiera session serverside.

## API integrationer

Alla externa API integrationer ska gå genom vår server.

Extern API nyckel får aldrig skickas till klienten.

Normalisera externa API svar innan de används i resten av applikationen.

UI ska inte bero direkt på leverantörens datamodell.

Skapa ett internt format för exempelvis fordonsdata.

På så sätt ska API leverantören kunna bytas utan att hela appen behöver skrivas om.

## Felhantering

Alla externa anrop kan misslyckas.

Hantera:

Timeout

Ogiltigt svar

Rate limits

Nätverksfel

Saknad fordonsdata

Auth fel

Databasfel

Storage fel

Användaren ska få ett begripligt felmeddelande.

Tekniska detaljer ska inte visas för användaren.

## Logging

Logga fel som behövs för felsökning.

Använd strukturerad logging där det är rimligt.

Undvik onödiga `console.log` i färdig kod.

Ta bort temporära debug loggar innan en feature betraktas som klar.

## Tillgänglighet

Interaktiva element ska fungera med tangentbord.

Form controls ska ha korrekta labels.

Använd semantisk HTML.

Knappar ska vara knappar.

Länkar ska vara länkar.

Färg får inte vara den enda indikationen av status.

## Testning

Varje kritiskt flöde ska kunna testas.

Prioritera tester för:

Authentication

Behörighet

Skapa fordon

Skapa servicepost

Redigera servicepost

Ta bort servicepost

Dokumentuppladdning

Ägarbyte

Premiumfunktioner

Tester ska fokusera på beteende snarare än implementation.

## Kontroller innan en uppgift är färdig

Innan en uppgift anses klar ska agenten kontrollera:

Att TypeScript bygger utan fel.

Att linting passerar.

Att relevanta tester passerar.

Att inga secrets har exponerats.

Att inga temporära debug loggar finns kvar.

Att mobilvyn fungerar.

Att befintlig funktionalitet inte uppenbart har brutits.

Att implementationen följer `PRODUCT.md`.

## Ändra inte utanför scope

Agenten ska inte passa på att skriva om närliggande kod utan tydligt behov.

Om agenten hittar ett separat problem under implementationen ska det dokumenteras men inte automatiskt lösas om det ökar scope betydligt.

Små säkra förbättringar är tillåtna om de direkt behövs för uppgiften.

## Refaktorering

Refaktorera när det finns ett konkret problem.

Exempel:

Duplicerad kod

Svårtestad kod

För stor komponent

Otydliga ansvarsområden

Prestandaproblem

Refaktorera inte enbart för att skapa fler abstraktioner.

## Beroenden

Lägg inte till npm paket utan anledning.

Innan ett nytt paket läggs till ska agenten kontrollera om:

Problemet kan lösas med befintlig kod.

Next.js redan erbjuder lösningen.

Supabase redan erbjuder lösningen.

Webbplattformen redan erbjuder lösningen.

Om ett nytt paket används ska det vara aktivt underhållet och väl etablerat.

## Kodstil

Skriv enkel och tydlig kod.

Optimera för läsbarhet.

Använd beskrivande namn.

Undvik kryptiska förkortningar.

Undvik extremt stora filer.

Undvik extremt små abstraktioner utan värde.

Kommentarer ska förklara varför, inte upprepa vad koden gör.

## Git

Arbeta i små logiska ändringar.

Blanda inte flera orelaterade features i samma ändring.

Commit meddelanden ska tydligt beskriva förändringen.

Exempel:

`feat: add vehicle creation flow`

`fix: prevent duplicate mileage entries`

`security: restrict document access with RLS`

`refactor: simplify service event form`

## Datamigrationer

Migrationer ska vara säkra.

Undvik destruktiva migrationer när det går.

Om data riskerar att försvinna ska detta uttryckligen anges innan ändringen görs.

En migration ska kunna förstås utan att läsa applikationskoden.

## Premiumfunktioner

Premiumkontroll får inte endast ske i UI.

Servern måste kontrollera användarens aktuella plan innan premiumfunktioner genomförs.

Användaren ska fortfarande kunna läsa sin befintliga servicehistorik om premiumabonnemanget avslutas.

## AI funktioner

AI funktioner är sekundära till kärnprodukten.

AI får aldrig automatiskt ändra fordons eller servicehistorik utan användarens bekräftelse.

Vid dokumenttolkning ska AI föreslå information.

Användaren ska kunna granska och korrigera resultatet innan det sparas.

AI resultat ska inte betraktas som verifierade fakta.

## PDF export

PDF genereras på serversidan.

PDF ska baseras på lagrad servicehistorik och inte på klientens lokala state.

Privata originaldokument ska inte automatiskt inkluderas.

PDF export ska kunna utvecklas utan att påverka datamodellen för servicehistoriken.

## Serviceintervall

Serviceintervall ska kunna komma från både systemdata och användaren.

Extern serviceinformation ska aldrig antas vara korrekt utan källa.

Om intervallet är osäkert ska UI kommunicera detta tydligt.

## Definition of Done

En feature är färdig när:

Funktionen fungerar enligt produktkravet.

Kodens ansvar är tydligt.

Behörighet är korrekt.

Felhantering finns.

Mobilupplevelsen fungerar.

TypeScript passerar.

Linting passerar.

Relevanta tester passerar.

Ingen känslig information exponeras.

Ingen onödig teknisk skuld har introducerats.

Dokumentation har uppdaterats om implementationen förändrar systemets struktur.

## Prioriteringsordning

När två mål står i konflikt ska agenten prioritera:

1. Datasäkerhet

2. Korrekt behörighet

3. Dataintegritet

4. Funktionell korrekthet

5. Enkel användarupplevelse

6. Prestanda

7. Kodens läsbarhet

8. Utvecklingshastighet

## Slutprincip

Servicebok V2 ska inte bli komplicerad bara för att AI kan generera mycket kod snabbt.

Bygg minsta robusta lösning som löser användarens problem väl.