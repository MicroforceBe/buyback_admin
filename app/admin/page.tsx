import { requirePageAccess } from '@/lib/security/access';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import { hasPermission } from '@/lib/adminPermissions';
import AdminIcon,{type AdminIconName} from './AdminIcon';
import styles from './dashboard.module.css';

export const dynamic='force-dynamic';
export const runtime='nodejs';
type Module={href:string;name:string;description:string;icon:AdminIconName;available:boolean};

export default async function AdminDashboardPage(){
  await requirePageAccess('dashboard',false);
  const adminUser=await getCurrentAdminUser();
  if(!adminUser)redirect('/admin/login?reason=not_logged_in');
  const can=(feature:Parameters<typeof hasPermission>[1])=>hasPermission(adminUser,feature,'read');
  const operations:Module[]=[
    {href:'/admin/refurb',name:'Refurb & recepties',description:'Verwerk binnenkomende toestellen en volg artikelen, garanties en leveranciers op.',icon:'refurb',available:can('refurb')},
    {href:'/admin/leads',name:'Buyback leads',description:'Beheer aanvragen, controleer toestellen en volg elke inruil verder op.',icon:'leads',available:can('leads')},
    {href:'/admin/diagnostics',name:'Diagnostics',description:'Start een diagnosesessie en bekijk de testresultaten van een toestel.',icon:'diagnostics',available:adminUser.role==='admin'},
    {href:'/admin/erp',name:'ERP & artikelen',description:'Raadpleeg ERP-artikelen en werk met de bestaande artikeltools.',icon:'erp',available:can('erp')},
  ].filter(m=>m.available) as Module[];
  const management:Module[]=[
    {href:'/admin/catalog',name:'Catalogus',description:'Modellen en basisprijzen.',icon:'catalog',available:can('catalog')},
    {href:'/admin/multipliers',name:'Multipliers',description:'Vraagsets en prijsregels.',icon:'multipliers',available:can('multipliers')},
    {href:'/admin/uploads',name:'Uploads',description:'Afbeeldingen en bestanden.',icon:'uploads',available:can('uploads')},
    {href:'/admin/settings',name:'Instellingen',description:'Branding, e-mails en rechten.',icon:'settings',available:can('settings')},
  ].filter(m=>m.available) as Module[];
  const moduleCount=operations.length+management.length;
  return <div className={styles.dashboard}>
    <header className={styles.hero}><div><div className={styles.eyebrow}>Microforce / werkruimte</div><h1>Dashboard</h1><p>Alles voor buyback en refurb op één plek.<br/>Ga direct verder met aanvragen, recepties en toestelverwerking.</p><div className={styles.heroActions}>{can('refurb')&&<Link href="/admin/refurb" prefetch={false} className={styles.primary}>Open recepties<AdminIcon name="next" size={16}/></Link>}{can('leads')&&<Link href="/admin/leads" prefetch={false} className={styles.secondary}>Bekijk leads<AdminIcon name="next" size={16}/></Link>}</div></div><div className={styles.heroMeta}><span>Jouw werkruimte</span><strong>{moduleCount}</strong><span>beschikbare modules</span></div></header>
    {operations.length>0&&<section aria-labelledby="daily-heading"><div className={styles.sectionHeading}><div><h2 id="daily-heading">Dagelijkse verwerking</h2><p>Van binnenkomst tot een afgewerkt toestel.</p></div><span>Operations</span></div><div className={styles.grid}>{operations.map(m=><ModuleCard key={m.href} module={m}/>)}</div></section>}
    {(can('rma_supplier')||can('refurb_analytics'))&&<section className={styles.shortcuts} aria-labelledby="quick-heading"><h2 id="quick-heading">Snelle toegang</h2>{can('rma_supplier')&&<Link href="/admin/refurb/rma" prefetch={false}><AdminIcon name="rma" size={17}/>RMA Supplier<AdminIcon name="arrow" size={14}/></Link>}{can('refurb_analytics')&&<Link href="/admin/refurb/analytics" prefetch={false}><AdminIcon name="analytics" size={17}/>Refurb analytics<AdminIcon name="arrow" size={14}/></Link>}</section>}
    {management.length>0&&<section aria-labelledby="management-heading"><div className={styles.sectionHeading}><div><h2 id="management-heading">Catalogus &amp; beheer</h2><p>De instellingen achter je dagelijkse werk.</p></div></div><div className={`${styles.grid} ${styles.management}`}>{management.map(m=><ModuleCard key={m.href} module={m}/>)}</div></section>}
    <section className={styles.updates} aria-label="Release notes"><div><span className={styles.updateIcon}><AdminIcon name="notes" size={22}/></span><div><h2>Nieuw in je werkruimte</h2><p>Lees wat er is verbeterd en welke functies je nu kunt gebruiken.</p></div></div><Link href="/admin/release-notes" prefetch={false}>Bekijk release notes<AdminIcon name="next" size={16}/></Link></section>
    {moduleCount===0&&<div className={styles.empty}>Je account heeft momenteel geen toegang tot de modules. Vraag een beheerder om je rechten te controleren.</div>}
  </div>;
}
function ModuleCard({module:m}:{module:Module}){return <Link href={m.href} prefetch={false} className={styles.card}><span className={styles.icon}><AdminIcon name={m.icon} size={23}/></span><div className={styles.cardCopy}><h3>{m.name}</h3><p>{m.description}</p><span className={styles.cardLink}>Open module<AdminIcon name="next" size={13}/></span></div><span className={styles.cardArrow}><AdminIcon name="arrow" size={18}/></span></Link>;}

