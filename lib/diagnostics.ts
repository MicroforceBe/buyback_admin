// Shared protocol for the guided web flow, persistence and certificates.
export const WEB_PROTOCOL = 1;
export const WEB_PREFIX = 'web:';
export const RESULT_LABELS = {
  pending: 'Niet getest', pass: 'Geslaagd', warning: 'Aandachtspunt',
  fail: 'Afgekeurd', unsupported: 'Niet ondersteund / geblokkeerd', na: 'Niet van toepassing',
} as const;
export type DiagnosticStatus = keyof typeof RESULT_LABELS;
export type DiagnosticSpec = {
  key: string; label: string; tool: string; instruction: string; checks: string[]; allowNA?: boolean;
};
export const WEB_TESTS: DiagnosticSpec[] = [
  {key:'touchscreen', label:'Touchscreen', tool:'touch', instruction:'Veeg ieder vak groen. Test ook op ongewenste aanrakingen. Alleen het browseroppervlak wordt gemeten.', checks:['Alle vakken reageren en er zijn geen ongewenste aanrakingen.']},
  {key:'multitouch', label:'Multitouch', tool:'multi', instruction:'Plaats vijf vingers tegelijk op het testvlak.', checks:['Vijf gelijktijdige aanrakingen zijn geregistreerd.']},
  {key:'edge_touch', label:'Schermranden', tool:'edges', instruction:'Veeg over alle gemarkeerde randsegmenten. Browser- en systeemranden buiten het testvlak blijven buiten deze meting.', checks:['Alle randsegmenten reageren zonder onderbreking.']},
  {key:'screen', label:'Schermkleuren', tool:'screen', instruction:'Bekijk alle kleuren. Controleer verkleuring, lijnen en vlekken.', checks:['Alle kleurvlakken zijn visueel gecontroleerd.']},
  {key:'dead_pixels', label:'Dode pixels', tool:'screen', instruction:'Bekijk ieder kleurvlak van dichtbij op vaste zwarte of lichte punten.', checks:['Alle kleurvlakken zijn op defecte pixels gecontroleerd.']},
  {key:'brightness', label:'Helderheid', tool:'screen', instruction:'Stel de helderheid handmatig laag en hoog in. Controleer gelijkmatigheid en flikkering; er wordt geen lichtsterkte gemeten.', checks:['Lage en hoge helderheid zijn visueel gecontroleerd.']},
  {key:'camera', label:'Camera voor en achter', tool:'camera', instruction:'Open beide cameraâ€™s, neem een foto en beoordeel scherpte, kleuren en vlekken. Dit controleert niet automatisch iedere fysieke lens.', checks:['Frontcamera en achtercamera tonen een goed beeld.','Foto-opname is bekeken en in orde.']},
  {key:'autofocus', label:'Autofocus', tool:'camera', instruction:'Richt de achtercamera afwisselend op een tekst dichtbij en een onderwerp veraf.', checks:['Scherpstelling dichtbij en veraf werkt.']},
  {key:'flashlight', label:'Flitser', tool:'camera', instruction:'Schakel de lamp aan en uit en controleer dit fysiek. Gebruik bij ontbrekende browserondersteuning de zaklamp in het bedieningspaneel.', checks:['De lamp is zichtbaar aan en uit gegaan.'],allowNA:true},
  {key:'barcode', label:'Barcode', tool:'barcode', instruction:'Scan een bekende code en vergelijk de gelezen waarde. Zonder browserdecoder blijft deze test niet ondersteund; een native scanner of decoder is dan nodig.', checks:['De gelezen waarde komt exact overeen met de bekende code.']},
  {key:'microphone', label:'Microfoon', tool:'microphone', instruction:'Neem stemgeluid op en beluister het volledig. Een opnamebestand alleen bewijst geen goede microfoon.', checks:['De opname is verstaanbaar en zonder storende vervorming teruggespeeld.']},
  {key:'speaker', label:'Luidspreker', tool:'speaker', instruction:'Ontkoppel Bluetooth en koptelefoons. Beluister alle tonen op een veilig volume.', checks:['Alle tonen komen uit de toestelluidspreker en klinken goed.']},
  {key:'earpiece', label:'Oorluidspreker', tool:'manual', instruction:'Voer een echte testoproep uit zonder luidsprekerstand. De browser kan de oorluidspreker niet afzonderlijk aansturen.', checks:['Tijdens een echte oproep klinkt de oorluidspreker duidelijk.']},
  {key:'motion', label:'Beweging en rotatiegegevens', tool:'motion', instruction:'Beweeg en draai het toestel. Versnelling zonder zwaartekracht en rotatiesnelheid worden apart beoordeeld. Dit is een beperkte sensorcontrole.', checks:['Er is zowel versnelling als rotatiesnelheid waargenomen.']},
  {key:'rotation', label:'Schermrotatie', tool:'rotation', instruction:'Zet rotatievergrendeling uit en draai tussen portret en landschap. Dit controleert de weergave, niet de volledige gyroscoop.', checks:['Portret en landschap zijn beide geregistreerd.']},
  {key:'face_id', label:'Face ID / biometrie', tool:'manual', instruction:'Test ontgrendeling met de ingestelde biometrie. Een toegangscode telt niet als geslaagde biometrie. Kies N.v.t. met reden als het model deze functie niet heeft.', checks:['Biometrische ontgrendeling is daadwerkelijk uitgevoerd.'],allowNA:true},
  {key:'buttons', label:'Fysieke knoppen', tool:'manual', instruction:'Test aan/uit, beide volumeknoppen en de mute-schakelaar of actieknop die dit model heeft. Vermeld in de notitie welke optionele knop aanwezig is.', checks:['Aan/uit en volume omhoog/omlaag werken.','De aanwezige mute-schakelaar of actieknop is gecontroleerd.']},
  {key:'charging_port', label:'Laadpoort', tool:'manual', instruction:'Gebruik een bekende goede kabel; geen draadloos laden. Controleer laden en een dataverbinding met een computer.', checks:['Bekabeld laden werkt.','Dataverbinding via de kabel werkt.']},
  {key:'vibration', label:'Trilling', tool:'manual', instruction:'Activeer trilling via de toestelinstellingen of een oproep en voel of de motor werkt.', checks:['Trilling is fysiek waargenomen.'],allowNA:true},
  {key:'proximity', label:'Nabijheidssensor', tool:'manual', instruction:'Dek tijdens een echte oproep de sensor af en maak hem weer vrij. Controleer dat het scherm uit en weer aan gaat.', checks:['Afdekken en vrijmaken geven de juiste schermreactie.']},
  {key:'wifi', label:'Wifi', tool:'network', instruction:'Verbind met bekende wifi en zet mobiele data uit. De bereikbaarheidstest alleen kan wifi niet van mobiele data onderscheiden.', checks:['Mobiele data staan uit en bekende wifi is verbonden.','De bereikbaarheidstest is geslaagd.']},
  {key:'connectivity', label:'Serververbinding', tool:'network', instruction:'Controleer of de diagnose-server antwoordt. Deze meting bewijst geen werking van alle draadloze hardware.', checks:['Een geldig antwoord van de diagnose-server is ontvangen.']},
  {key:'network_speed', label:'Gegevensoverdracht', tool:'transfer', instruction:'Meet een vaste kleine download en upload naar deze server. Dit is een indicatieve overdrachtsmeting, geen maximale internetsnelheid of antennekeuring.', checks:['Download en upload zijn volledig en zonder HTTP-fouten uitgevoerd.']},
  {key:'bluetooth', label:'Bluetooth', tool:'manual', instruction:'Koppel via de toestelinstellingen een bekend accessoire en test echte audio of gegevensoverdracht. Alleen een apparaat vinden is onvoldoende.', checks:['Een bekend accessoire is gekoppeld en echte overdracht werkt.']},
  {key:'gps', label:'Locatie', tool:'gps', instruction:'Test buiten en vergelijk de locatie met de werkelijke plek. Browserlocatie kan ook wifi of mobiele netwerken gebruiken; dit is geen afzonderlijke GPS-hardwarekeuring.', checks:['De locatie komt overeen met de werkelijke plek en de nauwkeurigheid is beoordeeld.']},
  {key:'cosmetic', label:'Cosmetische staat', tool:'manual', instruction:'Controleer scherm, frame, achterkant, lenzen, knoppen en poorten. Noteer zichtbare schade; beschadiging mag niet als geslaagd worden bewaard.', checks:['Alle genoemde delen zijn visueel gecontroleerd.']},
];
export type WebResult = {status: DiagnosticStatus; notes: string; checks: boolean[]; method: 'guided_manual'; protocol: number; observation: string; evidence: Record<string,number|boolean>; id?: string; createdAt?: string};
export type StoredTest = {id: string; testKey: string; status: string; notes?: string | null; value?: unknown; createdAt: Date | string};
export function emptyResult(spec: DiagnosticSpec): WebResult {
  return {status:'pending', notes:'', checks:spec.checks.map(()=>false), method:'guided_manual', protocol:WEB_PROTOCOL, observation:'', evidence:{}};
}
export function validateWebResult(spec: DiagnosticSpec, input: unknown): WebResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ongeldige beoordeling.');
  const r = input as Record<string, unknown>;
  if (typeof r.status !== 'string' || !Object.hasOwn(RESULT_LABELS, r.status)) throw new Error('Kies een geldige uitslag.');
  const status = r.status as DiagnosticStatus;
  if (status === 'na' && !spec.allowNA) throw new Error('Deze controle mag niet als niet van toepassing worden overgeslagen.');
  if (typeof r.notes !== 'string' || r.notes.length > 2000) throw new Error('Notitie mag maximaal 2000 tekens bevatten.');
  if (!Array.isArray(r.checks) || r.checks.length !== spec.checks.length || r.checks.some(x=>typeof x !== 'boolean')) throw new Error('Ongeldige controlelijst.');
  const checks = r.checks as boolean[];
  if (['pass','warning'].includes(status) && !checks.every(Boolean)) throw new Error('Bevestig eerst alle uitgevoerde controles.');
  if (['warning','fail','unsupported','na'].includes(status) && !r.notes.trim()) throw new Error('Vul een toelichting in bij deze uitslag.');
  if (typeof r.observation !== 'string' || r.observation.length > 2000) throw new Error('Ongeldige meetgegevens.');
  if (r.protocol !== WEB_PROTOCOL || r.method !== 'guided_manual') throw new Error('Ongeldige testversie. Vernieuw de pagina.');
  if (!r.evidence || typeof r.evidence!=='object' || Array.isArray(r.evidence)) throw new Error('Meetgegevens ontbreken.');
  const evidence=r.evidence as Record<string,number|boolean>;
  if(Object.keys(evidence).length>20 || Object.values(evidence).some(v=>typeof v!=='boolean' && (typeof v!=='number' || !Number.isFinite(v)))) throw new Error('Ongeldige meetgegevens.');
  if(['pass','warning'].includes(status)) {
    const enough = spec.tool==='touch'?evidence.covered===96 : spec.tool==='edges'?evidence.covered===36 : spec.tool==='multi'?typeof evidence.maxTouches==='number' && evidence.maxTouches>=5 : spec.tool==='rotation'?evidence.portrait===true && evidence.landscape===true : spec.tool==='motion'?evidence.acceleration===true && evidence.rotation===true : ['network','transfer'].includes(spec.tool)?evidence.transfer===true : spec.tool==='barcode'?evidence.barcode===true : spec.tool==='gps'?evidence.location===true : spec.key==='camera'?evidence.front===true && evidence.rear===true && evidence.photo===true : spec.key==='autofocus'?evidence.rear===true : spec.tool==='microphone'?evidence.played===true : true;
    if(!enough) throw new Error('Voer eerst de vereiste meting uit. Zonder voldoende meetgegevens kan deze controle niet als geslaagd of aandachtspunt worden bewaard.');
  }
  return {status, notes:r.notes.trim(), checks, observation:r.observation, evidence:{...evidence}, protocol:WEB_PROTOCOL, method:'guided_manual'};
}
export function webResults(rows: StoredTest[]): Record<string,WebResult> {
  const result: Record<string,WebResult> = {};
  const latest = new Map<string,StoredTest>();
  for (const row of [...rows].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime() || b.id.localeCompare(a.id))) {
    if (!latest.has(row.testKey)) latest.set(row.testKey,row);
  }
  for (const spec of WEB_TESTS) {
    const row = latest.get(WEB_PREFIX+spec.key);
    if (!row) continue;
    try {
      const value = validateWebResult(spec, row.value);
      if (value.status !== row.status) continue;
      result[spec.key] = {...value, id:row.id, createdAt:new Date(row.createdAt).toISOString()};
    } catch { /* Unversioned or malformed legacy results cannot certify this protocol. */ }
  }
  return result;
}
export function diagnosticReport(rows: StoredTest[], battery: number | null | undefined, appRows: StoredTest[] = []) {
  const results = webResults(rows);
  const incomplete = WEB_TESTS.filter(t=>!results[t.key] || ['pending','unsupported'].includes(results[t.key].status));
  const extras = new Map<string,StoredTest>();
  for (const row of [...rows.filter(r=>!r.testKey.startsWith(WEB_PREFIX)).map(r=>({...r,testKey:'manual:'+r.testKey})), ...appRows.map(r=>({...r,testKey:'app:'+r.testKey}))].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime() || b.id.localeCompare(a.id))) if (!extras.has(row.testKey)) extras.set(row.testKey,row);
  const statuses = [...Object.values(results).map(r=>r.status), ...Array.from(extras.values()).map(r=>r.status)];
  const hasFailure = statuses.includes('fail');
  const hasWarning = statuses.includes('warning');
  const batteryKnown = typeof battery === 'number' && Number.isInteger(battery) && battery >= 0 && battery <= 100;
  const complete = incomplete.length === 0;
  let score: number | null = null;
  let grade: string | null = null;
  if (complete && batteryKnown) {
    score = Math.max(0, 100 - statuses.filter(s=>s==='fail').length*15 - statuses.filter(s=>s==='warning').length*5 - (battery!<85?10:0) - (battery!<80?20:0));
    grade = !hasFailure && !hasWarning && score>=90 && battery!>=90 ? 'A' : !hasFailure && score>=75 && battery!>=85 ? 'B' : 'C';
  }
  return {results, incomplete, complete, batteryKnown, canFinalize:complete && batteryKnown, hasFailure, hasWarning, score, grade, extras:Array.from(extras.values())};
}
