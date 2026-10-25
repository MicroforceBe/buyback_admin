'use client';
import { useRef,useState } from 'react';
import { prepareLeadLabel } from './labelActions';
export default function LeadLabelPrintButton({leadId}:{leadId:string}){
 const [pending,setPending]=useState(false),[error,setError]=useState('');const busy=useRef(false);
 async function print(){
  if(busy.current)return;busy.current=true;setPending(true);setError('');
  try{const result=await prepareLeadLabel(leadId);if(!result.ok){setError(result.message);return;}const {printProductLabel}=await import('@/lib/printProductLabel');await printProductLabel(result.html);}
  catch{setError('Het label kon niet worden geprint. Controleer je sessie en probeer opnieuw.');}
  finally{busy.current=false;setPending(false);}
 }
 return <span className="inline-flex items-center gap-2"><button type="button" onClick={print} disabled={pending} aria-busy={pending} aria-label="Verpakkingslabel printen" title="Verpakkingslabel printen · opgeslagen toestelgegevens" className="bb-btn h-8 text-xs px-3">{pending?'…':<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/><path d="M18 12h.01"/></svg>}</button>{error&&<span role="alert" className="max-w-xs text-xs text-red-700">{error}</span>}</span>;
}
