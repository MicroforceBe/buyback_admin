'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import styles from './ReceptionQuickSearch.module.css';

type ReceptionOption={id:string;number:string;supplier:string;date:string;completed:boolean};

export default function ReceptionQuickSearch({receptions}:{receptions:ReceptionOption[]}){
  const router=useRouter();
  const [query,setQuery]=useState('');
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(-1);
  const term=query.trim().toLocaleLowerCase('nl-BE');
  // The protected page already loaded this small index. Typing makes no API requests.
  const matches=term.length<3?[]:receptions.filter(row=>String(row.number||'').toLocaleLowerCase('nl-BE').includes(term)||String(row.supplier||'').toLocaleLowerCase('nl-BE').includes(term));
  const visible=open&&term.length>=3;
  const selected=active>=0&&active<matches.length?active:-1;
  const resultId='reception-quick-search-results';
  useEffect(()=>{if(visible&&selected>=0)document.getElementById(`${resultId}-${selected}`)?.scrollIntoView({block:'nearest'});},[visible,selected,term]);
  return <div className={styles.lookup} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null)){setOpen(false);setActive(-1);}}}>
    <label htmlFor="reception-quick-search" className="sr-only">Receptie zoeken</label>
    <input id="reception-quick-search" type="text" role="combobox" aria-label="Receptie zoeken" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible?resultId:undefined} aria-activedescendant={visible&&selected>=0?`${resultId}-${selected}`:undefined} autoComplete="off" maxLength={120} placeholder="Zoek receptie of leverancier (min. 3 tekens)" value={query}
      onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(-1);}}
      onFocus={()=>setOpen(true)}
      onKeyDown={event=>{
        if(event.key==='Escape'){setOpen(false);setActive(-1);return;}
        if(term.length<3||!matches.length)return;
        if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);setActive(index=>(index+1)%matches.length);}
        if(event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(index=>index<=0?matches.length-1:index-1);}
        if(event.key==='Enter'&&visible){event.preventDefault();const target=matches[selected<0?0:selected];setOpen(false);router.push('/admin/refurb/'+encodeURIComponent(target.id));}
      }}/>
    <span className="sr-only" role="status" aria-live="polite">{term.length>=3?`${matches.length} recepties gevonden.`:''}</span>
    {visible&&<div className={styles.popover}>
      {matches.length?<ul id={resultId} role="listbox" aria-label="Gevonden recepties">{matches.map((row,index)=><li key={row.id} role="presentation"><Link id={`${resultId}-${index}`} href={'/admin/refurb/'+encodeURIComponent(row.id)} prefetch={false} role="option" aria-selected={selected===index} className={styles.option} data-active={selected===index} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>setOpen(false)}>
        <strong>{row.number}{row.completed?<span className={styles.completed}>Afgewerkt</span>:null}</strong><span>{row.supplier}{row.date?' · '+row.date:''}</span>
      </Link></li>)}</ul>:<p id={resultId} className={styles.empty}>Geen recepties gevonden.</p>}
    </div>}
  </div>;
}
