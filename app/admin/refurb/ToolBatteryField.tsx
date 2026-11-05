'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {fillMissingToolBattery} from './toolBatteryActions';

export default function ToolBatteryField({itemId,known,canEdit}:{itemId?:string;known:string|null;canEdit:boolean}){
  const [value,setValue]=useState(''),[saved,setSaved]=useState<number|null>(null),[pending,setPending]=useState(false),[error,setError]=useState('');
  const busy=useRef(false),router=useRouter();
  if(known)return <span>{known}</span>;
  if(saved!==null)return <span role="status">{saved}% · opgeslagen</span>;
  if(!itemId||!canEdit)return <span>—</span>;
  async function save(){
    if(busy.current||!itemId)return;
    if(!/^\d{1,3}$/.test(value)||Number(value)>100){setError('Vul een geheel percentage van 0 tot 100 in.');return;}
    busy.current=true;setPending(true);setError('');
    try{const result=await fillMissingToolBattery(itemId,value);if(!result.ok){setError(result.message);return;}setSaved(result.battery);router.refresh();}
    catch{setError('Niet opgeslagen. Controleer je sessie en probeer opnieuw.');}
    finally{busy.current=false;setPending(false);}
  }
  return <span className="inline-flex flex-wrap items-center gap-2 align-middle"><input type="text" inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} value={value} onChange={e=>{setValue(e.target.value);setError('');}} disabled={pending} aria-label="Ontbrekend batterijpercentage" placeholder="0–100" className="h-8 w-20 rounded-md border border-slate-300 px-2 text-sm" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save();}}}/><span aria-hidden="true">%</span><button type="button" className="bb-btn h-8 text-xs" disabled={pending||!value} onClick={save}>{pending?'Opslaan…':'Opslaan'}</button>{error&&<span role="alert" className="text-xs text-red-700">{error}</span>}</span>;
}
