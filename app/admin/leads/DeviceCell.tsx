'use client';

import { useState } from 'react';
import { updateLeadInlineActionJson } from './actions';

export default function DeviceCell(props: {
  id: string;
  model?: string | null;
  capacity_gb?: number | null;
  sku?: string | null;
  imei_sn?: string | null;
}) {
  const [sku, setSku] = useState(props.sku ?? '');
  const [imei, setImei] = useState(props.imei_sn ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('id', props.id);
      fd.append('sku', sku);
      fd.append('imei_sn', imei);
      const updated = await updateLeadInlineActionJson(fd);
      setSku(updated.sku ?? '');
      setImei(updated.imei_sn ?? '');
    } catch (e: any) {
      alert(e?.message ?? 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'bb-input h-8 text-xs px-2 py-1 w-full border rounded';
  const btnCls = 'bb-btn h-8 text-xs px-2 border rounded';

  return (
    <div className="space-y-1">
      <div className="text-sm">
        {props.model ?? '—'} {props.capacity_gb ? `• ${props.capacity_gb} GB` : ''}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500">SKU</label>
          <input className={inputCls} value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU" />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-gray-500">IMEI (15c) of Serienummer</label>
          <input className={inputCls} value={imei} onChange={e => setImei(e.target.value)} placeholder="IMEI of SN" />
        </div>
        <div>
          <button className={btnCls} onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}
