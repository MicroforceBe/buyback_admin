# Microforce USB TEST

Alleen voor https://buyback-admin-test.vercel.app/admin/diagnostics/new.
Geen installatie, geen live-koppeling, geen automatische uploads of stationregistratie.

Start `Start-USB-test.ps1` met de bestaande PowerShell. De bestaande Node-runtime en
Apple-uitlezers in C:\device-reader worden gebruikt. Laat het venster open tijdens
het werken. Sluit het venster of gebruik Ctrl+C om te stoppen. Start niet daarnaast
de oude Microforce bridge voor live; deze testvariant gebruikt een aparte poort 3011.

Sluit de iPhone via USB aan en ontgrendel hem. Bevestig op de iPhone zo nodig
Vertrouw deze computer. Open Nieuwe diagnosesessie op de vaste testsite.
Als Chrome om lokale netwerktoegang vraagt, geef uitsluitend deze testsite toegang.
Bij een toestel worden de velden automatisch ingevuld; bij meerdere toestellen kies
je het gewenste toestel. Controleer de waarden en klik Sessie starten om te bewaren.

Batterijconditie wordt berekend als nominale capaciteit / ontwerpcapaciteit, afgerond
op een geheel percentage en maximaal 100%. Alleen plausibele capaciteiten worden
gebruikt. Formulier, sessie en verslag vermelden altijd de berekende bron; dit kan
afwijken van iOS. Na handmatige wijziging wordt de bron handmatig. De meting en
bron worden per sessie bewaard en niet vervangen door een later gewijzigde toestelrij.
Laadcycli worden overgenomen als ze beschikbaar zijn. Ontbrekende waarden blijven leeg.

De fabriekskleur wordt via het exacte Apple-artikelnummer EN ProductType vertaald.
De eerste gecontroleerde catalogus bevat 128 artikelnummers voor iPhone 14 Pro en
14 Pro Max (alle vier kleuren, opslagvarianten en vier regionale nummerreeksen).
Andere modellen worden alleen ingevuld als USB zelf een benoemde behuizingskleur
geeft. Onbekende combinaties blijven leeg met een melding; de catalogus is uitbreidbaar
in colors.mjs. Numerieke DeviceColor is vaak de voorkant en wordt nooit blind als
behuizingskleur vertaald. Geen gok op basis van een SKU-prefix of kleurvolgorde.
Een vervangen behuizing kan van de fabriekskleur afwijken; handmatig corrigeren kan.
Een onbekend model wordt weergegeven met zijn Apple-toestelcode. Er worden geen
Find My-, activatieslot- of MDM-goedkeuringen afgeleid. Handmatig invullen blijft mogelijk.

De uitlezer bindt uitsluitend 127.0.0.1, controleert Host en vaste test-Origin en
vereist een eigen header met CORS-preflight. Er zijn alleen leesacties; geen HTTP-
uploadroutes, internetverzoeken, credentials, .env-inlezing of ruwe toestellogs.
Alle metingen worden expliciet aan de gekozen USB-UDID gebonden. Browsercode en
serveractie controleren de invoer opnieuw; bestaande conflicterende identiteit wordt
geweigerd. Toestel en sessie worden samen transactioneel opgeslagen door de aangemelde
testsite met bestaande refurb-schrijfrechten. Er is geen databaseschemawijziging.
