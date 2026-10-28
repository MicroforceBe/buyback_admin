import Link from 'next/link';
import {ArrowUpRight,Boxes,Search,Info} from 'lucide-react';
import {requirePageAccess} from '@/lib/security/access';
import {stockColumns,stockTotals,summarizeStock,stockArticleHref,storeArticles,type StockTotal,type StockColumn} from '@/lib/erpStock';
import {taxonomyGroups} from '../article-settings/data';
import {stockArticles} from './data';
import StockTree from './StockTree';
import styles from '../erp.module.css';
export const dynamic='force-dynamic';
export const revalidate=0;
const locations={gentbrugge:'stock_gentbrugge',oudenaarde:'stock_oudenaarde',antwerpen:'stock_antwerpen'} as const;
const labels={inventory_qty:'ERP totaal',stock_gentbrugge:'Gentbrugge',stock_oudenaarde:'Oudenaarde',stock_antwerpen:'Antwerpen'};
const first=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]??'':v??'';
function Quantity({total}:{total:StockTotal}){return <span title={total.missing?`${total.missing} SKU’s zonder voorraadwaarde; de getoonde som is onvolledig.`:undefined}>{total.value===null?'—':total.value.toLocaleString('nl-BE')}{total.missing>0&&<small className={styles.stockIncomplete}> *</small>}</span>;}
export default async function StockPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}){
 await requirePageAccess('erp',false);
 const sp=await searchParams,params=Object.fromEntries(['group','subgroup','q','status','empty','location'].map(k=>[k,first(sp?.[k]).slice(0,250)]));
 params.location=Object.hasOwn(locations,params.location)?params.location:'';
 const selectedColumn=params.location?locations[params.location as keyof typeof locations]:undefined;
 const columns:readonly StockColumn[]=selectedColumn?[selectedColumn]:stockColumns;
 const overviewHref=(location:string)=>'/admin/erp/stock?'+new URLSearchParams({...params,location});
 params.status=['active','inactive','all'].includes(params.status)?params.status:'active';
 const [result,groups]=await Promise.all([stockArticles(params).then(data=>({data,error:false})).catch(()=>({data:[],error:true})),taxonomyGroups()]);
 const words=params.q.toLocaleLowerCase('nl-BE').split(/\s+/).filter(Boolean);
 const articles=result.data.filter(a=>words.every(w=>(a.recognized_model||'Model niet bepaald').toLocaleLowerCase('nl-BE').includes(w)));
 const scopedArticles=selectedColumn?storeArticles(articles,selectedColumn):articles;
 const models=summarizeStock(scopedArticles,selectedColumn?false:params.empty==='1',selectedColumn);
 const visibleKeys=new Set(models.map(r=>JSON.stringify([r.groupId,r.subgroupId,r.model])));
 const visible=scopedArticles.filter(a=>visibleKeys.has(JSON.stringify([a.article_group_id,a.article_subgroup_id,a.recognized_model||null])));
 const totals=stockTotals(articles),roots=[...new Set(models.map(r=>r.groupId))];
 const contextLink='/admin/erp/articles?'+new URLSearchParams({group:params.group,subgroup:params.subgroup,status:params.status,location:params.location});
 return <div className={styles.shell}>
  <header className={styles.hero}><div><div className={styles.eyebrow}>ERP / VOORRAADINZICHT</div><h1>{selectedColumn?'Voorraad '+labels[selectedColumn]:'Voorraad per model'}</h1><p>{selectedColumn?'Modellen en aantallen voor deze vestiging.':'Bekijk de voorraad per artikelgroep, model en vestiging.'}</p></div><div className={styles.heroActions}><Link className="erp-button" href="/admin/erp/counts">Stocktellingen</Link>{selectedColumn&&<Link className="erp-button" href={overviewHref('')}>Alle vestigingen</Link>}<Link className="erp-button" href={contextLink}>Naar artikelen <ArrowUpRight size={15}/></Link></div></header>
  <section className={styles.panel}><form action="/admin/erp/stock" className={styles.filter}>
   <div className={styles.search}><Search size={18}/><input name="q" aria-label="Modellen zoeken" defaultValue={params.q} placeholder="Zoek een model…" maxLength={250}/><button className="erp-button primary">Zoeken</button><Link className="erp-button" href="/admin/erp/stock">Wissen</Link></div>
   <div className={styles.controls}>
    <label>Artikelgroep<select name="group" defaultValue={params.group}><option value="">Alle groepen</option>{groups.filter(g=>!g.parent_id).sort((a,b)=>a.name.localeCompare(b.name,'nl')).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    <label>Subgroep<select name="subgroup" defaultValue={params.subgroup}><option value="">Alle subgroepen</option>{groups.filter(g=>g.parent_id).sort((a,b)=>a.name.localeCompare(b.name,'nl')).map(g=><option key={g.id} value={g.id}>{groups.find(p=>p.id===g.parent_id)?.name} / {g.name}</option>)}</select></label>
    <label>ERP-status<select name="status" defaultValue={params.status}><option value="active">Actief</option><option value="inactive">Inactief</option><option value="all">Alle statussen</option></select></label>
    <label>Vestiging<select name="location" defaultValue={params.location}><option value="">Alle vestigingen</option>{Object.entries(locations).map(([location,column])=><option key={location} value={location}>{labels[column]}</option>)}</select></label>
    {!selectedColumn&&<label>Weergave<select name="empty" defaultValue={params.empty}><option value="">Modellen met voorraad</option><option value="1">Ook modellen zonder voorraad</option></select></label>}
   </div>
  </form></section>
  <div className="erp-notice"><Info size={17}/><span>Voorraad uit de laatste ERP-synchronisatie. ERP totaal kan afwijken van de som van de vestigingen. Alleen artikelen die nog in de ERP-import aanwezig zijn tellen mee.</span></div>
  {result.error?<div className="erp-notice error" role="alert">Voorraad kon niet volledig worden geladen. Vernieuw de pagina om opnieuw te proberen.</div>:<>
   <section className={styles.coreGrid} aria-label="Kies een vestiging">{stockColumns.map(c=>{const location=c==='inventory_qty'?'':c.replace('stock_',''),active=params.location===location;return <Link key={c} href={overviewHref(location)} className={styles.stockMetric+(active?' '+styles.stockMetricActive:'')} aria-current={active?'page':undefined} aria-label={c==='inventory_qty'?'Toon alle vestigingen':`Bekijk voorraad ${labels[c]}`}><span>{labels[c]}</span><strong><Quantity total={totals[c]}/></strong><small>{active?'Geselecteerd':'Bekijk overzicht →'}</small></Link>;})}</section>
   {selectedColumn&&<div className="erp-notice"><Info size={17}/><span>Je bekijkt {labels[selectedColumn]}. Klap hoofdgroep, subgroep en model open voor de artikelen met voorraad in deze winkel. De tegels blijven de totalen van alle vestigingen binnen je zoekfilters tonen.</span></div>}
   <div className={styles.toolbar}><span>{models.length.toLocaleString('nl-BE')} modelregels · {visible.length.toLocaleString('nl-BE')} SKU’s</span><span className={styles.muted}>{selectedColumn?'Klap hoofdgroep → subgroep → model open':'Klik op een groep voor de modellen'}</span></div>
   {stockColumns.some(c=>totals[c].missing>0)&&<div className="erp-notice">* Voor sommige SKU’s ontbreekt een voorraadwaarde. De betreffende som is onvolledig.</div>}
   {selectedColumn&&<StockTree articles={visible} column={selectedColumn} location={labels[selectedColumn]}/>}
   {!selectedColumn&&roots.map(id=>{const rows=models.filter(r=>r.groupId===id),name=rows[0].groupName,items=visible.filter(a=>a.article_group_id===id),sum=stockTotals(items);return <details key={id??'unassigned'} className={styles.stockGroup} open={!!params.group||!!params.subgroup||!!params.q||!!selectedColumn}><summary style={selectedColumn?{gridTemplateColumns:'minmax(0,1fr) minmax(110px,160px)'}:undefined}><span className={styles.stockGroupName}>{name}<small>{rows.length} modelregels · {items.length} SKU’s</small></span>{columns.map(c=><span key={c} className={styles.stockGroupValue}><small>{labels[c]}</small><b><Quantity total={sum[c]}/></b></span>)}</summary><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Subgroep</th><th>Model</th><th className={styles.numeric}>SKU’s</th>{columns.map(c=><th key={c} className={styles.numeric}>{labels[c]}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={JSON.stringify([row.subgroupId,row.model])}><td>{row.subgroupName}</td><td><Link className={styles.articleName} href={stockArticleHref(row,params.status,selectedColumn)}>{row.model||'Model niet bepaald'} <ArrowUpRight size={12} style={{display:'inline'}}/></Link></td><td className={styles.numeric}>{row.articles}</td>{columns.map(c=><td key={c} className={styles.numeric}>{c==='inventory_qty'||(row.totals[c].value??0)>0?<Link href={stockArticleHref(row,params.status,c)} title={c==='inventory_qty'?'Bekijk de bijbehorende SKU’s':`Bekijk SKU’s met voorraad in ${labels[c]}`}><Quantity total={row.totals[c]}/></Link>:<Quantity total={row.totals[c]}/>}</td>)}</tr>)}</tbody><tfoot><tr><th colSpan={2}>Totaal {name}</th><th className={styles.numeric}>{items.length}</th>{columns.map(c=><th key={c} className={styles.numeric}><Quantity total={sum[c]}/></th>)}</tr></tfoot></table></div></details>;})}
   {!models.length&&<div className={styles.panel}><div className={styles.empty}><Boxes size={28} style={{margin:'0 auto 10px'}}/>Geen modellen voor deze selectie. Pas de filters aan of toon ook modellen zonder voorraad.</div></div>}
  </>}
 </div>;
}
