import CopyCode from '../CopyCode';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {stockHierarchy,stockTotals,type StockArticle,type StockColumn} from '@/lib/erpStock';
import styles from '../erp.module.css';
export default function StockTree({articles,column,location}:{articles:StockArticle[];column:StockColumn;location:string}){
 const groups=stockHierarchy(articles);
 const quantity=(items:StockArticle[])=>(stockTotals(items)[column].value??0).toLocaleString('nl-BE');
 return <section aria-label={`Artikelen met voorraad in ${location}`} className={styles.stockTree}>
  {groups.map(group=><details key={group.id??'unassigned'} className={styles.stockTreeGroup} open><summary><span><b>{group.name}</b><small>{group.subgroups.length} subgroepen · {group.articles.length} SKU’s</small></span><span className={styles.stockTreeQuantity}><small>{location}</small><strong>{quantity(group.articles)}</strong></span></summary><div className={styles.stockTreeChildren}>
   {group.subgroups.map(subgroup=><details key={subgroup.id??'none'} className={styles.stockTreeSubgroup}><summary><span><b>{subgroup.name}</b><small>{subgroup.models.length} modellen · {subgroup.articles.length} SKU’s</small></span><span className={styles.stockTreeQuantity}><strong>{quantity(subgroup.articles)}</strong></span></summary><div className={styles.stockTreeChildren}>
    {subgroup.models.map(model=><details key={JSON.stringify(model.model)} className={styles.stockTreeModel}><summary><span><b>{model.model||'Model niet bepaald'}</b><small>{model.items.length} SKU’s met voorraad</small></span><span className={styles.stockTreeQuantity}><strong>{quantity(model.items)}</strong></span></summary><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>SKU</th><th>Artikel</th><th className={styles.numeric}>Voorraad {location}</th></tr></thead><tbody>{model.items.map(article=><tr key={article.id}><td>{article.sku?<CopyCode value={article.sku} className={styles.sku}/>:<span>—</span>}</td><td><Link className={styles.articleName} href={`/admin/erp/articles/${article.id}`}>{article.title||article.sku||'Artikel openen'} <ArrowUpRight size={12} style={{display:'inline'}}/></Link></td><td className={styles.numeric}><strong>{article[column]?.toLocaleString('nl-BE')}</strong></td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Totaal {model.model||'Model niet bepaald'}</th><th className={styles.numeric}>{quantity(model.items)}</th></tr></tfoot></table></div></details>)}
   </div></details>)}
  </div></details>)}
 </section>;
}
