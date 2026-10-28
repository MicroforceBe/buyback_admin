import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {uuidPattern} from '@/lib/erpArticleProfile';
import type {StockArticle} from '@/lib/erpStock';
export async function stockArticles(params:Record<string,string>):Promise<StockArticle[]>{
 const rows:StockArticle[]=[];
 // Read every matching SKU, not just the first Data API page. Never return partial totals on failure.
 for(let start=0;;start+=500){
  let q=supabaseAdmin.from('erp_article_classified').select('id,article_group_id,article_group_name,article_subgroup_id,article_subgroup_name,recognized_model,inventory_qty,stock_gentbrugge,stock_oudenaarde,stock_antwerpen').eq('missing_from_erp',false);
  if(params.status!=='all')q=q.eq('active',params.status!=='inactive');
  if(uuidPattern.test(params.group||''))q=q.eq('article_group_id',params.group);
  if(uuidPattern.test(params.subgroup||''))q=q.eq('article_subgroup_id',params.subgroup);
  const {data,error}=await q.order('id',{ascending:true}).range(start,start+499);
  if(error)throw Error('Voorraad kon niet volledig worden geladen. Probeer opnieuw.');
  rows.push(...(data??[]) as StockArticle[]);
  if(!data||data.length<500)return rows;
 }
}
