'use client';
import {useRef,useState,type ReactNode,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {countCommand} from './actions';
export default function CountForm({command,sessionId,version,children,label,danger=false,disabled=false}:{command:string;sessionId?:string;version?:number;children?:ReactNode;label:string;danger?:boolean;disabled?:boolean}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const attempt=useRef<{signature:string;form:FormData}|null>(null),working=useRef(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(working.current)return;const data=new FormData(e.currentTarget);if(sessionId)data.set('session_id',sessionId);if(version!==undefined)data.set('version',String(version));const signature=JSON.stringify([...data.entries()]);if(attempt.current?.signature!==signature){data.set('request_id',crypto.randomUUID());if(!sessionId)data.set('session_id',crypto.randomUUID());attempt.current={signature,form:data};}working.current=true;setBusy(true);setMessage('');try{const result=await countCommand(command,attempt.current.form);if(result.ok){attempt.current=null;if(command==='create'&&result.session_id)router.push('/admin/erp/counts/'+result.session_id);else{setMessage('Opgeslagen.');router.refresh();}}else setMessage(result.error||'Opslaan kon niet worden bevestigd. Probeer opnieuw.');}catch{setMessage('Opslaan kon niet worden bevestigd. Probeer dezelfde handeling opnieuw.');}finally{working.current=false;setBusy(false);}}
 return <form onSubmit={submit} className="count-form"><fieldset disabled={busy||disabled}>{children}<button type="submit" className={'erp-button '+(danger?'count-danger':'primary')}>{busy?'Bezig…':label}</button></fieldset>{message&&<p role="status" className="count-message">{message}</p>}</form>;
}
