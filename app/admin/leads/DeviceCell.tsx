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
const btn   = 'bb-btn h-8 text-xs px-3';

export default function DeviceCell(props: Props) {
  const [open, setOpen] = useState(false);

  // lokale UX-state (server action leest de <form>-velden)
  const [sku, setSku] = useState(props.sku ?? '');
  const [imei, setImei] = useState(props.imei_sn ?? '');

  const modelLine =
    [props.model, props.capacity_gb ? `${props.capacity_gb} GB` : '']
      .filter(Boolean)
      .join(' • ') || '—';

  return (
    <div className="space-y-1">
      {/* samenvatting + toggle */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate">{modelLine}</div>
          <div className="text-[11px] text-gray-500 truncate">
            {/* Subinfo in klein */}
            {sku ? `SKU: ${sku}` : 'SKU: —'} {imei ? `• IMEI/SN: ${imei}` : '• IMEI/SN: —'}
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

      {/* editor */}
      {open && (
        <form action={updateLeadInlineAction} className="mt-2 flex flex-col gap-1">
          <input type="hidden" name="id" value={props.id} />

          <div className="flex flex-col">
            <label className={label}>SKU</label>
            <input
              name="sku"
              className={input}
              value={sku}
              onChange={e => setSku(e.target.value)}
              placeholder="SKU"
            />
          </div>

          <div className="flex flex-col">
            <label className={label}>IMEI (15c) of Serienummer</label>
            <input
              name="imei_sn"
              className={input}
              value={imei}
              onChange={e => setImei(e.target.value)}
              placeholder="IMEI of SN"
            />
          </div>

          <div className="pt-1">
            <button className={btn} type="submit" title="Opslaan" aria-label="Opslaan">
              Opslaan
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
