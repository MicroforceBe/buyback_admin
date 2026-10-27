import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {buildReceptionRmaWork} from '@/lib/receptionRmaWork';
export async function loadReceptionRmaWork(itemIds?:string[]){
 async function all<T>(table:string,columns:string,ids?:string[],key='id'):Promise<T[]>{
  const rows:T[]=[];const groups=ids?Array.from({length:Math.ceil(ids.length/100)},(_,i)=>ids.slice(i*100,i*100+100)):[undefined];
  for(const group of groups)for(let start=0;;start+=1000){let query=supabaseAdmin.from(table).select(columns).order('id',{ascending:true});if(group)query=query.in(key,group);const{data,error}=await query.range(start,start+999);if(error)throw Error('RMA-werkstatus kon niet geladen worden.');rows.push(...(data??[]) as T[]);if((data??[]).length<1000)break;}
  return rows;
 }
 const lines=await all<{id:string;case_id:string;reception_item_id:string;decision:string}>('supplier_rma_items','id,case_id,reception_item_id,decision',itemIds,'reception_item_id');
 if(!lines.length)return [];
 const [followups,cases,sources]=await Promise.all([
  all<{case_item_id:string;custody:string;repair_state:string}>('supplier_rma_followups','id,case_item_id,custody,repair_state',lines.map(l=>l.id),'case_item_id'),
  all<{id:string;code:string;created_at:string}>('supplier_rma_cases','id,code,created_at',[...new Set(lines.map(l=>l.case_id))]),
  all<{id:string;refurb_status:string|null}>('refurb_reception_items','id,refurb_status',[...new Set(lines.map(l=>l.reception_item_id))]),
 ]);
 return buildReceptionRmaWork(lines,followups,cases,sources);
}
