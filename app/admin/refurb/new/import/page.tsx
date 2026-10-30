import {requirePageAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import ImportForm from './ImportForm';
import ui from '../../rma/rma.module.css';
import styles from '../../reception.module.css';
export const dynamic='force-dynamic';
export default async function ImportReceptionPage({searchParams}:{searchParams:Promise<{nr?:string}>}){
 const user=await requirePageAccess('refurb',false);
 const {data,error}=await supabaseAdmin.from('refurb_suppliers').select('id,name,rma_expiry_days,csv_import_format').order('name');
 if(error)throw Error('Leveranciers konden niet geladen worden.');
 const params=await searchParams;
 return <div className={`${ui.workspace} ${styles.reception}`}><ImportForm suppliers={data||[]} canSaveProfile={user.role==='admin'} initialNumber={(params.nr||'').slice(0,100)}/></div>;
}
