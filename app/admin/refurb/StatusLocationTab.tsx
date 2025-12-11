// app/admin/refurb/StatusLocationTab.tsx
"use client";

import { useTransition } from "react";
import {
  RefurbStatusOption,
  RefurbLocationOption,
  saveRefurbStatusRow,
  deleteRefurbStatusRow,
  setDefaultRefurbStatus,
  saveRefurbLocationRow,
  deleteRefurbLocationRow,
  setDefaultRefurbLocation,
} from "./settingsActions";

type Props = {
  initialStatuses: RefurbStatusOption[];
  initialLocations: RefurbLocationOption[];
};

export default function StatusLocationTab({
  initialStatuses,
  initialLocations,
}: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-8 text-xs">
      {/* STATUSSEN */}
      <section className="border rounded-md p-4">
        <h2 className="font-semibold text-sm mb-2">Refurb statussen</h2>
        <p className="text-[11px] text-slate-500 mb-3">
          Beheer de mogelijke statussen in de refurb receptie. Duid één status
          als <strong>default</strong> aan; bij import of plakken wordt die
          gebruikt als er geen status meegegeven is.
        </p>

        <table className="min-w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase">
            <tr>
              <th className="px-2 py-1 border text-left">Label</th>
              <th className="px-2 py-1 border text-left">Value</th>
              <th className="px-2 py-1 border text-center">Sort</th>
              <th className="px-2 py-1 border text-center">Default</th>
              <th className="px-2 py-1 border text-right">Acties</th>
            </tr>
          </thead>
          <tbody>
            {initialStatuses.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-2 py-1 border">
                  <form
                    action={(fd: FormData) =>
                      startTransition(() => saveRefurbStatusRow(fd))
                    }
                    className="flex gap-1 items-center"
                  >
                    <input type="hidden" name="id" value={row.id} />
                    <input
                      name="label"
                      defaultValue={row.label}
                      className="bb-input h-7 text-[11px] px-1 w-full"
                    />
                </td>

                <td className="px-2 py-1 border">
                    <input
                      name="value"
                      defaultValue={row.value}
                      className="bb-input h-7 text-[11px] px-1 w-full"
                    />
                </td>

                <td className="px-2 py-1 border text-center">
                    <input
                      name="sort_order"
                      defaultValue={row.sort_order.toString()}
                      className="bb-input h-7 text-[11px] px-1 w-16 text-center"
                      type="number"
                    />
                </td>

                <td className="px-2 py-1 border text-center">
                  <button
                    type="button"
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${
                      row.is_default
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                    onClick={() =>
                      startTransition(() => setDefaultRefurbStatus(row.id))
                    }
                  >
                    {row.is_default ? "✓" : ""}
                  </button>
                </td>

                <td className="px-2 py-1 border text-right">
                  <div className="flex gap-1 justify-end">
                    <button type="submit" className="bb-btn text-[11px] px-2">
                      Bewaar
                    </button>
                  </div>
                </td>
                  </form> {/* ← FORM CORRECT GESLOTEN */}
              </tr>
            ))}

            {/* Nieuwe rij */}
            <tr className="border-t bg-slate-50/40">
              <td colSpan={5} className="px-2 py-2">
                <form
                  action={(fd: FormData) =>
                    startTransition(() => saveRefurbStatusRow(fd))
                  }
                  className="flex flex-wrap gap-2 items-center"
                >
                  <input
                    name="label"
                    placeholder="Nieuwe status label"
                    className="bb-input h-7 text-[11px] px-1 min-w-[160px]"
                  />
                  <input
                    name="value"
                    placeholder="waarde (bv. received_store)"
                    className="bb-input h-7 text-[11px] px-1 min-w-[180px]"
                  />
                  <input
                    name="sort_order"
                    type="number"
                    defaultValue="0"
                    className="bb-input h-7 text-[11px] px-1 w-16 text-center"
                  />
                  <button type="submit" className="bb-btn text-[11px] px-3">
                    + Status
                  </button>
                  {isPending && (
                    <span className="text-[11px] text-slate-500">
                      Aan het opslaan...
                    </span>
                  )}
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* LOCATIONS */}
      <section className="border rounded-md p-4">
        <h2 className="font-semibold text-sm mb-2">Refurb locations</h2>
        <p className="text-[11px] text-slate-500 mb-3">
          Beheer de mogelijke locations. De <strong>default</strong> wordt
          gebruikt bij import/paste wanneer er geen locatie meegegeven is.
        </p>

        <table className="min-w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase">
            <tr>
              <th className="px-2 py-1 border text-left">Label</th>
              <th className="px-2 py-1 border text-left">Value</th>
              <th className="px-2 py-1 border text-center">Sort</th>
              <th className="px-2 py-1 border text-center">Default</th>
              <th className="px-2 py-1 border text-right">Acties</th>
            </tr>
          </thead>
          <tbody>
            {initialLocations.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-2 py-1 border">
                  <form
                    action={(fd: FormData) =>
                      startTransition(() => saveRefurbLocationRow(fd))
                    }
                    className="flex gap-1 items-center"
                  >
                    <input type="hidden" name="id" value={row.id} />
                    <input
                      name="label"
                      defaultValue={row.label}
                      className="bb-input h-7 text-[11px] px-1 w-full"
                    />
                </td>

                <td className="px-2 py-1 border">
                    <input
                      name="value"
                      defaultValue={row.value}
                      className="bb-input h-7 text-[11px] px-1 w-full"
                    />
                </td>

                <td className="px-2 py-1 border text-center">
                    <input
                      name="sort_order"
                      defaultValue={row.sort_order.toString()}
                      className="bb-input h-7 text-[11px] px-1 w-16 text-center"
                      type="number"
                    />
                </td>

                <td className="px-2 py-1 border text-center">
                  <button
                    type="button"
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${
                      row.is_default
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                    onClick={() =>
                      startTransition(() => setDefaultRefurbLocation(row.id))
                    }
                  >
                    {row.is_default ? "✓" : ""}
                  </button>
                </td>

                <td className="px-2 py-1 border text-right">
                  <div className="flex gap-1 justify-end">
                    <button type="submit" className="bb-btn text-[11px] px-2">
                      Bewaar
                    </button>
                  </div>
                </td>
                  </form> {/* ← FORM CORRECT GESLOTEN */}
              </tr>
            ))}

            {/* Nieuwe rij */}
            <tr className="border-t bg-slate-50/40">
              <td colSpan={5} className="px-2 py-2">
                <form
                  action={(fd: FormData) =>
                    startTransition(() => saveRefurbLocationRow(fd))
                  }
                  className="flex flex-wrap gap-2 items-center"
                >
                  <input
                    name="label"
                    placeholder="Nieuwe location label"
                    className="bb-input h-7 text-[11px] px-1 min-w-[160px]"
                  />
                  <input
                    name="value"
                    placeholder="waarde (bv. warehouse_1)"
                    className="bb-input h-7 text-[11px] px-1 min-w-[180px]"
                  />
                  <input
                    name="sort_order"
                    type="number"
                    defaultValue="0"
                    className="bb-input h-7 text-[11px] px-1 w-16 text-center"
                  />
                  <button type="submit" className="bb-btn text-[11px] px-3">
                    + Location
                  </button>
                  {isPending && (
                    <span className="text-[11px] text-slate-500">
                      Aan het opslaan...
                    </span>
                  )}
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
