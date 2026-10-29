import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {parseDistributionRules,type DistributionArticle,type DistributionList} from '@/lib/erpDistribution';
export async function distributionData(){
 const [config,open,archived]=await Promise.all([
  supabaseAdmin.from('erp_distribution_rules').select('rules,version,updated_at').eq('id',true).single(),
  readOpenLists(),
  supabaseAdmin.from('erp_distribution_lists').select('id,code,source,destination,state,version,lines,notes,created_by,created_at,archived_at').eq('state','archived').order('created_at',{ascending:false}).limit(30)
 ]);
 if(config.error||archived.error||!config.data)throw Error('Gegevens konden niet volledig geladen worden.');
 return {rules:parseDistributionRules(config.data.rules),version:config.data.version,lists:[...open,...(archived.data??[]) as DistributionList[]]};
}
async function readOpenLists(){
 const rows:DistributionList[]=[];
 for(let start=0;;start+=500){const {data,error}=await supabaseAdmin.from('erp_distribution_lists').select('id,code,source,destination,state,version,lines,notes,created_by,created_at,archived_at').eq('state','open').order('id').range(start,start+499);if(error)throw Error('Verzendlijsten konden niet geladen worden.');rows.push(...(data??[]) as DistributionList[]);if(!data||data.length<500)return rows;}
}
export async function distributionArticles(){
 const rows:DistributionArticle[]=[];
 for(let start=0;;start+=500){
  const {data,error}=await supabaseAdmin.from('erp_article_classified').select('id,sku,ean,title,recognized_model,article_group_name,article_subgroup_name,active,stock_gentbrugge,stock_oudenaarde,stock_antwerpen,source_updated_at').eq('missing_from_erp',false).eq('refurbished_product',true).order('id').range(start,start+499);
  if(error)throw Error('Refurbvoorraad kon niet volledig geladen worden.');rows.push(...(data??[]) as DistributionArticle[]);
  if(!data||data.length<500)return rows;
 }
}
export async function distributionList(id:string){
 const {data,error}=await supabaseAdmin.from('erp_distribution_lists').select('id,code,source,destination,state,version,lines,notes,created_by,created_at,archived_at').eq('id',id).maybeSingle();
 if(error)throw Error('Verzendlijst kon niet geladen worden.');return data as DistributionList|null;
}
