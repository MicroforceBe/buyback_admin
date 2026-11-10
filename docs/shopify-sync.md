# Shopify-synchronisatie (vervangt Matrixify)

Elke 15 minuten schrijft het ERP een CSV naar FTP; `/api/erp-sync` importeert die in `erp_articles`
(nu met de volledige rij in `raw_erp_row`). Vijf minuten later (`5-59/15 * * * *`) vergelijkt
`/api/shopify-sync` die rijen met Shopify en schrijft alleen wat verschilt.

## Wat wordt gesynchroniseerd
- Product: titel, merk (vendor), type, status
- Variant: prijs, vergelijkingsprijs, btw-plichtig
- Voorraad "available" per locatie (kolom `Inventory Available: <locatienaam>`), alleen waar het artikel al op die locatie staat
- Metavelden: custom.refurbished_product, custom.vat_margin, magento.manufacturer, magento.tax_bebat, magento.tax_recupel
- Winkels op de website: custom.stock_per_location_1 (lijst "Gentbrugge", "Antwerpen") volgt de voorraad per winkel na de run,
  over alle varianten van het product. Het thema gebruikt dit voor "Nu in Gent/Antwerpen" en de winkelfilter. Geen voorraad in
  een winkel: het metaveld wordt verwijderd. Oudenaarde is tijdelijk dicht en telt niet mee (STORE_LOCATIONS in plan.ts).
  Berekend nadat alle voorraadwijzigingen van de run gepland zijn (ook het op 0 zetten van SKU's die uit het ERP verdwenen).
  Hoogstens 150 producten per run, en alleen in de ruimte die onder max_changes overblijft na de andere wijzigingen en de
  publicaties van de run, zodat de eerste inhaalbeweging zich over enkele runs verspreidt zonder de noodrem. Mislukt de voorraadwijziging van een product, dan wordt
  zijn winkellijst niet geschreven (en als mislukt gemeld); de volgende run rekent ze opnieuw uit.

Niet: aanmaken of verwijderen van artikelen (zoals Matrixify), barcode, publicatie/kanalen, afbeeldingen.

## Modi (`/admin/erp/shopify`)
- **Uit** (standaard): niets.
- **Schaduw**: vergelijkt en logt wat zou veranderen, schrijft niets naar Shopify.
- **Live**: schrijft de verschillen in batches. **Noodrem**: meer wijzigingen (inclusief producten die in de webshop gezet moeten worden) dan het maximum → de run schrijft niets.
- Noodstop-knop zet alles uit (iedereen met ERP-schrijfrecht). Modus wijzigen en handmatig starten: alleen beheerders.

## Configuratie (Vercel-omgevingsvariabelen, door de eigenaar)
- `SHOPIFY_STORE_DOMAIN` – bv. `microforce-test.myshopify.com`
- `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` – van de Dev Dashboard-app "Microforce ERP Sync"
- Scopes: `read_products, write_products, read_inventory, write_inventory, read_locations`, plus `read_publications, write_publications` (actieve producten in de webshop zetten)

## Uitrol
1. `security/sql/shopify-sync.sql` op productie (staat al op test).
2. Merge; daarna draait de cron, maar de modus staat op **Uit**.
3. Variabelen instellen → **Schaduw** → enkele runs nakijken → Matrixify pauzeren → **Live**.

## Nieuwe artikelen als concept (optioneel)
Instelling "Nieuwe ERP-artikelen als concept aanmaken" (standaard uit, alleen beheerders).
- SKU's die alleen in het ERP staan, worden aangemaakt als **draft**-product met één variant, met de tag `erp-nieuw`:
  titel, merk, type, prijs, vergelijkingsprijs, btw, barcode, voorraadopvolging, verzending, voorraad per winkel en de vijf metavelden.
- Niet aangemaakt: rijen zonder titel of prijs, cadeaubonnen en artikelen die in het ERP gearchiveerd zijn.
- Maximaal 50 per run; bij meer dan 200 nieuwe SKU's tegelijk wordt niets aangemaakt (vermoedelijk een fout in het ERP-bestand).
- Zolang de tag `erp-nieuw` op het product staat, past de synchronisatie de **status** niet aan. Alle andere velden worden wel bijgewerkt.
  Verwijder de tag zodra foto's en beschrijving klaar zijn; vanaf dan volgt de status opnieuw het ERP.
- Aanmaken wordt bij een serverfout niet automatisch herhaald (geen dubbele producten); de volgende run probeert opnieuw als het product er nog niet is.
- Vereist `security/sql/shopify-sync-drafts.sql`.

## Dubbele titels
- De lijst "Dubbele titels in ERP" toont ERP-artikelen met exact dezelfde titel (hoofdletters en dubbele spaties genegeerd),
  met prijs, status, voorraad per winkel en het Shopify-product. Ze worden gewoon per SKU gesynchroniseerd.
- Een nieuw concept waarvan de titel al bestaat in Shopify of op een ander ERP-artikel, krijgt extra de tag `controle-dubbele-titel`.
  Zo zie je bij het afwerken van het concept dat het om een dubbele aanmaak in het ERP kan gaan.

## Opruimen: artikelen die alleen nog in Shopify staan
In de lijst "Alleen in Shopify" kan een beheerder producten selecteren en:
- **Archiveren**: direct en omkeerbaar. Het product verdwijnt uit de webshop en de verkoopkanalen.
- **Terugzetten als concept**: maakt het archiveren ongedaan. Het product krijgt de status draft.
- **Definitief verwijderen** (sectie "Gearchiveerd via deze tool"): pas 30 dagen na het archiveren, na het intypen van `VERWIJDER`.

### Actief zonder ERP-artikel: altijd naar concept
Ook als het automatisch opruimen uit staat, mag een product niet actief blijven als **geen enkele** SKU ervan nog in het
ERP-bestand zit. Na 1 uur zet de synchronisatie zo'n product op **concept** (een refurbished toestel op **niet vermeld**, zie hieronder) en de voorraad op 0 (een concept dat nog voorraad heeft, krijgt alleen de voorraad op 0), met dezelfde 301-doorverwijzing
als bij archiveren. Archiveren en verwijderen blijven manueel. Producten met de tag `erp-negeren` en vastgehouden artikelen
(verdacht veel tegelijk verdwenen) blijven ongemoeid. Komt de SKU terug in het ERP, dan volgt het product weer de ERP-status.

### Uitverkochte refurbished toestellen: "Niet vermeld" in plaats van concept
Een uitverkocht refurbished toestel blijft bereikbaar via zijn URL (beslissing Olivier, 10 november 2026). De pagina toont
dan "Niet meer op voorraad", geen prijs en tot 4 alternatieven op voorraad (thema: `snippets/uitverkocht.liquid`, aangeroepen
vanuit `snippets/price.liquid`). Daarvoor krijgt het product in Shopify de status **UNLISTED** ("Niet vermeld"): bereikbaar via
de link, maar niet in collecties, zoekresultaten, aanbevelingen, de sitemap of Google (Shopify zet zelf `noindex`).
- Regel (`targetStatus` in `lib/shopify/plan.ts`): zegt het ERP **Draft**, is er **geen voorraad** (over alle varianten, in het
  ERP én in Shopify) en staat "Refurbished" in de titel, dan wordt het UNLISTED. Heeft Shopify nog voorraad, dan wordt het eerst
  concept (de run zet de voorraad op 0) en in een volgende run UNLISTED: zo blijft een pagina nooit bereikbaar met voorraad die
  nog gekocht kan worden als het wegschrijven van de 0 mislukt. Al het andere volgt de ERP-status zoals voorheen (accessoires blijven concept). Zegt het ERP
  weer Active, dan wordt het product terug actief.
- Een refurbished product dat uit het ERP verdwijnt, wordt na 1 uur ook UNLISTED in plaats van concept (zelfde regel: eerst
  concept zolang Shopify nog voorraad heeft), zonder doorverwijzing (de pagina blijft bestaan). Ook oude concepten die niet meer
  in het ERP staan, worden zo omgezet. Andere producten gaan zoals voorheen naar concept met een 301.
- Bestaande concepten worden in porties omgezet: maximaal 75 per run samen (`MAX_UNLIST_PER_RUN`), zodat de noodrem niet afgaat;
  de rest staat bij de run als "volgt in een volgende run". Een toestel dat nu uitverkocht raakt, wacht nooit.
- UNLISTED-producten worden net als actieve op het kanaal Online Store gezet (anders zou de pagina een 404 geven).
- De Google-feed neemt alleen actieve producten mee, dus niet-vermelde producten staan er niet in.
- Een oude doorverwijzing op de URL doet niets meer zodra de pagina bestaat (Shopify volgt een doorverwijzing alleen bij een 404).

### Doorverwijzingen (301) voor productpagina's die verdwijnen
Een gearchiveerd product geeft in de webshop een 404. Daarom krijgt de oude URL `/products/<handle>` een 301-doorverwijzing
**op het moment van archiveren** (handmatig of automatisch door de synchronisatie), niet pas bij het verwijderen:
1. naar een ander actief product van **hetzelfde model** (zelfde titel zonder graad) dat op voorraad is;
2. anders naar de eerste collectie van het product (niet `all` of `frontpage`);
3. anders naar `/collections/all`.

Bestaande doorverwijzingen die naar de gearchiveerde pagina wezen, worden mee omgezet, zodat er geen keten op een dode pagina eindigt.
**Terugzetten als concept** verwijdert de doorverwijzing weer. Bij definitief verwijderen wordt de bestaande doorverwijzing bijgewerkt.
De knop "Doorverwijzingen aanmaken voor gearchiveerde producten zonder doorverwijzing" (sectie "Gearchiveerd via deze tool")
maakt ze eenmalig aan voor producten die vroeger al gearchiveerd werden (maximaal 60 per klik).
Alles vraagt het recht `write_online_store_navigation`; ontbreekt dat, dan wordt er niets doorverwezen en staat dat in het logboek.
Een probleem met een doorverwijzing laat het archiveren of verwijderen nooit mislukken.

Beveiligingen:
- vlak voor elke actie wordt opnieuw gecontroleerd in Shopify en in de laatste ERP-import;
- een product waarvan nog één SKU in het ERP staat, wordt altijd overgeslagen;
- producten met voorraad alleen als dat bewust aangevinkt is;
- maximaal 100 producten per actie, en niets als de ERP-gegevens onvolledig lijken (minder dan 500 artikelen);
- verwijderen wordt bij een serverfout niet herhaald;
- elk product komt in het logboek `shopify_product_removals`. De app kan daarin alleen toevoegen, niet wijzigen of wissen.

Vereist `security/sql/shopify-product-removals.sql`.

## Categorie van nieuwe concepten
Het ERP-bestand heeft geen tags. Een nieuw concept neemt daarom de `cat_…`- en `attribute_set_code_…`-tags over van het meest
gelijkende bestaande Shopify-product. Dat product moet aan twee voorwaarden voldoen:
- dezelfde SKU-familie (de eerste 3 cijfers, bv. 207 = MacBook, 211 = iPhone, 212 = laptops);
- de titel begint met minstens twee dezelfde woorden. De langste gemeenschappelijke start telt het zwaarst, daarna de woordoverlap.

Het concept krijgt ook `main_sku_<sku>` en de tag `controle-categorie`. Is er geen geschikt product, dan krijgt het `geen-categorie`.

## Eigenschappen van nieuwe concepten
Een nieuw concept krijgt zijn eigenschappen (metavelden) uit de titel en uit de 15 meest gelijkende bestaande producten
van dezelfde SKU-familie (`lib/shopify/enrich.ts`):
- **Uiterlijk** (`magento.conditie`) volgt uit de sterren in de titel: 5* = "5* Als Nieuw", 4* = "4* Zeer Goed", 3* = "3* Goed".
- **Wat mag je verwachten** komt van een product uit dezelfde familie met evenveel sterren.
- **Kleur** (Color Swatch `custom.color_swatch`, plus de kleurvelden als die er zijn) komt alleen van een product met dezelfde kleur, via het kleurveld of de titel. Een product van hetzelfde model gaat voor (de kleurstaal kan per model verschillen), daarna een product mét Color Swatch. SG telt als Space Grey, SL als Silver.
- **Model** = de woorden van de titel vóór de eerste capaciteit, bv. "MacBook Pro 16 L21 M1 Max" of "iPhone 13 Mini".
- **Modeleigenschappen** (scherm, processor, camera, garantie, ...) komen alleen van een product met exact hetzelfde model.
- **Geheugen en opslag** komen alleen van een product met hetzelfde model én dezelfde capaciteiten (bv. 32GB + 1TB).
- **Nooit gekopieerd:**
  - velden die het ERP synchroniseert;
  - voorraad- en dealerprijsvelden;
  - app-gegevens (reviews, SEO-tags, Google Shopping);
  - oude velden zonder type.

Bij de wijziging "nieuw artikel (draft)" staat hoeveel eigenschappen er ingevuld zijn. Het concept behoudt de tag
`controle-categorie`, zodat iemand het nakijkt voor het geactiveerd wordt.

## Artikelen die niet meer in het ERP staan
- **Recente export:** een artikel telt alleen als ERP-artikel als het in de recente exports stond. De rij moet bijgewerkt zijn
  door de laatste ERP-imports, met een marge van 40 minuten (twee imports). Dat geldt ook als de rij nog in `erp_articles` staat.
- **Opvolging:** de synchronisatie houdt per Shopify-SKU bij sinds wanneer die niet meer in het ERP staat (`shopify_sku_missing`).
- **Instelling "voorraad 0 en archiveren"** (standaard uit, alleen beheerders):
  - de voorraad gaat meteen naar 0 op alle locaties;
  - na 24 uur wordt het product gearchiveerd, alleen als geen enkele variant nog in het ERP staat en de voorraad overal al 0 is;
  - het archiveren wordt meteen in het opruimlogboek gezet, zodat definitief verwijderen na 30 dagen mogelijk is;
    lukt dat niet, dan stopt de run met een melding.
- **Uitzonderingen:**
  - de tag `erp-negeren` houdt een product buiten deze regel;
  - verdwijnen er meer dan 100 artikelen binnen het uur, dan worden ze **vastgehouden**: ze worden nooit op 0 gezet of
    gearchiveerd, tot een beheerder ze vrijgeeft (knop op de pagina) of ze terug in het ERP staan;
  - de noodrem en de noodstop gelden ook hier.
- Vereist `security/sql/shopify-sync-missing.sql`.

## Foto's van nieuwe concepten
Er worden alleen foto's gebruikt die al in de eigen Shopify-winkel staan. Foto's van het internet worden nooit gebruikt.
- **Bron:** alleen een product met exact hetzelfde model én dezelfde kleur. Is er meer dan één, dan het product met de meeste goede foto's (max. 10).
- **Kwaliteit voor marketing:** de langste zijde minstens 1000 px, de kortste minstens 500 px, en geen strook (max. 3:1).
  Kleinere of vreemde formaten worden niet overgenomen.
- **Alt-tekst:** de alt-tekst van het bronproduct, met de nieuwe titel. De SEO-tekst "kopen bij Microforce …" blijft behouden.
- **Geen geschikte foto:** het concept krijgt de tag `geen-afbeelding`.

## Catalogusrapport

`/admin/erp/shopify/catalog` (link rechtsboven op de Shopify-syncpagina). Een beheerder maakt een rapport met één bulk-query over alle actieve producten en concepten (1 à 2 minuten); de laatste 10 rapporten blijven bewaard (`shopify_catalog_reports`).

Controles per product:

| Code | Betekenis |
|---|---|
| Geen foto / geen foto van goede kwaliteit | Geen afbeelding, of geen enkele afbeelding van ≥1000 px lange zijde, ≥500 px korte zijde, verhouding ≤3:1 |
| Onbruikbare foto | Kleiner dan 200 px of een strook (verhouding >6:1) |
| Geen categorie-tag / lege tag `cat_` / geen collectie | Product is niet vindbaar via het menu |
| Uiterlijk ontbreekt / klopt niet | `magento.conditie` past niet bij de sterren (3*/4*/5*) in de titel |
| Kleurstaal ontbreekt | Refurbished product zonder Color Swatch (`custom.color_swatch`) |
| main_sku past niet | Tag `main_sku_…` verwijst naar een SKU die geen variant van het product is (kan menselijk of door een oude import zijn) |
| Dubbele titel | Meerdere actieve/concept-producten met dezelfde titel |

Producten met voorraad staan bovenaan. Elke regel linkt naar het product in Shopify.

Automatisch herstellen (alleen beheerder, max. 200 per keer, met bevestiging):

- **Uiterlijk** volgens de sterren in de titel.
- **Categorie-tags** gekopieerd van het meest gelijkende product (zelfde SKU-familie en titelbegin); een lege `cat_`-tag wordt dan verwijderd.

Elk product wordt vlak voor de wijziging opnieuw gelezen; als de titel sindsdien veranderd is of het probleem al opgelost is, wordt het overgeslagen. Foto's, kleur en `main_sku` worden nooit automatisch gewijzigd. Elke poging staat in het logboek `shopify_catalog_fixes` (alleen toevoegen, niet wijzigen of wissen).

### Vindbaarheid (SEO)

| Controle | Betekenis |
|---|---|
| SEO-titel / meta-description ontbreekt | Google toont dan de technische producttitel |
| Te lang | SEO-titel > 60 of meta-description > 155 tekens (Google kort af) |
| Geen / korte beschrijving | < 20 / < 100 woorden zichtbare tekst |
| Identieke beschrijving | Zelfde zichtbare tekst als minstens één ander actief product (dubbele inhoud) |
| Koppen noemen ander model | iPhone-pagina waarvan de koppen wel een iPhone noemen, maar nooit het eigen model |
| Extra H1 / lege afbeelding | `<h1>` in de beschrijving (het thema toont de titel al als H1), `<img>` zonder bron |
| Foto zonder alt-tekst | Minstens één productfoto zonder alt-tekst (alleen gemeld) |

Extra automatische aanpassingen (zelfde regels: admin, bevestiging, product eerst opnieuw gelezen):

- **SEO-tekst:** alleen een **lege** SEO-titel of meta-description wordt ingevuld, in de huisstijl ("Refurbished … – Zeer Goed | Microforce", "Koop refurbished … bij Microforce met 24 maanden garantie. Gratis afhalen …"). Geen prijzen (die veranderen). Een bestaande tekst wordt nooit overschreven.
- **Beschrijving:** een lege beschrijving wordt overgenomen van het product van **exact hetzelfde model** met de langste beschrijving (≥ 100 woorden) waarvan de koppen geen ander model noemen.

**Samenwerking met TinySEO.** TinySEO genereert elke nacht SEO-titels en meta-descriptions uit een sjabloon ("Alle metadata overschrijven") en slaat producten met de tag `tinyimg_metadata_skip` over. Onze tool zet die tag op elk product waarvan hij de SEO-tekst invult of vervangt (vóór de tekst geschreven wordt; mislukt het schrijven, dan gaat de tag weer weg). Zo neemt de tool product per product over, en blijven andere producten een TinySEO-tekst houden. Alt-teksten en beeldverkleining blijven bij TinySEO.

Extra controles: SEO-tekst is de ruwe titel of het algemene sjabloon (sterren, "… kopen - Microforce"), noemt een andere conditie dan de sterren in de titel, of de meta-description is identiek aan die van een ander product.

**Unieke SEO-tekst bij dezelfde titel.** Hebben meerdere producten exact dezelfde titel, dan zoekt de tool binnen die groep de eigenschappen die verschillen, in deze volgorde: Processor Model, Grafische kaart, Model Jaar, Toetsenbord layout (max. 2, en niet als de waarde al in de titel staat). Die komen in de SEO-titel (zo nodig alleen de eerste) en in de meta-description, bv. "Koop refurbished MacBook Pro 16" … met i9-9980HK en AMD Radeon Pro 5500M in conditie Zeer Goed …".

**Slechte SEO-tekst vervangen** (`seo_replace`) is een aparte keuze: het rapport toont oud → nieuw; er wordt alleen vervangen als de tekst nog exact is wat het rapport toonde. De oude tekst staat in het logboek (`old_value`) en elke SEO-aanpassing kan via **Terugdraaien** ongedaan gemaakt worden (één keer, alleen als de tekst intussen niet opnieuw gewijzigd is). Terugdraaien haalt ook de skip-tag weg als de tool die had toegevoegd, zodat TinySEO het product weer beheert.

**Koppen (H1 → H2).** Het thema toont de producttitel al als H1; een `<h1>` in de beschrijving wordt een `<h2 data-mf-h1="…">` met een eigen code per aanpassing. Die markering maakt terugdraaien exact (alleen de koppen van díe aanpassing worden weer H1). Bewaart Shopify de markering niet, dan staat dat in het logboek en is terugdraaien niet mogelijk.

**SEO-tekst van de tool is overschreven.** Bij elk rapport vergelijkt de tool per product de laatste toegepaste SEO-aanpassing (niet teruggedraaid) met de huidige SEO-titel en meta-description, en controleert of de tag `tinyimg_metadata_skip` er nog op staat.

**Alt-teksten.** Productfoto's zonder alt-tekst (`alt_photo`) krijgen de productnaam ("Refurbished Dell Latitude 5420 …", vanaf de tweede foto "– foto 2"); afbeeldingen in de beschrijving zonder alt-tekst (`alt_text`) krijgen de naam met "– afbeelding 2" enz. Bestaande alt-teksten worden nooit gewijzigd. Productfoto's schrijven gebeurt via `fileUpdate` en vraagt het recht `write_files` (en `read_files`) in de Dev Dashboard-app; zonder dat recht wordt de aanpassing overgeslagen met die reden. Terugdraaien zet per foto de oude alt-tekst terug zolang de tool-tekst er nog staat; bij de beschrijving exact zoals bij Opschonen. Let op: producten met de tag `tinyimg_metadata_skip` krijgen van TinySEO geen alt-teksten meer, en TinySEO's ALT-functie staat op overschrijven.

**Nieuwe concepten** uit de sync krijgen dezelfde beschrijving-regel; zonder geschikte bron krijgen ze de tag `geen-beschrijving`.

SQL: `security/sql/shopify-catalog.sql`, `shopify-catalog-seo.sql` `shopify-catalog-revert.sql` en `shopify-catalog-heading.sql` (tests: `test-shopify-catalog*.sql`).

## Collectierapport

`/admin/erp/shopify/collections` (link vanaf het catalogusrapport). Eén bulk-query over alle collecties met hun producten (status, voorraad, refurbished). Rapporten staan in `shopify_catalog_reports` met `scope = 'collections'` (laatste 10), aanpassingen in hetzelfde logboek `shopify_catalog_fixes` (de kolom `product_id` bevat dan het collectie-ID).

Controles: SEO-titel / meta-description ontbreekt of te lang, geen of korte tekst (< 20 / < 150 woorden), extra H1, geen actieve producten, zelfde actieve producten als een andere collectie (de collectie met de meeste tekst, dan de meeste voorraad, geldt als origineel), en **interne collecties** (CS-ATB…, Best selling/Seller, Homepage) die niet verborgen zijn.

Aanpassingen (admin, bevestigen, collectie eerst opnieuw gelezen, terugdraaien kan):
- **SEO invullen**: alleen lege velden, bv. "Refurbished iPad 2019 kopen – met garantie | Microforce"; voor niet-refurbished collecties "… kopen | Microforce". Geen prijzen of aantallen.
- **Verbergen**: alleen voor interne collecties; zet `seo.hidden = 1` (Shopify laat de pagina weg uit de sitemap en zet noindex). De collectie blijft werken op de site. Lege collecties worden alleen gemeld.
- **Koppen**: H1 → H2 met een eigen markering per aanpassing (zoals bij producten).

SQL: `security/sql/shopify-collections.sql` (kolom `scope`, extra soorten in het logboek).

## Zichtbaar in de webshop

Elke run (ook zonder andere wijzigingen) zoekt de actieve producten uit het ERP die niet op het kanaal Online Store staan en publiceert ze daar (max. 200 per run; schaduwmodus telt alleen). Producten die met de hand in Shopify gemaakt zijn, blijven ongemoeid, net als de andere kanalen (Google, Facebook, Shop, POS). Niet gepubliceerd: producten met een dubbele SKU in Shopify, producten waarvan de ERP-regels elkaar tegenspreken (titel, merk, type of status) en producten waarvan een schrijfactie in deze run mislukte (prijs, voorraad, status); die volgen bij een volgende geslaagde run. De publicaties tellen mee voor de noodrem. Zonder de rechten `read_publications` en `write_publications` wordt dit overgeslagen en staat de reden bij de run. Code: `lib/shopify/publish.ts`.
