'use client';

import { useState } from 'react';
import { updateLeadInlineAction } from './actions';

type Props = {
  id: string;
  model: string | null;
  capacity_gb: number | null;
  sku: string | null;
  imei_sn: string | null;
};

const input = 'bb-input h-9 text-xs px-2 py-1';
const label = 'text-[11px] text-gray-500';

export default function DeviceCell(p: Props) {
  const [open, setOpen] = useState(false);

  const modelLine = [p.model, p.capacity_gb ? `${p.capacity_gb} GB` : ''].filter(Boolean).join(' • ') || '—';

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate">{modelLine}</div>
          <div className="text-[11px] text-gray-500 truncate">
            {p.sku ? `SKU: ${p.sku}` : 'SKU: —'} {p.imei_sn ? `• IMEI/SN: ${p.imei_sn}` : '• IMEI/SN: —'}
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
          <input type="hidden" name="id" value={p.id} />

          <div className="flex flex-col">
            <label className={label}>SKU</label>
            <input name="sku" className={input} defaultValue={p.sku ?? ''} placeholder="SKU" />
          </div>

          <div className="flex flex-col">
            <label className={label}>IMEI (15c) of Serienummer</label>
            <input name="imei_sn" className={input} defaultValue={p.imei_sn ?? ''} placeholder="IMEI of SN" />
          </div>

          <div className="pt-1">
            <button className="bb-btn h-8 text-xs px-3" type="submit" aria-label="Opslaan">
              💾
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
