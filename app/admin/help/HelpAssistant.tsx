'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { CircleHelp, X, Send, BookOpen, ArrowUpRight, RotateCcw } from 'lucide-react';
import type { HelpModule } from '@/lib/helpManual';
import styles from './HelpAssistant.module.css';

export type HelpChoice={id:HelpModule;label:string;href:string;questions:string[]};
type Topic={id:string;title:string;text:string;href:string};
type Answer={kind:string;message:string;topics:Topic[]};
type Exchange={question:string;answer:Answer};
function pageModule(path:string):HelpModule|null {
  if(path==='/admin/refurb/rma'||path.startsWith('/admin/refurb/rma/'))return 'rma_supplier';
  if(path==='/admin/refurb'||path.startsWith('/admin/refurb/'))return 'refurb';
  if(path==='/admin/leads'||path.startsWith('/admin/leads/'))return 'leads';
  if(path==='/admin/erp'||path.startsWith('/admin/erp/'))return 'erp';
  return null;
}
export default function HelpAssistant({modules,full=false}:{modules:HelpChoice[];full?:boolean}) {
  const pathname=usePathname()||'';
  const context=pageModule(pathname);
  const [open,setOpen]=useState(full),[module,setModule]=useState<HelpModule>(modules.find(m=>m.id===context)?.id||modules[0]?.id||'leads');
  const [question,setQuestion]=useState(''),[exchanges,setExchanges]=useState<Exchange[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLTextAreaElement>(null),controller=useRef<AbortController|null>(null),latest=useRef(0),end=useRef<HTMLDivElement>(null),opener=useRef<HTMLButtonElement>(null),panel=useRef<HTMLElement>(null);
  function reset(){latest.current++;controller.current?.abort();setExchanges([]);setQuestion('');setError('');setBusy(false);}
  function close(){setOpen(false);opener.current?.focus();}
  useEffect(()=>{reset();if(context&&modules.some(m=>m.id===context))setModule(context);},[pathname]); // No dossier URL or query parameters are sent.
  useEffect(()=>{if(open)input.current?.focus();},[open]);
  useEffect(()=>{end.current?.scrollIntoView({block:'nearest'});},[exchanges,busy]);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  const active=modules.find(m=>m.id===module);
  if(!modules.length||(!full&&(pathname==='/admin/help'||pathname.startsWith('/admin/login'))))return null;
  async function ask(value:string){
    const q=value.trim();if(busy||q.length<3||q.length>800)return;
    const id=++latest.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setBusy(true);setError('');
    try{
      const res=await fetch('/api/admin/help',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({module,question:q}),signal:abort.signal,cache:'no-store'});
      const data=await res.json();if(id!==latest.current)return;
      if(res.status===401||res.status===403){setExchanges([]);setQuestion('');}
      if(!res.ok)throw Error(data.error||'De handleiding kon niet worden geladen. Probeer opnieuw.');
      setExchanges(old=>[...old.slice(-7),{question:q,answer:data}]);setQuestion('');
    }catch(e){if(id===latest.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:'Opvragen mislukt.');}
    finally{if(id===latest.current)setBusy(false);}
  }
  const content=<>
    <header className={styles.header}><span className={styles.mark}><BookOpen size={21}/></span><div><strong>Microforce helpassistent</strong><small>Handleiding · alleen uitleg</small></div>{!full&&<button type="button" onClick={close} aria-label="Help sluiten"><X size={20}/></button>}</header>
    <div className={styles.toolbar}><label htmlFor={full?'help-module-full':'help-module'}>Module</label><select id={full?'help-module-full':'help-module'} value={module} onChange={e=>{reset();setModule(e.target.value as HelpModule);}}>{modules.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select><button type="button" onClick={reset} title="Gesprek leegmaken" aria-label="Gesprek leegmaken"><RotateCcw size={17}/></button>{!full&&<Link href="/admin/help" title="Help op volledige pagina" aria-label="Help op volledige pagina"><ArrowUpRight size={18}/></Link>}</div>
    <div className={styles.messages}>
      <div className={styles.intro}><strong>Waarmee kan ik je helpen?</strong><p>Stel een gebruiksvraag over {active?.label}. Ik zoek in de beheerde handleiding. Ik bekijk geen dossiers en wijzig geen gegevens.</p><small>Deze eerste versie gebruikt handleidingzoekwerk, geen generatieve AI. Elke vraag wordt afzonderlijk behandeld.</small></div>
      {!exchanges.length&&<div className={styles.suggestions}>{active?.questions.map(q=><button type="button" key={q} disabled={busy} onClick={()=>ask(q)}>{q}<span aria-hidden="true">↗</span></button>)}</div>}
      {exchanges.map((item,i)=><div key={i} className={styles.exchange}><p className={styles.question}>{item.question}</p><div className={styles.answer}><p>{item.answer.message}</p>{item.answer.topics.map(t=><article key={t.id}><strong>{t.title}</strong><p>{t.text}</p><Link href={t.href} onClick={()=>{if(!full)close();}}>Open {active?.label} <ArrowUpRight size={13}/></Link></article>)}</div></div>)}
      {busy&&<p role="status">Handleiding doorzoeken…</p>}
      {error&&<p className={styles.error} role="alert">{error} <Link href="/admin/login">Aanmelden</Link></p>}
      <div ref={end}/>
    </div>
    <form className={styles.form} onSubmit={e=>{e.preventDefault();void ask(question);}}><label htmlFor={full?'help-question-full':'help-question'}>Je gebruiksvraag</label><div><textarea id={full?'help-question-full':'help-question'} ref={input} value={question} maxLength={800} rows={2} onChange={e=>setQuestion(e.target.value)} placeholder="Bijvoorbeeld: hoe print ik een label?" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask(question);}}}/><button type="submit" disabled={busy||question.trim().length<3} aria-label="Vraag stellen"><Send size={18}/></button></div><small>Geen klantgegevens invullen. Gesprekken worden niet opgeslagen.</small></form>
  </>;
  if(full)return <section className={styles.full} aria-label="Helpassistent">{content}</section>;
  return <>{open&&<><div className={styles.backdrop} onClick={close}/><section ref={panel} role="dialog" aria-modal="true" aria-label="Helpassistent" className={styles.panel} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const els=panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],select,textarea');if(!els?.length)return;const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}>{content}</section></>}<button type="button" ref={opener} className={styles.launcher} onClick={()=>setOpen(v=>!v)} aria-haspopup="dialog" aria-expanded={open}><CircleHelp size={20}/> Hulp</button></>;
}
