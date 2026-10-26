import type { ReactNode } from 'react';
import Link from 'next/link';
import Nav from './Nav';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import UserBadge from './UserBadge';
import IdleLogout from './IdleLogout';
import LogoutButton from './LogoutButton';
import styles from './AdminShell.module.css';

export const metadata={title:'Buyback Admin',description:'Beheer'};
export default async function AdminLayout({children}:{children:ReactNode}){
  const currentUser=await getCurrentAdminUser();
  if(!currentUser)return <>{children}</>;
  const role=currentUser.role as string|undefined;
  return <div className={styles.shell}>
    <aside className={styles.sidebar} aria-label="Hoofdnavigatie">
      <Link href="/admin" className={styles.brand} prefetch={false}><span className={styles.brandMark} aria-hidden="true">m</span><span><strong>microforce</strong><small>Buyback operations</small></span></Link>
      <Nav role={role}/>
      <div className={styles.sidebarFoot}>MICROFORCE<br/>Buyback &amp; refurb beheer</div>
    </aside>
    <main className={styles.main}>
      <IdleLogout timeoutMs={15*60*1000}/>
      <div className={styles.topbar}><div className={styles.workspace}><strong>Microforce</strong><span aria-hidden="true">/</span><span>Beheeromgeving</span></div><div className={styles.account}><UserBadge user={currentUser}/><LogoutButton/></div></div>
      <div className={styles.content}>{children}</div>
    </main>
  </div>;
}
