# Testbranch: security-test

Deze branch is uitsluitend bedoeld voor het afzonderlijke Vercel-project
`buyback-admin-test` en Supabase-project `ekqmhexbabrwudetkfcm`.

Niet naar main mergen: de test-only next.config.js weigert andere databaseprojecten,
vercel.json schakelt automatische Git-deployments uit en bevat geen cronjobs.
Handmatige deployments moeten expliciet project buyback-admin-test en deze branch
of de gecontroleerde commit kiezen.

## Alleen in het nieuwe testproject instellen

- SUPABASE_URL en NEXT_PUBLIC_SUPABASE_URL: de API-URL van het testproject.
- NEXT_PUBLIC_SUPABASE_ANON_KEY: uitsluitend de publieke sleutel van het testproject.
- SUPABASE_SERVICE_ROLE_KEY: uitsluitend de backend-sleutel van het testproject.
  De alternatieve SUPABASE_SERVICE_ROLE is niet nodig; gebruik één naam.
- DATABASE_URL: de PostgreSQL-verbinding van het testproject voor Prisma.
- DIRECT_URL: alleen indien benodigd, uitsluitend van het testproject.
- NEXT_PUBLIC_APP_URL: de URL van de aparte Vercel-testsite zodra die bekend is.

Vul credentials rechtstreeks in Vercel in. Geen waarden in chat, GitHub, logs of
dit document. Kopieer geen productiesleutels. Stel deze testwaarden expliciet in
voor zowel Preview als Production van het afzonderlijke TESTproject; een label
Production binnen dit testproject is niet de bestaande live-app.

Geen productiecredentials voor Resend, Sendcloud of ERP/FTP instellen. Geen
live-custom-domeinen of bestaande integraties aan dit project koppelen. De
testdatabase bevat alleen synthetische fixtures en geen actieve testlogin.

Een volledige build en browservalidatie zijn nog vereist. De oude widget-RPC
heeft een apart vastgesteld bestaand kolomprobleem, zie database-validation.md.
