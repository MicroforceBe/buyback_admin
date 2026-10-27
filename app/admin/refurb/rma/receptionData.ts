import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
export type ReceptionRmaCase = { id:string; code:string; stage:string; supplier_reference:string; reception_id:string|null };
export type ReceptionRmaLink = { reception_item_id:string; case_id:string; active:boolean; decision?:string; dossier:ReceptionRmaCase };
export async function loadReceptionRmaLinks(receptionId:string,itemIds:string[]) {
  async function batches<T>(table:string,columns:string,key:string,ids:string[]):Promise<T[]> {
    const rows:T[]=[];
    for(let start=0;start<ids.length;start+=100){for(let offset=0;;offset+=1000){
      const {data,error}=await supabaseAdmin.from(table).select(columns).in(key,ids.slice(start,start+100)).order('id',{ascending:true}).range(offset,offset+999);
      if(error)throw Error('RMA links unavailable');
      rows.push(...(data??[]) as T[]);if((data??[]).length<1000)break;
    }}return rows;
  }
  const linked=await batches<{reception_item_id:string;case_id:string;active:boolean;decision:string}>('supplier_rma_items','id,reception_item_id,case_id,active,decision','reception_item_id',itemIds);
  const columns='id,code,stage,supplier_reference,reception_id';
  const [historical,scoped]=await Promise.all([
    batches<ReceptionRmaCase>('supplier_rma_cases',columns,'id',[...new Set(linked.map(row=>row.case_id))]),
    batches<ReceptionRmaCase>('supplier_rma_cases',columns,'reception_id',[receptionId]),
  ]);
  const cases=[...new Map([...historical,...scoped].map(row=>[row.id,row])).values()];
  const byId=new Map(cases.map(row=>[row.id,row]));
  if(linked.some(row=>!byId.has(row.case_id)))throw Error('RMA links incomplete');
  return {cases,links:linked.map(row=>({...row,dossier:byId.get(row.case_id)!}))};
}

