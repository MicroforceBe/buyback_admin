'use client';
import {Fragment,useState} from 'react';
import type {OpenReceptionGroup} from '@/lib/receptionOpenSummary';
type SortKey='model'|'count'|'purchaseCents';
const money=(cents:number)=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(cents/100);
export default function OpenReceptionModels({rows}:{rows:OpenReceptionGroup[]}){
 const [q,setQ]=useState(''),[status,setStatus]=useState(''),[sort,setSort]=useState<SortKey>('count'),[asc,setAsc]=useState(false),[expanded,setExpanded]=useState<Set<string>>(new Set());
 const statuses=Array.from(new Map(rows.map(r=>[r.status,r.label])).entries()).sort((a,b)=>a[1].localeCompare(b[1],'nl'));
 const words=q.toLocaleLowerCase('nl-BE').trim().split(/\s+/).filter(Boolean);
 const filtered=rows.filter(r=>(!status||r.status===status)&&words.every(w=>(r.model+' '+r.label).toLocaleLowerCase('nl-BE').includes(w)));
 const grouped=new Map<string,{model:string;count:number;purchaseCents:number;missingPrices:number;rows:OpenReceptionGroup[]}>();
 for(const row of filtered){const model=grouped.get(row.model)||{model:row.model,count:0,purchaseCents:0,missingPrices:0,rows:[]};model.count+=row.count;model.purchaseCents+=row.purchaseCents;model.missingPrices+=row.missingPrices;model.rows.push(row);grouped.set(row.model,model);}
 const models=Array.from(grouped.values()).sort((a,b)=>(asc?1:-1)*(sort==='model'?a.model.localeCompare(b.model,'nl',{numeric:true}):a[sort]-b[sort])||a.model.localeCompare(b.model,'nl'));
 const total=filtered.reduce((sum,r)=>({count:sum.count+r.count,cents:sum.cents+r.purchaseCents,missing:sum.missing+r.missingPrices}),{count:0,cents:0,missing:0});
 function changeSort(key:SortKey){if(sort===key)setAsc(!asc);else{setSort(key);setAsc(key==='model');}}
 return <section className="reception-open-models"><div className="reception-open-toolbar"><h3>Openstaande artikelen per model</h3><label><span className="sr-only">Zoek model of status</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoek model of status…" maxLength={200}/></label><label><span className="sr-only">Filter status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Alle statussen</option>{statuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
 <div className="reception-open-table"><table><caption className="sr-only">Openstaande artikelen: klik op een model voor de uitsplitsing per status. Bedragen zijn aankoopwaarden.</caption><thead><tr>{([{key:'model',label:'Model'},{key:'count',label:'Aantal open'},{key:'purchaseCents',label:'Aankoopwaarde'}] as const).map(col=><th key={col.key} scope="col" aria-sort={sort===col.key?(asc?'ascending':'descending'):'none'}><button type="button" onClick={()=>changeSort(col.key)}>{col.label} <span aria-hidden="true">{sort===col.key?(asc?'↑':'↓'):'↕'}</span></button></th>)}</tr></thead>
 <tbody>{models.map(model=><Fragment key={model.model}><tr><th scope="row"><button className="reception-open-expand" type="button" aria-expanded={expanded.has(model.model)} onClick={()=>setExpanded(previous=>{const next=new Set(previous);if(next.has(model.model))next.delete(model.model);else next.add(model.model);return next;})}><span aria-hidden="true">{expanded.has(model.model)?'▾':'▸'}</span> {model.model}</button></th><td>{model.count}</td><td>{money(model.purchaseCents)}{model.missingPrices>0&&<span title={model.missingPrices+' aankoopprijzen ontbreken'}> *</span>}</td></tr>
 {expanded.has(model.model)&&model.rows.map(row=><tr className="reception-open-status-row" key={row.status}><th scope="row">{row.label}</th><td>{row.count}</td><td>{money(row.purchaseCents)}{row.missingPrices>0&&<span title={row.missingPrices+' aankoopprijzen ontbreken'}> *</span>}</td></tr>)}</Fragment>)}</tbody>
 <tfoot><tr><th scope="row">Totaal getoond</th><td>{total.count}</td><td>{money(total.cents)}{total.missing>0?' *':''}</td></tr></tfoot></table></div>
 {!models.length&&<p>Geen openstaande artikelen voor deze selectie.</p>}
 {total.missing>0&&<p>* Voor {total.missing} artikelen ontbreekt de aankoopprijs; deze bedragen zijn niet in het totaal opgenomen.</p>}
 </section>;
}
