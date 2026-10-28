import Link from 'next/link';
import {requirePageAccess} from '@/lib/security/access';
import {hasPermission} from '@/lib/adminPermissions';
import {taxonomySettings} from './data';
import TaxonomyManager from './TaxonomyManager';
import styles from '../erp.module.css';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function ArticleSettings(){
 const user = await requirePageAccess('erp', false);
 try{const data=await taxonomySettings();return <div className={styles.shell}><header className={styles.hero}><div><div className={styles.eyebrow}>ERP / ARTIKELINSTELLINGEN</div><h1>Groepen, SKU-matching & modellen</h1><p>Beheer de artikelstructuur en herken artikelen op basis van SKU en omschrijving.</p></div><Link href="/admin/erp/articles" className="erp-button">Naar artikelen</Link></header><div className="erp-notice">Artikelgroepen staan naast de bestaande rubrieken Refurb, Accessoires en Repairs. Prijzen, voorraad, ERP-flags en core-assortiment blijven behouden. Actieve regels werken na opslaan direct op bestaande en nieuw geïmporteerde artikelen.</div><TaxonomyManager {...data} canWrite={hasPermission(user,'erp','write')}/></div>;}catch{return <div className={styles.shell}><div className="erp-notice error" role="alert">De artikelinstellingen konden niet worden geladen. Probeer opnieuw.</div><Link href="/admin/erp/articles">Naar artikelen</Link></div>;}
}
