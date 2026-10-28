import {apiAccess} from '@/lib/security/access';
import {uuidPattern} from '@/lib/erpArticleProfile';
import {countCsv} from '@/lib/stockCounts';
import {countDetail} from '@/app/admin/erp/counts/data';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const denied=await apiAccess(request,'erp','read',false);if(denied)return denied;
 const {id}=await params;if(!uuidPattern.test(id))return new Response('Ongeldige telling.',{status:400});
 try{const {session,lines}=await countDetail(id);if(!session)return new Response('Niet gevonden.',{status:404});if(session.status!=='approved')return new Response('Export is beschikbaar na definitieve goedkeuring.',{status:409});return new Response(countCsv(session,lines),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="Stocktelling-${id.slice(0,8)}.csv"`,'Cache-Control':'private, no-store'}});}catch{return new Response('Export kon niet volledig worden opgebouwd. Probeer opnieuw.',{status:503});}
}
