export type ReceptionRmaWork = { reception_item_id:string; case_id:string; case_item_id:string; code:string; status:string; repair_state:string; custody:string };
export const receptionRmaWorkStatuses = ['RMA to fix','RMA in herstel','RMA eindcontrole','RMA wacht op retour','RMA aanwezigheid bevestigen'];
export const isReceptionRmaWorkStatus=(value:string)=>receptionRmaWorkStatuses.some(s=>s.toLowerCase()===value.trim().toLowerCase());
type Line={id:string;case_id:string;reception_item_id:string;decision:string};
type Followup={case_item_id:string;custody:string;repair_state:string};
type Case={id:string;code:string;created_at:string};
// Operational work status only. Never rewrite the original device or ERP booking.
export function buildReceptionRmaWork(lines:Line[],followups:Followup[],cases:Case[],sources:{id:string;refurb_status:string|null}[]=[]):ReceptionRmaWork[]{
 const refunded=new Set(sources.filter(s=>/(^|[^a-z0-9])refunded([^a-z0-9]|$)/i.test(s.refurb_status||'')).map(s=>s.id));
 const byCase=new Map(cases.map(c=>[c.id,c])),byLine=new Map(followups.map(f=>[f.case_item_id,f]));
 const latest=new Map<string,Line>();
 for(const line of lines){const c=byCase.get(line.case_id);if(!c)continue;const previous=latest.get(line.reception_item_id),p=previous&&byCase.get(previous.case_id);if(!p||c.created_at>p.created_at||(c.created_at===p.created_at&&line.id>(previous?.id||'')))latest.set(line.reception_item_id,line);}
 const work:ReceptionRmaWork[]=[];
 for(const line of latest.values()){
  if(refunded.has(line.reception_item_id))continue;
  const f=byLine.get(line.id),state=f?.repair_state||'none',custody=f?.custody||'unknown';
  if(['repaired','unrepairable','parts'].includes(state))continue;
  if(line.decision!=='rejected'&&!(['queued','working','quality'].includes(state)))continue;
  const present=['on_site','returned'].includes(custody);
  const status=!present?(custody==='unknown'?'RMA aanwezigheid bevestigen':'RMA wacht op retour'):state==='working'?'RMA in herstel':state==='quality'?'RMA eindcontrole':'RMA to fix';
  work.push({reception_item_id:line.reception_item_id,case_id:line.case_id,case_item_id:line.id,code:byCase.get(line.case_id)!.code,status,repair_state:state,custody});
 }
 return work;
}
