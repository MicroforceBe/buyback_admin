import type { ReactNode } from 'react';
import Link from 'next/link';
import Nav from './Nav';
import {hasPermission} from '@/lib/adminPermissions';
import AdminChrome from './AdminChrome';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import UserBadge from './UserBadge';
import IdleLogout from './IdleLogout';
import LogoutButton from './LogoutButton';
import styles from './AdminShell.module.css';
import HelpAssistant from './help/HelpAssistant';
import { allowedHelpModules, helpTopics } from '@/lib/helpManual';

export const metadata={title:'Buyback Admin',description:'Beheer'};
export default async function AdminLayout({children}:{children:ReactNode}){
  const currentUser=await getCurrentAdminUser();
  if(!currentUser)return <>{children}</>;
  const role=currentUser.role as string|undefined;
  const helpChoices=allowedHelpModules(currentUser).map(m=>({...m,questions:helpTopics.filter(t=>t.module===m.id).slice(0,4).map(t=>t.question)}));
  return <AdminChrome loginContent={children}><div className={styles.shell}>
    <aside className={styles.sidebar} aria-label="Hoofdnavigatie">
      <Link href="/admin" className={styles.brand} prefetch={false}><span className={styles.brandMark} aria-hidden="true">m</span><span><strong>microforce</strong><small>Buyback operations</small></span></Link>
      <Nav role={role} permissions={{dashboard:hasPermission(currentUser,'dashboard','read'),leads:hasPermission(currentUser,'leads','read'),refurb:hasPermission(currentUser,'refurb','read'),rma_supplier:hasPermission(currentUser,'rma_supplier','read'),erp:hasPermission(currentUser,'erp','read'),catalog:hasPermission(currentUser,'catalog','read'),multipliers:hasPermission(currentUser,'multipliers','read'),uploads:hasPermission(currentUser,'uploads','read'),settings:hasPermission(currentUser,'settings','read')}}/>
      <div className={styles.sidebarFoot}>MICROFORCE<br/>Buyback &amp; refurb beheer</div>
    </aside>
    <main className={styles.main}>
      <IdleLogout timeoutMs={15*60*1000}/>
      <div className={styles.topbar}><div className={styles.workspace}><strong>Microforce</strong><span aria-hidden="true">/</span><span>Beheeromgeving</span></div><div className={styles.account}><UserBadge user={currentUser}/><LogoutButton/></div></div>
      <div className={styles.content}>{children}</div>
    </main>
  </div><HelpAssistant modules={helpChoices}/></AdminChrome>;
}
