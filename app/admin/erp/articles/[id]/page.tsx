import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ExternalLink,LockKeyhole,Package,History,Link2} from 'lucide-react';
import {requirePageAccess} from '@/lib/security/access';
import {hasPermission} from '@/lib/adminPermissions';
import {uuidPattern,money,articleDate,profileFields,type ArticleProfile,type ProfileField} from '@/lib/erpArticleProfile';
import {titleGrade} from '@/lib/productLabel';
import {articleDetail} from '../data';
import ProfileForm from '../ProfileForm';
import CoreButton from '../CoreButton';
import styles from '../../erp.module.css';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function ArticlePage({params}:{params:Promise<{id:string}>}){
 const user = await requirePageAccess('erp', false);
 const {id}=await params;if(!uuidPattern.test(id))notFound();
 const {source:a,profile,history,error}=await articleDetail(id);
 if(error)return <div className={styles.shell}><Link className={styles.back} href="/admin/erp/articles">← Naar artikelen</Link><div className="erp-notice error" role="alert">De artikelfiche kon niet worden geladen. Probeer opnieuw.</div></div>;
 if(!a)notFound();const canWrite=hasPermission(user,'erp','write');
 return <div className={styles.shell}>
  <Link className={styles.back} href="/admin/erp/articles"><ArrowLeft size={13} style={{display:'inline',marginRight:5}}/>Artikeloverzicht</Link>
  <header className={styles.hero}><div><div className={styles.eyebrow}>ARTIKELFICHE / {a.sku}</div><h1>{profile?.display_name||a.title}</h1><div className={styles.meta}><span className={`erp-pill ${a.active?'green':''}`}>{a.active?'Actief':'Inactief'}</span>{a.refurbished_product&&<span className="erp-pill blue">Refurbished</span>}<span className="erp-pill">{a.vat_margin?'Marge BTW':'Normale BTW'}</span>{a.missing_from_erp&&<span className="erp-pill red">Ontbreekt in ERP</span>}</div></div><Link href={`/admin/erp/labels?sku=${encodeURIComponent(a.sku)}`} className="erp-button"><ExternalLink size={14}/>Labeltool openen</Link></header>
  <div className={styles.columns}><div className="space-y-5">
   <section className={styles.panel}><ProfileForm id={id} key={id} profile={profile as ArticleProfile|null} source={a} canWrite={canWrite}/></section>
   <section className={styles.panel}><details className={styles.history}><summary><History size={15} style={{display:'inline',marginRight:7}}/>Wijzigingshistoriek {history.length>0&&`· ${history.length} recent`}</summary>{history.length?history.map(h=>{const before=h.before_data as Record<string,unknown>|null,after=h.after_data as Record<string,unknown>;const changed=Object.keys(profileFields).filter(k=>(before?.[k]??null)!==(after?.[k]??null));return <div key={h.id} className={styles.historyRow}><b>Versie {h.version}</b> · {articleDate(h.changed_at)}<p>{changed.length?changed.map(k=>profileFields[k as ProfileField]).join(' · '):'Fiche opgeslagen zonder inhoudelijke wijziging'}</p></div>;}):<p className={styles.muted}>Er zijn nog geen interne wijzigingen opgeslagen.</p>}</details></section>
  </div><aside className={styles.side}>
   <section className={`${styles.panel} ${styles.sidePanel}`}><h2><LockKeyhole size={14} style={{display:'inline',marginRight:6}}/>Prijs uit extern ERP</h2><div className={styles.value}>{money(a.price_cents)}</div>{a.compare_price_cents!==null&&<p className={styles.muted}>Vergelijkingsprijs <s>{money(a.compare_price_cents)}</s></p>}<p className={styles.muted}>Alleen-lezen · {a.vat_margin?'Margeregeling':'Normale BTW-regeling'}</p></section>
   <section className={`${styles.panel} ${styles.sidePanel}`}><h2><Package size={14} style={{display:'inline',marginRight:6}}/>Voorraad uit extern ERP</h2><div className={styles.value}>{a.inventory_qty??'—'}</div><dl className={styles.facts}>{[['Gentbrugge',a.stock_gentbrugge],['Oudenaarde',a.stock_oudenaarde],['Antwerpen',a.stock_antwerpen]].map(([label,v])=><div key={String(label)}><dt>{label}</dt><dd>{v??'—'}</dd></div>)}</dl><p className={styles.muted}>Geïmporteerde artikelwaarde bijgewerkt:<br/>{articleDate(a.updated_at)}</p></section>
   <section className={`${styles.panel} ${styles.sidePanel}`}><h2>ERP-brongegevens</h2><dl className={styles.facts}>{[['SKU',a.sku],['ERP-naam',a.title],['Labelgrade',titleGrade(a.title)||'—'],['Gepubliceerd',a.published===null?'Onbekend':a.published?'Ja':'Nee']].map(([label,v])=><div key={label}><dt>{label}</dt><dd>{v}</dd></div>)}</dl><p className={styles.muted}>Labels en SKU-controles blijven de bestaande ERP-bron gebruiken. Interne aanvullingen wijzigen geen eerdere leads of recepties.</p>{a.refurbished_product===false&&<div>{canWrite?<CoreButton id={id} value={a.core_assortment}/>:<span className="erp-pill">{a.core_assortment?'Core-assortiment':'Geen core'}</span>}</div>}</section>
   {profile?.image_url&&<section className={`${styles.panel} ${styles.sidePanel}`}><h2>Artikelafbeelding</h2><a href={profile.image_url} target="_blank" rel="noopener noreferrer"><img src={profile.image_url} alt={profile.display_name||a.title} className={styles.image} loading="lazy" referrerPolicy="no-referrer"/></a></section>}
   <section className={`${styles.panel} ${styles.sidePanel}`}><h2><Link2 size={14} style={{display:'inline',marginRight:6}}/>Bestaande koppelingen</h2><p className={styles.muted}>Deze fiche gebruikt dezelfde SKU als leads, recepties en de labeltool. De ERP-import blijft de bron voor verkoopprijs, voorraad en artikelstatus.</p><Link href="/admin/erp/sync" className="erp-button">Synchronisatie bekijken</Link></section>
  </aside></div>
 </div>;
}
