"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useParams} from 'next/navigation';
import {WEB_TESTS,RESULT_LABELS,emptyResult,validateWebResult,type WebResult,type DiagnosticStatus} from '@/lib/diagnostics';
import TestExercise from './TestExercise';
import styles from './diagnostics.module.css';

export default function WebDiagnosticsPage(){
 const {id}=useParams<{id:string}>();
 const [results,setResults]=useState<Record<string,WebResult>>({});
 const [drafts,setDrafts]=useState<Record<string,WebResult>>({});
 const [index,setIndex]=useState(-1),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[model,setModel]=useState('');
 const requestId=useRef(0);
 const resultsRef=useRef(results);resultsRef.current=results;
 const spec=WEB_TESTS[index],key=spec?.key||'';
 const dirty=Object.keys(drafts).some(k=>JSON.stringify(drafts[k])!==JSON.stringify(results[k]));
 useEffect(()=>{
  const controller=new AbortController();
  async function load(){
   setLoading(true);setError('');
   try{
    const response=await fetch('/api/diagnostics/web-results?sessionId='+encodeURIComponent(id),{cache:'no-store',signal:controller.signal});
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error||'Laden mislukt.');
    setResults(data.results);setModel(data.model||'Toestel');
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Laden mislukt.');}
   finally{if(!controller.signal.aborted)setLoading(false);}
  }
  void load();return()=>{controller.abort();requestId.current++;};
 },[id]);
 useEffect(()=>{
  const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);
 const observe=useCallback((observation:string,evidence:Record<string,number|boolean>={})=>{
  if(!key)return;
  setDrafts(p=>({...p,[key]:{...(p[key]||resultsRef.current[key]||emptyResult(WEB_TESTS.find(t=>t.key===key)!)),observation,evidence:{...(p[key]?.evidence||resultsRef.current[key]?.evidence||{}),...evidence}}}));
 },[key]);
 function update(patch:Partial<WebResult>){
  if(!spec)return;
  setDrafts(p=>({...p,[key]:{...(p[key]||results[key]||emptyResult(spec)),...patch}}));setNotice('');
 }
 async function save(next:boolean,skip=false){
  if(!spec||saving||loading)return;
  setSaving(true);setError('');setNotice('');
  const operation=++requestId.current;
  const current=drafts[key]||results[key]||emptyResult(spec);
  const result=skip?{...current,status:'pending' as const,checks:spec.checks.map(()=>false)}:current;
  try{
   validateWebResult(spec,result);
   const response=await fetch('/api/diagnostics/web-results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:id,testKey:key,expectedId:results[key]?.id||null,result})});
   const data=await response.json();
   if(!response.ok||!data.ok)throw new Error(data.error||'Bewaren mislukt.');
   if(operation!==requestId.current)return;
   setResults(p=>({...p,[key]:data.result}));
   setDrafts(p=>{const copy={...p};delete copy[key];return copy;});
   setNotice(skip?'Overgeslagen en bewaard als niet getest.':'Beoordeling opgeslagen op de server.');
   if(next)setIndex(i=>i+1<WEB_TESTS.length?i+1:-1);
  }catch(e){if(operation===requestId.current)setError(e instanceof Error?e.message:'Opslaan mislukt. Je invoer blijft staan.');}
  finally{if(operation===requestId.current)setSaving(false);}
 }
 function navigate(next:number){if(!saving){setIndex(next);setError('');setNotice('');}}
 const incomplete=WEB_TESTS.filter(t=>!results[t.key]||['pending','unsupported'].includes(results[t.key].status));
 const completed=WEB_TESTS.length-incomplete.length;
 const draft=spec?(drafts[key]||results[key]||emptyResult(spec)):null;
 return <div className={styles.workspace}>
  <header className={styles.header}><div><span className={styles.eyebrow}>Begeleide toestelcontrole</span><h1>{model||'Webdiagnose'}</h1><p>{completed} van {WEB_TESTS.length} controles beoordeeld  /  {dirty?'Niet-opgeslagen invoer aanwezig':'Bewaarde uitslagen van de server'}</p></div>
   <a href={'/admin/diagnostics/'+id} onClick={e=>{if(dirty&&!window.confirm('Er is niet-opgeslagen invoer. Toch de test verlaten?'))e.preventDefault();}}>Terug naar sessie</a>
  </header>
  <div className={styles.progress} aria-label={completed+' van '+WEB_TESTS.length+' beoordeeld'}><span style={{width:completed/WEB_TESTS.length*100+'%'}}/></div>
  {error?<div role="alert" className={styles.error}>{error} {index<0?<button type="button" onClick={()=>window.location.reload()}>Opnieuw laden</button>:null}</div>:null}
  {notice?<div role="status" className={styles.success}>{notice}</div>:null}
  {loading?<p role="status">Bewaarde resultaten laden...</p>:<>
   <nav className={styles.navigation} aria-label="Diagnosetests"><label>Ga naar <select value={index} disabled={saving} onChange={e=>navigate(Number(e.target.value))}><option value={-1}>Overzicht en samenvatting</option>{WEB_TESTS.map((t,i)=><option key={t.key} value={i}>{i+1}. {t.label}  -  {RESULT_LABELS[results[t.key]?.status||'pending']}</option>)}</select></label><button type="button" disabled={saving} onClick={()=>navigate(-1)}>Overzicht</button></nav>
   {spec&&draft?<section className={styles.card}>
    <div className={styles.cardHead}><div><span className={styles.eyebrow}>Controle {index+1} / {WEB_TESTS.length}</span><h2>{spec.label}</h2></div><span className={styles.badge} data-status={results[key]?.status||'pending'}>Bewaard: {RESULT_LABELS[results[key]?.status||'pending']}</span></div>
    <p className={styles.instruction}>{spec.instruction}</p>
    <TestExercise key={key} spec={spec} onObservation={observe}/>
    <div className={styles.review}><h3>Beoordeling door medewerker</h3><p>Een meting of geopende camera is nog geen geslaagde test. Bevestig uitsluitend wat je werkelijk hebt gecontroleerd.</p>
     {spec.checks.map((text,i)=><label className={styles.check} key={text}><input type="checkbox" checked={draft.checks[i]||false} disabled={saving} onChange={e=>{const checks=[...draft.checks];checks[i]=e.target.checked;update({checks});}}/>{text}</label>)}
     <div className={styles.formGrid}><label>Uitslag<select value={draft.status} disabled={saving} onChange={e=>update({status:e.target.value as DiagnosticStatus})}>{Object.entries(RESULT_LABELS).filter(([s])=>s!=='na'||spec.allowNA).map(([status,label])=><option key={status} value={status}>{label}</option>)}</select></label>
      <label>Toelichting {['warning','fail','unsupported','na'].includes(draft.status)?'(verplicht)':'(optioneel)'}<textarea maxLength={2000} value={draft.notes} disabled={saving} onChange={e=>update({notes:e.target.value})}/></label>
     </div>
     {results[key]?.observation?<details><summary>Laatst bewaarde waarneming</summary><p>{results[key].observation}</p></details>:null}
    </div>
    <footer className={styles.actions}><button type="button" disabled={saving||index===0} onClick={()=>navigate(index-1)}>Vorige</button><button type="button" disabled={saving} onClick={()=>void save(true,true)}>Overslaan: niet getest</button><button type="button" disabled={saving} onClick={()=>void save(false)}>Opslaan</button><button type="button" className={styles.primary} disabled={saving} onClick={()=>void save(true)}>{saving?'Bewaren...':'Opslaan en volgende'}</button></footer>
   </section>:<section className={styles.card}>
    <div className={styles.cardHead}><div><span className={styles.eyebrow}>Werkelijke bewaarde resultaten</span><h2>Diagnoseoverzicht</h2></div><span className={styles.badge} data-status={incomplete.length?'pending':'pass'}>{incomplete.length?incomplete.length+' controles open':'Alle controles beoordeeld'}</span></div>
    <p>Geslaagd, afgekeurd en aandachtspunten blijven afzonderlijk zichtbaar. Niet ondersteund is geen geslaagde controle. N.v.t. vereist een reden. Afronden en het certificaat bekijken kan op de sessiepagina.</p>
    {dirty?<p className={styles.error}>Er is nog niet-opgeslagen invoer. De tabel toont alleen bewaarde beoordelingen.</p>:null}
    <div className={styles.buttons}><button type="button" className={styles.primary} disabled={!!error} onClick={()=>navigate(Math.max(0,WEB_TESTS.findIndex(t=>!results[t.key]||['pending','unsupported'].includes(results[t.key].status))))}>{Object.keys(results).length?'Verder met open controles':'Start controle'}</button><a href={'/admin/diagnostics/'+id}>Sessie en certificaat</a></div>
    <div className={styles.tableScroll}><table><thead><tr><th>Controle</th><th>Uitslag</th><th>Toelichting</th><th>Actie</th></tr></thead><tbody>{WEB_TESTS.map((t,i)=>{const r=results[t.key];return <tr key={t.key}><td>{t.label}</td><td><span className={styles.badge} data-status={r?.status||'pending'}>{RESULT_LABELS[r?.status||'pending']}</span></td><td>{r?.notes||' - '}{drafts[t.key]?<small> Niet-opgeslagen invoer</small>:null}</td><td><button type="button" disabled={!!error} onClick={()=>navigate(i)}>Open</button></td></tr>;})}</tbody></table></div>
   </section>}
  </>}
 </div>;
}
