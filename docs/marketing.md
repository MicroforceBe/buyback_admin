# Marketing-overzicht (`/admin/marketing`)

Toegang: recht `erp` (lezen); vernieuwen en Merchant-registratie alleen voor beheerders.

## Bronnen en instellingen (Vercel)

| Bron | Instellingen | Fase |
|---|---|---|
| Search Console | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL` (bv. `sc-domain:microforce.be`) | 1b |
| Analytics 4 | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GA4_PROPERTY_ID` (cijfers) | 1b |
| Merchant Center | `GOOGLE_SERVICE_ACCOUNT_JSON`, `MERCHANT_CENTER_ID` (cijfers) | 1b |
| Mailchimp, Trustpilot, Judge.me | zie de tegels op de pagina | 1c |
| Google Ads, Meta Ads | zie de tegels op de pagina | 1d |

De pagina controleert alleen óf een instelling ingevuld is; waarden worden nooit getoond of gelogd.

## Google (fase 1b)

- Eén serviceaccount in het Cloud-project "Microforce Marketing", met de API's Search Console, Analytics Data en Merchant ingeschakeld.
- Search Console: het serviceaccount als gebruiker **Beperkt** (alleen een geverifieerde eigenaar kan gebruikers toevoegen).
- Analytics 4: rol **Kijker** op de property.
- Merchant Center: rol **Beheerder** — nodig voor de eenmalige registratie van het Cloud-project (`registerGcp`). Zolang die ontbreekt, toont de tegel een knop "Registreren"; de ingelogde beheerder wordt technisch contact.
- Search Console: 28 dagen tot 3 dagen geleden (data loopt 2–3 dagen achter) t.o.v. de 28 dagen ervoor; top-10 zoektermen en pagina's. Indexeringsaantallen zitten niet in de API.
- Analytics 4: sessies, gebruikers, conversies (key events) en omzet per kanaal, laatste 28 dagen.
- Merchant Center: producten per status en de 10 meest voorkomende problemen (per product één keer geteld).
- Elke bron wordt een uur bewaard (`unstable_cache`, tag `marketing-google`); een fout bij één bron toont alleen die fout.

Code: `lib/marketing/google.ts` (API-aanroepen, token), `lib/marketing/googleData.ts` (puur), `app/admin/marketing/GoogleSection.tsx`. Tests: `security/tests/marketing.test.mjs`.

## Eigen Google-feed (vervangt Channable)

Actieve, refurbished producten die in de webshop staan, gaan elk kwartier (cron `/api/merchant-feed`, 5 minuten na de Shopify-sync) rechtstreeks via de Merchant API naar een eigen gegevensbron in Merchant Center.

- **Per variant één aanbieding**; het aanbiedings-ID is het numerieke variant-ID, hetzelfde als Channable gebruikte, zodat Google Ads de historiek per product houdt.
- **Velden:** titel, platte beschrijving, link (met `?variant=` bij meerdere varianten), foto's (max. 11), voorraad (in/uit voorraad), prijs met doorstreepprijs als `salePrice`, staat refurbished, merk uit het ERP-veld `magento.manufacturer` (OEM = geen merk), GTIN alleen bij een geldige streepjescode (anders `identifierExists: false`), Google-categorie voor smartphone/tablet/laptop/desktop/monitor.
- **Productgroepen voor Google Ads:** label 0 soort (Smartphone, Laptop, …), label 1 kwaliteit (sterren uit de titel), label 2 prijsklasse, label 3 merk, label 4 voorraad (uitverkocht, laatste stuk, meerdere).
- **Alleen wat veranderde** wordt verstuurd (`merchant_feed_items` bewaart een hash per aanbieding); wat niet meer in de feed hoort, wordt verwijderd. Max. 400 schrijfacties per run, de rest volgt. **Noodrem:** meer wijzigingen dan het maximum → de run stuurt niets.
- **Modi:** *Uit*; *Test*: alleen de opgegeven producten (max. 20), als `test-…`-aanbiedingen die op geen enkel Google-kanaal getoond worden; *Live*: de volledige feed, ruimt ook de testaanbiedingen op. Live vraagt een bevestiging dat de Google-kanalen in Channable uit staan en hun gegevensbron uit Merchant Center verwijderd is (anders staan de producten er dubbel).
- **Gegevensbron:** eenmalig aangemaakt met de knop op de marketingpagina (Nederlands, feedlabel BE, land België). Het serviceaccount heeft de rol Beheerder in Merchant Center.

- **Voorraad per winkel** (Free local listings / lokale advertenties): per Shopify-locatie een winkelcode uit Google Bedrijfsprofiel (⋮ → Bedrijfsprofielinstellingen → Geavanceerde instellingen → Winkelcode), in te vullen op de marketingpagina. Per aanbieding gaat de beschikbare voorraad per winkel mee (`localInventories:insert`), pas vanaf de run nadat Google het product kent, en alleen als ze veranderde (eigen hash `local_hash`) of samen met de verversing na 20 dagen. Een winkel zonder code krijgt niets. Winkelcodes voegt men niet via een spreadsheet-import toe: dat maakt een dubbele locatie aan. Na een nieuwe winkelcode duurt het tot 24 uur voor Merchant Center ze kent. SQL: `security/sql/merchant-feed-local.sql`.

Overschakelen: test → controleren in Merchant Center (de testaanbiedingen en hun problemen) → Channable-kanalen uitzetten en hun gegevensbron verwijderen → live → na een dag de afkeuringen vergelijken → Channable opzeggen.

SQL: `security/sql/merchant-feed.sql`. Code: `lib/marketing/merchantFeed.ts` (puur), `lib/marketing/merchantFeedRun.ts` (run), `app/admin/marketing/FeedSection.tsx`. Tests: `security/tests/merchant-feed.test.mjs`.
