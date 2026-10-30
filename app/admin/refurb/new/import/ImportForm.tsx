'use client';
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {parseSupplierDeviceCsv} from '@/lib/supplierDeviceCsv';
import {importSupplierDeviceCsv} from './actions';
type Supplier={id:string;name:string;rma_expiry_days:number;csv_import_format:string|null};
const money=(n:number)=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(n/100);
export default function ImportForm({suppliers,canSaveProfile,initialNumber}:{suppliers:Supplier[];canSaveProfile:boolean;initialNumber:string}){
 const [csv,setCsv]=useState(''),[filename,setFilename]=useState(''),[parsed,setParsed]=useState<ReturnType<typeof parseSupplierDeviceCsv>|null>(null),[supplier,setSupplier]=useState(''),[nr,setNr]=useState(initialNumber),[vat,setVat]=useState(''),[save,setSave]=useState(false),[ack,setAck]=useState(false),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),[busy,start]=useTransition();
 const request=useRef(''),readSequence=useRef(0),router=useRouter(),chosen=suppliers.find(s=>s.id===supplier);
 const locked=busy||uncertain;
 function reset(){request.current='';setAck(false);setMessage('');}
 async function load(file:File|undefined){const seq=++readSequence.current;reset();setParsed(null);setCsv('');setFilename('');if(!file)return;
  if(file.size>2_000_000){setMessage('CSV is te groot (maximaal 2 MB).');return;}
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(seq!==readSequence.current)return;const result=parseSupplierDeviceCsv(text);setCsv(text);setParsed(result);setFilename(file.name);}
  catch(e){if(seq===readSequence.current)setMessage(e instanceof Error?e.message:'Bestand kon niet gelezen worden.');}
 }
 function submit(){if(!parsed||!supplier||!vat||!nr||!ack||locked)return;request.current ||=crypto.randomUUID();const f=new FormData();f.set('csv',csv);f.set('supplier_id',supplier);f.set('reception_number',nr);f.set('vat_scheme',vat);f.set('save_profile',save?'1':'0');f.set('request_id',request.current);
  start(async()=>{try{const r=await importSupplierDeviceCsv(f);if(r.id){router.push('/admin/refurb/'+r.id);router.refresh();}else{setMessage(r.error||'Niet geïmporteerd.');if(r.uncertain)setUncertain(true);else request.current='';}}catch{setUncertain(true);setMessage('Geen bevestiging ontvangen. Controleer eerst de receptielijst voordat je opnieuw importeert.');}});
 }
 return <><header className="rma-hero"><div><h1>Receptie uit leveranciersbestand</h1><p>CSV controleren, leverancier kiezen en alle toestellen samen aanmaken.</p></div><Link className="bb-btn" href="/admin/refurb/new">Handmatig aanmaken</Link></header>
 <section className="rma-section"><div className="reception-new-grid">
 <label>CSV-bestand<input type="file" accept=".csv,text/csv" disabled={locked} onChange={e=>void load(e.target.files?.[0])}/></label>
 <label>Receptienummer<input className="bb-input" value={nr} maxLength={100} disabled={locked} onChange={e=>{setNr(e.target.value);reset();}} placeholder="Bijv. 26000624"/></label>
 <label>Leverancier<select className="bb-input" value={supplier} disabled={locked} onChange={e=>{setSupplier(e.target.value);setSave(false);reset();}}><option value="" disabled>Kies leverancier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label>Btw-regeling<select className="bb-input" value={vat} disabled={locked} onChange={e=>{setVat(e.target.value);reset();}}><option value="" disabled>Kies btw-regeling</option><option value="margin">Marge</option><option value="normal">Normale btw</option></select></label>
 </div>{chosen&&<p>RMA-termijn: {chosen.rma_expiry_days} dagen · {chosen.csv_import_format?'Device Details-formaat ingesteld':'Nog geen vast CSV-formaat ingesteld'}</p>}
 {canSaveProfile&&chosen&&!chosen.csv_import_format&&<label><input type="checkbox" checked={save} disabled={locked} onChange={e=>{setSave(e.target.checked);reset();}}/> Dit CSV-formaat standaard bewaren voor {chosen.name}</label>}
 <p>Device Details: Device ID → IMEI/SN, Item → omschrijving, Rate → aankoopprijs per toestel. Amount wordt niet opgeteld. Geen automatische ERP-SKU of grade toegewezen.</p>
 </section>
 {message&&<p role="alert" className="rma-section">{message}{uncertain&&<> <Link href="/admin/refurb">Recepties controleren</Link></>}</p>}
 {parsed&&<section className="rma-section"><header><h2>Controle vóór import</h2><p>{filename} · {parsed.items.length} toestellen · {money(parsed.total_cents)} · factuur {parsed.invoice} · datum {parsed.date}</p></header>
 <div style={{overflowX:'auto',maxHeight:400}}><table className="w-full text-xs"><thead><tr><th>IMEI/SN</th><th>Omschrijving</th><th>Aankoopprijs</th></tr></thead><tbody>{parsed.items.map(item=><tr key={item.imei_sn}><td style={{whiteSpace:'nowrap',padding:6}}>{item.imei_sn}</td><td style={{padding:6}}>{item.description}</td><td style={{whiteSpace:'nowrap',padding:6}}>{money(item.price_cents)}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Totaal</th><th>{money(parsed.total_cents)}</th></tr></tfoot></table></div>
 <label><input type="checkbox" checked={ack} disabled={locked} onChange={e=>setAck(e.target.checked)}/> Ik heb leverancier, btw-regeling, factuur en toestellen gecontroleerd.</label>
 <button className="bb-btn bb-btn-primary" disabled={!supplier||!vat||!nr||!ack||locked} onClick={submit}>{busy?'Importeren…':'Receptie met '+parsed.items.length+' toestellen aanmaken'}</button></section>}
 </>;
}
