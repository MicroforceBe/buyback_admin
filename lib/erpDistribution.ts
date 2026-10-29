export const distributionLocations={gentbrugge:'Gentbrugge',oudenaarde:'Oudenaarde',antwerpen:'Antwerpen'} as const;
export type DistributionLocation=keyof typeof distributionLocations;
export type DistributionArticle={id:string;sku:string;ean:string|null;title:string|null;recognized_model:string|null;article_group_name:string|null;article_subgroup_name:string|null;active:boolean;stock_gentbrugge:number|null;stock_oudenaarde:number|null;stock_antwerpen:number|null;source_updated_at:string|null};
export type DistributionRules={article_group_id?:string|null;keep_empty:number;keep_stock:number;overrides:{sku:string;location:DistributionLocation;keep_empty:number;keep_stock:number;enabled:boolean}[]};
export type DistributionLine={article_id:string;sku:string;title:string;model:string|null;quantity:number;stock:number;source_updated_at:string|null};
export type DistributionList={id:string;code:string;source:DistributionLocation;destination:DistributionLocation;state:'open'|'archived';version:number;lines:DistributionLine[];notes:string;created_by:string;created_at:string;archived_at:string|null};
export const defaultDistributionRules:DistributionRules={keep_empty:1,keep_stock:3,overrides:[]};
export function parseDistributionRules(raw:unknown):DistributionRules{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Regels ontbreken.');
 const r=raw as DistributionRules,n=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=10000;
 if(!n(r.keep_empty)||!n(r.keep_stock)||!Array.isArray(r.overrides)||r.overrides.length>200)throw Error('Controleer de bewaaraantallen (0–10000).');
 if(r.article_group_id!=null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.article_group_id))throw Error('Kies een geldige artikelgroep.');
 const seen=new Set<string>();const overrides=r.overrides.map(o=>{
  if(!o||typeof o.sku!=='string'||!o.sku.trim()||o.sku.length>100||!Object.hasOwn(distributionLocations,o.location)||o.location==='gentbrugge'||!n(o.keep_empty)||!n(o.keep_stock)||typeof o.enabled!=='boolean')throw Error('Controleer de SKU-uitzonderingen.');
  const key=o.location+':'+o.sku.trim();if(seen.has(key))throw Error('Een SKU heeft meer dan één regel voor dezelfde winkel.');seen.add(key);
  return {...o,sku:o.sku.trim()};
 });return {article_group_id:r.article_group_id??null,keep_empty:r.keep_empty,keep_stock:r.keep_stock,overrides};
}
export const distributionStock=(a:DistributionArticle,l:DistributionLocation)=>a[('stock_'+l) as 'stock_gentbrugge'|'stock_oudenaarde'|'stock_antwerpen'];
export function distributionSuggestions(articles:DistributionArticle[],lists:DistributionList[],rules:DistributionRules){
 const reserved=new Map<string,number>();
 for(const list of lists)if(list.state==='open')for(const line of list.lines){const key=list.source+':'+line.article_id;reserved.set(key,(reserved.get(key)||0)+line.quantity);}
 const known=(n:number|null):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 const modelHub=new Map<string,number|null>();
 for(const a of articles)if(a.recognized_model){const key=JSON.stringify([a.article_group_name,a.article_subgroup_name,a.recognized_model]);const current=modelHub.get(key);modelHub.set(key,!known(a.stock_gentbrugge)||current===null?null:(current||0)+a.stock_gentbrugge);}
 return articles.flatMap(a=>(Object.keys(distributionLocations) as DistributionLocation[]).map(source=>{
  const stock=distributionStock(a,source),planned=reserved.get(source+':'+a.id)||0,available=known(stock)?Math.max(0,stock-planned):0;
  const override=rules.overrides.find(o=>o.sku===a.sku&&o.location===source),keep=a.stock_gentbrugge===0?(override?.keep_empty??rules.keep_empty):(override?.keep_stock??rules.keep_stock);
  const recommended=source!=='gentbrugge'&&known(a.stock_gentbrugge)&&known(stock)&&override?.enabled!==false?Math.max(0,available-keep):0;
  const missing=source!=='gentbrugge'&&a.stock_gentbrugge===0&&available>0;
  const modelKey=JSON.stringify([a.article_group_name,a.article_subgroup_name,a.recognized_model]);
  return {article:a,source,stock,planned,available,keep,recommended,missing,modelMissing:!!a.recognized_model&&modelHub.get(modelKey)===0,unknown:!known(stock)||!known(a.stock_gentbrugge),disabled:override?.enabled===false,
   reason:recommended>0?(a.stock_gentbrugge===0?'SKU ontbreekt in Gentbrugge; winkel behoudt '+keep:'SKU aanwezig in Gentbrugge; winkel behoudt '+keep):missing?'SKU ontbreekt in Gentbrugge; handmatig beoordelen':'Handmatige keuze'};
 })).filter(row=>row.available>0||row.unknown);
}

export function distributionSourceRows<T extends {source:DistributionLocation}>(rows:T[],source:DistributionLocation|'all'){return rows.filter(r=>source==='all'?r.source!=='gentbrugge':r.source===source);}
