'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { USB_BASE, USB_ORIGIN, emptySessionInput, usbInput, type SessionInput } from '@/lib/diagnosticsUsb';
import styles from './new.module.css';

type Result = { error?:string; sessionId?:string };
export default function NewSessionForm({createSession}:{createSession:(form:FormData)=>Promise<Result>}) {
  const router=useRouter();
  const [fields,setFields]=useState<SessionInput>({...emptySessionInput});
  const [devices,setDevices]=useState<string[]>([]);
  const [selected,setSelected]=useState('');
  const [message,setMessage]=useState('USB-koppeling controleren...');
  const [error,setError]=useState('');
  const [reading,setReading]=useState(false);
  const [saving,setSaving]=useState(false);
  const dirty=useRef(false);
  const operation=useRef(0);
  const controller=useRef<AbortController|null>(null);

  async function usbRead(chosen?:string) {
    if(window.location.origin!==USB_ORIGIN){setMessage('USB-uitlezen is alleen beschikbaar op de vaste testsite.');return;}
    controller.current?.abort();
    const abort=new AbortController();controller.current=abort;
    const sequence=++operation.current;
    setReading(true);setError('');setMessage('Aangesloten iPhone uitlezen...');
    const timer=window.setTimeout(()=>abort.abort(),45000);
    async function get(path:string){
      const response=await fetch(USB_BASE+path,{headers:{'X-Microforce-USB':'1'},signal:abort.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'USB uitlezen mislukt.');
      return result;
    }
    try{
      const health=await get('/health');
      if(health.protocol!==1||health.environment!=='test'||health.upload!==false)throw new Error('De USB-koppeling is niet de juiste testversie.');
      const result=await get('/devices');
      const ids:string[]=Array.isArray(result.devices)?result.devices.filter((id:unknown)=>typeof id==='string'&&/^[a-f0-9-]{16,80}$/i.test(id)):[];
      if(sequence!==operation.current)return;
      setDevices(ids);
      if(!ids.length){setMessage('Geen iPhone gevonden. Sluit de iPhone via USB aan en ontgrendel het toestel.');return;}
      if(chosen&&!ids.includes(chosen))throw new Error('De gekozen iPhone is niet meer aangesloten. Kies het toestel opnieuw.');
      const id=chosen|| (ids.length===1?ids[0]:'');
      setSelected(id);
      if(!id){setMessage('Meerdere iPhones aangesloten. Kies hieronder het juiste toestel en klik op Uitlezen.');return;}
      const data=usbInput((await get('/device/read?udid='+encodeURIComponent(id))).device);
      if(sequence!==operation.current)return;
      if(dirty.current){setMessage('Niet overgenomen omdat je ondertussen velden hebt gewijzigd. Klik opnieuw op Uitlezen.');return;}
      setFields(data);
      setMessage('iPhone uitgelezen. Controleer de gegevens en klik op Sessie starten. Batterijconditie en ontbrekende gegevens vul je zelf aan.');
    }catch(e){
      if(sequence!==operation.current)return;
      setError(e instanceof Error&&e.name!=='TypeError'&&e.name!=='AbortError'?e.message:'De lokale USB-koppeling is niet bereikbaar. Start USB TEST op deze computer en sta lokale netwerktoegang toe als de browser daarom vraagt. Klik daarna opnieuw op Uitlezen.');
      setMessage('Je kunt de gegevens ook handmatig invullen.');
    }finally{window.clearTimeout(timer);if(sequence===operation.current)setReading(false);}
  }
  useEffect(()=>{
    void usbRead();
    return()=>{operation.current++;controller.current?.abort();};
    // Field edits never trigger another hardware request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setSaving(true);setError('');
    try{
      const result=await createSession(new FormData(event.currentTarget));
      if(result.error)setError(result.error);
      else if(result.sessionId)router.push('/admin/diagnostics/'+result.sessionId);
    }catch{setError('De sessie kon niet worden opgeslagen. Je invoer blijft behouden; probeer opnieuw.');}
    finally{setSaving(false);}
  }
  const labels:Partial<Record<keyof SessionInput,string>>={imei:'IMEI',serialNumber:'Serienummer',brand:'Merk',model:'Model',storage:'Opslag',color:'Kleur',batteryHealth:'Batterijconditie (%)',iosVersion:'iOS-versie',productType:'Toesteltype (Apple)'};
  return <form onSubmit={submit} className={styles.form}>
    <section className={styles.usb} aria-label="USB uitlezen"><div><strong>iPhone via USB</strong><p role="status" aria-live="polite">{message}</p></div>
      {devices.length>1&&<label>Toestel<select value={selected} onChange={e=>setSelected(e.target.value)} disabled={reading||saving}><option value="">Kies toestel</option>{devices.map((id,index)=><option key={id} value={id}>iPhone {index+1} · {id.slice(-6)}</option>)}</select></label>}
      <button type="button" disabled={reading||saving} onClick={()=>{if(dirty.current){if(!window.confirm('De ingevulde gegevens vervangen door de USB-uitlezing?'))return;dirty.current=false;}void usbRead(selected);}}>{reading?'Uitlezen...':'Opnieuw uitlezen'}</button>
    </section>
    {error&&<div role="alert" className={styles.error}>{error}</div>}
    <fieldset disabled={saving||reading} className={styles.fields}>{Object.entries(labels).map(([key,label])=><label key={key} htmlFor={'device-'+key}>{label}<input id={'device-'+key} name={key} value={fields[key as keyof SessionInput]} type={key==='batteryHealth'?'number':'text'} min={key==='batteryHealth'?0:undefined} max={key==='batteryHealth'?100:undefined} maxLength={120} required={key==='model'} onChange={e=>{dirty.current=true;setFields(previous=>({...previous,[key]:e.target.value}));}}/></label>)}</fieldset>
    <input type="hidden" name="udid" value={fields.udid}/>
    <div className={styles.footer}><span>Er wordt pas een sessie bewaard wanneer je op Sessie starten klikt.</span><button type="submit" disabled={saving||reading}>{saving?'Opslaan...':'Sessie starten'}</button></div>
  </form>;
}
