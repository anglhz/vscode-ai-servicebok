# DESIGN.md

## 1. Syfte

Detta dokument beskriver designprinciperna för Servicebok V2.

Designen ska kännas:

Mobil först

Snabb

Lugn

Pålitlig

Modern

Enkel

App lik

Servicebok ska prioritera tydlighet och användbarhet framför dekorativa effekter.

Gränssnittet ska vara lätt att förstå även för användare som inte är tekniskt vana.

## 2. Grundprincip

Användaren ska nästan alltid förstå tre saker direkt:

Vilket fordon tittar jag på?

Vad har hänt med fordonet?

Vad behöver jag göra härnäst?

Designen ska stödja dessa frågor på varje relevant skärm.

## 3. Mobile first

Alla vyer designas först för mobil.

Utgångspunkt:

Små skärmar först

Stora tryckytor

En hand ska räcka för vanliga flöden

Viktiga actions placeras nära tummen

Desktop är en utökning av mobilupplevelsen

Vi ska inte designa desktop först och sedan försöka pressa ned layouten på mobil.

## 4. App känsla

Servicebok ska kännas mer som en installerad app än en traditionell webbplats.

Det innebär:

Bottom navigation på mobil

Fasta och tydliga toppsektioner där det passar

Snabba övergångar

Minimalt med helsidesspinners

Få onödiga sidbyten

Tydliga states

Formulär optimerade för touch

Bottom sheets där det passar bättre än modal

## 5. Visuell ton

Designen ska kännas:

Professionell

Neutral

Trygg

Teknisk utan att kännas avancerad

Ren

Fordon och servicehistorik är seriös information.

Designen ska därför undvika:

Överdrivet lekfulla illustrationer

Starka neonfärger

Onödiga animationer

För mycket gradients

För många färger samtidigt

## 6. Färgprinciper

Använd en neutral bas.

Bakgrund ska vara lugn och ge god kontrast mot innehåll.

Accentfärg används främst för:

Primära knappar

Aktiv navigation

Viktiga actions

Statusindikatorer där det är relevant

Statusfärger används sparsamt.

Exempel:

Grönt för klart eller inom intervall

Gult för snart dags

Rött för försenat eller kritiskt

Färg får aldrig vara enda informationsbäraren.

Text eller ikon ska också förklara statusen.

## 7. Typografi

Typografin ska vara tydlig och kompakt.

Använd tydlig hierarki.

Exempel:

Sidtitel

Sektionstitel

Korttitel

Brödtext

Metadata

Sekundär text

Undvik för många storlekar och vikter.

Text ska vara lättläst på mobil.

Kritisk fordonsinformation som registreringsnummer och miltal ska vara tydlig utan att dominera hela skärmen.

## 8. Spacing

Använd konsekvent spacing.

Rekommenderad bas:

4 px

8 px

12 px

16 px

24 px

32 px

Större avstånd används mellan sektioner.

Mindre avstånd används inom komponenter.

Undvik att varje komponent använder egna slumpmässiga marginaler.

## 9. Rundning och kort

Kort kan användas men ska inte överanvändas.

Inte varje sektion behöver ligga i ett separat kort.

Använd kort när innehållet är:

En tydlig enhet

Klickbart

Har egen status

Behöver separeras visuellt

Undvik att skapa ett gränssnitt där allt ser ut som separata flytande kort.

## 10. Skuggor

Skuggor ska vara subtila.

Använd hellre:

Kontrast

Bakgrund

Borders

Spacing

än kraftiga skuggor.

## 11. Ikoner

Använd ett konsekvent ikonbibliotek.

Ikoner ska stödja förståelsen.

Exempel:

Fordon

Service

Verktyg

Dokument

Mätarställning

Påminnelse

Däck

Besiktning

Export

Ikoner ska inte användas enbart som dekoration.

## 12. Huvudnavigation

Mobil navigation ska ligga längst ner.

Flikar:

Hem

Fordon

Ny

Påminnelser

Konto

Ny action ska vara visuellt tydlig eftersom registrering av en ny händelse är en av de vanligaste aktiviteterna.

Navigationen ska vara tillgänglig på de flesta huvudvyer.

## 13. Desktop navigation

På desktop kan bottom navigation ersättas med:

Sidebar

eller

Toppnavigation

Sidebar rekommenderas om appen växer.

Samma huvudstruktur ska behållas.

## 14. Hemskärm

Hemskärmen ska snabbt svara på:

Vilka fordon har jag?

Vad behöver uppmärksamhet?

Vad hände senast?

Exempel på struktur:

Hälsning

Aktivt fordon

Miltal

Nästa service

Kommande påminnelse

Snabb actions

Senaste historik

För användare med flera fordon ska det gå att växla enkelt mellan dem.

## 15. Fordonskort

Ett fordonskort ska kunna visa:

Märke och modell

Registreringsnummer

Årsmodell

Miltal

Nästa åtgärd

Exempel:

Volvo V60

ABC123

2021

8 420 mil

Service om 580 mil

Kortet ska vara klickbart.

Undvik för mycket data på kortnivå.

## 16. Fordonssida

Fordonssidan är kärnan i appen.

Överst visas:

Märke

Modell

Registreringsnummer

Årsmodell

Nuvarande miltal

Nästa service

Eventuell fordonsbild eller neutral fordonsikon

Därefter visas primära actions.

Exempel:

Ny händelse

Uppdatera miltal

Dokument

Exportera

Sedan visas tidslinjen.

## 17. Fordonsheader

Headern ska kännas stabil och informativ.

Den ska inte behöva laddas om vid varje liten interaktion.

Primär fordonsdata hämtas från vår databas.

Extern data får laddas sekundärt.

## 18. Tidslinje

Tidslinjen är en av de viktigaste komponenterna i produkten.

Varje händelse ska vara lätt att skanna.

Visa i första hand:

Datum

Miltal

Kategori

Titel

Kostnad

Dokumentstatus

Exempel:

12 augusti 2026

8 420 mil

SERVICE

Ordinarie service

4 295 kr

Dokument finns

Detaljer ska kunna öppnas utan att hela sidan känns överlastad.

## 19. Händelsekort

Ett servicekort ska inte visa all data direkt.

Prioritera:

Vad

När

Vid vilket miltal

Vad kostade det

Finns dokument

Sekundär information visas när användaren öppnar posten.

## 20. Kategorier

Kategorier ska ha konsekventa labels och ikoner.

Exempel:

Service

Reparation

Besiktning

Däck

Olja

Bromsar

Kamrem

Batteri

Skada

Tillbehör

Övrigt

Undvik ett stort antal nästan identiska kategorier i första versionen.

## 21. Skapa ny händelse

Flödet ska vara mycket snabbt.

Primär designprincip:

Användaren ska kunna registrera en enkel service med få tryck.

Första nivån ska innehålla:

Kategori

Datum

Miltal

Rubrik

Kostnad

Dokument

Avancerade fält kan ligga under:

Mer information

Där kan användaren lägga till:

Verkstad

Beskrivning

Anteckningar

Detaljerade servicepunkter

## 22. Formulär

Formulär ska använda stora inputfält.

Labels ska alltid finnas.

Placeholder får inte ersätta label.

Rätt tangentbord ska visas.

Exempel:

Numeriskt tangentbord för miltal

Numeriskt tangentbord för kostnad

Datumpicker för datum

Dropdown eller bottom sheet för kategori

## 23. Validering

Visa fel nära det fält som är felaktigt.

Undvik generella felmeddelanden högst upp om felet kan visas lokalt.

Bra:

Miltal måste vara 0 eller högre

Mindre bra:

Något gick fel

## 24. Spara action

Primär save knapp ska vara lätt att nå på mobil.

För längre formulär kan en sticky action area användas längst ner.

Exempel:

Avbryt

Spara

Spara knappen ska visa loading state utan att hela formuläret försvinner.

## 25. Loading states

Undvik helsidesspinners så långt det går.

Använd tre nivåer:

Primär data

Visas direkt när möjligt

Sekundär data

Skeleton lokalt

Mutation

Loading state endast på relevant knapp eller komponent

Exempel:

När användaren sparar en servicepost ska inte hela appen bli tom.

Spara knappen kan visa progress medan resten av gränssnittet ligger kvar.

## 26. Skeletons

Skeletons ska likna den komponent som laddas.

Undvik stora generiska grå block.

Skeleton ska bara användas där data faktiskt laddas.

## 27. Optimistisk UI

Använd där det känns naturligt.

Exempel:

Markera reminder som klar

Uppdatera enkel status

Undvik för:

Ägarbyte

Betalning

Dokumentöverföring

Säkerhetskritiska mutationer

## 28. Tomma states

Tomma states ska hjälpa användaren vidare.

Exempel:

Ingen servicehistorik ännu

Registrera din första service för att börja bygga fordonets historik.

Primär knapp:

Lägg till service

Undvik tomma sidor utan vägledning.

## 29. Felstates

Fel ska vara tydliga och mänskliga.

Exempel:

Vi kunde inte hämta fordonsinformationen just nu.

Försök igen

Undvik tekniska felkoder i UI.

## 30. Success states

Visa tydlig bekräftelse efter viktiga actions.

Exempel:

Service sparad

Dokument uppladdat

Miltal uppdaterat

Fordon överfört

Bekräftelser ska vara korta.

## 31. Dokument

Dokument ska visas som tydliga poster.

Visa:

Filtyp

Dokumenttyp

Datum

Filnamn

Kopplad servicepost

Action för att öppna

För bilder kan thumbnail visas.

För PDF räcker ikon och metadata.

## 32. Dokumentuppladdning

På mobil ska användaren enkelt kunna:

Ta ett foto

Välja bild

Välja fil

Flödet ska vara tydligt kring vilken servicepost dokumentet kopplas till.

## 33. Påminnelser

Påminnelser ska prioriteras visuellt efter hur nära de ligger.

Exempel:

Försenad

Snart dags

Kommande

Visa både datum och miltal när relevant.

Exempel:

Service om 580 mil eller senast 12 november.

## 34. Statuschips

Statuschips kan användas för:

Dokument finns

Snart dags

Försenad

Importerad

Premium

Använd få och tydliga statusar.

## 35. Miltal

Miltal ska alltid visas konsekvent.

Exempel:

8 420 mil

Inte:

8420

8420mil

84 200 km

Om kilometer senare stöds ska formatet vara tydligt.

## 36. Kostnader

Kostnad visas konsekvent.

Exempel:

4 295 kr

Undvik decimaler om kostnaden är ett helt antal kronor.

Detaljerad valutaformattering ska hanteras centralt.

## 37. Registreringsnummer

Registreringsnummer ska visas i versaler.

Exempel:

ABC123

På vissa ställen kan en registreringsskyltliknande komponent användas, men den ska inte bli gimmick.

## 38. Fordonslookup

Flödet för registreringsnummer ska vara mycket enkelt.

Skärm:

Lägg till fordon

Input:

Registreringsnummer

Knapp:

Sök fordon

Efter träff:

Volvo V60

2021

ABC123

Bensin

197 hk

Knapp:

Lägg till fordon

Om lookup misslyckas ska användaren kunna fortsätta manuellt.

## 39. Ägarbyte

Ägarbyte ska kännas tryggt och tydligt.

Det ska aldrig vara lätt att råka överföra fordonet.

Använd ett flersteegsflöde:

Starta överföring

Välj dokument

Bekräfta

Skapa överföringslänk

Vid accept ska mottagaren tydligt se:

Vilket fordon

Vilken historik som följer med

Vilka dokument som följer med

Vad övertagandet innebär

## 40. Farliga actions

Actions som:

Ta bort

Överför fordon

Radera dokument

Avsluta konto

ska kräva extra tydlighet.

Använd bekräftelsedialog.

För mycket kritiska actions kan användaren behöva skriva en bekräftelse eller trycka två gånger.

## 41. PDF export

Exportvyn ska vara enkel.

Visa:

Vad som kommer ingå

Valbara sektioner om relevant

Knapp:

Skapa PDF

Efter generering:

Visa PDF

Dela PDF

PDF export ska kännas som en värdefull premiumfunktion.

## 42. Premium

Premium ska presenteras som en förbättring, inte som konstant störande reklam.

Upgrade prompts ska visas i relevant kontext.

Exempel:

Användaren trycker på PDF export.

Visa:

Exportera professionell servicehistorik till PDF med Premium.

Undvik att blockera gratisfunktioner med onödiga upsells.

## 43. Dashboard cards

Dashboard ska inte fyllas med statistik i första versionen.

Prioritera:

Aktivt fordon

Nästa åtgärd

Senaste händelse

Snabb action

Statistik kan läggas till senare.

## 44. Tabs

Tabs kan användas på fordonsnivå.

Exempel:

Översikt

Historik

Dokument

Service

Undvik fler än fyra till fem tabs.

På mobil ska de vara lätta att nå och tydliga.

## 45. Navigation mellan nivåer

Användaren ska alltid förstå var de befinner sig.

Exempel:

Fordon

Volvo V60

Service 12 augusti 2026

Back navigation ska fungera förutsägbart.

## 46. Bottom sheets

Bottom sheets passar för:

Välja kategori

Välja filter

Snabba actions

Lägga till dokument

Välja fordonsaction

Undvik bottom sheets för långa komplexa formulär.

## 47. Dialoger

Dialoger används främst för:

Bekräftelser

Korta inställningar

Destruktiva actions

Komplexa formulär ska helst ha egen skärm på mobil.

## 48. Animation

Animation ska vara snabb och diskret.

Använd främst för:

Öppna sheet

Navigation

State change

Success feedback

Undvik långsamma dekorativa animationer.

## 49. Accessibility

Alla controls ska ha tydliga labels.

Kontrast ska vara tillräcklig.

Touch targets ska vara stora.

Fokusstates ska vara synliga.

Appen ska fungera med tangentbord på desktop.

Ikoner utan text ska ha accessible labels.

## 50. Responsiv design

Mobil:

Bottom navigation

En kolumn

Fullbreddsformulär

Desktop:

Sidebar eller toppnavigation

Bredare content area

Eventuellt två kolumner där det förbättrar överblick

Undvik extremt breda textfält på stora skärmar.

## 51. Maxbredd

Vanligt appinnehåll bör ha rimlig maxbredd.

Exempel:

Formulär ska inte sträckas över hela desktopskärmen.

Historik ska vara lätt att läsa.

Dashboard kan använda något bredare layout.

## 52. Fordonsbild

Fordon ska kunna ha en bild senare.

Första versionen kan använda:

Neutral bilikon

Neutral MC ikon

eller uppladdad fordonsbild

Bild är sekundär information.

Den får inte göra sidan långsam.

## 53. Bildoptimering

Använd Next.js bildoptimering där lämpligt.

Thumbnails ska användas istället för originalfiler i listor.

Lazy load sekundära bilder.

## 54. Sökning

Första versionen behöver inte global sök.

På fordonsnivå kan historikfilter senare stödja:

Kategori

Datum

Kostnad

Miltal

Dokumentstatus

## 55. Filter

Filter ska vara enkla.

Standardläget visar allt.

Filter öppnas via en tydlig action.

På mobil passar bottom sheet bra.

## 56. Sortering

Historik sorteras nyast först som standard.

Användaren kan senare få välja:

Nyast

Äldst

Högst kostnad

Miltal

## 57. Design tokens

Använd tokens för:

Färg

Spacing

Radius

Typography

Shadow

Border

Undvik hårdkodade designvärden utspridda över hela appen.

Tailwind theme ska vara central källa.

## 58. Komponenter

Prioriterade gemensamma komponenter:

AppShell

MobileBottomNav

DesktopSidebar

PageHeader

VehicleCard

VehicleHeader

ServiceEventCard

ServiceTimeline

DocumentCard

ReminderCard

EmptyState

ErrorState

LoadingSkeleton

StatusBadge

MileageDisplay

CurrencyDisplay

RegistrationNumber

PrimaryActionBar

## 59. Layout komponenter

Skapa få och tydliga layoutkomponenter.

Exempel:

AppContainer

PageSection

ContentCard

StickyActionBar

Undvik ett stort antal wrappers med otydliga syften.

## 60. Dashboard exempel

Mobil:

Servicebok

God kväll

Volvo V60

ABC123

8 420 mil

Service om 580 mil

Ny händelse

Nästa

Besiktning om 42 dagar

Senaste historik

Ordinarie service

12 augusti

4 295 kr

Bottom navigation

## 61. Fordonssida exempel

Volvo V60

ABC123

2021

8 420 mil

Service om 580 mil

Ny händelse

Uppdatera miltal

Historik

12 augusti

Ordinarie service

8 420 mil

4 295 kr

Dokument finns

18 januari

Bromsar fram

6 930 mil

6 800 kr

## 62. Skapa service exempel

Ny händelse

Kategori

Service

Datum

12 september 2026

Miltal

8 500 mil

Rubrik

Ordinarie service

Kostnad

4 295 kr

Lägg till dokument

Mer information

Spara

## 63. Prestanda som designprincip

En snabb app är också en designfråga.

Användaren ska inte behöva undra om appen arbetar.

Prioritera:

Direkt feedback

Lokala loading states

Snabb rendering

Cachad intern fordonsdata

Minimal blocking

Data som redan finns ska visas först.

## 64. Undvik layout shifts

Reservera plats för innehåll som laddas.

Använd stabila höjder där det är möjligt.

Bilder ska ha definierade proportioner.

Navigation ska inte flytta sig när data laddas.

## 65. Offline känsla

Även utan fullt offlinestöd ska appen kännas robust vid dålig uppkoppling.

Visa sparad data när det går.

Visa tydligt om en mutation misslyckas.

Användaren ska kunna försöka igen utan att börja om hela flödet.

## 66. PWA känsla

Designen ska fungera bra när appen körs från hemskärmen.

Tänk därför på:

Safe areas

Bottom navigation

Viewport

Fullskärmsflöden

Touch targets

## 67. Dark mode

Dark mode behöver inte vara krav i första versionen.

Designsystemet ska dock inte göra framtida dark mode onödigt svårt.

Undvik onödigt hårdkodade färger.

## 68. Språk

Första versionen är på svenska.

UI texter ska vara naturliga och korta.

Undvik tekniska termer.

Bra:

Lägg till fordon

Mindre bra:

Skapa fordonsobjekt

Bra:

Dokument kunde inte laddas upp

Mindre bra:

Storage operation failed

## 69. Ton i UI

Ton ska vara tydlig och neutral.

Undvik överdrivet formellt språk.

Undvik barnsligt språk.

Undvik onödiga utropstecken.

## 70. Design quality checklist

Innan en ny skärm betraktas som klar ska följande kontrolleras:

Fungerar den på liten mobil?

Är primär action tydlig?

Finns onödiga element?

Finns helsidesspinner som kan undvikas?

Är tomt state tydligt?

Är felstate tydligt?

Är loading state lokal?

Är touch targets tillräckligt stora?

Är texten lätt att läsa?

Är navigationen förutsägbar?

Fungerar skärmen på desktop?

## 71. Vad vi inte ska göra

Vi ska inte designa varje skärm som ett dashboard.

Vi ska inte lägga statistik överallt.

Vi ska inte använda fem olika accentfärger.

Vi ska inte skapa separata designmönster för varje feature.

Vi ska inte gömma viktiga actions bakom menyer i onödan.

Vi ska inte använda helsidesspinners för små mutationer.

Vi ska inte överbelasta fordonskort med information.

Vi ska inte använda animation som ersättning för tydlig UX.

## 72. Viktigaste användarflödena

Designen ska optimeras särskilt för:

Skapa konto

Lägg till fordon

Öppna fordon

Registrera service

Ladda upp kvitto

Uppdatera miltal

Se nästa service

Exportera historik

Överföra fordon

Dessa flöden ska prioriteras framför sekundära funktioner.

## 73. Designens slutprincip

Servicebok ska kännas som ett verktyg användaren kan lita på.

Appen ska hjälpa användaren att förstå fordonets historik utan att kräva att användaren lär sig systemet.

När det finns ett val mellan mer visuellt imponerande design och enklare användning ska enklare användning vinna.