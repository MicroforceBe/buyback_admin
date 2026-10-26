'use client';
import type { AdminUser } from '@/lib/getCurrentAdminUser';
import styles from './AdminShell.module.css';
export default function UserBadge({user}:{user:AdminUser|null}){
  if(!user)return <span className={styles.userRole}>Niet ingelogd</span>;
  return <div className={styles.userBadge}><span className={styles.avatar} aria-hidden="true">{user.email.slice(0,1).toUpperCase()}</span><div className={styles.userText}><span className={styles.userEmail}>{user.email}</span><span className={styles.userRole}>{user.role}</span></div></div>;
}
