import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {parseDistributionRules,type DistributionArticle,type DistributionList,type DistributionWish} from '@/lib/erpDistribution';
export async function distributionData(){
 const [config,open,archived,groups,wishes]=await Promise.all([
  supabaseAdmin.from('erp_distribution_rules').select('rules,version,updated_at').eq('id',true).single(),
  readOpenLists(),
  supabaseAdmin.from('erp_distribution_lists').select('id,code,source,destination,state,version,lines,notes,created_by,created_at,archived_at').eq('state','archived').order('created_at',{ascending:false}).limit(30),
  supabaseAdmin.from('erp_article_groups').select('id,name').is('parent_id',null).eq('active',true).order('name'),
  readWishes()
 ]);
 if(config.error||archived.error||groups.error||!config.data)throw Error('Gegevens konden niet volledig geladen worden.');
 return {wishes,groups:groups.data??[],rules:parseDistributionRules(config.data.rules),version:config.data.version,lists:[...open,...(archived.data??[]) as DistributionList[]]};
}
async function readOpenLists(){
 const rows:DistributionList[]=[];
 for(let start=0;;start+=500){const {data,error}=await supabaseAdmin.from('erp_distribution_lists').select('id,code,source,destination,state,version,lines,notes,created_by,created_at,archived_at').eq('state','open').order('id').range(start,start+499);if(error)throw Error('Verzendlijsten konden niet geladen worden.');rows.push(...(data??[]) as DistributionList[]);if(!data||data.length<500)return rows;}
}
export async function distributionArticles(groupId:string|null|undefined){
 if(!groupId)return [];
 // All-zero SKUs cannot contribute to a dispatch proposal or model stock sum.
 // Keep unknown and negative values for existing validation and incomplete-model warnings.
 const rows:DistributionArticle[]=[];
 for(let start=0;;start+=500){
  const {data,error}=await supabaseAdmin.from('erp_article_classified').select('id,sku,ean,title,recognized_model,article_group_name,article_subgroup_name,active,stock_gentbrugge,stock_oudenaarde,stock_antwerpen,source_updated_at').eq('missing_from_erp',false).eq('article_group_id',groupId).or('stock_gentbrugge.neq.0,stock_oudenaarde.neq.0,stock_antwerpen.neq.0,stock_gentbrugge.is.null,stock_oudenaarde.is.null,stock_antwerpen.is.null').order('id').range(start,start+499);
  if(error)throw Error('Refurbvoorraad kon niet volledig geladen worden.');rows.push(...(data??[]) as DistributionArticle[]);
  if(!data||data.length<500)return rows;
 }
}
export async function distributionList(id:string){
 const {data,error}=await supabaseAdmin.from('erp_distribution_lists').select('id,code,source,destination,state,version,lines,notes,created_by,created_at,archived_at').eq('id',id).maybeSingle();
 if(error)throw Error('Verzendlijst kon niet geladen worden.');return data as DistributionList|null;
}

async function readWishes(){
 const rows:DistributionWish[]=[];
 for(let start=0;;start+=500){
  const {data,error}=await supabaseAdmin.from('erp_distribution_wishes').select('id,article_id,sku,title,model,destination,quantity,state,version,notes,created_by,created_at').eq('state','needs_check').order('id').range(start,start+499);
  if(error)throw Error('Gewenste toestellen konden niet volledig geladen worden.');rows.push(...(data??[]) as DistributionWish[]);if(!data||data.length<500)break;
 }
 const archived=await supabaseAdmin.from('erp_distribution_wishes').select('id,article_id,sku,title,model,destination,quantity,state,version,notes,created_by,created_at').eq('state','cancelled').order('created_at',{ascending:false}).limit(30);
 if(archived.error)throw Error('Aanvraakhistoriek kon niet geladen worden.');return [...rows,...(archived.data??[]) as DistributionWish[]];
}
