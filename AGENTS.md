# AGENTS.md — afspraken voor AI-assistenten (Codex, Claude) en ontwikkelaars

Dit bestand is de **enige bron** voor werkafspraken in deze repo. Codex leest het rechtstreeks;
`CLAUDE.md` verwijst ernaar. Pas afspraken hier aan, niet op twee plaatsen.

## Wat is dit project

`buyback-admin` is de interne beheertool van Microforce voor inkoop (buyback-leads) en
refurbishing van toestellen: recepties, refurb-status, labels, supplier-RMA, ERP-artikelen,
stocktellingen, distributie, diagnostics en Trustpilot-uitnodigingen.

- Gebruikers: medewerkers (receptie, techniekers, boekhouding, managers) met rechten per feature.
- UI-taal: **Nederlands**. Code, identifiers en commitberichten: **Engels**.

## Stack

- Next.js 15 (App Router, server actions), React 18, TypeScript strict, Tailwind.
- Node 22 (zelfde versie als Vercel en CI).
- Supabase (Postgres 17) via `@supabase/supabase-js`; Prisma voor de diagnostics-tabellen
  (`prisma/schema.prisma`).
- Hosting: Vercel, team `microforce`.
  - `buyback-admin` = **productie** (alleen `main`; preview-deployments staan uit).
  - `buyback-admin-test` = **testomgeving**, gekoppeld aan het Supabase-testproject.
  - Cron: `/api/erp-sync` elke 15 min.
- Overige integraties: ERP via FTP/Excel, Resend (mail), Sendcloud (labels), Trustpilot.

## Mappen

- `app/admin/**` — beheerpagina's en server actions (`actions.ts` per onderdeel).
- `app/api/**` — route handlers (publieke buyback-API, admin-API, diagnostics, cron).
- `lib/**` — domeinlogica. Houd logica hier, puur en testbaar; pagina's en actions blijven dun.
- `lib/security/**` — toegang (`access.ts`), policy (`policy.ts`), secrets.
- `security/sql/**` — SQL-wijzigingen per feature; `security/sql/test-*.sql` zijn verificatiescripts.
- `security/tests/**` — tests (`node:test`), draaien zonder externe diensten.

## Beveiliging — niet onderhandelbaar

- **Elke server action en elke admin-route controleert rechten**, als eerste stap:
  `requireAccess(feature, mode)` in actions, `requirePageAccess(feature)` in pagina's,
  `apiAccess(request, feature, mode)` in route handlers. Geen uitzonderingen zonder expliciete goedkeuring.
- Rechten komen uit `lib/adminPermissions.ts`. Nieuwe feature = nieuwe key in `ALL_FEATURES`
  plus labels en profielen bijwerken plus test.
- Database-toegang gebeurt server-side via `supabaseAdmin` (service role, `import 'server-only'`).
  RLS staat aan op alle tabellen zonder policies (default deny voor anon/authenticated) — zo laten.
  Nooit de service role key of andere secrets in client-code, `NEXT_PUBLIC_*`-variabelen, URL's of logs.
- Muterende API-routes vereisen same-origin (zit in `apiAccess`).
- Valideer alle invoer met `zod` of een expliciete parser in `lib/` die duidelijke Nederlandse
  foutmeldingen geeft.
- "Booked"-items en andere vergrendelde records blijven vergrendeld; respecteer bestaande guards.

## Database

- Productie: Supabase-project `Microforce-buyback` (`poqyuyqguumfmldwffdv`).
  Test: `Microforce-buyback-security-test` (`ekqmhexbabrwudetkfcm`).
- **AI-assistenten voeren nooit zelf SQL uit die schema of data wijzigt op productie.**
  Lezen (schema bekijken, advisors, SELECT) mag.
- Elke schemawijziging staat in de repo als SQL-bestand in `security/sql/<feature>.sql`, met een
  bijhorend `security/sql/test-<feature>.sql` om het resultaat te verifiëren. Eerst op het
  testproject, daarna pas — door een mens — op productie.
- Wijzigingen zijn additief en terugdraaibaar waar mogelijk; geen `drop` of destructieve
  `update` zonder expliciete goedkeuring in de pull request.
- Wijzig je `prisma/schema.prisma`, controleer dan met `npx prisma validate`.

## Testen en controles

Voor elke pull request moet lokaal slagen:

```bash
npm ci
npx tsc --noEmit
node --experimental-vm-modules --test security/tests/<relevante>.test.mjs
```

- Nieuwe of gewijzigde logica krijgt een test in `security/tests/`, in dezelfde stijl als de
  bestaande tests: modules laden via `node:vm`, Supabase en andere diensten mocken, geen netwerk.
- Een nieuw testbestand voeg je ook toe aan `.github/workflows/release-verification.yml`
  (zowel onder `paths:` als in een stap), anders draait het niet in CI.
- Test randgevallen expliciet (lege waarden, grenzen, ongeldige invoer, geweigerde rechten).

## Git-werkwijze

- **Nooit rechtstreeks naar `main` pushen.** `main` deployt automatisch naar productie.
- Werk op een branch: `codex/<korte-omschrijving>` of `claude/<korte-omschrijving>`.
- Open een pull request naar `main`. Test de branch op `buyback-admin-test` (testdatabase), nooit tegen productie.
- Eén onderwerp per pull request. Kleine, reviewbare wijzigingen.
- Commitberichten: Engels, gebiedende wijs, beschrijven het *gedrag*
  (bv. "Show ERP-ready checks for reception items waiting for SKU").
- De PR-beschrijving vermeldt: wat en waarom, hoe getest, eventuele SQL die een mens moet
  uitvoeren (met volgorde: testproject → productie), en risico's.
- Codex en Claude reviewen elkaars pull requests waar mogelijk; de eigenaar (Olivier) merget.

## Review guidelines

Voor Codex- en Claude-reviews van pull requests. Behandel als **P0** (blokkerend):

- Een server action, pagina of route die data leest of wijzigt zonder eerst `requireAccess`,
  `requirePageAccess` of `apiAccess` aan te roepen, of die het verkeerde recht controleert.
- Secrets of de service role key in client-code, `NEXT_PUBLIC_*`, URL's, logs of commits.
- Code of SQL die de productiedatabase wijzigt buiten een reviewbaar SQL-bestand in
  `security/sql/`, of een destructieve migratie (`drop`, `truncate`, brede `update`/`delete`).
- Vertrouwen op waarden uit het formulier die de server zelf moet bepalen (actor, rol, rechten,
  prijzen, statusovergangen, versie).
- Echte klant- of leveranciersgegevens in tests, fixtures of PR-teksten.

Behandel als **P1**:

- Ontbrekende of zwakke invoervalidatie; foutmeldingen die niet in het Nederlands zijn of
  interne details lekken.
- Ontbrekende tests voor nieuwe logica, randgevallen of geweigerde rechten; een nieuw
  testbestand dat niet in `.github/workflows/release-verification.yml` staat.
- Gelijktijdige bewerkingen zonder versiecontrole waar andere modules die wel hebben.
- PostgREST-filters (`.or(...)`, `ilike`) opgebouwd uit niet-gesaneerde gebruikersinvoer.
- Wijzigingen aan vergrendelde ("Booked") records of bestaande guards.
- SQL-wijziging zonder bijhorend `security/sql/test-*.sql`, of een PR zonder uitleg welke SQL
  een mens moet uitvoeren.

Geen opmerkingen nodig over pure opmaak of stijl die overeenkomt met het aangepaste bestand.

## Stijl

- Volg de stijl van het bestand dat je aanpast; herformatteer geen code die je niet wijzigt.
- TypeScript strict; vermijd nieuwe `any`.
- Imports via het alias `@/`.
- Geen nieuwe dependencies zonder reden in de PR-beschrijving; versies vastzetten zoals in
  `package.json`.
- Bedragen in centen (`*_cents`, integer). Datums tonen in NL-formaat (DD-MM-JJJJ).

## Niet doen

- Geen secrets, `.env`-bestanden of klantgegevens committen of in logs/PR's plakken.
- Geen echte klant- of leveranciersdata in tests of fixtures; gebruik synthetische data.
- Geen wijzigingen aan Vercel-instellingen, environment variables, domeinen of Supabase-instellingen
  zonder expliciete vraag van de eigenaar.
