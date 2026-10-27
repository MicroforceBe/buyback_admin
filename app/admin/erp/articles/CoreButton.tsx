'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Star} from 'lucide-react';
import {setArticleCore} from './actions';
export default function CoreButton({id,value}:{id:string;value:boolean|null}){
 const [error,setError]=useState(''),[pending,start]=useTransition(),router=useRouter();
 return <><button type="button" disabled={pending} aria-pressed={value===true} title="Core-assortiment wijzigen" className={`erp-core ${value?'selected':''}`} onClick={()=>start(async()=>{setError('');try{const r=await setArticleCore(id,value);if(!r.ok)setError(r.error??'Opslaan mislukt.');else router.refresh();}catch{setError('Geen toegang of sessie verlopen. Vernieuw de pagina.');}})}><Star size={13} fill={value?'currentColor':'none'}/>{pending?'Opslaan…':value?'Core':'Geen core'}</button>{error&&<span role="alert" className="erp-field-error">{error}</span>}</>;
}
