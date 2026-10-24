# Testresultaten databasebeveiliging — 24 oktober 2026

De beveiligingsvoorstellen 01–04 zijn uitsluitend uitgevoerd op het afzonderlijke testproject `ekqmhexbabrwudetkfcm` (Microforce-buyback-security-test). De live-app, Vercel-instellingen en productiedatabase zijn niet gewijzigd.

## Testbasis

De public-databasestructuur is via uitsluitend catalogusqueries gelezen. Er zijn geen productierecords gekopieerd. Vóór toepassing van de voorstellen kwamen de volgende onderdelen exact overeen: 40 tabellen inclusief kolomdefinities en RLS-status, 8 sequences (definities, geen actuele productievolgnummers), 68 constraints, 49 aanvullende indexen, 13 functies, 3 views, 8 triggers, 23 policies en 903 tabelgrants.

Dit is geen volledige platformkopie: Supabase Auth-instellingen, Storage-buckets/bestanden, netwerkconfiguratie, externe services en applicatie-omgevingsvariabelen zijn niet gekopieerd. De testdatabase gebruikt PostgreSQL 17.11; productie meldde 17.6. De hoofdversie is gelijk, de patchversie verschilt.

Er zijn fictieve leveranciers, ontvangsten, toestellen, catalogusartikelen, winkels en leads toegevoegd. De twee fictieve accounts zijn inactief en hebben geen wachtwoordhash. Er zijn geen werkende beheersessies of productiecredentials aangemaakt/gekopieerd. Muterende proefacties zijn na controle teruggedraaid; de synthetische fixtures blijven beschikbaar.

## Resultaten

| Controle | Uitkomst |
|---|---|
| Vooraf: anonieme leesactie op fictieve accounts | Toegang aangetoond; probleem gereproduceerd zonder productiedata |
| Na afscherming: lezen van acht gevoelige tabellen als anon | Geweigerd |
| Normale authenticated-rol leest accounts/schrijft ontvangstitems | Geweigerd |
| Publieke catalogus, actieve winkels, catalogusview en catalogus-RPC | Leesbaar |
| Anonieme cataloguswijziging en ontvangstverwijdering via RPC | Geweigerd |
| Backendrol leest account-/sessietabellen, wijzigt open ontvangstregel en registreert lead | Werkt op databaseniveau |
| Geboekt toestel wijzigen of verwijderen | Geweigerd |
| Volledige ontvangst met geboekt toestel verwijderen | Geweigerd; alle regels behouden |
| Ongeboekte ontvangst en gekoppelde regels verwijderen | Werkt atomair |
| Ongeboekte regel verwijderen en opvolgende geboekte regel hernummeren | Werkt atomair; geboekte bedrijfsgegevens behouden |

De acht afgeronde database-testsuites slagen. Dit zijn SQL-/roltests, geen browser- of HTTP-tests. Gelijktijdige transacties zijn nog niet getest.

## Bestaande fout gevonden

De bestaande `api_buyback_widget(text)`-functie faalt voor het fictieve model met `column "titles" does not exist`, bij het uitlezen van `buyback_multipliers_per_category_json`. Dit is onafhankelijk bevestigd door de oorspronkelijke productiefunctiedefinitie in een tijdelijke testfunctie uit te voeren. De beveiligingspatch heeft deze fout niet geïntroduceerd.

Of de live Shopify-widget juist deze databasefunctie gebruikt, is nog onbekend; de applicatie bevat ook eigen buyback-API-routes. Er is dus geen bewijs dat de live widget hierdoor op dit moment uitvalt. Deze bestaande functie is niet aangepast. Eerst de werkelijk gebruikte widgetroute vaststellen en de gewenste vragen-/multiplierstructuur bevestigen voordat de functie gericht wordt hersteld.

## Security Advisors op het testproject

Geen ERROR-meldingen voor ontbrekende RLS, views met eigenaarsrechten of wijzigbare function-search-paths in de teruggegeven scan. Wel:

- 26 informatieve meldingen voor interne tabellen met RLS zonder clientpolicies. Dat is hier bewust: de eigen beheerlogin loopt via een gecontroleerde backend, en de backendrol heeft toegang. [Toelichting](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Waarschuwingen voor de twee bewust publiek uitvoerbare catalogus/widgetfuncties met eigenaarsrechten. De defecte legacy-widgetfunctie vereist daarnaast de hierboven beschreven functionele beoordeling. [Toelichting](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

Storage-voorstel 06 is niet getest: bucketconfiguratie en bestanden zijn niet gekopieerd.

## Nog vereist vóór productie

1. Een toegestane buildomgeving met toegang tot het pakketregister. De eerder vastgestelde lokale netwerkblokkade is nog niet opgelost; volledige typecontrole en productiebuild zijn nog niet uitgevoerd.
2. Een aparte applicatie-instantie op de testdatabase, zonder productiemail, verzending of ERP-credentials.
3. Login en gebruikersrechten, publieke buyback-aanvraag, goederenontvangst en diagnose via de browser testen, inclusief foutpaden. Controleer de externe widget en lokale diagnosebrug.
4. Een herstelplan en afzonderlijke toestemming voor de exacte productiewijzigingen.

De geslaagde databasecontroles geven meer zekerheid over de voorgestelde afscherming, maar garanderen niet dat de volledige live-app ongewijzigd blijft werken. Er is geen productievrijgave gegeven en de oorspronkelijke productieproblemen zijn nog niet opgelost.
