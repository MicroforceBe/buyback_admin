import Link from 'next/link';
import {ArrowUpRight,Boxes,Search,Info} from 'lucide-react';
import {requirePageAccess} from '@/lib/security/access';
import {stockColumns,stockTotals,summarizeStock,stockArticleHref,type StockTotal} from '@/lib/erpStock';
import {taxonomyGroups} from '../article-settings/data';
import {stockArticles} from './data';
import styles from '../erp.module.css';
export const dynamic='force-dynamic';
export const revalidate=0;
const labels={inventory_qty:'ERP totaal',stock_gentbrugge:'Gentbrugge',stock_oudenaarde:'Oudenaarde',stock_antwerpen:'Antwerpen'};
const first=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]??'':v??'';
function Quantity({total}:{total:StockTotal}){return <span title={total.missing?`${total.missing} SKU’s zonder voorraadwaarde; de getoonde som is onvolledig.`:undefined}>{total.value===null?'—':total.value.toLocaleString('nl-BE')}{total.missing>0&&<small className={styles.stockIncomplete}> *</small>}</span>;}
export default async function StockPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}){
 await requirePageAccess('erp',false);
 const sp=await searchParams,params=Object.fromEntries(['group','subgroup','q','status','empty'].map(k=>[k,first(sp?.[k]).slice(0,250)]));
 params.status=['active','inactive','all'].includes(params.status)?params.status:'active';
 const [result,groups]=await Promise.all([stockArticles(params).then(data=>({data,error:false})).catch(()=>({data:[],error:true})),taxonomyGroups()]);
 const words=params.q.toLocaleLowerCase('nl-BE').split(/\s+/).filter(Boolean);
 const articles=result.data.filter(a=>words.every(w=>(a.recognized_model||'Model niet bepaald').toLocaleLowerCase('nl-BE').includes(w)));
 const models=summarizeStock(articles,params.empty==='1');
 const visibleKeys=new Set(models.map(r=>JSON.stringify([r.groupId,r.subgroupId,r.model])));
 const visible=articles.filter(a=>visibleKeys.has(JSON.stringify([a.article_group_id,a.article_subgroup_id,a.recognized_model||null])));
 const totals=stockTotals(visible),roots=[...new Set(models.map(r=>r.groupId))];
 const contextLink='/admin/erp/articles?'+new URLSearchParams({group:params.group,subgroup:params.subgroup,status:params.status});
 return <div className={styles.shell}>
  <header className={styles.hero}><div><div className={styles.eyebrow}>ERP / VOORRAADINZICHT</div><h1>Voorraad per model</h1><p>Bekijk de voorraad per artikelgroep, model en vestiging.</p></div><div className={styles.heroActions}><Link className="erp-button" href={contextLink}>Naar artikelen <ArrowUpRight size={15}/></Link></div></header>
  <section className={styles.panel}><form action="/admin/erp/stock" className={styles.filter}>
   <div className={styles.search}><Search size={18}/><input name="q" aria-label="Modellen zoeken" defaultValue={params.q} placeholder="Zoek een model…" maxLength={250}/><button className="erp-button primary">Zoeken</button><Link className="erp-button" href="/admin/erp/stock">Wissen</Link></div>
   <div className={styles.controls}>
    <label>Artikelgroep<select name="group" defaultValue={params.group}><option value="">Alle groepen</option>{groups.filter(g=>!g.parent_id).sort((a,b)=>a.name.localeCompare(b.name,'nl')).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    <label>Subgroep<select name="subgroup" defaultValue={params.subgroup}><option value="">Alle subgroepen</option>{groups.filter(g=>g.parent_id).sort((a,b)=>a.name.localeCompare(b.name,'nl')).map(g=><option key={g.id} value={g.id}>{groups.find(p=>p.id===g.parent_id)?.name} / {g.name}</option>)}</select></label>
    <label>ERP-status<select name="status" defaultValue={params.status}><option value="active">Actief</option><option value="inactive">Inactief</option><option value="all">Alle statussen</option></select></label>
    <label>Weergave<select name="empty" defaultValue={params.empty}><option value="">Modellen met voorraad</option><option value="1">Ook modellen zonder voorraad</option></select></label>
   </div>
  </form></section>
  <div className="erp-notice"><Info size={17}/><span>Voorraad uit de laatste ERP-synchronisatie. ERP totaal kan afwijken van de som van de vestigingen. Alleen artikelen die nog in de ERP-import aanwezig zijn tellen mee.</span></div>
  {result.error?<div className="erp-notice error" role="alert">Voorraad kon niet volledig worden geladen. Vernieuw de pagina om opnieuw te proberen.</div>:<>
   <section className={styles.coreGrid} aria-label="Voorraad in huidige selectie">{stockColumns.map(c=><div key={c} className={styles.stockMetric}><span>{labels[c]}</span><strong><Quantity total={totals[c]}/></strong></div>)}</section>
   <div className={styles.toolbar}><span>{models.length.toLocaleString('nl-BE')} modelregels · {visible.length.toLocaleString('nl-BE')} SKU’s</span><span className={styles.muted}>Klik op een groep voor de modellen</span></div>
   {stockColumns.some(c=>totals[c].missing>0)&&<div className="erp-notice">* Voor sommige SKU’s ontbreekt een voorraadwaarde. De betreffende som is onvolledig.</div>}
   {roots.map(id=>{const rows=models.filter(r=>r.groupId===id),name=rows[0].groupName,items=visible.filter(a=>a.article_group_id===id),sum=stockTotals(items);return <details key={id??'unassigned'} className={styles.stockGroup} open={!!params.group||!!params.subgroup||!!params.q}><summary><span className={styles.stockGroupName}>{name}<small>{rows.length} modelregels · {items.length} SKU’s</small></span>{stockColumns.map(c=><span key={c} className={styles.stockGroupValue}><small>{labels[c]}</small><b><Quantity total={sum[c]}/></b></span>)}</summary><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Subgroep</th><th>Model</th><th className={styles.numeric}>SKU’s</th>{stockColumns.map(c=><th key={c} className={styles.numeric}>{labels[c]}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={JSON.stringify([row.subgroupId,row.model])}><td>{row.subgroupName}</td><td><Link className={styles.articleName} href={stockArticleHref(row,params.status)}>{row.model||'Model niet bepaald'} <ArrowUpRight size={12} style={{display:'inline'}}/></Link></td><td className={styles.numeric}>{row.articles}</td>{stockColumns.map(c=><td key={c} className={styles.numeric}>{c==='inventory_qty'||(row.totals[c].value??0)>0?<Link href={stockArticleHref(row,params.status,c)} title={c==='inventory_qty'?'Bekijk de bijbehorende SKU’s':`Bekijk SKU’s met voorraad in ${labels[c]}`}><Quantity total={row.totals[c]}/></Link>:<Quantity total={row.totals[c]}/>}</td>)}</tr>)}</tbody><tfoot><tr><th colSpan={2}>Totaal {name}</th><th className={styles.numeric}>{items.length}</th>{stockColumns.map(c=><th key={c} className={styles.numeric}><Quantity total={sum[c]}/></th>)}</tr></tfoot></table></div></details>;})}
   {!models.length&&<div className={styles.panel}><div className={styles.empty}><Boxes size={28} style={{margin:'0 auto 10px'}}/>Geen modellen voor deze selectie. Pas de filters aan of toon ook modellen zonder voorraad.</div></div>}
  </>}
 </div>;
}
