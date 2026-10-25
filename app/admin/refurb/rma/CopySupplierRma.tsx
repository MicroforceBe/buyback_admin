'use client';
import { useState } from 'react';
export default function CopySupplierRma({ text }: { text: string }) {
  const [message,setMessage]=useState('');
  return <div className="space-y-1"><button type="button" className="bb-btn text-sm" onClick={async()=>{try{await navigator.clipboard.writeText(text);setMessage('Overzicht gekopieerd.');}catch{setMessage('Kopiëren lukt niet. Selecteer de gegevens in de tabel.');}}}>Kopieer leveranciersoverzicht</button><p role="status" className="text-xs text-slate-500">{message}</p></div>;
}
