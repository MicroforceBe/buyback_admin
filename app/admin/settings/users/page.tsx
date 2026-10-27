import {requirePageAccess} from '@/lib/security/access';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {hasPermission,isRootAdminEmail} from '@/lib/adminPermissions';
import UserPermissionsTable from './UserPermissionsTable';
import styles from './users.module.css';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export default async function UsersPage(){
 const current=await requirePageAccess('settings',true);
 const [users,audit]=await Promise.all([
  supabaseAdmin.from('buyback_admin_users').select('email,role,permissions,is_active,role_profile,access_version').order('email'),
  supabaseAdmin.from('buyback_user_access_audit').select('id,actor,subject_email,event,created_at,changes').order('created_at',{ascending:false}).limit(50)
 ]);
 if(users.error||audit.error)return <div className={styles.workspace}><h1>Gebruikers & rechten</h1><p role="alert">Gebruikersbeheer kon niet volledig worden geladen. Er zijn geen gegevens gewijzigd.</p></div>;
 const rows=(users.data??[]).map(u=>({...u,version:u.access_version,isRoot:isRootAdminEmail(u.email)}));
 return <div className={styles.workspace}>
  <header className={styles.hero}><div><span>Beheer / toegang & bevoegdheden</span><h1>Gebruikers & rechten</h1><p>Geef iedereen de juiste werkruimte, met afzonderlijke toegang tot RMA Supplier.</p></div><div className={styles.heroBadge}>Persoonlijke accounts</div></header>
  <UserPermissionsTable initialUsers={rows} currentUserEmail={current.email} canEdit={hasPermission(current,'settings','write')} audit={audit.data??[]}/>
 </div>;
}
