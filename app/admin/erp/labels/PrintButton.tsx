'use client';
import { useState } from 'react';
import { printProductLabel } from '@/lib/printProductLabel';
export default function PrintButton({html}:{html?:string|null}){
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  async function print(){
    if(!html||pending)return;
    setPending(true);setError('');
    try{await printProductLabel(html);}catch(error){setError(error instanceof Error?error.message:'Printen mislukt.');}
    finally{setPending(false);}
  }
  return <span className="inline-flex flex-col gap-1"><button type="button" onClick={print} disabled={!html||pending} className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">{pending?'Label voorbereiden…':'Print label'}</button>{error&&<span role="alert" className="text-xs text-red-700">{error}</span>}</span>;
}
