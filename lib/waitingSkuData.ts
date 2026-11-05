import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {buildWaitingSkuIndex,matchWaitingSku,isWaitingForSku,type WaitingSkuArticle,type WaitingSkuMatch} from '@/lib/waitingSku';

// Called after the reception page's existing access guard. One paginated catalogue read,
// not a search request per reception or device. Availability means exists, not stock quantity.
export async function loadWaitingSkuMatches(items:Array<{id:string;sku?:string|null;refurb_status?:string|null;vat_scheme:'margin'|'normal'}>,options:Array<{value:string;label?:string|null}>){
 const waiting=items.filter(i=>isWaitingForSku(i.refurb_status,options));
 const matches:Record<string,WaitingSkuMatch>={};
 if(!waiting.some(i=>i.sku?.trim()))return {matches,failed:false};
 const articles:WaitingSkuArticle[]=[];
 for(let offset=0;;offset+=1000){
  const result=await supabaseAdmin.from('erp_articles').select('sku,title,vat_margin,refurbished_product,missing_from_erp').eq('refurbished_product',true).eq('missing_from_erp',false).order('sku',{ascending:true}).range(offset,offset+999);
  if(result.error)return {matches:{},failed:true};
  const rows=(result.data||[]) as WaitingSkuArticle[];articles.push(...rows);if(rows.length<1000)break;
 }
 const index=buildWaitingSkuIndex(articles);
 for(const item of waiting){const match=matchWaitingSku(index,item.sku,item.vat_scheme);if(match)matches[item.id]=match;}
 return {matches,failed:false};
}

