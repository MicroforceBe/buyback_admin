// app/admin/leads/DeviceCell.tsx

'use client';

import { useState } from 'react';
import { updateLeadInlineAction } from './actions';

type Status =
  | 'new'
  | 'received_store'
  | 'label_created'
  | 'shipment_received'
  | 'check_passed'
  | 'check_failed'
  | 'done'
  | 'cancelled';

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

  // status + rechten om edit te bepalen
  status?: string | null;
  canEdit?: boolean;
};

const input = 'bb-input h-9 text-xs px-2 py-1';
const label = 'text-[11px] text-gray-500';

export default function DeviceCell(p: Props) {
  const [open, setOpen] = useState(false);

  const status: Status = (p.status ?? 'new') as Status;
  const isEditable = !!p.canEdit;

  // Model/details tonen zodra toestel effectief binnen is:
  // - Ontvangen in winkel (received_store)
  // - Zending ontvangen (shipment_received)
  // - + alle latere statussen
  const afterShipment =
    status === 'received_store' ||
    status === 'shipment_received' ||
    status === 'check_passed' ||
    status === 'check_failed' ||
    status === 'done' ||
    status === 'cancelled';

  // Init-lijst voor gebruikte onderdelen uit array
  const initialParts = Array.isArray(p.used_parts_skus)
    ? p.used_parts_skus
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

  // Helper voor weergave van gebruikte onderdelen (read-only blok)
  const partsDisplay =
    parts
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ') || '—';

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

        {/* toggle voor edit / extra info (altijd beschikbaar, ook bij locked) */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs px-2 h-7 border rounded"
          aria-expanded={open}
          title={
            !afterShipment
              ? open
                ? 'Sluiten'
                : 'Toon info'
              : isEditable
              ? open
                ? 'Sluiten'
                : 'Bewerken / details'
              : open
              ? 'Sluiten'
              : 'Toon details (alleen lezen)'
          }
        >
          {open ? '▴' : '▾'}
        </button>
      </div>

      {open && (
        <>
          {/* Voor toestel nog niet fysiek binnen: enkel melding tonen */}
          {!afterShipment ? (
            <div className="mt-1 text-[11px] text-gray-500">
              Eenmaal het toestel ontvangen is kan je details toevoegen.
            </div>
          ) : isEditable ? (
            // ====== BEWERKBARE MODE ======
            <form
              action={updateLeadInlineAction}
              className="mt-2 flex flex-col gap-1 border-t border-gray-200 pt-2"
            >
              <input type="hidden" name="id" value={p.id} />

              {/* SKU */}
              <div className="flex flex-col">
                <label className={label}>
                  SKU{' '}
                  <span
                    data-device-warning="sku"
                    className="text-orange-500 ml-1 hidden"
                    title="Verplicht bij controle"
                  >
                    ⚠
                  </span>
                </label>
                <input
                  name="sku"
                  className={input}
                  defaultValue={p.sku ?? ''}
                  placeholder="SKU"
                />
              </div>

              {/* IMEI / serienummer */}
              <div className="flex flex-col">
                <label className={label}>
                  IMEI (15c) of Serienummer{' '}
                  <span
                    data-device-warning="imei_sn"
                    className="text-orange-500 ml-1 hidden"
                    title="Verplicht bij controle"
                  >
                    ⚠
                  </span>
                </label>
                <input
                  name="imei_sn"
                  className={input}
                  defaultValue={p.imei_sn ?? ''}
                  placeholder="IMEI of SN"
                />
              </div>

              {/* Batterij-percentage */}
              <div className="flex flex-col">
                <label className={label}>
                  Batterij (%){" "}
                  <span
                    data-device-warning="battery_percentage"
                    className="text-orange-500 ml-1 hidden"
                    title="Verplicht bij controle (mag ook “-” zijn)"
                  >
                    ⚠
                  </span>
                </label>
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
                  placeholder="0–100 of '-'"
                />
              </div>

              {/* Gebruikte onderdelen (SKU's) */}
              <div className="flex flex-col mt-1">
                <label className={label}>
                  Gebruikte onderdelen (SKU&apos;s){' '}
                  <span
                    data-device-warning="used_parts_skus"
                    className="text-orange-500 ml-1 hidden"
                    title="Verplicht bij controle (mag ook “-” één veld zijn)"
                  >
                    ⚠
                  </span>
                </label>

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
                      dangerouslySetInnerHTML={{
                        __html: p.questions_answers_html,
                      }}
                    />
                  </div>
                </details>
              ) : (
                <p className="mt-1 text-[11px] text-gray-400">
                  Geen vragen/antwoorden opgeslagen.
                </p>
              )}
            </form>
          ) : (
            // ====== READ-ONLY MODE (bv. na check_passed/done) ======
            <div className="mt-2 flex flex-col gap-1 border-t border-gray-200 pt-2 text-xs text-gray-700">
              <div>
                <span className="font-semibold">SKU:</span> {p.sku || '—'}
              </div>
              <div>
                <span className="font-semibold">IMEI/SN:</span> {p.imei_sn || '—'}
              </div>
              <div>
                <span className="font-semibold">Batterij:</span>{' '}
                {typeof p.battery_percentage === 'number'
                  ? `${p.battery_percentage}%`
                  : '—'}
              </div>
              <div>
                <span className="font-semibold">Gebruikte onderdelen:</span>{' '}
                {partsDisplay}
              </div>

              {p.questions_answers_html ? (
                <details className="mt-2 text-[11px] text-gray-700">
                  <summary className="cursor-pointer select-none text-gray-600 hover:text-gray-900">
                    Vragen &amp; antwoorden tonen
                  </summary>
                  <div className="mt-1 border border-gray-200 rounded bg-white p-2 max-h-64 overflow-auto">
                    <div
                      className="prose prose-xs max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: p.questions_answers_html,
                      }}
                    />
                  </div>
                </details>
              ) : (
                <p className="mt-1 text-[11px] text-gray-400">
                  Geen vragen/antwoorden opgeslagen.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
