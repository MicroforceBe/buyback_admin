import LocalDate from '@/app/admin/LocalDate';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requirePageAccess} from '@/lib/security/access';
import {hasPermission} from '@/lib/adminPermissions';
import {distributionLocations} from '@/lib/erpDistribution';
import {distributionList} from '../data';
import ListControls from '../ListControls';
import DispatchLines from '../DispatchLines';
import '../distribution.css';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function DistributionListPage({params}:{params:Promise<{id:string}>}){
 const user = await requirePageAccess('erp',false);
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 let list;try{list=await distributionList(id);}catch{return <p role="alert">De verzendlijst kon niet geladen worden.</p>;}if(!list)notFound();
 return <div className="distribution-detail"><Link className="distribution-no-print" href="/admin/erp/distribution#verzendlijsten">← Voorraadverdeling</Link><div className="distribution-print"><header><small>MICROFORCE / LOGISTIEK · {list.state==='open'?'OPEN PLANNING':'GEARCHIVEERD'}</small><h1>{list.code}</h1><h2>{distributionLocations[list.source]} → {distributionLocations[list.destination]}</h2><p>{<LocalDate value={list.created_at} withTime timeZone="Europe/Brussels"/>} · {list.created_by}</p></header><p>Verzendlijst op basis van de ERP-voorraad bij aanmaak. Controleer fysieke beschikbaarheid vóór verzending. Deze lijst past geen voorraad aan.</p>{list.notes&&<p className="distribution-notice">{list.notes}</p>}<DispatchLines lines={list.lines}/><p className="distribution-signature">Gecontroleerd door: _______________________ Datum: ______________</p></div><ListControls list={list} canWrite={hasPermission(user,'erp','write')}/></div>;
}
