export const supplierDecisions={pending:'Nog geen beslissing',approved:'Volledige vergoeding toegekend',partial:'Gedeeltelijke vergoeding',rejected:'Geweigerd',repaired:'Hersteld door leverancier'} as const;
export const custodyStates={unknown:'Nog te bevestigen',on_site:'Bij Microforce · niet verzonden',sent:'Onderweg naar leverancier',supplier:'Bij leverancier',returning:'Wacht op retour / onderweg terug',returned:'Retour ontvangen bij Microforce'} as const;
export const repairStates={none:'Nog niet gestart',queued:'Te herstellen',working:'In herstel',quality:'Eindcontrole',repaired:'Intern hersteld · controle geslaagd',unrepairable:'Niet herstelbaar',parts:'Bestemd voor onderdelen'} as const;
export type ResolutionItem={id?:string;case_id?:string;case_stage?:string;reception_item_id?:string;expected_cents:number|null;received_cents:number;decision?:string;approved_cents?:number|null;written_off_cents?:number;decision_reason?:string;decision_on?:string|null;claim_locked?:boolean};
export type RmaFollowup={reception_handoff_at?:string|null;id:string;case_item_id:string;reception_item_id:string;custody:keyof typeof custodyStates;outbound_on:string|null;returned_on:string|null;return_reference:string;repair_state:keyof typeof repairStates;repair_notes:string;repair_parts:string;repair_assignee:string;started_at:string|null;completed_at:string|null;version:number;updated_at:string};
export const repairTerminal=(state:string|undefined)=>['repaired','unrepairable','parts'].includes(state??'');
// These messages are safe for users; database diagnostics and identifiers are never returned.
export const rmaResolutionMessages:Record<string,string>={use_reception:'Verwerk dit artikel via de gewone receptiewerklijst: status, SKU en gebruikte onderdelen worden daar opgeslagen.',fix_status:'De bestaande status RMA to fix ontbreekt of is dubbel geconfigureerd.',refunded:'Een Refunded toestel kan niet opnieuw naar interne RMA-herstelopvolging.',invalid:'Niet opgeslagen. Controleer de bedragen, selectie en datums.',conflict:'Deze gegevens zijn intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.',finalized:'De financiële gegevens van dit dossier zijn definitief afgesloten.',decision_required:'Leg eerst voor elk betrokken artikel de leveranciersbeslissing vast.',decision_invalid:'Controleer de uitkomst en het toegekende bedrag. Gedeeltelijk is groter dan nul en kleiner dan de claim.',reason_required:'Vul de reden of toelichting bij deze leveranciersbeslissing in.',receipt_award:'Ontvangen mag niet hoger zijn dan het toegekende bedrag.',claim_locked:'De oorspronkelijke claim kan na een leveranciersbeslissing niet meer worden gewijzigd.',custody:'Controleer de fysieke toestand en de datums. Toekomstige of tegenstrijdige datums zijn niet toegestaan.',return_required:'Bevestig eerst dat het toestel aanwezig is. Na verzending is een ontvangen retour met datum vereist.',sent_date:'Vul de werkelijke verzenddatum van dit artikel in.',repair_active:'Er bestaat al een actieve herstelopvolging. Controleer de bestaande taak en de fysieke toestand.',repair_transition:'Deze herstelstap is niet mogelijk. Doorloop eerst herstel en eindcontrole.',repair_finalized:'Deze interne herstelopvolging heeft al een definitieve uitkomst.',rejection_required:'Intern herstel kan starten na een weigering of gedeeltelijke vergoeding.',repair_notes:'Beschrijf de werkzaamheden en de reden van het herstelresultaat.',quality_required:'Bevestig een geslaagde eindcontrole en vul gebruikte onderdelen in (- bij geen onderdelen).',writeoff:'Bevestig afzonderlijk dat het nog niet ontvangen toegekende bedrag wordt afgeschreven.',final_fields:'Vul dossierstatus en leveranciers-RMA/referentie in. Een CN-nummer is verplicht bij toegekende of ontvangen vergoeding.'};
export function repairNextStates(state:string){return ({none:['queued'],queued:['queued','working'],working:['working','quality','unrepairable','parts'],quality:['quality','working','repaired','unrepairable','parts'],repaired:[],unrepairable:[],parts:[]} as Record<string,string[]>)[state]??[];}
export function needsInternalFollowup(item:ResolutionItem,followup?:Pick<RmaFollowup,'repair_state'>){return (item.decision==='rejected'||item.decision==='partial'||!!followup&&followup.repair_state!=='none')&&!repairTerminal(followup?.repair_state);}
export function supplierRmaResolutionTotals(items:ResolutionItem[]){
 return items.reduce((sum,item)=>{
  const requested=item.expected_cents??0,award=item.approved_cents??0,writeoff=item.written_off_cents??0;
  sum.expected+=requested;sum.received+=item.received_cents;sum.unknown+=item.expected_cents==null?1:0;
  if(!item.decision||item.decision==='pending'){if(item.case_stage==='handled')sum.historicalUnknown+=requested;else sum.pending+=requested;sum.pendingCount++;}
  else{sum.approved+=award;sum.outstanding+=Math.max(0,award-item.received_cents-writeoff);if(['partial','rejected'].includes(item.decision))sum.rejected+=Math.max(0,requested-award);}
  sum.writtenOff+=writeoff;return sum;
 },{expected:0,received:0,approved:0,rejected:0,pending:0,pendingCount:0,outstanding:0,writtenOff:0,historicalUnknown:0,unknown:0});
}
export function requiresSupplierCreditNote(items:ResolutionItem[]){return items.some(item=>(item.approved_cents??0)>0||item.received_cents>0);}

// Device counts are unique; monetary totals remain per claim/dossier line.
// A rejected item can later be internally repaired, so categories intentionally overlap.
export function buildSupplierRmaOutcomes(items:(ResolutionItem&{id:string;case_id:string;reception_item_id:string})[],followups:Pick<RmaFollowup,'case_item_id'|'repair_state'>[],sources:{id:string;reception_id:string}[],receptions:{id:string;supplier_id:string|null;supplier:string|null}[],selectedItemIds:string[]){
 const included=new Set(selectedItemIds),sourceById=new Map(sources.map(r=>[r.id,r])),receptionById=new Map(receptions.map(r=>[r.id,r])),followupByLine=new Map(followups.map(r=>[r.case_item_id,r]));
 function blank(){return{rejected:new Set<string>(),partial:new Set<string>(),refunded:new Set<string>(),supplierRepaired:new Set<string>(),internallyRepaired:new Set<string>(),unrepairable:new Set<string>(),parts:new Set<string>(),openRepair:new Set<string>(),known:new Set<string>(),lines:[] as ResolutionItem[]};}
 const all=blank(),groups=new Map<string,ReturnType<typeof blank>&{key:string;name:string}>();
 for(const line of items){
  if(!included.has(line.reception_item_id))continue;
  const source=sourceById.get(line.reception_item_id),reception=source?receptionById.get(source.reception_id):undefined;if(!reception)continue;
  const key=reception.supplier_id?'id:'+reception.supplier_id:'name:'+(reception.supplier??'').trim().toLowerCase();
  const group=groups.get(key)??{...blank(),key,name:reception.supplier||'Onbekende leverancier'};groups.set(key,group);
  for(const target of [all,group]){
   const id=line.reception_item_id,followup=followupByLine.get(line.id);target.lines.push(line);
   if(line.decision&&line.decision!=='pending')target.known.add(id);
   if(line.decision==='rejected')target.rejected.add(id);
   if(line.decision==='partial'){target.partial.add(id);target.rejected.add(id);}
   if(line.received_cents>0)target.refunded.add(id);
   if(line.decision==='repaired')target.supplierRepaired.add(id);
   if(followup?.repair_state==='repaired')target.internallyRepaired.add(id);
   if(followup?.repair_state==='unrepairable')target.unrepairable.add(id);
   if(followup?.repair_state==='parts')target.parts.add(id);
   if(needsInternalFollowup(line,followup))target.openRepair.add(id);
  }
 }
 function summary(row:ReturnType<typeof blank>){return{known:row.known.size,rejected:row.rejected.size,partial:row.partial.size,refunded:row.refunded.size,supplierRepaired:row.supplierRepaired.size,internallyRepaired:row.internallyRepaired.size,unrepairable:row.unrepairable.size,parts:row.parts.size,openRepair:row.openRepair.size,financial:supplierRmaResolutionTotals(row.lines)};}
 return{totals:summary(all),suppliers:Array.from(groups.values(),row=>({key:row.key,name:row.name,...summary(row)})).sort((a,b)=>a.name.localeCompare(b.name,'nl'))};
}
