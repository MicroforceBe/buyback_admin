'use client';
import { useRef, useState } from 'react';
import { prepareReceptionLabel } from './labelActions';

export default function RefurbLabelPrintButton({itemId}:{itemId:string}){
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const busy=useRef(false);
  async function print(){
    if(busy.current)return;
    busy.current=true;setPending(true);setError('');
    try{
      const result=await prepareReceptionLabel(itemId);
      if(!result.ok){setError(result.message);return;}
      const {printProductLabel}=await import('@/lib/printProductLabel');
      await printProductLabel(result.html);
    }catch{setError('Het label kon niet worden geprint. Controleer je sessie en probeer opnieuw.');}
    finally{busy.current=false;setPending(false);}
  }
  return <span className="inline-flex items-center gap-1"><button type="button" onClick={print} disabled={pending} title="Verpakkingslabel printen · DYMO 99012 · 89 × 36 mm" aria-label="Verpakkingslabel printen" aria-busy={pending} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">{pending?'…':<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/><path d="M18 12h.01"/></svg>}</button>{error&&<span role="alert" className="max-w-52 text-[11px] text-red-700">{error}</span>}</span>;
}

