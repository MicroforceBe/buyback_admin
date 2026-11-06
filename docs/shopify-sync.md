# Shopify-synchronisatie (vervangt Matrixify)

Elke 15 minuten schrijft het ERP een CSV naar FTP; `/api/erp-sync` importeert die in `erp_articles`
(nu met de volledige rij in `raw_erp_row`). Vijf minuten later (`5-59/15 * * * *`) vergelijkt
`/api/shopify-sync` die rijen met Shopify en schrijft alleen wat verschilt.

## Wat wordt gesynchroniseerd
- Product: titel, merk (vendor), type, status
- Variant: prijs, vergelijkingsprijs, btw-plichtig
- Voorraad "available" per locatie (kolom `Inventory Available: <locatienaam>`), alleen waar het artikel al op die locatie staat
- Metavelden: custom.refurbished_product, custom.vat_margin, magento.manufacturer, magento.tax_bebat, magento.tax_recupel

Niet: aanmaken of verwijderen van artikelen (zoals Matrixify), barcode, publicatie/kanalen, afbeeldingen.

## Modi (`/admin/erp/shopify`)
- **Uit** (standaard): niets.
- **Schaduw**: vergelijkt en logt wat zou veranderen, schrijft niets naar Shopify.
- **Live**: schrijft de verschillen in batches. **Noodrem**: meer wijzigingen dan het maximum → de run schrijft niets.
- Noodstop-knop zet alles uit (iedereen met ERP-schrijfrecht). Modus wijzigen en handmatig starten: alleen beheerders.

## Configuratie (Vercel-omgevingsvariabelen, door de eigenaar)
- `SHOPIFY_STORE_DOMAIN` – bv. `microforce-test.myshopify.com`
- `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` – van de Dev Dashboard-app "Microforce ERP Sync"
- Scopes: `read_products, write_products, read_inventory, write_inventory, read_locations`

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
  Als de app het recht `write_online_store_navigation` heeft, wordt `/products/<handle>` doorverwezen naar de eerste collectie van het product
  (anders naar `/collections/all`).

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
- **Kleur** (kleur, kleurstaal) komt alleen van een product met dezelfde kleur in de titel. SG telt als Space Grey, SL als Silver.
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
