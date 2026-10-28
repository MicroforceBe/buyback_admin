import Link from 'next/link';
import {Package,RefreshCw,Printer,Upload,Settings2,ArrowUpRight,Info,Star} from 'lucide-react';
import {requirePageAccess} from '@/lib/security/access';
import {hasPermission} from '@/lib/adminPermissions';
import styles from './erp.module.css';
import {taxonomyGroups} from './article-settings/data';
export const dynamic='force-dynamic';
export const revalidate=0;

const modules=[{title:'Voorraad per model',description:'Voorraad per artikelgroep en model, met totalen voor Gentbrugge, Oudenaarde en Antwerpen.',href:'/admin/erp/stock',Icon:Package},{title:'Artikelinstellingen',description:'Beheer groepen, subgroepen, de driecijferige SKU-matching en modelherkenning.',href:'/admin/erp/article-settings',Icon:Settings2},{title:'Artikelen',description:'Zoek SKU’s, bekijk prijzen en voorraad en vul de interne artikelfiches aan.',href:'/admin/erp/articles',Icon:Package},{title:'Synchronisatie',description:'Bekijk en controleer de bestaande import vanuit het externe ERP.',href:'/admin/erp/sync',Icon:RefreshCw},{title:'Labels',description:'Open de bestaande DYMO-labeltool met SKU, IMEI/SN, grade en batterij.',href:'/admin/erp/labels',Icon:Printer},{title:'CSV-import',description:'Bestaande handmatige import voor artikelgegevens.',href:'/admin/erp/import',Icon:Upload,write:true},{title:'FTP-instellingen',description:'Beheer de bestaande verbinding voor ERP-imports.',href:'/admin/erp/settings',Icon:Settings2,admin:true}];
export default async function ErpPage(){
 const user = await requirePageAccess('erp', false);
 const groups=await taxonomyGroups();
 const articleModules=[...groups.filter(g=>!g.parent_id&&g.active).sort((a,b)=>a.name.localeCompare(b.name,'nl')).map(g=>({title:g.name,description:'Artikelen binnen deze artikelgroep en de bijbehorende subgroepen.',href:'/admin/erp/articles?group='+encodeURIComponent(g.id),Icon:Package})),{title:'Core-assortiment',description:'Vast assortiment en ontbrekende voorraad per vestiging.',href:'/admin/erp/articles?area=core',Icon:Star}];
 return <div className={styles.shell}><header className={styles.hero}><div><div className={styles.eyebrow}>MICROFORCE / ARTIKELBEHEER</div><h1>ERP & artikelen</h1><p>Artikelgegevens, voorraad en bestaande werkprocessen centraal beschikbaar.</p></div><Link className="erp-button" href="/admin/erp/articles">Naar artikelen <ArrowUpRight size={15}/></Link></header><div className={styles.moduleGrid}>{articleModules.map(({title,description,href,Icon})=><Link className={styles.module} href={href} key={href}><Icon size={23} color="#2584a4"/><h2>{title}</h2><p>{description}</p></Link>)}</div><h2 style={{fontWeight:700,fontSize:15}}>Overzicht & bestaande tools</h2><div className={styles.moduleGrid}>{modules.filter(m=>(!m.admin||user.role==='admin')&&(!m.write||hasPermission(user,'erp','write'))).map(({title,description,href,Icon})=><Link className={styles.module} href={href} key={href}><Icon size={23} color="#2584a4"/><h2>{title}</h2><p>{description}</p></Link>)}</div><div className="erp-notice"><Info size={18}/><span>Prijzen en voorraad blijven afkomstig uit het externe ERP. Interne artikelfiches worden afzonderlijk bewaard en niet overschreven bij synchronisatie.</span></div></div>;
}

