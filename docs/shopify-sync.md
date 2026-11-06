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
