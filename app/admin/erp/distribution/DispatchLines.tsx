'use client';
import Link from 'next/link';
import {useState} from 'react';
import {workCompare,workMatches,type DistributionLine,type WorkSort} from '@/lib/erpDistribution';
import CopyCode from '../CopyCode';
import SortHeader from './SortHeader';
export default function DispatchLines({lines}:{lines:DistributionLine[]}){
 const [q,setQ]=useState(''),[sort,setSort]=useState<WorkSort>({key:'SKU',direction:'asc'});
 const value=(l:DistributionLine,key:string)=>key==='SKU'?l.sku:key==='Aantal'?l.quantity:[l.title,l.model].join(' ');
 const ordered=[...lines].sort((a,b)=>workCompare(value(a,sort.key),value(b,sort.key),sort.direction)||a.sku.localeCompare(b.sku)),matches=(l:DistributionLine)=>workMatches([l.sku,l.title,l.model],q);
 return <><div className="distribution-filters distribution-no-print"><label>Zoek in artikelen<input value={q} maxLength={200} onChange={e=>setQ(e.target.value)} placeholder="SKU, omschrijving of model…"/></label><span>{ordered.filter(matches).length} van {lines.length} SKU’s</span><small>Printen en CSV behouden de volledige lijst.</small></div><div className="distribution-table"><table><thead><tr><th>Controle</th>{['SKU','Artikel / model','Aantal'].map(key=><SortHeader key={key} label={key} field={key} sort={sort} onChange={k=>setSort({key:k,direction:sort.key===k&&sort.direction==='asc'?'desc':'asc'})}/>)}</tr></thead><tbody>{ordered.map(l=><tr key={l.article_id} className={!matches(l)?'distribution-filtered-out':undefined}><td>☐</td><td><CopyCode value={l.sku}/></td><td><Link href={'/admin/erp/articles/'+l.article_id}>{l.title}</Link><small>{l.model}</small></td><td><strong>{l.quantity}</strong></td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Totaal · {lines.length} SKU’s</th><th>{lines.reduce((s,l)=>s+l.quantity,0)} stuks</th></tr></tfoot></table></div></>;
}
