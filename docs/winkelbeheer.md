# Winkelbeheer — architectuurplan

Status: voorstel, fase 1 (klantenbeheer) in ontwikkeling.
Doel: kassa (sales POS), service/reparatie en klantenbeheer voor de Microforce-winkels, binnen
`buyback-admin`, met een koppeling naar een boekhoudpakket (Odoo of Exact Online — nog te kiezen).

## Uitgangspunten

1. **Eén klant, overal dezelfde.** Verkoop, reparatie en buyback-leads verwijzen naar dezelfde
   rij in `shop_customers`. Geen kopieën van klantgegevens in andere tabellen.
2. **De admin-tool is de bron voor de winkelwerking; het boekhoudpakket is de bron voor de
   boekhouding.** Wij registreren verkopen, reparaties en klanten; het pakket maakt de officiële
   facturen, verstuurt B2B-facturen via Peppol en boekt.
3. **Pakket-onafhankelijk.** Alle code praat met een interne `AccountingConnector`-interface.
   Odoo en Exact zijn twee implementaties. De keuze wordt een instelling, geen herschrijving.
4. **Asynchrone, betrouwbare synchronisatie.** Een verkoop wordt nooit geblokkeerd omdat het
   pakket even niet bereikbaar is. Wijzigingen gaan in een wachtrij (outbox) en worden opnieuw
   geprobeerd tot ze bevestigd zijn.
5. **Zelfde beveiligingsmodel** als de rest van de tool: feature-rechten, server-side
   databasetoegang, audit-log per wijziging.

## Modules

| Module | Feature-recht | Kern |
|---|---|---|
| Klanten | `customers` | Particulier/bedrijf, contact, adres, btw-nummer, voorkeurwinkel, historiek |
| Kassa (POS) | `pos` (fase 2) | Winkelmandje, artikelen uit `erp_articles`, korting, betaalmethodes, ticket, kassasessie/dagafsluiting per winkel |
| Service/reparatie | `repairs` (fase 3) | Intake met toestel, IMEI, klacht, voorwaarden en handtekening; statussen; onderdelen; prijsofferte; klantberichten; afrekenen via kassa |
| Boekhoudkoppeling | `settings` (admin) | Configuratie, wachtrij, foutenoverzicht, opnieuw proberen |

## Datamodel (overzicht)

Fase 1:
- `shop_customers` — klanten (nummer `K000001`, type, naam, bedrijf, btw, contact, adres,
  voorkeurwinkel, marketingtoestemming, notitie, `version` voor gelijktijdige bewerkingen,
  `archived_at` in plaats van verwijderen).
- `shop_customer_events` — audit-log (wie, wat, wanneer, welke velden).
- `shop_customer_external_refs` — id van de klant in Odoo/Exact per pakket, met syncstatus.
- `buyback_leads.shop_customer_id` — koppeling bestaande leads aan een klant.

Later:
- `pos_sessions`, `pos_sales`, `pos_sale_lines`, `pos_payments` (fase 2).
- `repair_orders`, `repair_order_lines`, `repair_order_events` (fase 3).
- `accounting_outbox` — te synchroniseren gebeurtenissen met status, pogingen en laatste fout.

## Boekhoudkoppeling

- `lib/accounting/connector.ts` definieert `upsertCustomer`, `createSalesDocument`,
  `registerPayment`.
- `lib/accounting/odoo.ts` (JSON-RPC/XML-RPC API) en `lib/accounting/exact.ts` (REST API, OAuth2).
- Een cron-route verwerkt `accounting_outbox` (zoals `/api/erp-sync` nu al elke 15 minuten draait).
- Idempotent: elke push draagt onze eigen id mee, zodat een herhaalde poging geen dubbele klant
  of factuur maakt.

## Wettelijke aandachtspunten (België) — te bevestigen met de boekhouder

- **B2B e-facturatie via Peppol is verplicht sinds 1 januari 2026.** Facturen aan bedrijven
  maken we daarom niet zelf als PDF, maar laten we aanmaken en versturen door Odoo of Exact.
  Het btw-nummer van bedrijfsklanten is dus een kerngegeven.
- **Geregistreerd kassasysteem (GKS).** Momenteel verplicht voor horeca; er is sprake van
  uitbreiding van de doelgroep. Voor de kassa (fase 2) eerst nagaan of dit op onze winkels van
  toepassing is of wordt, vóór we het ticket- en kassamodel vastleggen.
- **AVG/GDPR.** Alleen gegevens die nodig zijn; marketingtoestemming expliciet en apart;
  klanten archiveren en op verzoek anonimiseren; geen IBAN in het klantrecord.

## Fasering

1. **Klantenbeheer** — klanten aanmaken, zoeken, bewerken, archiveren; leads koppelen.
2. **Kassa** — eerst zonder gekoppelde betaalterminal (medewerker bevestigt betaling), daarna
   terminalintegratie zodra de leverancier gekozen is.
3. **Service/reparatie** — intake tot afhalen, afrekenen via de kassa.
4. **Boekhoudkoppeling** — zodra het pakket gekozen is; klanten eerst, dan verkopen/facturen.
   De outbox wordt al vanaf fase 2 gevuld, zodat er niets verloren gaat.

## Open beslissingen

- Odoo of Exact Online.
- Betaalterminal en leverancier.
- Ticketprinter, barcodescanner en (eventueel) kassalade per winkel.
- GKS-plicht voor de winkels (zie hierboven).
