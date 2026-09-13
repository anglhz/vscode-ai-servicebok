# Servicebok V2

Next.js App Router, strikt TypeScript, Tailwind och shadcn/ui.
Läs PRODUCT.md, AGENTS.md, DATABASE.md, ARCHITECTURE.md och DESIGN.md före större ändringar.

## Lokal setup

Node.js 24 LTS (`.nvmrc`) och npm krävs.

```sh
npm ci
```

Kopiera `.env.example` till `.env.local` (PowerShell: `Copy-Item .env.example .env.local`).
Ange `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY` från ett
Supabase-utvecklingsprojekt. Lämna `SUPABASE_SERVICE_ROLE_KEY` tom; den används inte.

Applicera migrationen i en utvecklingsmiljö före signup. Lokal Supabase kräver Docker
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

Aktivera e-post/lösenord i Supabase. Använd minst 12 tecken för nya lösenord.
Behåll e-postbekräftelse i produktion; utan bekräftelsekrav loggas nya konton in direkt.

Sätt Supabase Auth **Site URL** till appens `/auth/callback`, lokalt
`http://localhost:3000/auth/callback`, och motsvarande HTTPS-adress i produktion.
Signup använder denna konfigurerade URL, aldrig en klientstyrd redirect.
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
- Zod validerar auth-input serverside. Signup kräver 12–128 tecken och matchande
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
uppgiften. Profilvyn använder Zod för sitt begränsade svar tills typer kan genereras.

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

Dashboard och fordonsvyer är platshållare. Inga fordonstabeller, ägarskap,
servicehändelser, dokument, Stripe, PDF, externa API:er eller AI ingår.
Theme i app/globals.css, spacing med 4 px-bas, sidebar från 768 px.
Laddningsindikering är lokal på submitknappen.

## Referenser

- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase användardata](https://supabase.com/docs/guides/auth/managing-user-data)
