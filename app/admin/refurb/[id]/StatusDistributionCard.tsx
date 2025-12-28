// app/admin/refurb/[id]/StatusDistributionCard.tsx
"use client";

import React, { useMemo, useState } from "react";

type StatusStat = {
  status: string;
  label: string;
  count: number;
  pct: number;
  color: string;
  value_cents: number;
  is_final: boolean;
};

function money(cents: number) {
  const n = Number.isFinite(cents) ? cents : 0;
  return (n / 100).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
}

export default function StatusDistributionCard(props: {
  totalItems: number;
  donutStyle: Record<string, string>;
  statusStats: StatusStat[];
  totalValueAllCents: number;
  totalValueFinalCents: number;
  totalValueNonFinalCents: number;
  hasTransitionsConfigured: boolean;
}) {
  const {
    totalItems,
    donutStyle,
    statusStats,
    totalValueAllCents,
    totalValueFinalCents,
    totalValueNonFinalCents,
    hasTransitionsConfigured,
  } = props;

  const [open, setOpen] = useState(false); // ✅ standaard ingeklapt

  const finalStats = useMemo(() => statusStats.filter((s) => s.is_final), [statusStats]);

  return (
    <div className="border rounded-md bg-white text-xs">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 border-b bg-slate-50"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="font-medium text-[11px] uppercase tracking-wide text-slate-700">
          Statusverdeling in deze receptie
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          <span>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="p-3">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
            <div>
              <div className="flex items-center gap-3">
                <div
                  className="w-20 h-20 rounded-full border border-slate-200 flex items-center justify-center"
                  style={donutStyle}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-50" />
                </div>

                <div className="space-y-1 text-[11px] w-full">
                  <div className="text-slate-500">
                    Totaal:{" "}
                    <span className="font-semibold text-slate-700">{totalItems} toestellen</span>
                  </div>

                  <div className="text-slate-500">
                    Totale waarde (alle statussen):{" "}
                    <span className="font-semibold text-slate-700">{money(totalValueAllCents)}</span>
                  </div>

                  <div className="text-slate-500">
                    Totale waarde (finale statussen):{" "}
                    <span className="font-semibold text-slate-700">{money(totalValueFinalCents)}</span>
                  </div>

                  <div className="text-slate-500">
                    Totale waarde (niet-finaal):{" "}
                    <span className="font-semibold text-slate-700">{money(totalValueNonFinalCents)}</span>
                  </div>

                  {!hasTransitionsConfigured && (
                    <div className="mt-2 text-[11px] text-amber-700">
                      Let op: er zijn geen status-transities ingesteld, dus “finale status” kan niet bepaald
                      worden.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-600 mb-2">
                Legende (finale statussen: geen vervolgstatus)
              </div>

              {hasTransitionsConfigured && finalStats.length > 0 ? (
                <div className="space-y-1 text-[11px]">
                  {finalStats.map((s) => (
                    <div key={s.status} className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="truncate max-w-[160px]">{s.label}</span>
                      <span className="ml-auto tabular-nums text-slate-700">
                        {s.count} ({s.pct}%) • {money(s.value_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : hasTransitionsConfigured ? (
                <div className="text-[11px] text-slate-500">Geen finale statussen aanwezig in deze receptie.</div>
              ) : (
                <div className="text-[11px] text-slate-500">—</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
