export type WaitingSkuArticle={sku:string;title:string|null;vat_margin:boolean;refurbished_product?:boolean;missing_from_erp?:boolean};
export type WaitingSkuMatch={input:string;sku:string;title:string};
export function normalizeWaitingSku(value:string|null|undefined){return (value||'').trim().replace(/\s+/g,' ').toLowerCase();}
export function isWaitingForSku(status:string|null|undefined,options:Array<{value:string;label?:string|null}>=[]){
 const normalize=(s:string|null|undefined)=>normalizeWaitingSku(s).replace(/[_-]+/g,' ').replace(/\s+/g,' ');
 const value=normalize(status),option=options.find(o=>normalize(o.value)===value||normalize(o.label)===value);
 return value==='waiting for sku'||!!option&&(normalize(option.value)==='waiting for sku'||normalize(option.label)==='waiting for sku');
}
export function buildWaitingSkuIndex(articles:WaitingSkuArticle[]){
 const index=new Map<string,WaitingSkuArticle[]>();
 for(const article of articles){
  if(article.refurbished_product!==true||article.missing_from_erp!==false||typeof article.vat_margin!=='boolean'||!article.sku?.trim())continue;
  for(const input of new Set([normalizeWaitingSku(article.sku),normalizeWaitingSku(article.title)])){
   if(!input)continue;const key=(article.vat_margin?'margin':'normal')+':'+input;
   const rows=index.get(key)||[];rows.push(article);index.set(key,rows);
  }
 }
 return index;
}
export function matchWaitingSku(index:ReturnType<typeof buildWaitingSkuIndex>,input:string|null|undefined,vatScheme:'margin'|'normal'):WaitingSkuMatch|null{
 const text=normalizeWaitingSku(input);if(!text)return null;
 const rows=index.get(vatScheme+':'+text)||[];
 // Multiple exact-title candidates are still available; show all codes in the tooltip.
 if(!rows.length)return null;
 const exact=rows.find(r=>normalizeWaitingSku(r.sku)===text)||rows[0];
 return {input:input||'',sku:[...new Set(rows.map(r=>r.sku))].sort().join(', '),title:exact.title||exact.sku};
}

