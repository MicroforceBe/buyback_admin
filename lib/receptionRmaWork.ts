export type ReceptionRmaWork = { reception_item_id:string; case_id:string; case_item_id:string; code:string; status:string; label:string; note:string; repair_state:string; custody:string };
type Status={value:string;label:string|null};
const norm=(value:string|null|undefined)=>(value||'').trim().toLowerCase();
export function receptionRmaFixStatus(options:Status[]){
 const matches=options.filter(s=>norm(s.label)==='rma to fix'||norm(s.value)==='rma to fix');
 if(matches.length!==1)throw Error('De bestaande status RMA to fix ontbreekt of is dubbel geconfigureerd.');
 return matches[0];
}
export const isReceptionRmaWorkStatus=(value:string,options:Status[])=>options.some(s=>(norm(s.label)==='rma to fix'||norm(s.value)==='rma to fix')&&(norm(s.value)===norm(value)||norm(s.label)===norm(value)));
type Line={id:string;case_id:string;reception_item_id:string;decision:string};
type Followup={case_item_id:string;custody:string;repair_state:string};
type Case={id:string;code:string;created_at:string};
// Operational work status only. Never rewrite the original device or ERP booking.
export function buildReceptionRmaWork(lines:Line[],followups:Followup[],cases:Case[],sources:{id:string;refurb_status:string|null}[]=[],options:Status[]=[]):ReceptionRmaWork[]{
 const sourceById=new Map(sources.map(s=>[s.id,s]));
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
  const fix=present?receptionRmaFixStatus(options):undefined;
  const status=fix?.value||sourceById.get(line.reception_item_id)?.refurb_status||'';
  const label=fix?.label||options.find(s=>norm(s.value)===norm(status))?.label||status;
  const note=!present?(custody==='unknown'?'Aanwezigheid nog te bevestigen':'Wacht op retour'):state==='working'?'Intern herstel bezig':state==='quality'?'Eindcontrole':'Te herstellen';
  work.push({reception_item_id:line.reception_item_id,case_id:line.case_id,case_item_id:line.id,code:byCase.get(line.case_id)!.code,status,label,note,repair_state:state,custody});
 }
 return work;
}
