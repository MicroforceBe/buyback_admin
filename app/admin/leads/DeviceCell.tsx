'use client';

import { useState } from 'react';
import { updateLeadInlineAction } from './actions';

export default function DeviceCell(props: {
  id: string;
  model?: string | null;
  capacity_gb?: number | null;
  sku?: string | null;
  imei_sn?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [sku, setSku] = useState(props.sku ?? '');
  const [imei, setImei] = useState(props.imei_sn ?? '');
  const [saving, setSaving] = useState(false);

  const input = 'bb-input h-8 text-xs px-2 py-1 w-full border rounded';
  const label = 'text-[11px] text-gray-500';
  const btn = 'bb-btn h-8 text-xs px-2 border rounded';

  async function save() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('id', props.id);
      fd.append('sku', sku);
      fd.append('imei_sn', imei);
      await updateLeadInlineActionJson(fd);
    } catch (e: any) {
      alert(e?.message ?? 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      {/* compacte header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm">
            {props.model ?? '—'} {props.capacity_gb ? `• ${props.capacity_gb} GB` : ''}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            SKU: {sku || '—'} • IMEI/SN: {imei || '—'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-xs px-2 h-7 border rounded"
          aria-expanded={open}
          title={open ? 'Sluiten' : 'Bewerken'}
        >
          {open ? '▴' : '▾'}
        </button>
      </div>

{open && (
  <form action={updateLeadInlineAction} className="mt-2 flex flex-col gap-1">
    <input type="hidden" name="id" value={props.id} />

    <div className="flex flex-col">
      <label className={label}>SKU</label>
      <input name="sku" className={input} value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU" />
    </div>

    <div className="flex flex-col">
      <label className={label}>IMEI (15c) of Serienummer</label>
      <input name="imei_sn" className={input} value={imei} onChange={e => setImei(e.target.value)} placeholder="IMEI of SN" />
    </div>

    <div className="pt-1">
      <button className={btn} type="submit">Opslaan</button>
    </div>
  </form>
)}

    </div>
  );
}
