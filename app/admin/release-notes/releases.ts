export type ReleaseEntry={id:string;date:string;title:string;area:string;status:'live'|'test';summary:string;changes:string[]};

// User-facing history only: no credentials, customer records or internal deployment details.
// Add new entries at the top and move a test entry to live only after approved publication.
export const releases:ReleaseEntry[]=[
 {id:'distribution-20261029',date:'2026-10-29',title:'Refurbvoorraad verdelen en verzendlijsten maken',area:'ERP',status:'test',summary:'Bekijk retourvoorstellen per exacte SKU, kies zelf extra artikelen en maak verzendlijsten tussen Gentbrugge en de winkels.',changes:['Standaard behoudt een winkel 1 stuk wanneer Gentbrugge dezelfde SKU niet heeft, en 3 wanneer Gentbrugge wel voorraad heeft. De rest wordt voorgesteld voor retour.','Alle SKU’s die in Gentbrugge ontbreken blijven apart beschikbaar voor handmatige beoordeling, ook bij slechts 1 stuk in de winkel. Modellen die volledig ontbreken worden gemarkeerd.','Beheerders kunnen de bewaaraantallen en uitzonderingen per SKU en winkel aanpassen. Onbekende voorraad levert geen automatisch voorstel op.','Open verzendlijsten tellen als gepland en voorkomen dubbele planning. Lijsten kunnen geprint, gedownload en na verwerking gearchiveerd worden.','Dit onderdeel wijzigt geen ERP-voorraad en registreert geen verzending of ontvangst. Fysieke controle en verwerking in het externe ERP blijven nodig.']},

 {id:'stock-counts-20261028',date:'2026-10-28',title:'Stocktellingen met barcodescanners',area:'ERP',status:'live',summary:'Tel voorraad per winkel en telzone met EAN of SKU, vergelijk verschillen en keur tellingen gecontroleerd goed.',changes:['Stocktellingen is bereikbaar via ERP en het voorraadoverzicht. De start bewaart een momentopname; teltaken en goedkeuring wijzigen geen ERP-voorraad.','Scan met een toetsenbordscanner, zoals Zebra DS2278 of Datalogic QM2131 via het USB-basisstation, met Enter als afsluiting. Optionele IMEI/SN-registratie voorkomt dubbele toesteltellingen.','Persoonlijke telzones, herhaalbeveiliging per aanvraag, tijdelijke bewaring van een onbevestigde scan, ongedaan maken en onbekende barcodes met verplichte opvolging. Werken vereist serververbinding.','Niet geteld en bewust nul blijven apart. Beheerders kunnen gerichte hertellingen starten, voorraadbewegingen controleren en definitief goedkeuren. Goedgekeurde tellingen blijven vergrendeld.','De CSV na goedkeuring bevat alleen getelde artikelen en is een controlevoorstel. Geen automatische correctie of upload naar het externe ERP.']},
 {id:'article-stock-20261028',date:'2026-10-28',title:'Artikelgroepen en voorraad per model',area:'ERP',status:'live',summary:'Blader door je eigen artikelgroepen en subgroepen en bekijk de voorraad per model en vestiging.',changes:['De ERP-startpagina en artikeltabs volgen de zelf ingestelde hoofdgroepen. Klikbare subgroepen staan onder de gekozen hoofdgroep; Nog in te delen toont artikelen zonder groep. Core-assortiment blijft apart beschikbaar.','Voorraad per model bundelt SKU-varianten binnen hun groep en subgroep. Bekijk het ERP-totaal en Gentbrugge, Oudenaarde en Antwerpen naast elkaar.','Filter op groep, subgroep, model en ERP-status. Klik door naar de bijbehorende artikelen of de SKU’s met voorraad op een vestiging. Niet herkende modellen blijven apart zichtbaar.','Prijzen, voorraad en de bestaande ERP-import blijven leidend en worden hier niet gewijzigd. Ontbrekende voorraadwaarden worden als onvolledig aangeduid.']},
 {id:'article-taxonomy-20261028',date:'2026-10-28',title:'Artikelgroepen, SKU-prefixen en modelherkenning',area:'ERP',status:'live',summary:'Zelf beheerde artikelgroepen en subgroepen, met automatische indeling via de eerste drie SKU-cijfers en modelherkenning uit de omschrijving.',changes:['Artikelinstellingen bevat groepen, subgroepen, de SKU-matchingtabel en modelregels. Meerdere prefixen kunnen naar dezelfde groep of subgroep verwijzen; een prefix heeft maar één doel.','Modelregels gebruiken verplichte en uitgesloten woorden. Handmatig ingevulde modellen gaan voor; gelijkwaardige tegenstrijdige regels tonen een conflict.','Op de artikelfiche is de herkomst zichtbaar. Kies een handmatige groep, laat de SKU-regel volgen of sluit de toekenning bewust uit.','Bestaande ERP-rubrieken, core-assortiment, prijzen, voorraad en label-/leadcontroles blijven behouden. Deze uitbreiding wijzigt de bestaande Refurb-modellen en analyticsregels niet.']},


 {id:'erp-article-management-20261027',date:'2026-10-27',title:'Artikelbeheer met interne artikelfiches',area:'ERP',status:'live',summary:'Een vernieuwd artikeloverzicht met eigen artikelfiches, naast de bestaande ERP-import.',changes:['Aparte rubrieken Refurb, Accessoires en Repairs (onderdelen en hersteldiensten), met een eigen Core-assortimentoverzicht voor voorraadtekorten per vestiging. Bestaande core-selecties blijven behouden.','Zoeken op SKU, EAN, naam, merk en model. Bestaande voorraad-, locatie-, grade-, marge- en core-filters blijven beschikbaar.','Open de artikelfiche voor eigen artikelnaam, type, merk, model, EAN, specificaties, afbeelding en interne notities. Versiecontrole en wijzigingshistoriek beschermen tegen overschrijven.','Prijs, voorraad, SKU, ERP-status en BTW-regeling blijven uit het externe ERP komen en zijn op de fiche alleen-lezen.','CSV-import, synchronisatie, core-assortiment en de bestaande labeltool blijven geïntegreerd. Interne aanvullingen wijzigen geen bestaande labels of toestelvalidatie.']},

 {id:'development-backlog-20261027',date:'2026-10-27',title:'Ontwikkelbacklog voor beheerders',area:'Beheer',status:'live',summary:'Een centrale lijst om ideeën en toekomstige verbeteringen te bewaren en op te volgen.',changes:['Beheerders openen de ontwikkelbacklog onderaan de navigatie. Gewone gebruikers krijgen geen toegang.','Voeg ideeën toe met omschrijving, module, prioriteit en status. Zoek en filter in de lijst; bewerk of archiveer items zonder de historiek van de ideeënlijst kwijt te raken.','Het voorstel voor persoonlijke werkpc- en werkplekbeveiliging staat als uitgesteld idee genoteerd. Een backlogitem geeft geen automatische opdracht tot uitvoering.']},

 {id:'user-access-20261027',date:'2026-10-27',title:'Gebruikersbeheer en afzonderlijke RMA-rechten',area:'Gebruikersbeheer',status:'live',summary:'Uitgebreid gebruikersbeheer met afzonderlijke toegang tot RMA Supplier. Bestaande accounts en rechten blijven behouden.',changes:[
 'Professionele accountlijst en rechtenmatrix, met invulprofielen voor receptie, techniek, boekhouding en operationele verantwoordelijkheid.',
 'RMA Supplier apart toekennen: bekijken, verwerken, financiële wijzigingen en definitief afsluiten. Refurb analytics krijgt afzonderlijke leestoegang.',
 'Profielen worden alleen expliciet toegepast en opgeslagen. Er is geen automatische herverdeling van bestaande gebruikersrechten.',
 'Wijzigingen hebben een historiek en versiecontrole. Bestaande wachtwoorden blijven behouden als de wachtwoordvelden leeg blijven.',
 'Accounts deactiveren en sessies intrekken, met bescherming tegen eigen buitensluiting en verlies van de laatste actieve beheerder.',
 ]},


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

