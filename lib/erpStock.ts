export const stockColumns=['inventory_qty','stock_gentbrugge','stock_oudenaarde','stock_antwerpen'] as const;
export type StockColumn=typeof stockColumns[number];
export type StockArticle={id:string;article_group_id:string|null;article_group_name:string|null;article_subgroup_id:string|null;article_subgroup_name:string|null;recognized_model:string|null}&Record<StockColumn,number|null>;
export type StockTotal={value:number|null;missing:number};
export type StockRow={groupId:string|null;groupName:string;subgroupId:string|null;subgroupName:string;model:string|null;articles:number;totals:Record<StockColumn,StockTotal>};
export function stockTotals(rows:StockArticle[]):Record<StockColumn,StockTotal>{
 return Object.fromEntries(stockColumns.map(column=>{let value:number|null=rows.length?null:0,missing=0;for(const row of rows){const n=row[column];if(typeof n==='number'&&Number.isFinite(n))value=(value??0)+n;else missing++;}return [column,{value,missing}];})) as Record<StockColumn,StockTotal>;
}
export function summarizeStock(articles:StockArticle[],includeEmpty=false):StockRow[]{
 const buckets=new Map<string,StockArticle[]>();
 for(const article of articles){const key=JSON.stringify([article.article_group_id,article.article_subgroup_id,article.recognized_model||null]);const bucket=buckets.get(key)??[];bucket.push(article);buckets.set(key,bucket);}
 return [...buckets.values()].map(rows=>{const a=rows[0];return {groupId:a.article_group_id,groupName:a.article_group_name||'Nog in te delen',subgroupId:a.article_subgroup_id,subgroupName:a.article_subgroup_name||'Zonder subgroep',model:a.recognized_model||null,articles:rows.length,totals:stockTotals(rows)};}).filter(row=>includeEmpty||stockColumns.some(c=>row.totals[c].missing>0||row.totals[c].value!==null&&row.totals[c].value!==0)).sort((a,b)=>a.groupName.localeCompare(b.groupName,'nl')||a.subgroupName.localeCompare(b.subgroupName,'nl')||(a.model||'').localeCompare(b.model||'','nl',{numeric:true}));
}
export function stockArticleHref(row:StockRow,status:string,location?:StockColumn){
 const p=new URLSearchParams({status,source:'',area:row.groupId?'all':'unclassified'});
 if(row.groupId)p.set('group',row.groupId);
 if(row.subgroupId)p.set('subgroup',row.subgroupId);else p.set('subgroupState','none');
 if(row.model)p.set('model',row.model);else p.set('modelState','unknown');
 if(location&&location!=='inventory_qty')p.set('location',location.replace('stock_',''));
 return '/admin/erp/articles?'+p;
}
