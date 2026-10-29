import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requirePageAccess} from '@/lib/security/access';
import {hasPermission} from '@/lib/adminPermissions';
import {distributionLocations} from '@/lib/erpDistribution';
import {distributionList} from '../data';
import ListControls from '../ListControls';
import CopyCode from '../../CopyCode';
import '../distribution.css';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function DistributionListPage({params}:{params:Promise<{id:string}>}){
 const user = await requirePageAccess('erp',false);
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 let list;try{list=await distributionList(id);}catch{return <p role="alert">De verzendlijst kon niet geladen worden.</p>;}if(!list)notFound();
 return <div className="distribution-detail"><Link className="distribution-no-print" href="/admin/erp/distribution#verzendlijsten">← Voorraadverdeling</Link><div className="distribution-print"><header><small>MICROFORCE / LOGISTIEK · {list.state==='open'?'OPEN PLANNING':'GEARCHIVEERD'}</small><h1>{list.code}</h1><h2>{distributionLocations[list.source]} → {distributionLocations[list.destination]}</h2><p>{new Date(list.created_at).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'})} · {list.created_by}</p></header><p>Verzendlijst op basis van de ERP-voorraad bij aanmaak. Controleer fysieke beschikbaarheid vóór verzending. Deze lijst past geen voorraad aan.</p>{list.notes&&<p className="distribution-notice">{list.notes}</p>}<div className="distribution-table"><table><thead><tr><th>Controle</th><th>SKU</th><th>Artikel / model</th><th>Aantal</th></tr></thead><tbody>{list.lines.map(l=><tr key={l.article_id}><td>☐</td><td><CopyCode value={l.sku}/></td><td><Link href={'/admin/erp/articles/'+l.article_id}>{l.title}</Link><small>{l.model}</small></td><td><strong>{l.quantity}</strong></td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Totaal · {list.lines.length} SKU’s</th><th>{list.lines.reduce((s,l)=>s+l.quantity,0)} stuks</th></tr></tfoot></table></div><p className="distribution-signature">Gecontroleerd door: _______________________ Datum: ______________</p></div><ListControls list={list} canWrite={hasPermission(user,'erp','write')}/></div>;
}
