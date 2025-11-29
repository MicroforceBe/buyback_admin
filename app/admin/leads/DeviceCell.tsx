// app/admin/leads/DeviceCell.tsx

'use client';

import { useState } from 'react';
import { updateLeadInlineAction } from './actions';

type Props = {
  id: string;
  model: string | null;
  variant: string | null;
  capacity_gb: number | null;
  sku: string | null;
  imei_sn: string | null;
  questions_answers_html?: string | null;

  // NIEUW
  battery_percentage: number | null;
  used_parts_skus: string[] | null;
};

const input = 'bb-input h-9 text-xs px-2 py-1';
const label = 'text-[11px] text-gray-500';

export default function DeviceCell(p: Props) {
  const [open, setOpen] = useState(false);

  // Init-lijst voor gebruikte onderdelen uit array
  const initialParts =
    Array.isArray(p.used_parts_skus) && p.used_parts_skus.length
      ? p.used_parts_skus.map((s) => s.trim()).filter(Boolean)
      : [];

  const [parts, setParts] = useState<string[]>(
    initialParts.length ? initialParts : ['']
  );

  // Bovenste regel: model • variant • 128 GB
  const modelLine =
    [
      p.model || undefined,
      p.variant || undefined,
      p.capacity_gb ? `${p.capacity_gb} GB` : undefined,
    ]
      .filter(Boolean)
      .join(' • ') || '—';

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* hoofdregel */}
          <div className="truncate font-medium">{modelLine}</div>

          {/* subregel met SKU / IMEI / batterij */}
          <div className="text-[11px] text-gray-500 truncate">
            {p.sku ? `SKU: ${p.sku}` : 'SKU: —'}{' '}
            {p.imei_sn ? `• IMEI/SN: ${p.imei_sn}` : '• IMEI/SN: —'}
            {typeof p.battery_percentage === 'number'
              ? ` • Batterij: ${p.battery_percentage}%`
              : ''}
          </div>
        </div>

        {/* toggle voor edit / extra info */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs px-2 h-7 border rounded"
          aria-expanded={open}
          title={open ? 'Sluiten' : 'Bewerken / details'}
        >
          {open ? '▴' : '▾'}
        </button>
      </div>

      {open && (
        <form
          action={updateLeadInlineAction}
          className="mt-2 flex flex-col gap-1 border-t border-gray-200 pt-2"
        >
          <input type="hidden" name="id" value={p.id} />

          {/* SKU */}
          <div className="flex flex-col">
            <label className={label}>SKU</label>
            <input
              name="sku"
              className={input}
              defaultValue={p.sku ?? ''}
              placeholder="SKU"
            />
          </div>

          {/* IMEI / serienummer */}
          <div className="flex flex-col">
            <label className={label}>IMEI (15c) of Serienummer</label>
            <input
              name="imei_sn"
              className={input}
              defaultValue={p.imei_sn ?? ''}
              placeholder="IMEI of SN"
            />
          </div>

          {/* Batterij-percentage */}
          <div className="flex flex-col">
            <label className={label}>Batterij (%)</label>
            <input
              type="number"
              name="battery_percentage"
              className={input}
              min={0}
              max={100}
              defaultValue={
                typeof p.battery_percentage === 'number'
                  ? p.battery_percentage
                  : ''
              }
              placeholder="0–100"
            />
          </div>

          {/* Gebruikte onderdelen (SKU's) */}
          <div className="flex flex-col mt-1">
            <label className={label}>Gebruikte onderdelen (SKU&apos;s)</label>

            {parts.map((value, idx) => (
              <div key={idx} className="mt-1 flex gap-2 items-center">
                <input
                  className={input}
                  value={value}
                  placeholder={`Onderdeel SKU ${idx + 1}`}
                  onChange={(e) => {
                    const next = [...parts];
                    next[idx] = e.target.value;
                    setParts(next);
                  }}
                />
                {idx === parts.length - 1 && (
                  <button
                    type="button"
                    className="text-xs px-2 h-7 border rounded"
                    onClick={() => setParts([...parts, ''])}
                    title="Extra onderdeel toevoegen"
                  >
                    +
                  </button>
                )}
              </div>
            ))}

            {/* Hidden veld dat alle onderdelen als één string doorstuurt */}
            <input
              type="hidden"
              name="used_parts_skus"
              value={parts
                .map((s) => s.trim())
                .filter(Boolean)
                .join(', ')}
            />
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            <button
              className="bb-btn h-8 text-xs px-3"
              type="submit"
              aria-label="Opslaan"
            >
              💾
            </button>
          </div>

          {/* Vragen & antwoorden uit de widget (HTML uit Supabase) */}
          {p.questions_answers_html ? (
            <details className="mt-2 text-[11px] text-gray-700">
              <summary className="cursor-pointer select-none text-gray-600 hover:text-gray-900">
                Vragen &amp; antwoorden tonen
              </summary>
              <div className="mt-1 border border-gray-200 rounded bg-white p-2 max-h-64 overflow-auto">
                <div
                  className="prose prose-xs max-w-none"
                  // HTML komt uit jouw backend (admin-only → ok)
                  dangerouslySetInnerHTML={{ __html: p.questions_answers_html }}
                />
              </div>
            </details>
          ) : (
            <p className="mt-1 text-[11px] text-gray-400">
              Geen vragen/antwoorden opgeslagen.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
