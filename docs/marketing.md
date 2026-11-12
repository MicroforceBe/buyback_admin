# Marketing-overzicht (`/admin/marketing`)

Toegang: recht `erp` (lezen); vernieuwen en Merchant-registratie alleen voor beheerders.

## Bronnen en instellingen (Vercel)

| Bron | Instellingen | Fase |
|---|---|---|
| Search Console | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL` (bv. `sc-domain:microforce.be`) | 1b |
| Analytics 4 | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GA4_PROPERTY_ID` (cijfers) | 1b |
| Merchant Center | `GOOGLE_SERVICE_ACCOUNT_JSON`, `MERCHANT_CENTER_ID` (cijfers) | 1b |
| Mailchimp, Trustpilot | zie de tegels op de pagina | 1c |
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
- **Velden:** titel, platte beschrijving, link (met `?variant=` bij meerdere varianten), foto's (max. 11), voorraad (in/uit voorraad), alleen de verkoopprijs (de vergelijkingsprijs uit Shopify gaat niet mee: vaak de nieuwprijs, die nooit gevraagd werd), staat refurbished, merk uit het ERP-veld `magento.manufacturer` (OEM = geen merk), GTIN alleen bij een geldige streepjescode (anders `identifierExists: false`), Google-categorie voor smartphone/tablet/laptop/desktop/monitor.
- **GTIN per model** (`model_gtins`, pagina *Marketing → Modellen & GTIN*): het model is de titel zonder het staat-deel (`modelKey`), zodat alle sterrengradaties dezelfde GTIN krijgen. De feed gebruikt de streepjescode van de variant als die geldig is, anders de GTIN van het model, anders `identifierExists: false`. Europese versie (Apple ZD/A); elke code met bron; zakelijke laptops met eigen configuratie krijgen er geen. SQL: `security/sql/model-gtins.sql`.
- **Ophalen vandaag** (voorraad per winkel): een winkel met voorraad krijgt `pickupMethod: BUY` en `pickupSla: SAME_DAY` (online bestelling ligt dezelfde dag binnen het uur klaar, Olivier 2026-11), maar alleen als de checkout van Shopify daar lokaal afhalen aanbiedt (`localPickupSettingsV2` van de locatie). Zo belooft Google nooit iets wat de kassa niet kan.
- **GTIN als barcode in Shopify** (`lib/shopify/modelBarcodes.ts`, cron `/api/shopify-barcodes` elk uur op :13, knop *Nu invullen* op de GTIN-pagina): refurbished varianten (niet gearchiveerd, zonder eigen configuratie) **zonder** barcode krijgen de GTIN van hun model, zodat de JSON-LD van de productpagina (`snippets/structured-data-product.liquid`, leest de barcode) en elke feed hem hebben. De geschreven code staat ook in het variant-metaveld `microforce.model_gtin`: alleen een barcode die daaraan gelijk is, wordt later aangepast (GTIN van het model gewijzigd) of verwijderd (GTIN ingetrokken; het metaveld wordt dan `ingetrokken`, zodat een later ingetypte code niet meer als die van de tool geldt). Een andere barcode wordt nooit aangeraakt. Volgt de schakelaar van de Shopify-sync: uit = niets, schaduw = alleen tellen, live = schrijven; max. 200 per run. De ERP-sync zet een barcode alleen bij het aanmaken van een product en overschrijft dit dus niet.
- **Kleur, opslag en werkgeheugen** uit de titel (`color`, `productDetails`), en de kwaliteitsklasse. **Productkenmerken** (`productHighlights`) alleen voor toestellen en alleen wat altijd waar is: premium originele kwaliteit (4–5 sterren), batterij min. 85% of nieuwe batterij (smartphone, tablet, laptop, smartwatch), 2 jaar garantie (Apple), gecontroleerd op 50 punten, kwaliteitsgarantie. Prijs, verzending, retour en inruil horen er volgens Google niet in (retour komt uit het retourbeleid in Merchant Center).
- **Productgroepen voor Google Ads:** label 0 soort (Smartphone, Laptop, …), label 1 kwaliteit (sterren uit de titel), label 2 prijsklasse, label 3 merk, label 4 voorraad (uitverkocht, laatste stuk, meerdere).
- **Alleen wat veranderde** wordt verstuurd (`merchant_feed_items` bewaart een hash per aanbieding); wat niet meer in de feed hoort, wordt verwijderd. Max. 400 schrijfacties per run, de rest volgt. **Noodrem:** meer wijzigingen dan het maximum → de run stuurt niets.
- **Modi:** *Uit*; *Test*: alleen de opgegeven producten (max. 20), als `test-…`-aanbiedingen die op geen enkel Google-kanaal getoond worden; *Live*: de volledige feed, ruimt ook de testaanbiedingen op. Live vraagt een bevestiging dat de Google-kanalen in Channable uit staan en hun gegevensbron uit Merchant Center verwijderd is (anders staan de producten er dubbel).
- **Gegevensbron:** eenmalig aangemaakt met de knop op de marketingpagina (Nederlands, feedlabel BE, land België). Het serviceaccount heeft de rol Beheerder in Merchant Center.

- **Voorraad per winkel** (Free local listings / lokale advertenties): per Shopify-locatie een winkelcode uit Google Bedrijfsprofiel (⋮ → Bedrijfsprofielinstellingen → Geavanceerde instellingen → Winkelcode), in te vullen op de marketingpagina. Per aanbieding gaat de beschikbare voorraad per winkel mee (`localInventories:insert`), pas vanaf de run nadat Google het product kent, en alleen als ze veranderde (`local_hash`), na 20 dagen (`local_sent_at`, eigen verversing), of als een winkel zijn code verloor: dan wordt de voorraad van die winkel bij Google verwijderd (`local_stores` onthoudt naar welke winkels ze ging). Een winkel zonder code krijgt niets. Winkelcodes voegt men niet via een spreadsheet-import toe: dat maakt een dubbele locatie aan. Na een nieuwe winkelcode duurt het tot 24 uur voor Merchant Center ze kent. SQL: `security/sql/merchant-feed-local.sql`.

Overschakelen: test → controleren in Merchant Center (de testaanbiedingen en hun problemen) → Channable-kanalen uitzetten en hun gegevensbron verwijderen → live → na een dag de afkeuringen vergelijken → Channable opzeggen.

SQL: `security/sql/merchant-feed.sql`. Code: `lib/marketing/merchantFeed.ts` (puur), `lib/marketing/merchantFeedRun.ts` (run), `app/admin/marketing/FeedSection.tsx`. Tests: `security/tests/merchant-feed.test.mjs`.

## Marketingplan: nog te doen

- **Google Bedrijfsprofiel opwaarderen** (Antwerpen, Gent; Oudenaarde bij heropening): profielsterkte naar 100% ("Profiel voltooien"), socialemediaprofielen koppelen (Facebook, Instagram, LinkedIn), producten en diensten invullen, regelmatig posts, reviews vragen en beantwoorden, "Automatisch aanvullen" (adressen bij het afrekenen) bekijken. Winkelcodes: ANTWERPEN, GENTBRUGGE, Oudenaarde 12821811782628512507.
- **Nagemaakte website** `getmicroforce.shop` (gebruikt naam en tekst van Microforce): melden en opvolgen; daarna geregeld zoeken naar nieuwe nagemaakte domeinen.
- **Google Ads**: Shopping-campagnes op de productgroepen van de eigen feed; MacBook-Shopping zonder rendement en afgekeurde advertenties in de merkcampagnes opruimen.
- **Meta**: welke producten via het Facebook-kanaal naar Meta gaan (alleen refurbished?).
- **Fase 1c**: Mailchimp, Trustpilot. (Judge.me valt weg op vraag van Olivier.)

## Google Ads-audit (alleen lezen)
Pagina **Marketing → Google Ads-audit** (`/admin/marketing/ads`), laatste 30 dagen: totalen, campagnes (met vertoningsaandeel en
verlies door budget/rang voor Zoeken en Shopping), per apparaat, conversieacties, zoektermen die geld kosten zonder conversie
en de duurste producten. Elke vraag apart: één geweigerde vraag verbergt de rest niet. Cijfers worden een uur bewaard.

- Toegang via hetzelfde serviceaccount als Merchant Center, met de scope `adwords`. Het serviceaccount is in Google Ads
  toegevoegd met **Alleen-lezen**; de code doet ook alleen `googleAds:search`.
- Google Ads API-toegang hangt sinds september 2026 aan het Cloud-project (Explorer-niveau, 2.880 bewerkingen per dag);
  er is geen developer token of beheerdersaccount nodig.
- Instelling: `GOOGLE_ADS_CUSTOMER_ID` = het klant-ID (10 cijfers, met of zonder streepjes).

## Verwittigingen "Op aanvraag" (MacBook-modelpagina's)

Op elke MacBook-generatiepagina van microforce.be toont het blok **Op aanvraag of binnenkort terug** (theme:
`snippets/model-op-aanvraag.liquid`) de configuraties (chip, werkgeheugen, opslag) die nu uitverkocht zijn. De klant vinkt
één of meer configuraties aan, kiest welke staten goed zijn (Behoorlijk, Zeer goed, Als nieuw; standaard alle drie), vult naam en
e-mail in en geeft toestemming. "Verwittig mij" in de keuzehulp springt naar dat blok met de configuratie en die staat al aangevinkt.
Dit vervangt voor MacBooks de knop van de app Stok; andere producten houden Stok.

- **Aanvragen:** `POST /api/public/aanvraag` (alleen vanaf de webshop, CORS `PUBLIC_SHOP_ORIGINS`). Bewaart één rij per
  configuratie in `shop_stock_requests` via `submit_shop_stock_request` en stuurt een bevestigingsmail. Opnieuw aanvragen werkt
  de open rij bij (geen dubbels). Begrensd: 10 aanvragen per IP per uur (IP als HMAC met `CRON_SECRET`, na 2 dagen gewist)
  en 30 rijen per e-mailadres per dag. Bevestigingsmails: hoogstens 3 per adres per 24 uur en 100 per uur in totaal
  (`claim_shop_stock_confirmation`, adres als SHA-256 in `shop_stock_mail_log`, na 2 dagen gewist); daarboven wordt de aanvraag
  bewaard zonder mail. Naam: alleen letters, spaties, koppeltekens, punten en apostrofs, max. 60 tekens, geen links. Een val voor bots (veld `website`) bewaart niets. De server maakt de labels zelf.
- **Verwittigen:** cron `/api/stock-requests` elk uur op :20 (na de Shopify-sync). Per open aanvraag het goedkoopste
  **actieve** toestel **op voorraad** in die collectie met dezelfde configuratie (uit de handle, `macConfig`) in een
  van de gekozen staten. Eén mail per e-mailadres per run (alle matches samen), hoogstens 50 mails per run. De rij gaat eerst
  op "verwittigd" en wordt dan gemaild; mislukt de mail, dan gaat ze terug naar open. Na een verwittiging kan de klant
  opnieuw aanvragen. Een aanvraag vervalt na 6 maanden. Afgesloten aanvragen (verwittigd, uitgeschreven,
  vervallen) worden 60 dagen na het afsluiten volledig gewist (GDPR, zelfde termijn als in het privacybeleid voor mails).
  Bewijs van toestemming: `consent_at` en `consent_version` (versie van de tekst op het formulier, bv. `nl-2026-11-12`).
  Het vinkje op het formulier linkt naar het privacybeleid (`/pages/privacybeleid`).
- **Uitschrijven:** link in elke mail (en `List-Unsubscribe`) naar `/api/public/aanvraag/uitschrijven`; de pagina toont een
  knop, pas die schrijft uit (mailscanners openen links automatisch).
- **Mails:** Nederlands, Frans of Engels (taal van de pagina) via Resend. Afzender `SHOP_MAIL_FROM`, anders `MAIL_FROM`.
- **Overzicht:** *Marketing → Aanvragen "Op aanvraag"* (`/admin/marketing/aanvragen`): vraag per configuratie (open, per
  aanvaarde staat, oudste, verwittigd in 30 dagen). Namen en e-mailadressen alleen voor beheerders. Later: beschikbaarheid
  bij leveranciers ernaast, zodra hun lijsten digitaal binnenkomen.
- **SQL:** `security/sql/shop-stock-requests.sql` (test: `test-shop-stock-requests.sql`, binnen BEGIN/ROLLBACK).
  Code: `lib/stockRequests/` (`core.ts` puur, `run.ts` cron, `mail.ts`). Tests: `security/tests/stock-requests.test.mjs`.
