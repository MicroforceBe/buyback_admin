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
