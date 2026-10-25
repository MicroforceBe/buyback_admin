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

Batterijconditie, ontbrekende opslag/kleur en onbekende modellen worden niet geraden.
Een onbekend model wordt weergegeven met zijn Apple-toestelcode. Er worden geen
Find My-, activatieslot- of MDM-goedkeuringen afgeleid. Handmatig invullen blijft mogelijk.

De uitlezer bindt uitsluitend 127.0.0.1, controleert Host en vaste test-Origin en
vereist een eigen header met CORS-preflight. Er zijn alleen leesacties; geen HTTP-
uploadroutes, internetverzoeken, credentials, .env-inlezing of ruwe toestellogs.
Alle metingen worden expliciet aan de gekozen USB-UDID gebonden. Browsercode en
serveractie controleren de invoer opnieuw; bestaande conflicterende identiteit wordt
geweigerd. Toestel en sessie worden samen transactioneel opgeslagen door de aangemelde
testsite met bestaande refurb-schrijfrechten. Er is geen databaseschemawijziging.
