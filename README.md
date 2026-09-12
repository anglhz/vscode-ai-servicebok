# Servicebok V2

Teknisk grund för en digital servicebok. Next.js App Router, React, strikt TypeScript,
Tailwind CSS och shadcn/ui. Läs PRODUCT.md, AGENTS.md, DATABASE.md,
ARCHITECTURE.md och DESIGN.md innan produktfunktioner implementeras.

## Lokal setup

Krav: Node.js 24 LTS och npm. `.nvmrc` anger Node-versionen.

```sh
npm ci
npm run dev
```

Öppna http://localhost:3000. Startsidan leder till `/dashboard`.
Platshållarsidorna fungerar utan Supabase eller miljövariabler.

När Supabase ska användas, kopiera `.env.example` till `.env.local` och fyll i
`NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY` från ditt
utvecklingsprojekt. I PowerShell: `Copy-Item .env.example .env.local`.
`SUPABASE_SERVICE_ROLE_KEY` ska lämnas tom i denna fas; den används inte av koden.
Den får aldrig exponeras via NEXT_PUBLIC, skickas till klienten eller committas.
Alla lokala `.env`-filer ignoreras av Git, med undantag för den tomma exempelfilen.

## Kontroller

```sh
npm run typecheck
npm run lint
npm run build
npm start
```

Typecheck genererar först Next.js routetyper, även på en ren checkout.
Build använder inga externa typsnitt eller Supabase-anrop.
Lockfilen checkas in för reproducerbara installationer.

## Struktur

| Sökväg | Ansvar |
| --- | --- |
| `app/(app)/` | Gemensam AppShell och statiska platshållarsidor |
| `app/api/` | Plats för framtida Route Handlers |
| `components/layout/` | AppShell, AppContainer och PageHeader |
| `components/navigation/` | Gemensamma länkar, mobilnavigation och desktopsidebar |
| `components/ui/` | shadcn/ui Button och Skeleton |
| `components/vehicles/` | RegistrationNumber; övriga fordonskomponenter tillkommer senare |
| `components/` | EmptyState, LoadingSkeleton, MileageDisplay och CurrencyDisplay |
| `lib/supabase/` | Browserklient, serverklienter och kontroll av publika miljövariabler |
| `lib/utils/` | Klassnamn och svenska visningsformat |
| `lib/auth/`, `lib/permissions/`, `lib/validation/` | Reserverade mappar för kommande skyddade flöden |
| `services/` | Tomma domänmappar för fordon, servicehändelser, dokument och påminnelser |
| `types/` | Plats för delade typer; generera databastyper när schema finns |
| `supabase/migrations/` | Endast platshållare, inga schemaändringar |
| `public/` | Plats för statiska tillgångar |

Mappar för framtida integrationer skapas när de behövs.

## Avgränsning och säkerhet

Alla nuvarande sidor är publika, statiska platshållare utan användardata,
databasfrågor eller mutationer. Inloggning, ägarskap, RLS och databasens schema
är inte implementerade. Lägg inte privata data på dessa sidor innan
serververifierad session, behörighetskontroller och RLS finns på plats.

`lib/supabase/browser.ts` använder endast publika variabler.
`lib/supabase/server.ts` är skyddad med `server-only` och skapar klient per anrop:

- `createClient()` är avsedd för Server Actions och Route Handlers med skrivbara cookies.
- `createReadOnlyClient()` är avsedd för Server Components. Innan autentisering
  införs måste en session-refresh proxy förnya cookies och vidarebefordra dem till
  både request och response. Den skrivskyddade klienten förnyar inte browserns cookies.

Klienterna startas först när funktionerna anropas. Saknad konfiguration ger ett
tydligt utvecklarfel. Inga anrop görs från platshållarna. En admin-klient läggs
till först när ett konkret serverflöde behöver service role.

## Design och beslut

- `/new` är en extra platshållare för fliken Ny; ingen händelse skapas där.
- Navigation växlar till sidebar vid Tailwinds `md` (768 px). Mobilnavigationen
  tar hänsyn till safe area och har reserverat utrymme under sidinnehållet.
- Neutral ljus bas, grön accent och systemtypsnitt. Tokens ligger i
  `app/globals.css` med Tailwind v4:s CSS-baserade theme. Spacing följer 4 px-bas.
- Sidor och layout är Server Components. Endast aktiva navigationslänkar använder
  klientlogik för aktuell route. Ingen global state eller helsidesspinner.
- `LoadingSkeleton` är för lokalt laddande innehåll och visas inte artificiellt
  på statiska sidor. Reducerad rörelse respekteras.
- `CurrencyDisplay` tar ören, `MileageDisplay` tar svenska mil. Saknade värden
  skiljs från noll. Formatteringen delas i `lib/utils/format.ts`.
- shadcn-komponenterna har hämtats från registret. Deras `cn`-import använder
  projektets gemensamma utility, och Button använder endast Radix Slot.

Lägg till fler primitives vid behov med `npx shadcn@latest add <komponent>`.
Kontrollera genererade importer och beroenden efteråt.

## Referenser

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase SSR-klienter](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [shadcn/ui med Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)
