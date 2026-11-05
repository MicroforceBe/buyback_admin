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
