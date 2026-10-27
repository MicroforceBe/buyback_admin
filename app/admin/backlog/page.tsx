import {requirePageAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import type {BacklogItem} from '@/lib/developmentBacklog';
import BacklogBoard from './BacklogBoard';
import styles from './backlog.module.css';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export default async function BacklogPage({searchParams}:{searchParams?:Promise<{message?:string}>}){
 await requirePageAccess('settings',true);
 const params=await searchParams;
 const {data,error}=await supabaseAdmin.from('buyback_development_backlog').select('id,title,description,module,status,priority,version,created_at,updated_at').order('updated_at',{ascending:false}).limit(2000);
 return <div className={styles.workspace}><header className={styles.hero}><span>Microforce / doorontwikkeling</span><h1>Ontwikkelbacklog</h1><p>Ideeën verzamelen, prioriteiten bepalen en verbeteringen opvolgen.</p><small>Alleen toegankelijk voor beheerders</small></header>{error?<div role="alert" className={styles.error}>De ontwikkelbacklog kon niet worden geladen. Probeer opnieuw; er zijn geen wijzigingen uitgevoerd.</div>:<BacklogBoard items={(data??[]) as BacklogItem[]} message={params?.message} truncated={(data??[]).length===2000}/>}</div>;
}
