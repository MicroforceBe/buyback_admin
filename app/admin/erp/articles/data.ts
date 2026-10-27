import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {erpSearchFilter,articleArea} from '@/lib/erpArticleProfile';
import {parseSkuSearch,escapeSkuSearchPattern} from '@/lib/skuSearch';
export const PAGE_SIZE=50;
function articleQuery(params:Record<string,string>){
 let q=supabaseAdmin.from('erp_article_overview').select('*',{count:'exact'});
 const area=articleArea(params.area??'all');
 if(area==='core')q=q.eq('core_assortment',true).or('refurbished_product.eq.false,refurbished_product.is.null');
 else if(area!=='all')q=q.eq('management_group',area);
 if(params.source==='missing')q=q.eq('missing_from_erp',true);
 else if(params.source!=='all')q=q.eq('missing_from_erp',false);
 const words=parseSkuSearch(params.q??'');
 for(const word of words.included)q=q.or(erpSearchFilter(word));
 for(const word of words.excluded)q=q.not('title','ilike',`%${escapeSkuSearchPattern(word)}%`);
 if(params.status==='inactive')q=q.eq('active',false);else if(params.status!=='all')q=q.eq('active',true);
 if(['3','4','5'].includes(params.grade))q=q.ilike('source_title',`%${params.grade}*%`);
 if(params.stock==='in_stock')q=q.gt('inventory_qty',0);if(params.stock==='out_of_stock')q=q.lte('inventory_qty',0);
 if(params.refurbished==='yes')q=q.eq('refurbished_product',true);if(params.refurbished==='no')q=q.eq('refurbished_product',false);
 if(params.vat==='margin')q=q.eq('vat_margin',true);if(params.vat==='normal')q=q.eq('vat_margin',false);
 if(params.core==='yes')q=q.eq('core_assortment',true);if(params.core==='no')q=q.or('core_assortment.eq.false,core_assortment.is.null');
 const locations=['gentbrugge','oudenaarde','antwerpen'];
 if(locations.includes(params.location))q=q.gt(`stock_${params.location}`,0);
 if(locations.includes(params.missingCoreLocation))q=q.eq('core_assortment',true).lte(`stock_${params.missingCoreLocation}`,0);
 for(const [field,operator]of [['minPrice','gte'],['maxPrice','lte']] as const){const n=Number(params[field]);if(params[field]&&Number.isFinite(n)&&n>=0)q=q[operator]('price_cents',Math.round(n*100));}
 if(['device','part','service','accessory','other'].includes(params.type))q=q.eq('product_type',params.type);
 if(params.profile==='yes')q=q.gt('profile_version',0);if(params.profile==='no')q=q.eq('profile_version',0);
 return q;
}
export async function coreSummary(params:Record<string,string>){
 const base={...params,area:'core',missingCoreLocation:''};
 const rows=await Promise.all(['','gentbrugge','oudenaarde','antwerpen'].map(async location=>{let q=articleQuery(base);if(location)q=q.lte('stock_'+location,0);const {count,error}=await q.limit(0);return {count:count??0,error:!!error};}));
 return {total:rows[0].count,gentbrugge:rows[1].count,oudenaarde:rows[2].count,antwerpen:rows[3].count,error:rows.some(r=>r.error)};
}
export async function listArticles(params:Record<string,string>,page:number){
 const q=articleQuery(params);
 const sorts:Record<string,[string,boolean]>={sku:['sku',true],title:['title',true],price:['price_cents',true],stock:['inventory_qty',false],recent:['profile_updated_at',false]};
 const [sort,ascending]=sorts[params.sort]??sorts.sku;
 const {data,error,count}=await q.order(sort,{ascending,nullsFirst:false}).order('id',{ascending:true}).range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1);
 return {articles:data??[],count:count??0,error:!!error};
}
export async function articleDetail(id:string){
 const [source,profile,history]=await Promise.all([
  supabaseAdmin.from('erp_articles').select('id,sku,title,ean,description,brand,model,capacity_gb,color,category,condition_grade,active,published,refurbished_product,vat_margin,inventory_qty,stock_gentbrugge,stock_oudenaarde,stock_antwerpen,price_cents,compare_price_cents,core_assortment,missing_from_erp,missing_from_erp_at,updated_at').eq('id',id).maybeSingle(),
  supabaseAdmin.from('erp_article_profiles').select('display_name,ean,description,brand,model,capacity_gb,color,category,product_type,condition_grade,specifications,image_url,notes,version,updated_at').eq('article_id',id).maybeSingle(),
  supabaseAdmin.from('erp_article_profile_history').select('id,version,changed_at,before_data,after_data').eq('article_id',id).order('version',{ascending:false}).limit(20)
 ]);
 return {source:source.data,profile:profile.data,history:history.data??[],error:!!(source.error||profile.error||history.error)};
}
