# Herstelpakket Microforce buyback-admin

Status: lokaal voorbereid, niet toegepast. Datum: 24 oktober 2026.

Aanvulling na databasevalidatie: voorstellen 01–04 zijn inmiddels uitsluitend op het aparte testproject `ekqmhexbabrwudetkfcm` uitgevoerd. Acht database-testsuites slagen; een bestaande fout in `api_buyback_widget(text)` is gereproduceerd met de oorspronkelijke definitie. Productie is niet gewijzigd. Zie `database-validation.md` voor het actuele bewijs en de resterende blokkades. Verwijzingen hieronder naar nog niet uitgevoerde SQL gelden voor productie; 06 (Storage) is ook in test nog niet uitgevoerd.

## Wat is voorbereid?

- Centrale controle van sessie, lees-/schrijfrechten en adminrechten, vóór interne API-handlers en serveracties gegevens benaderen.
- Toegangscontrole op interne serverpagina's en layouts voor clientpagina's. De bestaande rechten voor `refurb`, `erp` en `leads_finalize` worden nu ook ingelezen.
- Beveiliging van de schrijfacties op `/api/buyback/shops`, terwijl publieke winkelinformatie beschikbaar blijft. Bevoegde beheerders kunnen ook inactieve winkels zien.
- Controle van Origin bij API-schrijfacties met cookies; de brede Server Actions-origininstelling is verwijderd. Login eist een HTTPS-origin die overeenkomt met de host.
- Diagnose-API: geldige beheersessie met refurb-rechten óf een server-side bridgecredential. Dit credential hoort uitsluitend op de diagnosebrug; nooit in browsercode, QR-links of een `NEXT_PUBLIC_`-variabele.
- ERP-cron accepteert alleen een passende `CRON_SECRET`; debugmail is uitgeschakeld.
- Verwijdering van accountinvoer-/wachtwoordhashlogging, intakepayloadlogging en het loggen/terugsturen van ruwe leadaanvragen.
- Verlopen, ingetrokken, ongeldige en inactieve sessies worden geweigerd zonder cookies tijdens server-rendering te wijzigen.
- Ontvangstvelden krijgen runtimevalidatie, statuslookupfouten weigeren wijzigingen en geboekte items worden bij inline/paste afgeschermd.
- Verwijderen van een ontvangst of ontvangstregel loopt via voorgestelde atomaire databasefuncties, met een aanvullende trigger tegen wijzigingen/verwijderingen van geboekte items.

Dit is een herstelvoorstel, geen bevestiging dat de live omgeving nu veilig is.

## Bron en afbakening

- Repository: https://github.com/MicroforceBe/buyback_admin
- Basiscommit: `71072ca0e5f56bf4eab272fbff75132f0f521b68`.
- De GitHub-tree en alle 192 opgehaalde bronbestanden zijn gecontroleerd met Git-blobhashes. De actuele `main` kwam bij ophalen overeen met de onderzochte productiedeployment.
- Vercel: team Microforce, project `buyback-admin`.
- Supabase: `Microforce-buyback`, projectref `poqyuyqguumfmldwffdv`.
- Beide Vercel-Supabase-URL-variabelen verwijzen naar dit project. De afzonderlijke `DATABASE_URL`/Prisma-verbinding blijft onafhankelijk te verifiëren zonder credentials te tonen.
- Alleen broncode en databasecatalogusmetadata gelezen. Geen klantrecords, accountrecords, sessiewaarden of credentialwaarden opgevraagd bij deze voorbereiding.
- Geen GitHub-mutaties, commits, deployments, SQL-mutaties, migraties, secretwijzigingen of productie-instellingen uitgevoerd.

## Beslissingen in dit voorstel

Gewone medewerkers moeten expliciet `read: true` hebben; schrijven vereist daarnaast `write: true`. Een `write`-recht zonder `read` is geen toegang. Admins houden volledige toegang. Account- en systeeminstellingen vereisen een admin; overige bestaande featuregrenzen blijven van toepassing. Diagnose gebruikt voorlopig het featuregebied `refurb` omdat de bestaande permissies geen afzonderlijke diagnosefeature hebben. Bevestig deze keuze met de verantwoordelijke voor gebruikersrechten.

De eigen `bb_admin_session` is geen Supabase Auth-sessie. Interne tabellen krijgen daarom geen algemene `authenticated`-policy. De backend gebruikt service_role na expliciete applicatiecontroles. De publieke catalogus blijft alleen leesbaar; twee bestaande, gecontroleerde catalogus/widget-RPC's blijven bewust met eigenaarsrechten werken. Die publieke leesrechten omvatten in dit voorstel ook catalogusconfiguratie en inactieve catalogusrijen: toets dit contract met de widgetbeheerder.

Zonder geconfigureerde statustransities weigert het voorstel statuswijzigingen. Onbekende statussen worden niet meer stilzwijgend geaccepteerd. De trigger vergrendelt geboekte bedrijfsgegevens; alleen hernummering van de presentatievolgorde plus timestamp blijft mogelijk.

## Voorgestelde invoervolgorde — nog niet uitgevoerd

1. Controleer de projectref, huidige commit en databasecatalogus opnieuw met `00-preflight-read-only.sql`. Leg actuele grants/policies/definities veilig vast en bevestig herstelbare backups. Gebruik een afgeschermde testdatabase zonder productiepersoonsgegevens; het maken daarvan is niet in deze voorbereiding uitgevoerd.
2. Beoordeel `01-containment.sql` apart als urgente inperking: accounts, sessies en lead-events worden alleen via de backend toegankelijk. Geen bestaande sessies worden door dit script ingetrokken. De publieke buybackflow gebruikt volgens de onderzochte code service_role voor leadregistratie. Externe consumenten zijn niet volledig bekend en moeten gecontroleerd worden.
3. Test `02-internal-data.sql`, `03-public-api.sql`, `04-booked-integrity.sql` en eventueel `06-storage.sql` in die testomgeving. 03 beperkt alle bestaande public-functies tot de backend, behalve de twee publieke widget-RPC's. 06 verwijdert de brede uploadpolicy voor ieder Supabase Auth-account; andere apps die dezelfde bucket gebruiken kunnen geraakt worden.
4. Installeer en vergrendel dependencies in een omgeving met toegestane package-toegang. Controleer afhankelijkheden op bekende kwetsbaarheden en kies ondersteunde beveiligde versies voordat wordt uitgerold. Er is geen lockfile in de basiscommit; deze voorbereiding installeert of upgradet geen dependencies.
5. Configureer later, na toestemming, afzonderlijke willekeurige `CRON_SECRET` en `DIAGNOSTICS_BRIDGE_SECRET` van minimaal 32 tekens. Gebruik de secretmanager; plak waarden niet in chat of rapport. Laat de externe diagnosebrug de bearerheader meesturen. De bestaande `ERP_SYNC_SECRET` wordt niet automatisch hergebruikt.
6. Laat volledige typecontrole, lint en productiebuild slagen; test alle onderstaande flows. Bij een aparte preview mag deze niet met de productiedatabase, productiemail of productieverzending werken. De huidige metadata toont dezelfde env-targets voor preview en productie; gelijke geheime waarden zijn niet geverifieerd.
7. Laat de exacte SQL- en codewijzigingen goedkeuren. Pas 04 toe vóór deployment van deze code: beide nieuwe delete-RPC's zijn een harde afhankelijkheid. Pas 01–03 toe volgens het goedgekeurde onderhoudsplan. Controleer preflight direct voor uitvoering; laat een schema-afwijking de transactie afbreken.
8. Rol uitsluitend de geteste commit uit. Controleer metadata met `05-verify-read-only.sql`, draai Supabase Security Advisors opnieuw en voer de smoke-tests uit. Daarna pas eventueel 06 na controle van andere bucketconsumenten.
9. Voer afzonderlijk goedgekeurde incidentrespons uit: beschikbare toegangslogs onderzoeken, beheersessies intrekken, getroffen wachtwoorden resetten en mogelijk blootgestelde geheimen roteren. Wachtwoordhashes veranderen niet door alleen RLS aan te zetten. Gezien de eerder bestaande wachtwoordlogging moeten toegang en bewaartermijn van logs worden onderzocht; deze logs zijn niet opgehaald.

Geen automatische rollback die anonieme toegang heropent. Bij problemen eerst de betrokken functie beperken en grants gericht herstellen voor de noodzakelijke backendrol. Een oude deployment terugzetten herintroduceert ontbrekende servercontroles; een code-rollback is dus geen veilige standaardoplossing.

## Vereiste praktijktests vóór productie

| Flow | Verwachting |
|---|---|
| Anonieme Data API-toegang tot users/sessies/leads/ontvangsten/toestellen | Geen lees- of schrijfrechten; test met uitsluitend synthetische fixtures |
| Publieke widget: catalogus, multipliers, shops, leadaanvraag | Blijft werken; geen interne gegevens in responses; geen echte mails/labels versturen |
| Verlopen/ingetrokken sessie, inactieve gebruiker | Geen toegang, ook niet via directe API/action-aanroep |
| Medewerker met alleen read | Lezen toegestaan voor eigen features; elke schrijfroute en action geweigerd |
| Medewerker met write zonder read | Geweigerd; pas roltoekenning aan indien dit legitiem moet worden |
| Niet-admin met settings-rechten | Geen accountbeheer of systeeminstellingen |
| Admin | Login, users, shops, catalogus, uploads, leads en exports blijven bruikbaar |
| Geen of fout Origin bij cookie-API-mutatie | Geweigerd; same-origin verzoek met juiste rechten toegestaan |
| Diagnosebrug | Zonder/foute bearer geweigerd; geldige bearer werkt; geen token in browser of QR |
| QR-webtests | Vereisen nu een bevoegde beheersessie; eventueel apart scoped toegang ontwerpen |
| ERP-cron | Zonder/fout secret geen sync; geldig secret start maximaal één gecontroleerde testimport |
| Ontvangst inline/paste/bulk | Onbekende velden/statussen geweigerd; lookupfout geeft geen permissieve fallback |
| Geboekte regel | Geen bedrijfsgegevens wijzigen/verwijderen; ook niet via cascade of gelijktijdige requests |
| Ontvangst verwijderen met booked-item | Hele transactie geweigerd; geen gedeeltelijk verdwenen regels |
| Ongeboekte ontvangst/regel verwijderen | Atomair, inclusief hernummeren waar van toepassing |
| Catalogusafbeeldingen | Publieke leesflow werkt; uploads uitsluitend via bevoegde serveracties |

## Uitgevoerde lokale controles

- 42 tests geslaagd via Node 24 met ingebouwde TypeScript-stripping en VM-modules. De tests gebruiken gemockte database-, sessie- en providerinterfaces en blokkeren netwerkverkeer. Testdata is synthetisch.
- Test van iedere interne onderzochte API-handler: anonieme requests stoppen vóór data-/providergebruik.
- Tests van de echte rechten-/secret-/sessiecode en ontvangstacties bij geweigerde toegang, onbekende veldnamen, geboekte items en mislukte statuslookups.
- Alle `.ts`-bronbestanden syntactisch geparseerd. Controle van eerste-statement guards voor alle geëxporteerde adminacties en inline serveracties.
- De productiebuild is geprobeerd, maar stopt vóór compilatie omdat `prisma` en de projectdependencies niet geïnstalleerd zijn. De `.tsx`-bestanden zijn daardoor nog niet volledig gecompileerd/getypecheckt.
- SQL 01–04 is uitgevoerd op een afzonderlijke PostgreSQL-testdatabase met synthetische fixtures; acht database-testsuites slagen. SQL 06 en de volledige externe widget-/bridgeflow zijn niet getest. Geen SQL-mutaties op productie uitgevoerd.

Reproduceren zonder externe diensten (Node 24):

```text
node --experimental-vm-modules --test security/tests/security.test.mjs security/tests/workflow.test.mjs
```

## Openstaande punten buiten deze eerste herstelpatch

- Duurzame login-rate-limiting en MFA/session-hardening moeten nog worden ontworpen en getest; sessietokens staan voorlopig nog als bearerwaarde in de afgeschermde sessietabel. Hashing van opgeslagen sessietokens vraagt een aparte compatibele migratie.
- Bestaande publieke leadaanvragen vereisen aanvullende servervalidatie, prijsberekening, misbruikbeperking en veilige HTML-verwerking; deze patch herschrijft dat contract niet.
- Toestelregistratie normaliseren, dubbele serienummers voorkomen, diagnose/ontvangst/ERP via foreign keys verbinden en voorraadmutaties vastleggen blijven vervolgwerk.
- Bulk/paste bestaat nog uit meerdere writes; volledige atomaire verwerking en gelijktijdige edits vereisen aanvullende RPC's/transacties. De booked-trigger voorkomt wel wijzigingen aan vergrendelde bedrijfsgegevens.
- ERP-import blijft batchgewijs werken en mist nog een volledig gecontroleerde importtransactie, bronbestandsvalidatie en gelijktijdigheidsbeveiliging.
- Nieuwe objecten kunnen opnieuw automatische grants krijgen. Inventariseer alle object-creators en default privileges en plan expliciete exposure. De bestaande objecten worden door 01–03 afgeschermd; nieuwe objecten vragen blijvende controle.
- Werkelijke scheiding van preview/productie, backupherstel en de Prisma-databaseref moeten nog worden bevestigd.

## Bronnen

- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://nextjs.org/docs/14/app/building-your-application/data-fetching/server-actions-and-mutations

De Supabase-changelogindex kon via de documenttool niet worden gelezen (niet-ondersteund markdown-contenttype); relevante actuele beveiligingsdocumentatie is wel geraadpleegd.
