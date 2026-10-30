export type OpenReceptionModel={id:string;name:string;search_keywords:string|null};
export type OpenReceptionItem={description:string|null;price_cents:number|null;status:string;label:string};
export type OpenReceptionGroup={model:string;status:string;label:string;count:number;purchaseCents:number;missingPrices:number};
export type OpenReceptionSummary={count:number;purchaseCents:number;missingPrices:number;groups:OpenReceptionGroup[]};
export function buildOpenReceptionSummary(items:OpenReceptionItem[],models:OpenReceptionModel[],modelsAvailable=true):OpenReceptionSummary{
 const ordered=[...models].sort((a,b)=>a.name.localeCompare(b.name,'nl'));
 const matchers=ordered.map(m=>({name:m.name,words:(m.search_keywords||'').toLowerCase().split(',').map(w=>w.trim()).filter(Boolean)}));
 const groups=new Map<string,OpenReceptionGroup>();
 for(const item of items){
  const desc=(item.description||'').trim().toLowerCase();
  const model=!modelsAvailable?'Model niet beschikbaar':matchers.find(m=>m.words.some(w=>desc.includes(w)))?.name||'Niet herkend';
  const key=JSON.stringify([model,item.status]),row=groups.get(key)||{model,status:item.status,label:item.label||'Geen status',count:0,purchaseCents:0,missingPrices:0};
  row.count++;if(typeof item.price_cents==='number'&&Number.isSafeInteger(item.price_cents))row.purchaseCents+=item.price_cents;else row.missingPrices++;
  groups.set(key,row);
 }
 return mergeOpenReceptionSummaries([{groups:Array.from(groups.values())}]);
}
export function mergeOpenReceptionSummaries(summaries:{groups:OpenReceptionGroup[]}[]):OpenReceptionSummary{
 const groups=new Map<string,OpenReceptionGroup>();let count=0,purchaseCents=0,missingPrices=0;
 for(const summary of summaries)for(const item of summary.groups){
  const key=JSON.stringify([item.model,item.status]),row=groups.get(key)||{...item,count:0,purchaseCents:0,missingPrices:0};
  row.count+=item.count;row.purchaseCents+=item.purchaseCents;row.missingPrices+=item.missingPrices;groups.set(key,row);
  count+=item.count;purchaseCents+=item.purchaseCents;missingPrices+=item.missingPrices;
 }
 return {count,purchaseCents,missingPrices,groups:Array.from(groups.values()).sort((a,b)=>a.model.localeCompare(b.model,'nl')||a.label.localeCompare(b.label,'nl'))};
}
