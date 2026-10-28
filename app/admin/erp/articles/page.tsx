import Link from 'next/link';
import {Search,ArrowUpRight,RefreshCw,SlidersHorizontal,Package,Info} from 'lucide-react';
import {requirePageAccess} from '@/lib/security/access';
import {hasPermission} from '@/lib/adminPermissions';
import {articleTypes,articleAreas,articleArea,money} from '@/lib/erpArticleProfile';
import {titleGrade} from '@/lib/productLabel';
import {listArticles,coreSummary,PAGE_SIZE} from './data';
import CoreButton from './CoreButton';
import {taxonomyGroups} from '../article-settings/data';
import styles from '../erp.module.css';
export const dynamic='force-dynamic';
export const revalidate=0;
const filterKeys=['group','subgroup','groupState','area','q','status','grade','stock','refurbished','vat','location','core','missingCoreLocation','minPrice','maxPrice','source','type','profile','sort'];
const first=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]??'':v??'';
function href(params:Record<string,string>,page:number){const q=new URLSearchParams({...params,page:String(page)});return `/admin/erp/articles?${q}`;}
function Select({name,label,value,options}:{name:string;label:string;value:string;options:[string,string][]}){return <label>{label}<select name={name} defaultValue={value}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;}
export default async function ArticlesPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}){
 const user = await requirePageAccess('erp', false);
 const sp=await searchParams,params=Object.fromEntries(filterKeys.map(k=>[k,first(sp?.[k]).slice(0,250)]));
 params.status||='active';params.sort||='sku';
 const rawPage=Number(first(sp?.page)),page=Number.isSafeInteger(rawPage)&&rawPage>0?Math.min(rawPage,100000):1;
 params.area=articleArea(params.area);
 const [{articles,count,error},core,groups]=await Promise.all([listArticles(params,page),params.area==='core'?coreSummary(params):Promise.resolve(null),taxonomyGroups()]),pages=Math.max(1,Math.ceil(count/PAGE_SIZE));
 const roots=groups.filter(g=>!g.parent_id&&g.active).sort((a,b)=>a.name.localeCompare(b.name,'nl'));
 const selectedGroup=groups.find(g=>!g.parent_id&&g.id===params.group);
 const clearHref=href({area:params.area,...(params.group?{group:params.group}:{})},1);
 const canWrite=hasPermission(user,'erp','write');
 return <div className={styles.shell}>
  <header className={styles.hero}><div><div className={styles.eyebrow}>ERP / CENTRAAL ARTIKELBEHEER</div><h1>{params.area==='all'?(selectedGroup?.name??'Artikelen'):articleAreas[params.area as keyof typeof articleAreas]}</h1><p>{params.area==='core'?'Volg het vaste assortiment en voorraadtekorten per vestiging op.':'Alle SKU’s, artikelgegevens en voorraad op één plek.'}</p></div><div className={styles.heroActions}><Link href="/admin/erp/article-settings" className="erp-button">Artikelinstellingen</Link>{params.area==='core'&&<Link href="/admin/erp/articles?area=all&refurbished=no" className="erp-button">Core-selectie beheren</Link>}<Link href="/admin/erp/sync" className="erp-button"><RefreshCw size={15}/>Synchronisatie</Link>{canWrite&&<Link href="/admin/erp/import" className="erp-button">CSV-import</Link>}</div></header>
  <nav className={styles.areaNav} aria-label="Artikelbeheer per artikelgroep"><Link href="/admin/erp/articles" aria-current={params.area==='all'&&!params.group?'page':undefined}>Alle artikelen</Link>{roots.map(group=><Link key={group.id} href={href({area:'all',group:group.id},1)} aria-current={params.area==='all'&&params.group===group.id?'page':undefined}>{group.name}</Link>)}{(['core','unclassified'] as const).map(area=><Link key={area} href={href({area},1)} aria-current={params.area===area?'page':undefined}>{articleAreas[area]}</Link>)}</nav>
  {params.area==='unclassified'&&<div className="erp-notice"><Info size={17}/><span>Deze artikelen hebben nog geen artikelgroep. Stel een SKU-prefix in bij Artikelinstellingen of ken een groep toe op de artikelfiche.</span></div>}
  {core&&<section className={styles.coreGrid} aria-label="Core-assortiment opvolging">{core.error?<div className="erp-notice error" role="alert">De core-tellingen konden niet worden geladen.</div>:([['','Core-artikelen',core.total],['gentbrugge','Ontbreekt in Gentbrugge',core.gentbrugge],['oudenaarde','Ontbreekt in Oudenaarde',core.oudenaarde],['antwerpen','Ontbreekt in Antwerpen',core.antwerpen]] as const).map(([location,label,total])=><Link key={location} href={href({...params,missingCoreLocation:location},1)} className={params.missingCoreLocation===location?styles.coreActive:''}><span>{label}</span><strong>{total}</strong><small>{location?'Geen voorraad · klik voor artikellijst':'Binnen de huidige filters'}</small></Link>)}</section>}
  <section className={styles.panel}><form action="/admin/erp/articles" className={styles.filter}>
   <input type="hidden" name="area" value={params.area}/>
   <div className={styles.search}><Search size={18}/><input name="q" aria-label="Artikelen zoeken" defaultValue={params.q} placeholder="Zoek SKU, EAN, artikelnaam, merk of model…" maxLength={250}/><button className="erp-button primary" type="submit">Zoeken</button><Link className="erp-button" href={clearHref}>Wissen</Link></div>
   <div className={styles.controls}>
    <Select name="status" label="ERP-status" value={params.status} options={[["active","Actief"],["inactive","Inactief"],["all","Alle statussen"]]}/>
    <Select name="type" label="Artikeltype" value={params.type} options={[["","Alle types"],...Object.entries(articleTypes)]}/>
    <Select name="stock" label="Voorraad" value={params.stock} options={[["","Alle voorraad"],["in_stock","Op voorraad"],["out_of_stock","Geen voorraad"]]}/>
    <Select name="location" label="Locatie met voorraad" value={params.location} options={[["","Alle locaties"],["gentbrugge","Gentbrugge"],["oudenaarde","Oudenaarde"],["antwerpen","Antwerpen"]]}/>
    <Select name="sort" label="Sorteren" value={params.sort} options={[["sku","SKU"],["title","Artikelnaam"],["price","Prijs oplopend"],["stock","Voorraad aflopend"],["recent","Recent aangevuld"]]}/>
   </div><div className={styles.controls}>
    <Select name="group" label="Artikelgroep" value={params.group} options={[["","Alle groepen"],...groups.filter(g=>!g.parent_id).map(g=>[g.id,g.name] as [string,string])]}/>
    <Select name="subgroup" label="Subgroep" value={params.subgroup} options={[["","Alle subgroepen"],...groups.filter(g=>g.parent_id&&(!params.group||g.parent_id===params.group)).map(g=>[g.id,((groups.find(p=>p.id===g.parent_id)?.name??'')+' / '+g.name)] as [string,string])]}/>
    <Select name="groupState" label="Toekenning" value={params.groupState} options={[["","Alle toekenningen"],["unassigned","Zonder groep"],["manual","Handmatig toegekend"]]}/>
   </div>
   <details open={['grade','refurbished','vat','core','missingCoreLocation','minPrice','maxPrice','source','profile'].some(k=>!!params[k])}><summary><SlidersHorizontal size={12} style={{display:'inline',marginRight:6}}/>Meer filters</summary><div className={styles.controls}>
    <Select name="grade" label="Grade in ERP-naam" value={params.grade} options={[["","Alle grades"],["3","3*"],["4","4*"],["5","5*"]]}/>
    <Select name="refurbished" label="Refurbished" value={params.refurbished} options={[["","Alle artikelen"],["yes","Refurbished"],["no","Niet refurbished"]]}/>
    <Select name="vat" label="BTW-regeling" value={params.vat} options={[["","Alle regelingen"],["margin","Marge"],["normal","Normale BTW"]]}/>
    <Select name="core" label="Core-assortiment" value={params.core} options={[["","Alle artikelen"],["yes","Core"],["no","Geen core"]]}/>
    <Select name="missingCoreLocation" label="Core ontbreekt op locatie" value={params.missingCoreLocation} options={[["","Niet filteren"],["gentbrugge","Gentbrugge"],["oudenaarde","Oudenaarde"],["antwerpen","Antwerpen"]]}/>
    <label>Minimumprijs (€)<input name="minPrice" type="number" step="0.01" min="0" defaultValue={params.minPrice}/></label><label>Maximumprijs (€)<input name="maxPrice" type="number" step="0.01" min="0" defaultValue={params.maxPrice}/></label>
    <Select name="source" label="Aanwezig in ERP" value={params.source} options={[["","Aanwezig"],["missing","Ontbreekt in laatste import"],["all","Alles, inclusief ontbrekend"]]}/>
    <Select name="profile" label="Interne artikelfiche" value={params.profile} options={[["","Alle fiches"],["yes","Aangevuld"],["no","Nog niet aangevuld"]]}/>
   </div></details>
  </form></section>
  <section className={styles.panel}><div className={styles.toolbar}><div><h2>Artikeloverzicht <span className="erp-pill blue">{count.toLocaleString('nl-BE')}</span></h2><small>{count?`${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE,count)} van ${count}`:'Geen resultaten'}</small></div><span className={styles.muted}>Prijs & voorraad: extern ERP</span></div>
   {error?<div className="erp-notice error" role="alert">Artikelen konden niet worden geladen. Vernieuw de pagina of probeer later opnieuw.</div>:<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>SKU / EAN</th><th>Artikel</th><th>Grade</th><th>Core</th><th className={styles.numeric}>Voorraad</th><th>Per locatie</th><th className={styles.numeric}>Prijs</th><th><span className="sr-only">Open fiche</span></th></tr></thead><tbody>
    {articles.map(a=><tr key={a.id}><td><Link prefetch={false} className={styles.sku} href={`/admin/erp/articles/${a.id}`}>{a.sku}</Link><div className={styles.muted}>{a.ean||'EAN —'}</div></td><td><Link className={styles.articleName} prefetch={false} href={`/admin/erp/articles/${a.id}`} title={a.title}>{a.title||'Zonder artikelnaam'}</Link><div className={styles.meta}><span>{[a.brand,a.model].filter(Boolean).join(' · ')}</span>{a.product_type&&<span className="erp-pill">{articleTypes[a.product_type as keyof typeof articleTypes]}</span>}<span className={`erp-pill ${a.active?'green':''}`}>{a.active?'Actief':'Inactief'}</span>{a.refurbished_product&&<span className="erp-pill blue">Refurb</span>}{a.vat_margin&&<span className="erp-pill amber">Marge</span>}{a.published&&<span className="erp-pill">Gepubliceerd</span>}{a.missing_from_erp&&<span className="erp-pill red">Ontbreekt in ERP</span>}{a.profile_version>0&&<span className="erp-pill">Fiche aangevuld</span>}</div><div className={styles.meta}><span>{[a.article_group_name,a.article_subgroup_name].filter(Boolean).join(' / ')||'Groep: niet toegewezen'}</span>{a.recognized_model&&<span className="erp-pill blue">{a.recognized_model}</span>}{a.model_origin==='conflict'&&<span className="erp-pill red">Modelconflict</span>}{a.group_origin==='manual'&&<span className="erp-pill amber">Handmatige groep</span>}</div></td><td>{a.condition_grade||titleGrade(a.source_title)||'—'}</td><td>{a.refurbished_product?'—':canWrite&&a.refurbished_product!==true?<CoreButton id={a.id} value={a.core_assortment}/>:a.core_assortment?'Core':'—'}</td><td className={styles.numeric}><strong>{a.inventory_qty??'—'}</strong></td><td className={styles.stock}>Gentbrugge <b className={a.core_assortment&&a.stock_gentbrugge!==null&&a.stock_gentbrugge<=0?styles.stockGap:undefined}>{a.stock_gentbrugge??'—'}</b><br/>Oudenaarde <b className={a.core_assortment&&a.stock_oudenaarde!==null&&a.stock_oudenaarde<=0?styles.stockGap:undefined}>{a.stock_oudenaarde??'—'}</b><br/>Antwerpen <b className={a.core_assortment&&a.stock_antwerpen!==null&&a.stock_antwerpen<=0?styles.stockGap:undefined}>{a.stock_antwerpen??'—'}</b></td><td className={styles.numeric}><strong>{money(a.price_cents)}</strong>{a.compare_price_cents!==null&&<div className={styles.muted}><s>{money(a.compare_price_cents)}</s></div>}</td><td><Link prefetch={false} href={`/admin/erp/articles/${a.id}`} aria-label={`Open artikelfiche ${a.sku}`}><ArrowUpRight size={17}/></Link></td></tr>)}
    {!articles.length&&<tr><td colSpan={8} className={styles.empty}><Package size={25} style={{margin:'0 auto 10px'}}/>Geen artikelen gevonden. Pas je zoekopdracht of filters aan.</td></tr>}
   </tbody></table></div>}
   <footer className={styles.pagination}><Link className="erp-button" aria-disabled={page<=1} href={href(params,Math.max(1,page-1))}>Vorige</Link><span>Pagina {page} van {pages}</span><Link className="erp-button" aria-disabled={page>=pages} href={href(params,Math.min(pages,page+1))}>Volgende</Link></footer>
  </section><div className="erp-notice"><Info size={17}/><span>Prijzen en voorraad worden hier niet aangepast. Open een artikel om de interne fiche aan te vullen; de bestaande SKU en ERP-koppelingen blijven behouden.</span></div>
 </div>;
}

