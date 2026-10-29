import Link from 'next/link';
import {requirePageAccess} from '@/lib/security/access';
import {hasPermission} from '@/lib/adminPermissions';
import {distributionLocations} from '@/lib/erpDistribution';
import {distributionArticles,distributionData} from './data';
import Planner from './Planner';
import RulesEditor from './RulesEditor';
import styles from '../erp.module.css';
import './distribution.css';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function DistributionPage(){
 const user = await requirePageAccess('erp',false);
 let articles,data;try{[articles,data]=await Promise.all([distributionArticles(),distributionData()]);}catch{return <div role="alert" className="erp-notice error">Voorraadverdeling kon niet volledig geladen worden. Er worden geen gedeeltelijke voorstellen getoond. Vernieuw de pagina.</div>;}
 const write=hasPermission(user,'erp','write'),oldest=articles.map(a=>a.source_updated_at).filter((v):v is string=>!!v).sort()[0],stale=!oldest||Date.now()-Date.parse(oldest)>45*60*1000;
 return <div className={styles.shell}><header className={styles.hero}><div><div className={styles.eyebrow}>ERP / LOGISTIEK</div><h1>Voorraadverdeling</h1><p>Refurbvoorraad verdelen tussen Gentbrugge en de winkels.</p></div><Link className="erp-button" href="/admin/erp/stock">Voorraad per winkel</Link></header>
 <div className="distribution-notice">Voorstellen en verzendlijsten; geen automatische voorraadcorrecties of transferopvolging. Het externe ERP blijft leidend. Drempels gelden per exacte SKU. Oudste voorraadmeting: {oldest?new Date(oldest).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'}):'onbekend'}.{stale&&<strong> Voorraad is ouder dan 45 minuten of onvolledig gedateerd: controleer de synchronisatie vóór verzending.</strong>} <Link href="/admin/erp/sync">Synchronisatie bekijken →</Link></div>
 <Planner articles={articles} lists={data.lists} rules={data.rules} canWrite={write}/>
 <section className="distribution-card" id="verzendlijsten"><div className="distribution-heading"><div><h2>Verzendlijsten per winkel</h2><p>Open lijsten tellen mee als gepland. Archiveer na verwerking en ERP-synchronisatie. Dit is geen verzend- of ontvangstbevestiging.</p></div></div>
 {(['open','archived'] as const).map(state=><details key={state} open={state==='open'}><summary>{state==='open'?'Open planning':'Laatste 30 gearchiveerde lijsten'} ({data.lists.filter(l=>l.state===state).length})</summary><div className="distribution-table"><table><thead><tr>{['Lijst','Van','Naar','SKU’s / stuks','Aangemaakt','Door'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{data.lists.filter(l=>l.state===state).sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(l=><tr key={l.id}><td><Link href={'/admin/erp/distribution/'+l.id}>{l.code} →</Link></td><td>{distributionLocations[l.source]}</td><td>{distributionLocations[l.destination]}</td><td>{l.lines.length} / {l.lines.reduce((s,r)=>s+r.quantity,0)}</td><td>{new Date(l.created_at).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'})}</td><td>{l.created_by}</td></tr>)}</tbody></table></div></details>)}</section>
 {user.role==='admin'&&<section className="distribution-card"><RulesEditor key={data.version} rules={data.rules} version={data.version} skus={articles.map(a=>a.sku).sort()}/></section>}
 </div>;
}
