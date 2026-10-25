import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageAccess } from '@/lib/security/access';
import { supplierRmaStages, supplierRmaTotals } from '@/lib/supplierRma';
import { loadSupplierRmaData } from '../data';
import { updateSupplierRmaCase, updateSupplierRmaItem, addSupplierRmaItems, copySupplierRmaExpected, finalizeSupplierRma } from '../actions';
import CopySupplierRma from '../CopySupplierRma';
export const dynamic='force-dynamic';export const revalidate=0;
const money=(cents:number)=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(cents/100);
const inputMoney=(cents:number|null)=>cents==null?'':(cents/100).toFixed(2);
const cell='border-b px-3 py-2';
const dateTime=(value:string)=>new Date(value).toLocaleString('nl-BE',{timeZone:'Europe/Brussels'});
export default async function SupplierRmaDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{saved?:string}>}){
  await requirePageAccess('refurb',true);
  const {id}=await params,query=await searchParams;
  let data;try{data=await loadSupplierRmaData();}catch{return <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4">RMA-gegevens konden niet volledig geladen worden. Vernieuw de pagina.</p>;}
  const dossier=data.cases.find(row=>row.id===id);if(!dossier)notFound();
  const items=data.caseItems.filter(row=>row.case_id===id),totals=supplierRmaTotals(items),handled=dossier.stage==='handled',closed=['handled','refunded','closed','rejected','cancelled'].includes(dossier.stage);
  const eligible=data.candidates.filter(row=>!dossier.reception_id||row.reception_id===dossier.reception_id).filter(row=>dossier.supplier_id?row.reception!.supplier_id===dossier.supplier_id:!row.reception!.supplier_id&&row.reception!.supplier.trim().toLowerCase()===dossier.supplier_name.trim().toLowerCase()).filter(row=>!items.some(item=>item.reception_item_id===row.id));
  const history=data.history.filter(row=>row.case_id===id).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const sourceIds=new Set(items.map(row=>row.reception_item_id));
  const statusHistory=data.statusHistory.filter(row=>sourceIds.has(row.reception_item_id)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const clipboard=[dossier.code,dossier.supplier_name,'RMA-nummer leverancier: '+dossier.supplier_reference,'CN-nummer leverancier: '+(dossier.supplier_credit_note||''),'',...items.map(row=>{const source=data.sourceById.get(row.reception_item_id),reception=source?data.receptionById.get(source.reception_id):undefined;return [reception?.reception_number,reception?.supplier_invoice_nr,source?.imei_sn||source?.manual_sn,source?.description,source?.rma_defect_description,row.expected_cents==null?'Verwacht onbekend':money(row.expected_cents)].join('\t');}),'','Totaal verwacht: '+money(totals.expected)].join('\n');
  const fields=()=> <><input type="hidden" name="case_id" value={id}/><input type="hidden" name="version" value={dossier.version}/></>;
  return <div className="space-y-5">
    <Link href="/admin/refurb/rma" className="text-sm text-blue-600 underline">← RMA Supplier</Link>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-lg font-semibold">{dossier.code}</h1><p className="text-sm text-slate-500">{dossier.supplier_name} · {supplierRmaStages[dossier.stage as keyof typeof supplierRmaStages]}</p></div><CopySupplierRma text={clipboard}/></div>
    {dossier.reception_id&&<p className="text-sm"><Link href={'/admin/refurb/'+dossier.reception_id} className="text-blue-600 underline">Receptie {data.receptionById.get(dossier.reception_id)?.reception_number}</Link><span className="block text-xs text-slate-500">Nieuwe RMA-artikelen uit deze receptie worden automatisch toegevoegd zolang dit dossier actief is.</span></p>}
    {query?.saved==='1'&&<p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">Opgeslagen. De wijziging staat in de historiek.</p>}
    <div className="grid gap-3 sm:grid-cols-3">{[{name:'Verwacht',value:totals.expected},{name:'Ontvangen',value:totals.received},{name:closed?'Verschil verwacht / ontvangen':'Nog te ontvangen',value:totals.outstanding}].map(row=><div key={row.name} className="rounded-md border bg-white p-4"><div className="text-xs text-slate-500">{row.name}</div><div className="mt-1 text-xl font-semibold">{money(row.value)}</div></div>)}</div>
    {totals.unknown>0&&<p role="status" className="text-sm text-amber-700">Voor {totals.unknown} artikelen is het verwachte bedrag nog onbekend.</p>}
    <form action={updateSupplierRmaCase} className="grid gap-3 rounded-md border bg-white p-4 sm:grid-cols-2 xl:grid-cols-3">{fields()}
      <fieldset disabled={handled} className="contents"><label className="flex flex-col gap-1 text-xs">Dossierstatus<select name="stage" defaultValue={dossier.stage} className="bb-input h-9 px-2">{Object.entries(supplierRmaStages).filter(([value])=>value!=='handled'||handled).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">RMA-nummer leverancier<input name="supplier_reference" maxLength={250} defaultValue={dossier.supplier_reference} className="bb-input h-9 px-2"/></label>
      <label className="flex flex-col gap-1 text-xs">CN-nummer leverancier (bij Refunded)<input name="supplier_credit_note" maxLength={250} defaultValue={dossier.supplier_credit_note||''} className="bb-input h-9 px-2"/></label>
      <label className="flex flex-col gap-1 text-xs">Verzend-/trackingreferentie<input name="tracking_reference" maxLength={250} defaultValue={dossier.tracking_reference} className="bb-input h-9 px-2"/></label>
      <label className="flex flex-col gap-1 text-xs">Verzonden op<input type="date" name="sent_on" defaultValue={dossier.sent_on||''} className="bb-input h-9 px-2"/></label>
      <label className="flex flex-col gap-1 text-xs">Ontvangen door leverancier op<input type="date" name="received_on" defaultValue={dossier.received_on||''} className="bb-input h-9 px-2"/></label>
      <label className="flex flex-col gap-1 text-xs">Opnieuw opvolgen op<input type="date" name="followup_on" defaultValue={dossier.followup_on||''} className="bb-input h-9 px-2"/></label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2 xl:col-span-3">Notities / afspraken<textarea name="notes" maxLength={10000} defaultValue={dossier.notes} rows={3} className="bb-input p-2"/></label>
      <div><button className="bb-btn bb-btn-primary text-sm">Dossier opslaan</button></div><p className="text-xs text-slate-500 sm:col-span-2">Dossierstatus en toestelstatus blijven afzonderlijk. Afsluiten bewaart de historiek en maakt artikelen vrij voor een eventueel later dossier.</p>
      </fieldset>
    </form>
    {handled&&<p role="status" className="rounded-md border bg-slate-50 p-3 text-sm">Dit dossier is definitief afgehandeld. Gegevens en historiek blijven beschikbaar; wijzigingen en heropenen zijn geblokkeerd.</p>}
    <section className="space-y-2">
      <h2 className="text-base font-semibold">Artikelen en compensaties</h2>
      <p className="text-xs text-slate-500">Sla gewijzigde verwachte bedragen eerst op. De pijlen nemen de opgeslagen verwachting over naar ontvangen en overschrijven het bestaande ontvangen bedrag. Gebruik dit uitsluitend na effectieve ontvangst van de compensatie.</p>
      <div className="overflow-x-auto rounded-md border bg-white"><table className="w-full text-sm">
        <caption className="sr-only">Dossierartikelen, compensaties en totalen</caption>
        <thead className="bg-slate-50"><tr>
          {['Receptie / IMEI-SN','Omschrijving / defect','Toestelstatus','Verwacht (€)'].map(label=><th key={label} scope="col" className={cell+' text-left'}>{label}</th>)}
          <th scope="col" className={cell}><form action={copySupplierRmaExpected}>{fields()}<input type="hidden" name="all" value="1"/><button disabled={closed||!items.length||totals.unknown>0} aria-label="Verwacht overnemen naar ontvangen voor alle artikelen" title="Op alle artikelen toepassen: opgeslagen verwachte bedragen overnemen naar ontvangen (bestaande waarden overschrijven)" className="bb-btn text-base">⇉</button></form></th>
          {['Ontvangen (€)','Notitie','Opslaan'].map(label=><th key={label} scope="col" className={cell+' text-left'}>{label}</th>)}
        </tr></thead>
        <tbody>{items.map(row=>{
          const source=data.sourceById.get(row.reception_item_id),reception=source?data.receptionById.get(source.reception_id):undefined,formId='rma-item-'+row.id;
          return <tr key={row.id}>
            <td className={cell}><form id={formId} action={updateSupplierRmaItem}>{fields()}<input type="hidden" name="item_id" value={row.id}/></form><Link href={'/admin/refurb/'+(source?.reception_id||'')} prefetch={false} className="text-blue-600 underline">{reception?.reception_number||'Receptie'}</Link><span className="block font-mono text-xs">{source?.imei_sn||source?.manual_sn||'—'}</span><span className="block text-xs text-slate-500">{reception?.supplier_invoice_nr}</span></td>
            <th scope="row" className={cell+' text-left font-normal'}>{source?.description||'—'}<span className="block text-xs text-slate-500">{source?.rma_defect_description}</span></th>
            <td className={cell}>{source?.refurb_status||'—'}</td>
            <td className={cell}><input form={formId} name="expected" inputMode="decimal" aria-label="Verwachte compensatie" defaultValue={inputMoney(row.expected_cents)} disabled={closed} required className="bb-input h-9 w-28 px-2"/></td>
            <td className={cell}><form action={copySupplierRmaExpected}>{fields()}<input type="hidden" name="item_id" value={row.id}/><button disabled={closed||row.expected_cents==null} aria-label={'Verwacht overnemen naar ontvangen voor '+(source?.imei_sn||source?.description||'artikel')} title="Opgeslagen verwacht bedrag overnemen naar ontvangen" className="bb-btn">→</button></form></td>
            <td className={cell}><input form={formId} name="received" inputMode="decimal" aria-label="Ontvangen compensatie" defaultValue={inputMoney(row.received_cents)} disabled={closed} required className="bb-input h-9 w-28 px-2"/></td>
            <td className={cell}><input form={formId} name="notes" aria-label="Artikelnotitie" maxLength={5000} defaultValue={row.notes} disabled={closed} className="bb-input h-9 min-w-40 px-2"/></td>
            <td className={cell}><button form={formId} disabled={closed} className="bb-btn text-xs">Opslaan</button></td>
          </tr>;
        })}</tbody>
        <tfoot className="bg-slate-50 font-semibold"><tr><th scope="row" colSpan={3} className={cell+' text-left'}>Totaal ({items.length} artikelen)</th><td className={cell}>{money(totals.expected)}{totals.unknown>0&&<span className="block text-xs text-amber-700">{totals.unknown} onbekend</span>}</td><td className={cell}></td><td className={cell}>{money(totals.received)}</td><td colSpan={2} className={cell}>Verschil: {money(totals.expected-totals.received)}</td></tr></tfoot>
      </table></div>
    </section>
    {!handled&&<form action={finalizeSupplierRma} className="space-y-3 rounded-md border bg-white p-4">{fields()}<h2 className="font-semibold">Definitief afhandelen</h2><p className="text-sm text-slate-600">Controleer eerst de bedragen, het RMA-nummer en het CN-nummer. Ook een resterend verschil wordt definitief vastgelegd. Deze stap registreert geen extra betaling en wijzigt geen toestelstatus.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm_final" value="1" required/><span>Ik heb dit dossier gecontroleerd en wil het definitief afhandelen. Daarna kan het niet meer gewijzigd of heropend worden.</span></label><button className="bb-btn bb-btn-primary text-sm">Definitief afhandelen</button></form>}
    {!closed&&eligible.length>0&&<details className="rounded-md border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Artikelen toevoegen ({eligible.length})</summary><form action={addSupplierRmaItems} className="mt-3 space-y-3">{fields()}<div className="max-h-64 space-y-2 overflow-auto">{eligible.map(row=><label key={row.id} className="flex gap-2 text-sm"><input type="checkbox" name="item_ids" value={row.id}/><span>{row.reception!.reception_number} · {row.imei_sn||row.manual_sn||'—'} · {row.description}</span></label>)}</div><button className="bb-btn text-sm">Geselecteerde artikelen toevoegen</button></form></details>}
    <section className="space-y-2"><h2 className="text-base font-semibold">Dossierhistoriek</h2><ol className="space-y-2 text-sm">{history.map(row=><li key={row.id} className="rounded-md border bg-white p-3"><span className="font-medium">{({create:'Dossier aangemaakt',add_items:'Artikelen toegevoegd',update_case:'Dossier bijgewerkt',auto_add_item:'RMA-artikel automatisch toegevoegd vanuit receptie',late_rma:'Latere RMA vanuit receptie gemeld',update_item:'Artikelbedragen / notitie bijgewerkt',copy_item:'Verwacht bedrag overgenomen naar ontvangen',copy_all:'Verwachte bedragen voor alle artikelen overgenomen naar ontvangen',finalize:'Dossier definitief afgehandeld'} as Record<string,string>)[row.event]||'Wijziging'}</span>{typeof row.details.change?.stage==='string'&&<span> · {supplierRmaStages[row.details.change.stage as keyof typeof supplierRmaStages]||row.details.change.stage}</span>}{typeof row.details.change?.supplier_reference==='string'&&<span className="block text-xs">RMA-nummer leverancier: {row.details.change.supplier_reference||'—'}</span>}{typeof row.details.change?.supplier_credit_note==='string'&&<span className="block text-xs">CN-nummer leverancier: {row.details.change.supplier_credit_note||'—'}</span>}<span className="block text-xs text-slate-500">{dateTime(row.created_at)} · {row.actor}</span></li>)}</ol></section>
    <details className="rounded-md border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Toestelstatussen en compensatiehistoriek ({statusHistory.length})</summary><ol className="mt-3 space-y-2 text-sm">{statusHistory.map(row=><li key={row.id} className="border-t pt-2">{data.sourceById.get(row.reception_item_id)?.description||'Artikel'}<span className="block">{row.old_status||'Begin'} → {row.new_status||'Geen status'} · compensatie {row.new_compensation_cents==null?'niet ingevuld':money(row.new_compensation_cents)}</span><span className="text-xs text-slate-500">{dateTime(row.created_at)} · via receptie</span></li>)}{!statusHistory.length&&<li className="text-slate-500">Nog geen wijzigingen geregistreerd sinds de invoering van RMA-opvolging.</li>}</ol></details>
  </div>;
}
