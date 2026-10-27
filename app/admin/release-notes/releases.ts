export type ReleaseEntry={id:string;date:string;title:string;area:string;status:'live'|'test';summary:string;changes:string[]};

// User-facing history only: no credentials, customer records or internal deployment details.
// Add new entries at the top and move a test entry to live only after approved publication.
export const releases:ReleaseEntry[]=[
 {id:'reception-battery-20261027',date:'2026-10-27',title:'Batterijcapaciteit op recepties en labels',area:'Recepties',status:'live',summary:'Bewaar de batterijcapaciteit bij het receptieartikel en print ze mee op het verpakkingslabel.',changes:[
 'Nieuw veld Batterij (%) met een geheel getal van 0 tot 100. Een streepje betekent niet ingevuld; batterij-informatie blijft dan volledig weg op het receptielabel.',
 'Voor smartphones is een opgeslagen batterijcapaciteit van minstens 85% verplicht voordat het label kan worden geprint. Je kunt lagere waarden wel bewaren tijdens de verwerking.',
 'De printcontrole gebruikt de opgeslagen artikelgegevens. Een onopgeslagen batterijwijziging moet eerst worden bewaard.',
 'De bestaande batterijregels voor buyback leads blijven behouden.',
 ]},

 {id:'trustpilot-20261027',date:'2026-10-27',title:'Automatische Trustpilot-uitnodigingen na afronding',area:'Leads',status:'live',summary:'Nieuwe afgeronde buybacks worden automatisch bij Trustpilot aangemeld voor een uitnodiging na 7 dagen.',changes:[
 'De eerste overgang naar Afgewerkt meldt de buyback één keer aan. Bestaande afgewerkte buybacks worden niet achteraf uitgenodigd.',
 'Afgewerkt betekent verkoopsklaar en in voorraad; de betaling gebeurt afzonderlijk. Trustpilot gebruikt het ingestelde Microforce BuyBack-sjabloon en de termijn van 7 dagen.',
 'Beheerders kunnen registraties en eventuele ontbrekende klantgegevens opvolgen via Trustpilot bij Leads.',
 ]},

 {id:'rma-resolution-20261027',date:'2026-10-27',title:'RMA Supplier: weigering en verwerking in receptie',area:'RMA Supplier',status:'live',summary:'Beslissingen per artikel, retourregistratie en verdere verwerking via de gewone receptiewerklijst.',changes:[
  'Leg per artikel vast of de leverancier de volledige claim, een deel, geen vergoeding of herstel door de leverancier aanvaardt. Eén dossier kan verschillende uitkomsten bevatten.',
  'Geweigerde artikelen die bij Microforce aanwezig zijn worden teruggezet naar de bestaande status RMA to fix. Status, SKU en gebruikte onderdelen bewerk je daarna gewoon in de receptie.',
  'Na verzending kan de verdere verwerking pas starten zodra de retour bij Microforce is geregistreerd. Voor artikelen die niet verzonden zijn volstaat bevestiging dat ze nog aanwezig zijn.',
  'De leveranciersweigering en de artikelgegevens vóór terugzetting blijven in de historiek bewaard, ook bij een eerder geboekt toestel. Er wordt geen tweede artikel aangemaakt.',
  'Oorspronkelijke claim, toegekend, ontvangen, geweigerd en eventueel afgeschreven blijven apart. De overneempijlen gebruiken het toegekende bedrag.',
  'Een volledig geweigerd dossier zonder vergoeding kan zonder CN worden afgesloten; een leveranciersreferentie blijft nodig. Bij toegekende of ontvangen vergoeding blijft CN verplicht.',
  'Analytics onderscheidt leveranciersbeslissingen, ontvangen vergoedingen en hersteluitkomsten. Een compensatiebedrag geldt niet als bewijs van herstel; elk toestel telt één keer in het RMA-totaal.',
 ]},

 {id:'dashboard-20261026',date:'2026-10-26',title:'Een vernieuwde Microforce-werkruimte',area:'Dashboard',status:'live',summary:'Een zakelijke startpagina en een vaste, leesbare navigatie.',changes:[
  'Na uitloggen verschijnt alleen het aanmeldscherm, zonder oude navigatie of accountinformatie. Dit geldt ook bij een verlopen sessie tijdens het navigeren.',
  'Nieuwe dashboardindeling met aparte groepen voor dagelijkse verwerking en catalogus & beheer.',
  'Vaste zijbalk met menunamen en consistente iconen. Het menu schuift niet meer open bij hover; op kleinere schermen staat de navigatie bovenaan.',
  'Snelle toegang tot recepties, leads, RMA Supplier en Refurb analytics, volgens de bestaande toegangsrechten.',
  'Nieuwe sectie Release notes, beschikbaar voor alle aangemelde gebruikers, met een overzicht van de gepubliceerde verbeteringen.',
 ]},
 {id:'recepties-20261026',date:'2026-10-26',title:'Sneller naar de juiste receptie',area:'Recepties',status:'live',summary:'Meer werkruimte voor leveringen, minder informatie die in de weg staat.',changes:[
  'Het tegeloverzicht is standaard ingeklapt. Het toont openstaande recepties, te verwerken artikelen, artikelen in overzicht en artikelen met een naderende garantietermijn.',
  'Een afzonderlijke waarschuwing blijft zichtbaar wanneer de leveranciers-/RMA-termijn van open artikelen vandaag of binnen 7 dagen verloopt.',
  'Toon afgewerkte recepties staat rechts in de header Leveringen.',
  'De receptiezoeker geeft vanaf 3 tekens suggesties op receptienummer of leverancier. Ook afgewerkte recepties zijn vindbaar; een keuze opent direct de receptie.',
 ]},
 {id:'dymo-20261026',date:'2026-10-26',title:'DYMO-labels met één afdruk per label',area:'Labels',status:'live',summary:'De gedeelde printopmaak is afgestemd op DYMO 99012, 89 × 36 mm, op de LabelWriter 450.',changes:[
  'Het extra lege label is verholpen en bij een fysieke proef bevestigd.',
  'MICROFORCE is compacter geplaatst en CE staat verder naar binnen. De fysieke uitlijning van deze laatste correctie moet nog met een proefafdruk worden bevestigd.',
  'De barcodegrootte en de vrije ruimte rond de barcodes zijn behouden. SKU, IMEI/SN, grade, batterij en btw-regeling blijven op het label staan.',
  'Print op 100% met het juiste 99012-papierformaat en zonder kop- of voetteksten.',
 ]},
 {id:'rma-supplier-20261025',date:'2026-10-25',title:'Volledige opvolging met RMA Supplier',area:'RMA Supplier',status:'live',summary:'Leveranciers-RMA’s beheren in dossiers, vanaf de receptie tot de definitieve afhandeling.',changes:[
  'Dossiers per leverancier met gekoppelde artikelen, dossierstatus, leveranciers-RMA-nummer, leveranciers-CN-nummer, tracking, datums, notities en historiek.',
  'Vanuit het RMA-overzicht van een receptie een leveranciersdossier aanmaken. Reeds gekoppelde artikelen tonen hun dossier; nieuwe artikelen kunnen naar een actief dossier of een nieuw dossier voor een aparte zending.',
  'Bij RMA wordt de aankoopprijs als compensatie voorgesteld of automatisch ingevuld wanneer de regels dit toelaten; de compensatie kan handmatig worden aangepast. Zonder ingevulde compensatie kan een artikel niet aan een dossier worden toegevoegd.',
  'Een artikel dat ooit RMA was blijft meetellen in de RMA-historiek, ook na herstel of een andere status. RMA-overzichten blijven beschikbaar bij andere RMA-statussen.',
  'Een later defect bij een afgewerkt of geboekt artikel kan via Nieuw RMA melden worden opgevolgd, met behoud van de boeking. Een terugbetaald artikel kan niet opnieuw op RMA worden gezet.',
  'Klikbare receptienummers en beschikbare CN-nummers in het dossieroverzicht. Pijlen nemen Verwacht over naar Ontvangen, per artikel of voor alle artikelen; totalen staan onderaan.',
  'Ontvangen bedragen pas overnemen na werkelijke ontvangst. De pijl registreert geen betaling en boekt geen creditnota.',
  'Definitief afhandelen vereist een ingevulde dossierstatus, leveranciers-RMA-nummer, leveranciers-CN-nummer en expliciete bevestiging. Daarna blijven dossier en bedragen ongewijzigd bewaard.',
 ]},
 {id:'recepties-20261025',date:'2026-10-25',title:'Een overzichtelijke receptiewerkplek',area:'Recepties',status:'live',summary:'Artikelen staan centraal, met een consistente zakelijke indeling.',changes:[
  'Volledig afgewerkte recepties zijn standaard verborgen en kunnen opnieuw zichtbaar worden gemaakt. De ingestelde eindstatussen bepalen wat afgewerkt is.',
  'Voortgang toont bijvoorbeeld 77% afgewerkt, 7 van de 30 artikels open.',
  'Naast het receptienummer staat een telling voor elke niet-afgewerkte status. Een klik opent de receptie met direct het juiste artikelfilter.',
  'Receptiegegevens, statusverdeling en bulk update starten ingeklapt; de open artikelen blijven direct bereikbaar. De blokken hebben dezelfde stijl.',
  'Intern factuurnummer is bewerkbaar. De RMA-termijn is instelbaar per receptie en per leverancier, standaard 30 dagen; nieuwe recepties nemen de leverancierstermijn over.',
  'De bulk-updatekeuzes voor geselecteerde rijen of een IMEI/SN-lijst zijn hersteld in de opmaak, met behoud van de bestaande verwerkingsfuncties.',
  'Bij Finished en Ready to book is een printicoon beschikbaar voor het verpakkingslabel. Printen start vanuit de receptie zonder tussenpagina.',
 ]},
 {id:'analytics-20261025',date:'2026-10-25',title:'Inzicht in aankopen, open werk en RMA',area:'Analytics',status:'live',summary:'Grafische en financiële overzichten per leverancier.',changes:[
  'Aankoopaantallen en aankoopbedragen per leverancier, met RMA-aantallen en RMA-percentage.',
  'Grafieken tonen openstaande artikelen en hun aankoopwaarde per leverancier, inclusief totalen.',
  'Uitsplitsingen van openstaande artikelen per model, leverancier en status, met periodefilters op receptiedatum.',
  'Alle RMA-statussen en de blijvende RMA-historiek tellen mee. Een compensatiebedrag is geen bewijs dat een betaling is ontvangen of dat een toestel is hersteld.',
  'Nog niet verwerkte RMA betekent: een huidige RMA-status zonder eindstatus. Aankoopwaarde, ingevulde compensaties en ontbrekende bedragen staan afzonderlijk vermeld.',
 ]},
 {id:'leads-20261025',date:'2026-10-25',title:'Betere verwerking van buyback leads',area:'Leads',status:'live',summary:'Duidelijkere invoercontrole, betere SKU-zoekresultaten en een uniforme werkpagina.',changes:[
  'De leadspagina heeft dezelfde zakelijke stijl als de recepties. De volledige modelnaam is leesbaar bij mouse-over.',
  'Een voorlopige omschrijving mag in SKU worden opgeslagen. Voor Controle succesvol moet de opgeslagen SKU daadwerkelijk bestaan als actief refurbished margeartikel in ERP.',
  'Duidelijke meldingen bij ontbrekende gegevens voor de controlestatussen. Voor een succesvolle controle blijven de vereiste klant- en toestelgegevens verplicht.',
  'SKU-zoeken combineert woorden en uitsluitingen: iPad 2025 -air zoekt iPad én 2025 en sluit air uit. De beperking tot refurbished margeartikelen blijft gelden.',
  'Naast bewaren staat een printicoon wanneer de opgeslagen toestel-SKU, SN/IMEI en batterijwaarde geldig zijn. Onopgeslagen afwijkingen moeten eerst worden bewaard.',
  'Een batterijwaarde van 80% of lager toont een waarschuwing en blokkeert printen niet. De grens is voorlopig 80%, niet instelbaar per model.',
  'Bij geen gebruikte onderdelen vul je - in. Onbekende onderdelen-SKU’s kunnen voorlopig met waarschuwing worden opgeslagen zolang ERP onvolledig is; onderdelen worden niet op het label geprint.',
  'Leadtijden worden in Belgische lokale tijd weergegeven. Bevestigingsmails gebruiken antwoordteksten in plaats van interne codes zoals opt_1.',
 ]},
 {id:'diagnostics-test-20261025',date:'2026-10-25',title:'Betrouwbaardere webdiagnose en USB-invoer',area:'Diagnostics',status:'test',summary:'Deze uitbreidingen zijn alleen in de testomgeving beschikbaar; nog niet vrijgegeven voor live gebruik.',changes:[
  'De webdiagnose maakt onderscheid tussen automatische browserwaarnemingen, handmatige controles en tests die native ondersteuning nodig hebben. Niet uitgevoerde tests worden niet automatisch goedgekeurd.',
  'Bij sessiestart kunnen iPhonegegevens via de lokale USB-koppeling op de werkcomputer automatisch worden ingevuld en bij de sessie bewaard.',
  'Batterijconditie kan uit beschikbare USB-capaciteitsgegevens worden berekend. Deze waarde staat expliciet als berekend vermeld en is geen garantie dat ze exact overeenkomt met iOS.',
  'Kleurvertaling op basis van model en Apple-artikelnummer is toegevoegd, met bevestigde ondersteuning voor iPhone 14 Pro/Pro Max. Onbekende combinaties blijven handmatig te controleren.',
  'Een QR-code en bijbehorende link openen de webtests op de iPhone. De foutieve undefined-URL is hersteld.',
  'De testomgeving blijft achter Vercel-beveiliging: op een iPhone kan eerst een Vercel-aanmelding nodig zijn. Deze extra beveiliging is niet uitgeschakeld.',
 ]},
 {id:'basis-20261024',date:'2026-10-24',title:'Een gecontroleerde basis voor de live omgeving',area:'Platform',status:'live',summary:'Verbeteringen aan opslag, communicatie en veilige verwerking.',changes:[
  'Buyback-aanvragen worden opgeslagen en zijn zichtbaar in het beheer, met controle op het berekende bedrag.',
  'Catalogusafbeeldingen blijven bewaard in bestandsopslag. Database- en afbeeldingsback-ups zijn afzonderlijk veiliggesteld en een herstelprocedure is gecontroleerd.',
  'Toegangs-, status- en prijscontroles zijn aangescherpt. Geboekte artikelen blijven beschermd tegen ongewenste wijzigingen.',
  'PDF-/labelkoppelingen zijn afgeschermd. Bestaande e-mailtemplates blijven uit de database komen; de ontvangst van testmails is gecontroleerd.',
  'De bestaande ERP-importinstellingen zijn behouden. Een nieuwe FTPS-verbinding is niet als werkend bevestigd; de werkelijke Sendcloud-labeltest is overgeslagen.',
 ]},
];

