import LocalDate from '@/app/admin/LocalDate';
import Link from 'next/link';
import {requirePageAccess} from '@/lib/security/access';
import {hasPermission} from '@/lib/adminPermissions';
import DesiredDevices from './DesiredDevices';
import DistributionLists from './DistributionLists';
import {distributionArticles,distributionData} from './data';
import Planner from './Planner';
import RulesEditor from './RulesEditor';
import styles from '../erp.module.css';
import './distribution.css';
export const dynamic='force-dynamic';export const revalidate=0;
export default async function DistributionPage({searchParams}:{searchParams?:Promise<{tab?:string}>}){
 const user = await requirePageAccess('erp',false);
 const params=await searchParams,free=params?.tab==='free';
 let articles,data;try{data=await distributionData();articles=await distributionArticles(data.rules.article_group_id);}catch{return <div role="alert" className="erp-notice error">Voorraadverdeling kon niet volledig geladen worden. Er worden geen gedeeltelijke voorstellen getoond. Vernieuw de pagina.</div>;}
 const write=hasPermission(user,'erp','write'),oldest=articles.map(a=>a.source_updated_at).filter((v):v is string=>!!v).sort()[0],stale=!oldest||Date.now()-Date.parse(oldest)>45*60*1000;
 return <div className={`${styles.shell} distribution-page`}><header className="distribution-compact-header"><h1>Voorraadverdeling</h1><Link className="erp-button" href="/admin/erp/stock">Voorraad per winkel</Link></header>
 <details className="distribution-info"><summary>Brongegevens en werkwijze</summary> <div className="distribution-notice">Voorstellen en verzendlijsten; geen automatische voorraadcorrecties of transferopvolging. Het externe ERP blijft leidend. Drempels gelden per exacte SKU binnen {data.groups.find(g=>g.id===data.rules.article_group_id)?.name||'de te kiezen refurbgroep'}. Oudste voorraadmeting: {oldest?<LocalDate value={oldest} withTime timeZone="Europe/Brussels"/>:'onbekend'}.{stale&&<strong> Voorraad is ouder dan 45 minuten of onvolledig gedateerd: controleer de synchronisatie vóór verzending.</strong>} <Link href="/admin/erp/sync">Synchronisatie bekijken →</Link></div></details>
 {stale&&<p role="alert" className="distribution-notice">De voorraadmeting is ouder dan 45 minuten of onvolledig gedateerd. Controleer de synchronisatie vóór verzending.</p>}
 {!data.rules.article_group_id&&<div role="alert" className="distribution-notice">Kies bij Verdeelregels beheren eerst de artikelgroep met refurbartikelen. Er worden geen andere artikelen gebruikt als vervanging.</div>}
 <nav className="distribution-module-tabs" aria-label="Voorraadverdeling onderdelen"><Link href="/admin/erp/distribution?tab=return" aria-current={!free?'page':undefined}>Retour Hoofdmagazijn</Link><Link href="/admin/erp/distribution?tab=free" aria-current={free?'page':undefined}>Vrije refurb voorraad</Link></nav>
 {free?<DesiredDevices articles={articles} lists={data.lists} wishes={data.wishes} canWrite={write}/>:<Planner articles={articles} lists={data.lists} wishes={data.wishes} rules={data.rules} canWrite={write}/>} 
 <DistributionLists lists={data.lists}/>
 {!free&&user.role==='admin'&&<section className="distribution-card"><RulesEditor groups={data.groups} key={data.version} rules={data.rules} version={data.version} skus={articles.map(a=>a.sku).sort()}/></section>}
 </div>;
}
