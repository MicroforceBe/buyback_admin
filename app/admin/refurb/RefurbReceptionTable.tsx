// app/admin/refurb/RefurbReceptionTable.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  RefurbItem,
  updateRefurbItemCell,
  pasteIntoRefurbColumn,
  bulkUpdateRefurbItems,
  fetchReceptionItems,
  deleteRefurbReceptionItem,
  searchErpArticlesForSku,
  type ErpSkuSearchResult,
} from "./actions";

import type { RefurbStatusOption, RefurbLocationOption } from "./settingsActions";

type StatusTransitionsMap = Record<string, string[]>;

type Props = {
  receptionId: string;
  initialItems: RefurbItem[];
  statusOptions: RefurbStatusOption[];
  locationOptions: RefurbLocationOption[];
  defaultStatusValue: string;
  defaultLocationValue: string;
  readyToBookValue: string;
  vatScheme: "margin" | "normal";

  // Supplier invoice nummer van de receptie
  supplierInvoiceNr?: string | null;

  statusTransitions?: StatusTransitionsMap;
  statusNextMap?: StatusTransitionsMap;

  canDelete?: boolean;
  canUseAdminStatuses?: boolean;
};

// SKU en used_parts blijven editable (dus NIET locken op fill)
const LOCK_AFTER_FILL_FIELDS = new Set<
  "price_cents" | "description" | "supplier_device_errors" | "supplier_grading"
>(["price_cents", "description", "supplier_device_errors", "supplier_grading"]);

function money(cents: number | null) {
  if (typeof cents !== "number") return "";
  return (cents / 100).toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

function parseMoneyToCents(raw: string): number | null {
  const v = raw.replace(",", ".").trim();
  if (!v) return null;
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function parseUsedParts(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function norm(s: string) {
  return (s || "").trim().toLowerCase();
}
function containsFinished(status: string | null | undefined) {
  return norm(status || "").includes("finished");
}
function isBooked(status: string | null | undefined) {
  return norm(status || "") === "booked";
}
function isReadyToBook(status: string | null | undefined) {
  return norm(status || "") === "ready to book";
}

function hasValidSku(v: string | null | undefined) {
  return Boolean((v ?? "").trim().length > 0);
}

/**
 * ✅ Canonicalize status:
 * - DB/legacy kan label opslaan (bv "New") i.p.v. value.
 * - Wij tonen en bewerken altijd de value uit refurb_status_options.value.
 */
function canonicalizeStatusValue(
  raw: string | null | undefined,
  statusOptions: RefurbStatusOption[],
  defaultStatusValue: string
) {
  const v = (raw ?? "").trim();
  if (!v) return (defaultStatusValue || "").trim();

  const exact = statusOptions.find((o: any) => String(o?.value ?? "").trim() === v);
  if (exact) return exact.value;

  const vNorm = norm(v);
  const byLabel = statusOptions.find((o: any) => norm(String(o?.label ?? "")) === vNorm);
  if (byLabel) return byLabel.value;

  return v;
}

/**
 * Oude fallback-regels (blijven bestaan als er geen statusTransitions-map is
 * OF als er geen entry bestaat voor de huidige status)
 */
function canChangeStatusFallback(opts: {
  current: string | null | undefined;
  next: string;
  defaultStatusValue: string;
  readyToBookValue: string;
}): { ok: true } | { ok: false; reason: string } {
  const current = opts.current ?? "";
  const next = opts.next;
  const def = opts.defaultStatusValue;

  if (containsFinished(current) && norm(next) !== norm(opts.readyToBookValue)) {
    return {
      ok: false,
      reason: "Finished-status kan enkel op Ready to Book gezet worden.",
    };
  }
  if (isBooked(current) && norm(next) !== norm(current)) {
    return {
      ok: false,
      reason: "Status is booked en kan niet meer gewijzigd worden.",
    };
  }
  if (isBooked(next) && !isReadyToBook(current)) {
    return {
      ok: false,
      reason: "Status kan alleen op booked gezet worden vanuit Ready to Book.",
    };
  }
  if (norm(next) === norm(def) && norm(current) !== norm(def)) {
    return {
      ok: false,
      reason: "Je kan niet terug naar de default status zodra je daarvan afwijkt.",
    };
  }
  return { ok: true };
}

function parseTokens(raw: string): string[] {
  return (raw || "")
    .split(/[\r\n\t,; ]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanClipboardValue(value: unknown) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

function compensationText(
  cents: number | null | undefined
) {
  if (typeof cents !== "number") return "0,00";

  return (cents / 100).toLocaleString("nl-BE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function copyToClipboard(text: string) {
  try {
    if (!text) return;
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error("[REFURB] clipboard error", error);
  }
}

async function copyHtmlToClipboard(
  html: string,
  plainText: string
) {
  try {
    if (
      navigator.clipboard &&
      typeof window.ClipboardItem !== "undefined"
    ) {
      const clipboardItem = new ClipboardItem({
        "text/html": new Blob([html], {
          type: "text/html",
        }),
        "text/plain": new Blob([plainText], {
          type: "text/plain",
        }),
      });

      await navigator.clipboard.write([clipboardItem]);
      return;
    }

    await navigator.clipboard.writeText(plainText);
  } catch (error) {
    console.error("[REFURB] HTML clipboard error", error);
    await navigator.clipboard.writeText(plainText);
  }
}

function CopyBtn({ value, title }: { value: string; title?: string }) {
  return (
    <button
      type="button"
      className="bb-btn text-[11px] px-2 h-7 ml-auto"
      title={title ?? "Copy to clipboard"}
      onClick={() => copyToClipboard(value)}
      disabled={!value}
    >
      ⧉
    </button>
  );
}

type UsedPartsCellProps = {
  rawValue: string | null;
  locked: boolean;
  onChange: (raw: string) => void;
  onPasteToColumn?: (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
};

function UsedPartsCell({ rawValue, locked, onChange, onPasteToColumn }: UsedPartsCellProps) {
  const [parts, setParts] = useState<string[]>(() => parseUsedParts(rawValue));

  useEffect(() => {
    setParts(parseUsedParts(rawValue));
  }, [rawValue]);

  if (locked) {
    const list = parseUsedParts(rawValue || "");
    if (!list.length) return <span className="text-slate-400">—</span>;

    return (
      <div className="flex flex-col gap-1">
        {list.map((p, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="block truncate max-w-[200px]" title={p}>
              {p}
            </span>
            <CopyBtn value={p} title="Copy used part SKU" />
          </div>
        ))}
      </div>
    );
  }

  const commit = () => {
    const raw = parts
      .map((p) => p.trim())
      .filter(Boolean)
      .join(", ");
    onChange(raw);
  };

  const updatePart = (index: number, value: string) => {
    setParts((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addPart = () => setParts((prev) => [...prev, ""]);

  const removePart = (index: number) => {
    setParts((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      onChange(next.map((p) => p.trim()).filter(Boolean).join(", "));
      return next;
    });
  };

  const rows = parts.length > 0 ? parts : [""];

  return (
    <div className="flex flex-col gap-1">
      {rows.map((part, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input
            className="bb-input h-7 text-[11px] px-1 w-full"
            value={part}
            onChange={(e) => updatePart(i, e.target.value)}
            onBlur={commit}
            onPaste={i === 0 && onPasteToColumn ? (e) => onPasteToColumn(e) : undefined}
          />
          <CopyBtn value={part.trim()} title="Copy used part SKU" />
          {rows.length > 1 && (
            <button type="button" className="bb-btn text-[11px] px-2 h-7" onClick={() => removePart(i)}>
              –
            </button>
          )}
          {i === rows.length - 1 && (
            <button type="button" className="bb-btn text-[11px] px-2 h-7" onClick={addPart}>
              +
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function SkuAutocompleteCell({
  value,
  vatScheme,
  disabled,
  onChange,
  onPaste,
}: {
  value: string;
  vatScheme: "margin" | "normal";
  disabled: boolean;
  onChange: (value: string) => Promise<void>;
  onPaste: (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
}) {
  const [input, setInput] = useState(value);
  const [results, setResults] = useState<ErpSkuSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const q = input.trim();

      if (q.length < 2) {
        setResults([]);
        return;
      }

      try {
        setLoading(true);

        const rows = await searchErpArticlesForSku(
          q,
          vatScheme
        );

        if (!cancelled) {
          setResults(rows || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const t = setTimeout(run, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input, vatScheme]);

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <input
          className="bb-input h-7 text-[11px] px-1 w-full"
          value={input}
          disabled={disabled}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={async () => {
            setTimeout(() => setOpen(false), 150);
            await onChange(input.trim());
          }}
          onPaste={onPaste}
        />

        <CopyBtn value={input.trim()} title="Copy SKU" />
      </div>

      {open && (results.length > 0 || loading) && (
        <div className="absolute z-50 mt-1 w-[520px] overflow-hidden rounded-xl border bg-white shadow-2xl">
          {loading && (
            <div className="px-3 py-2 text-[11px] text-slate-500">
              Zoeken...
            </div>
          )}

          {!loading &&
            results.map((r) => (
              <button
                key={`${r.sku}-${r.title}`}
                type="button"
                className="flex w-full flex-col border-b px-3 py-2 text-left hover:bg-slate-50"
                onMouseDown={async (e) => {
                  e.preventDefault();

                  setInput(r.sku);
                  setOpen(false);

                  await onChange(r.sku);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-[11px] text-slate-900">
                    {r.sku}
                  </div>

                  <div className="text-[10px] text-slate-500">
                    Stock: {r.inventory_qty ?? 0}
                  </div>
                </div>

                <div className="mt-1 text-[11px] text-slate-600 line-clamp-2">
                  {r.title || "—"}
                </div>

                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                  <span>
                    {(r.price_cents || 0) / 100}€
                  </span>

                  <span>
                    {r.vat_margin ? "Margin VAT" : "Normal VAT"}
                  </span>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}


export default function RefurbReceptionTable({
  receptionId,
  initialItems,
  statusOptions,
  locationOptions,
  defaultStatusValue,
  defaultLocationValue,
  readyToBookValue,
  statusTransitions,
  statusNextMap,
  canDelete = false,
  canUseAdminStatuses = true,
  vatScheme,
  supplierInvoiceNr = null,
}: Props) {
  const router = useRouter();

  // ✅ normalize initialItems (label -> value) zodat UI overeenstemt met Supabase options
  const normalizedInitialItems = useMemo(() => {
    return (initialItems || []).map((it) => ({
      ...it,
      refurb_status: canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue),
    }));
  }, [initialItems, statusOptions, defaultStatusValue]);

  const [items, setItems] = useState<RefurbItem[]>(normalizedInitialItems);

  // UI toggles
  const [isPasting, setIsPasting] = useState(false);

  // kolom toggles (default ingeklapt)
  const [showExtraSn, setShowExtraSn] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPrice, setShowPrice] = useState(false); // ✅ nieuw (default ingeklapt)
  const [showSupplierRemarks, setShowSupplierRemarks] = useState(false); // ✅ nieuw (default ingeklapt)

  // lijstblokken (default open: niet-afgewerkt, default collapsed: afgewerkt)
  const [openNotDone, setOpenNotDone] = useState(true);
  const [openDone, setOpenDone] = useState(false);

  // header filters
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [locationFilter, setLocationFilter] = useState<string>("__all__");
  const [imeiQuery, setImeiQuery] = useState<string>("");
  const [descQuery, setDescQuery] = useState<string>("");

  // selectie
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  // bulk update (collapse)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rmaOpen, setRmaOpen] = useState(false);
  const [rmaCopied, setRmaCopied] = useState(false);
  const [bulkEnableStatus, setBulkEnableStatus] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkEnableLocation, setBulkEnableLocation] = useState(false);
  const [bulkLocation, setBulkLocation] = useState<string>("");
  const [bulkPartsText, setBulkPartsText] = useState<string>("");
  const [bulkImeiText, setBulkImeiText] = useState<string>("");
  const [bulkTarget, setBulkTarget] = useState<"imei" | "selected">("selected");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // delete row
  const [isDeletingRow, setIsDeletingRow] = useState<string | null>(null);

  // ✅ als statusOptions wijzigen (of initialItems na refresh), sync de state (zonder user edits te droppen op elke render)
  useEffect(() => {
    setItems(normalizedInitialItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedInitialItems]);

  const hasItems = items.length > 0;

  const rmaItems = useMemo(() => {
  return items.filter((item) => {
    const status = canonicalizeStatusValue(
      item.refurb_status,
      statusOptions || [],
      defaultStatusValue
    );

    return norm(status) === "rma";
  });
}, [items, statusOptions, defaultStatusValue]);

const totalRmaCompensationCents = useMemo(() => {
  return rmaItems.reduce((total, item) => {
    const compensation =
      typeof item.compensation_cents === "number"
        ? item.compensation_cents
        : 0;

    return total + compensation;
  }, 0);
}, [rmaItems]);

const rmaClipboardPlainText = useMemo(() => {
  const invoice =
    cleanClipboardValue(supplierInvoiceNr) || "—";

  const header = [
    "IMEI/SN",
    "Description",
    "RMA defect description",
    "Compensation",
  ].join("\t");

  const rows = rmaItems.map((item) => {
    const imeiOrSn =
      cleanClipboardValue((item as any).imei_sn) ||
      cleanClipboardValue((item as any).manual_sn) ||
      "—";

    const description =
      cleanClipboardValue(item.description) || "—";

    const defectDescription =
      cleanClipboardValue(item.rma_defect_description) || "—";

    const compensation =
      typeof item.compensation_cents === "number"
        ? `€ ${compensationText(item.compensation_cents)}`
        : "—";

    return [
      imeiOrSn,
      description,
      defectDescription,
      compensation,
    ].join("\t");
  });

  return [
    `Supplier invoice nr: ${invoice}`,
    "",
    header,
    ...rows,
    "",
    `Totale compensatie: € ${compensationText(
      totalRmaCompensationCents
    )}`,
  ].join("\n");
}, [
  supplierInvoiceNr,
  rmaItems,
  totalRmaCompensationCents,
]);

const rmaClipboardHtml = useMemo(() => {
  const invoice =
    cleanClipboardValue(supplierInvoiceNr) || "—";

  const rowsHtml = rmaItems
    .map((item) => {
      const imeiOrSn =
        cleanClipboardValue((item as any).imei_sn) ||
        cleanClipboardValue((item as any).manual_sn) ||
        "—";

      const description =
        cleanClipboardValue(item.description) || "—";

      const defectDescription =
        cleanClipboardValue(item.rma_defect_description) || "—";

      const compensation =
        typeof item.compensation_cents === "number"
          ? `€ ${compensationText(item.compensation_cents)}`
          : "—";

      return `
        <tr>
          <td style="border:1px solid #d1d5db;padding:7px 9px;vertical-align:top;font-family:Arial,sans-serif;font-size:12px;">
            ${escapeHtml(imeiOrSn)}
          </td>

          <td style="border:1px solid #d1d5db;padding:7px 9px;vertical-align:top;font-family:Arial,sans-serif;font-size:12px;">
            ${escapeHtml(description)}
          </td>

          <td style="border:1px solid #d1d5db;padding:7px 9px;vertical-align:top;font-family:Arial,sans-serif;font-size:12px;">
            ${escapeHtml(defectDescription)}
          </td>

          <td style="border:1px solid #d1d5db;padding:7px 9px;vertical-align:top;text-align:right;white-space:nowrap;font-family:Arial,sans-serif;font-size:12px;">
            ${escapeHtml(compensation)}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;">
      <p style="margin:0 0 12px 0;font-size:13px;">
        <strong>Supplier invoice nr:</strong>
        ${escapeHtml(invoice)}
      </p>

      <table
        cellpadding="0"
        cellspacing="0"
        style="width:100%;border-collapse:collapse;border:1px solid #d1d5db;"
      >
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="border:1px solid #d1d5db;padding:7px 9px;text-align:left;font-family:Arial,sans-serif;font-size:12px;">
              IMEI/SN
            </th>

            <th style="border:1px solid #d1d5db;padding:7px 9px;text-align:left;font-family:Arial,sans-serif;font-size:12px;">
              Description
            </th>

            <th style="border:1px solid #d1d5db;padding:7px 9px;text-align:left;font-family:Arial,sans-serif;font-size:12px;">
              RMA defect description
            </th>

            <th style="border:1px solid #d1d5db;padding:7px 9px;text-align:right;font-family:Arial,sans-serif;font-size:12px;">
              Compensation
            </th>
          </tr>
        </thead>

        <tbody>
          ${rowsHtml}
        </tbody>

        <tfoot>
          <tr style="background:#fef2f2;">
            <td
              colspan="3"
              style="border:1px solid #d1d5db;padding:8px 9px;text-align:right;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;"
            >
              Totale compensatie
            </td>

            <td
              style="border:1px solid #d1d5db;padding:8px 9px;text-align:right;white-space:nowrap;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:#b91c1c;"
            >
              € ${escapeHtml(
                compensationText(totalRmaCompensationCents)
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}, [
  supplierInvoiceNr,
  rmaItems,
  totalRmaCompensationCents,
]);

async function copyCompleteRmaOverview() {
  if (!rmaItems.length) return;

  try {
    await copyHtmlToClipboard(
      rmaClipboardHtml,
      rmaClipboardPlainText
    );

    setRmaCopied(true);

    window.setTimeout(() => {
      setRmaCopied(false);
    }, 2000);
  } catch (error) {
    console.error(
      "[REFURB] copy complete RMA overview error",
      error
    );

    window.alert(
      "Kopiëren mislukt. Controleer de browserrechten voor het klembord."
    );
  }
}

 
  // lookup maps
  const statusOptionByValue = useMemo(() => {
    const m = new Map<string, RefurbStatusOption>();
    for (const s of statusOptions) m.set(s.value, s);
    return m;
  }, [statusOptions]);

  const locationOptionByValue = useMemo(() => {
    const m = new Map<string, RefurbLocationOption>();
    for (const l of locationOptions) m.set(l.value, l);
    return m;
  }, [locationOptions]);

  const statusColorByValue = useMemo(() => {
    return new Map(statusOptions.map((s: any) => [s.value, s.color ?? null]));
  }, [statusOptions]);

  const transitions: StatusTransitionsMap | null = statusNextMap ?? statusTransitions ?? null;

  const allowedNextByStatus = useMemo(() => {
    if (!transitions) return null;

    const exact = new Map<string, Set<string>>();
    const normalized = new Map<string, Set<string>>();

    for (const [from, arr] of Object.entries(transitions)) {
      const set = new Set((arr || []).filter(Boolean));
      exact.set(from, set);
      normalized.set(norm(from), new Set(Array.from(set.values())));
    }

    return { exact, normalized };
  }, [transitions]);

  function getAllowedNextSet(currentStatus: string) {
    if (!allowedNextByStatus) {
      return { hasMapForCurrent: false, set: null as Set<string> | null };
    }

    const cur = (currentStatus || "").trim();
    const setExact = allowedNextByStatus.exact.get(cur);
    const setNorm = allowedNextByStatus.normalized.get(norm(cur));
    const set = setExact ?? setNorm ?? null;

    // ✅ enkel "map-mode" als er effectief minstens 1 toegelaten volgende status is
    const hasMapForCurrent = Boolean(set && set.size > 0);

    return { hasMapForCurrent, set: hasMapForCurrent ? set : null };
  }

  function isTransitionAllowed(current: string, next: string): { ok: true } | { ok: false; reason: string } {
    const cur = (current || "").trim();
    const nxt = (next || "").trim();

    // booked blijft altijd hard lock
    if (isBooked(cur) && norm(nxt) !== norm(cur)) {
      return {
        ok: false,
        reason: "Status is booked en kan niet meer gewijzigd worden.",
      };
    }

    // ✅ Alleen map als er effectief een entry bestaat voor deze current status
    const { hasMapForCurrent, set } = getAllowedNextSet(cur);
    if (allowedNextByStatus && hasMapForCurrent) {
      if (norm(nxt) === norm(cur)) return { ok: true };

      const allowed =
        (set && set.has(nxt)) || (set && Array.from(set.values()).some((v) => norm(v) === norm(nxt)));

      if (!allowed) {
        return {
          ok: false,
          reason: "Deze status kan niet naar de gekozen vervolgstatus.",
        };
      }
      return { ok: true };
    }

    // fallback: oude regels
    return canChangeStatusFallback({
      current: cur,
      next: nxt,
      defaultStatusValue,
      readyToBookValue,
    });
  }

  function statusRuleVerdictForRow(opt: any, row: RefurbItem) {
    const adminOnly = Boolean(opt?.admin_only);
    const needSku = Boolean(opt?.need_sku);

    if (adminOnly && !canUseAdminStatuses) {
      return { ok: false as const, reason: "Alleen admin kan deze status kiezen." };
    }
    if (needSku && !hasValidSku((row as any).sku)) {
      return { ok: false as const, reason: "SKU is verplicht voor deze status." };
    }
    return { ok: true as const };
  }

  // ================================
  // Filters + selection
  // ================================

  const presentStatuses = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      const v = canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue).trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items, statusOptions, defaultStatusValue]);

  // ✅ Location filter options MUST come from rows, and must NOT be reduced by locationFilter itself.
  const locationFilterOptions = useMemo(() => {
    const labelByValue = new Map((locationOptions || []).map((o: any) => [String(o.value), String(o.label)]));

    const iq = norm(imeiQuery);
    const dq = norm(descQuery);

    // apply all filters except location
    const base = (items || []).filter((it: any) => {
      const st = canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue).trim();
      if (statusFilter !== "__all__" && st !== statusFilter) return false;

      if (iq) {
        const imei = norm((it as any).imei_sn ?? "");
        const sn = norm((it as any).manual_sn ?? "");
        if (!imei.includes(iq) && !sn.includes(iq)) return false;
      }

      if (dq) {
        const desc = norm(it.description ?? "");
        if (!desc.includes(dq)) return false;
      }

      return true;
    });

    const normLoc = (v: string) => v.trim();
    const locSet = new Set<string>();

    for (const it of base as any[]) {
      const raw = (it.location ?? "").toString();
      const n = normLoc(raw);
      if (!n) continue;
      locSet.add(n);
    }

    return Array.from(locSet.values())
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({
        value: v,
        label: labelByValue.get(v) || v,
      }));
  }, [items, locationOptions, statusOptions, statusFilter, imeiQuery, descQuery, defaultStatusValue]);

  const filteredRows = useMemo(() => {
    const iq = norm(imeiQuery);
    const dq = norm(descQuery);

    return items
      .map((it, originalIndex) => ({ it, originalIndex }))
      .filter(({ it }) => {
        const st = canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue).trim();
        const okStatus = statusFilter === "__all__" || st === statusFilter;

        const loc = ((it as any).location ?? "").trim();
        const okLoc = locationFilter === "__all__" || loc === locationFilter;

        const imei = norm((it as any).imei_sn ?? "");
        const sn = norm((it as any).manual_sn ?? "");
        const okImei = !iq || imei.includes(iq) || sn.includes(iq);

        const desc = norm(it.description ?? "");
        const okDesc = !dq || desc.includes(dq);

        return okStatus && okLoc && okImei && okDesc;
      });
  }, [items, statusOptions, statusFilter, locationFilter, imeiQuery, descQuery, defaultStatusValue]);

  // final-status rules: final = geen vervolgstatus (missing OR empty)
  const isFinalStatusValue = useMemo(() => {
    const t = transitions;
    const hasAnyTransitions = t ? Object.keys(t).length > 0 : false;

    return (statusValue: string) => {
      if (!hasAnyTransitions) return false;
      const next = t?.[statusValue] ?? [];
      return !next || next.length === 0;
    };
  }, [transitions]);

  // split done vs not done blocks
  const filteredNotDoneRows = useMemo(() => {
    return filteredRows.filter(({ it }) => {
      const st = canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue).trim();
      return !isFinalStatusValue(st);
    });
  }, [filteredRows, statusOptions, defaultStatusValue, isFinalStatusValue]);

  const filteredDoneRows = useMemo(() => {
    return filteredRows.filter(({ it }) => {
      const st = canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue).trim();
      return isFinalStatusValue(st);
    });
  }, [filteredRows, statusOptions, defaultStatusValue, isFinalStatusValue]);

  const filteredIds = useMemo(() => filteredRows.map((r) => r.it.id), [filteredRows]);

  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id)) && !allFilteredSelected;

  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    headerCheckboxRef.current.indeterminate = someFilteredSelected;
  }, [someFilteredSelected]);

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  function isLockedAfterFill(item: RefurbItem, field: any) {
    if (!LOCK_AFTER_FILL_FIELDS.has(field)) return false;
    const value = (item as any)[field];
    if (field === "price_cents") return value !== null && value !== undefined;
    return value !== null && value !== undefined && value !== "";
  }

  async function handleCellChange(
    itemId: string,
    field:
      | "refurb_status"
      | "sku"
      | "used_parts"
      | "price_cents"
      | "description"
      | "supplier_device_errors"
      | "supplier_grading"
      | "refurb_diagnostics"
      | "rma_defect_description"
      | "rma"
      | "compensation_cents"
      | "imei_sn"
      | "manual_sn"
      | "location",
    value: string
  ) {
    const before = items.find((x) => x.id === itemId);
    const currentStatus = canonicalizeStatusValue(before?.refurb_status, statusOptions || [], defaultStatusValue);

    if (isBooked(currentStatus)) {
      window.alert("Status is booked en deze rij kan niet meer gewijzigd worden.");
      return;
    }

    if (field === "refurb_status") {
      // ✅ AdminOnly + NeedSKU UI checks (server-side ook)
      const opt: any = statusOptions.find((o: any) => String(o?.value ?? "") === String(value ?? ""));
      if (opt) {
        if (opt.admin_only && !canUseAdminStatuses) {
          window.alert("Je hebt geen rechten om deze status te kiezen.");
          return;
        }
        if (opt.need_sku && !hasValidSku((before as any)?.sku)) {
          window.alert("SKU is verplicht om deze status te kiezen.");
          return;
        }
      }

      const verdict = isTransitionAllowed(currentStatus, value);
      if (!verdict.ok) {
        window.alert(verdict.reason);
        return;
      }
    }

    // optimistic UI update
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;

        if (field === "price_cents" || field === "compensation_cents") {
          return {
            ...it,
            [field]: value ? parseMoneyToCents(value) : null,
          } as RefurbItem;
        }

        if (field === "refurb_status") {
          return { ...it, refurb_status: value || null } as RefurbItem;
        }

        return { ...it, [field]: value || null } as RefurbItem;
      })
    );

    try {
      await updateRefurbItemCell(itemId, field as any, value);
      if (field === "refurb_status" || field === "location") {
        router.refresh();
      }
    } catch (e: any) {
      console.error("[REFURB] updateCell client error", e);
      window.alert(e?.message || "Opslaan mislukt (zie logs).");

      // ✅ herstel UI naar server truth
      try {
        const fresh = await fetchReceptionItems(receptionId);
        setItems(
          (fresh || []).map((it) => ({
            ...it,
            refurb_status: canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue),
          }))
        );
      } catch {}
    }
  }

  async function handlePasteToColumn(
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    startRowIndex: number,
    field:
      | "refurb_status"
      | "sku"
      | "used_parts"
      | "price_cents"
      | "description"
      | "supplier_device_errors"
      | "supplier_grading"
      | "refurb_diagnostics"
      | "rma_defect_description"
      | "rma"
      | "compensation_cents"
      | "imei_sn"
      | "manual_sn"
      | "location"
  ) {
    const text = e.clipboardData.getData("text");
    if (!text || !text.includes("\n")) return;

    e.preventDefault();
    const lines = text.split(/\r?\n/);

    try {
      setIsPasting(true);
      const updated = await pasteIntoRefurbColumn(
        receptionId,
        startRowIndex,
        field as any,
        lines,
        defaultStatusValue, // ✅ voorkomt "new"
        defaultLocationValue
      );
      setItems(
        (updated || []).map((it) => ({
          ...it,
          refurb_status: canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue),
        }))
      );
      router.refresh();
    } catch (err: any) {
      console.error("[REFURB] pasteToColumn client error", err);
      window.alert(err?.message || "Plakken mislukt (zie logs).");
    } finally {
      setIsPasting(false);
    }
  }

  function getTargetsForBulk(): string[] {
    if (bulkTarget === "selected") {
      return items.filter((it) => selectedIds.has(it.id)).map((it) => it.id);
    }

    const tokens = new Set(parseTokens(bulkImeiText).map(norm));
    if (!tokens.size) return [];

    return items
      .filter((it) => {
        const imei = norm((it as any).imei_sn ?? "");
        const sn = norm((it as any).manual_sn ?? "");
        return (imei && tokens.has(imei)) || (sn && tokens.has(sn));
      })
      .map((it) => it.id);
  }

  async function runBulkUpdate() {
    const itemIds = getTargetsForBulk();

    const wantStatus = bulkEnableStatus && bulkStatus.trim() !== "";
    const wantLocation = bulkEnableLocation && bulkLocation.trim() !== "";
    const partsRaw = parseTokens(bulkPartsText)
      .map((t) => t.trim())
      .filter(Boolean)
      .join(", ");
    const wantParts = partsRaw.length > 0;

    if (!wantStatus && !wantLocation && !wantParts) {
      window.alert("Kies minstens één bulk update (Status, Locatie of Used parts).");
      return;
    }

    if (!itemIds.length) {
      window.alert(
        bulkTarget === "selected" ? "Geen rijen geselecteerd." : "Geen rijen gevonden met IMEI/SN uit de textarea."
      );
      return;
    }

    // ✅ Bulk UI checks for status (NeedSKU/AdminOnly)
    if (wantStatus) {
      const opt: any = statusOptions.find((o: any) => String(o?.value ?? "") === String(bulkStatus ?? ""));
      if (opt?.admin_only && !canUseAdminStatuses) {
        window.alert("Je hebt geen rechten om deze status in bulk toe te passen.");
        return;
      }

      if (opt?.need_sku) {
        const missingSkuCount = items
          .filter((it) => itemIds.includes(it.id))
          .filter((it) => !hasValidSku((it as any).sku)).length;

        if (missingSkuCount > 0) {
          window.alert(
            `Deze status vereist een SKU.\n\n` +
              `${missingSkuCount} van de geselecteerde rijen hebben geen SKU.\n` +
              `Vul eerst SKU in voor deze rijen, en probeer opnieuw.`
          );
          return;
        }
      }
    }

    setIsBulkUpdating(true);

    try {
      const res = await bulkUpdateRefurbItems({
        receptionId,
        itemIds,
        patch: {
          refurb_status: wantStatus ? bulkStatus : undefined,
          location: wantLocation ? bulkLocation : undefined,
          used_parts: wantParts ? partsRaw : undefined,
        },
        defaultStatusValue,
        readyToBookValue,
      });

      const fresh = await fetchReceptionItems(receptionId);
      setItems(
        (fresh || []).map((it) => ({
          ...it,
          refurb_status: canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue),
        }))
      );

      if (wantStatus || wantLocation) router.refresh();

      window.alert(
        `Bulk update uitgevoerd.\n` +
          `Updated: ${res.updated}\n` +
          (res.skipped > 0
            ? `Overgeslagen: ${res.skipped}\n` +
              Object.entries(res.reasons)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join("\n")
            : "Alles succesvol toegepast.")
      );
    } catch (e) {
      console.error("[REFURB] bulk update error", e);
      window.alert("Bulk update mislukt (zie logs).");
    } finally {
      setIsBulkUpdating(false);
    }
  }

  async function onDeleteRow(item: RefurbItem) {
    if (!canDelete) return;

    const currentStatus = canonicalizeStatusValue(item.refurb_status, statusOptions || [], defaultStatusValue).trim();
    if (isBooked(currentStatus)) {
      window.alert("Status is booked: deze rij kan niet verwijderd worden.");
      return;
    }

    const ok = window.confirm(
      `Rij verwijderen?\n\nRow index: ${item.row_index}\nSKU: ${item.sku ?? "—"}\nIMEI/SN: ${(item as any).imei_sn ?? "—"}`
    );
    if (!ok) return;

    try {
      setIsDeletingRow(item.id);
      const fresh = await deleteRefurbReceptionItem({
        receptionId,
        itemId: item.id,
      });
      setItems(
        (fresh || []).map((it) => ({
          ...it,
          refurb_status: canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue),
        }))
      );
      router.refresh();
    } catch (e: any) {
      console.error("[REFURB] delete row error", e);
      window.alert(e?.message || "Rij verwijderen mislukt.");
    } finally {
      setIsDeletingRow(null);
    }
  }

  // ================================
  // kolomtelling (voor “no items” / “geen filters” rows)
  // ================================
  const baseColCount =
    1 + // status
    1 + // location
    1 + // IMEI/SN
    1 + // SKU
    1 + // used parts
    1 + // description
    1 + // supplier grading
    0;

  const colSpan =
    1 + // checkbox
    (canDelete ? 1 : 0) +
    baseColCount +
    (showExtraSn ? 1 : 0) + // extra SN
    (showPrice ? 1 : 0) + // price
    (showSupplierRemarks ? 1 : 0) + // supplier remarks
    (showAdvanced ? 4 : 0); // advanced

  // helper: render the table header row (used twice: not done + done blocks)
  const renderHeader = () => {
    return (
      <thead className="bg-slate-50 text-[11px] uppercase">
        <tr>
          <th className="px-2 py-1 border w-8">
            <input
              ref={headerCheckboxRef}
              type="checkbox"
              checked={allFilteredSelected}
              onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
              aria-label="Selecteer alle gefilterde rijen"
            />
          </th>

          {canDelete && <th className="px-2 py-1 border w-10">Act</th>}

          <th className="px-2 py-1 border">
            <div className="flex items-center gap-2">
              <span>Status</span>
              <select
                className="bb-select bb-select-sm text-[11px]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="__all__">Alles</option>
                {presentStatuses.map((st) => (
                  <option key={st} value={st}>
                    {statusOptionByValue.get(st)?.label ?? st}
                  </option>
                ))}
              </select>
            </div>
          </th>

          <th className="px-2 py-1 border">
            <div className="flex items-center gap-2">
              <span>Location</span>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="bb-select bb-select-sm w-full text-slate-900"
              >
                <option value="__all__">Alles</option>
                {locationFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </th>

          <th className="px-2 py-1 border">
            <div className="flex flex-col gap-1">
              <span>IMEI/SN</span>
              <input
                className="bb-input h-7 text-[11px] px-2 normal-case"
                placeholder="zoek..."
                value={imeiQuery}
                onChange={(e) => setImeiQuery(e.target.value)}
              />
            </div>
          </th>

          {showExtraSn && <th className="px-2 py-1 border">SN</th>}

          <th className="px-2 py-1 border">SKU</th>
          <th className="px-2 py-1 border">Used parts</th>

          {showPrice && <th className="px-2 py-1 border">Price</th>}

          <th className="px-2 py-1 border">
            <div className="flex flex-col gap-1">
              <span>Description</span>
              <input
                className="bb-input h-7 text-[11px] px-2 normal-case"
                placeholder="zoek..."
                value={descQuery}
                onChange={(e) => setDescQuery(e.target.value)}
              />
            </div>
          </th>

          {showSupplierRemarks && <th className="px-2 py-1 border">Supplier remarks</th>}

          <th className="px-2 py-1 border">Supplier Grading</th>

          {showAdvanced && (
            <>
              <th className="px-2 py-1 border">Refurb Diagnostics</th>
              <th className="px-2 py-1 border">RMA Defect Description</th>
              <th className="px-2 py-1 border">RMA</th>
              <th className="px-2 py-1 border">Compensation</th>
            </>
          )}
        </tr>
      </thead>
    );
  };

  // helper: render rows
  const renderRows = (rows: Array<{ it: RefurbItem }>) => {
    return (
      <>
        {rows.map(({ it }) => {
          const currentStatus = canonicalizeStatusValue(it.refurb_status, statusOptions || [], defaultStatusValue).trim();

          const rowBooked = isBooked(currentStatus);

          const lockedPrice = isLockedAfterFill(it, "price_cents");
          const lockedDesc = isLockedAfterFill(it, "description");
          const lockedSuppErr = isLockedAfterFill(it, "supplier_device_errors");
          const lockedSuppGrad = isLockedAfterFill(it, "supplier_grading");

          const imeiSn = (it as any).imei_sn ?? "";
          const manualSn = (it as any).manual_sn ?? "";
          const locationValue = (it as any).location ?? "";

          const statusColor = statusColorByValue.get(currentStatus) ?? null;
          const isFinishedRow = containsFinished(currentStatus);

          const rowChecked = selectedIds.has(it.id);

          const { hasMapForCurrent, set: allowedNextSet } = getAllowedNextSet(currentStatus);

          // ✅ alleen "map-mode" gebruiken als er effectief mapping bestaat voor current
          const mapModeForRow = Boolean(allowedNextByStatus && hasMapForCurrent);

          // ✅ status dropdown options
          const visibleStatusOptions = (() => {
            if (!mapModeForRow) return statusOptions;

            const curNorm = norm(currentStatus);
            const allowedNorms = new Set<string>();
            if (allowedNextSet) {
              for (const v of Array.from(allowedNextSet.values())) {
                allowedNorms.add(norm(v));
              }
            }

            return statusOptions.filter((opt) => {
              const vNorm = norm(opt.value);
              return vNorm === curNorm || allowedNorms.has(vNorm);
            });
          })();

          // ✅ als map-mode maar 0/1 opties: niet hard disablen tenzij er echt geen choices zijn
          const rowHasChoices = mapModeForRow ? visibleStatusOptions.length > 1 : statusOptions.length > 0;

          // ✅ paste startRowIndex moet row_index zijn (niet array-index), anders plakt alles “verschoven”
          const pasteStartRowIndex = Number((it as any).row_index ?? 0);

          return (
            <tr key={it.id} className="border-t hover:bg-slate-50/50">
              <td className="px-2 py-0.5 border">
                <input type="checkbox" checked={rowChecked} onChange={(e) => toggleSelectOne(it.id, e.target.checked)} />
              </td>

            {canDelete && (
              <td className="px-1 py-0.5 border">
                <button
                  type="button"
                  className="bb-btn text-[11px] px-2 h-7 border border-red-200 text-red-700"
                  disabled={rowBooked || isDeletingRow === it.id}
                  title={rowBooked ? "Booked: kan niet verwijderen" : "Verwijder rij"}
                  onClick={() => onDeleteRow(it)}
                >
                  {isDeletingRow === it.id ? "…" : "🗑️"}
                </button>
              </td>
            )}
              {/* Status */}
              <td className="px-1 py-0.5 border">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex w-3 h-3 rounded-full border border-slate-300 shrink-0"
                    style={{ background: statusColor ?? "transparent" }}
                    aria-hidden="true"
                  />
                  <select
                    value={currentStatus}
                    disabled={rowBooked || (mapModeForRow && !rowHasChoices)}
                    onChange={(e) => handleCellChange(it.id, "refurb_status", e.target.value)}
                    className="bb-select bb-select-sm w-full text-slate-900"
                    title={
                      rowBooked
                        ? "Booked: status kan niet meer gewijzigd worden"
                        : mapModeForRow && !rowHasChoices
                        ? "Geen toegelaten vervolgstatus"
                        : "Status wijzigen"
                    }
                  >
                    {currentStatus && !statusOptionByValue.has(currentStatus) && (
                      <option value={currentStatus}>{currentStatus}</option>
                    )}

                    {!mapModeForRow
                      ? statusOptions.map((opt: any) => {
                          const optValue = opt.value;

                          if (isFinishedRow && norm(optValue) !== norm(readyToBookValue)) {
                            return null;
                          }

                          const cannotGoBackToDefault =
                            norm(optValue) === norm(defaultStatusValue) && norm(currentStatus) !== norm(defaultStatusValue);

                          const cannotSetBooked = norm(optValue) === "booked" && !isReadyToBook(currentStatus);

                          const ruleVerdict = statusRuleVerdictForRow(opt, it);

                          const disabled = rowBooked || cannotGoBackToDefault || cannotSetBooked || !ruleVerdict.ok;

                          const title = !ruleVerdict.ok ? ruleVerdict.reason : undefined;

                          return (
                            <option key={opt.value} value={opt.value} disabled={disabled} title={title}>
                              {opt.label}
                            </option>
                          );
                        })
                      : visibleStatusOptions.map((opt: any) => {
                          const ruleVerdict = statusRuleVerdictForRow(opt, it);
                          const disabled = rowBooked || !ruleVerdict.ok;
                          const title = !ruleVerdict.ok ? ruleVerdict.reason : undefined;

                          return (
                            <option key={opt.value} value={opt.value} disabled={disabled} title={title}>
                              {opt.label}
                            </option>
                          );
                        })}
                  </select>
                </div>
              </td>

              {/* Location */}
              <td className="px-1 py-0.5 border">
                <select
                  value={locationValue}
                  disabled={rowBooked}
                  onChange={(e) => handleCellChange(it.id, "location", e.target.value)}
                  className="bb-select bb-select-sm w-full text-slate-900"
                >
                  {locationValue && !locationOptionByValue.has(locationValue) && <option value={locationValue}>{locationValue}</option>}
                  {locationOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </td>

              {/* IMEI/SN + copy */}
              <td className="px-1 py-0.5 border">
                <div className="flex items-center gap-1">
                  {imeiSn ? (
                    <span className="block truncate max-w-[200px]" title={imeiSn}>
                      {imeiSn}
                    </span>
                  ) : (
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full"
                      value={imeiSn}
                      disabled={rowBooked}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItems((prev) => prev.map((row) => (row.id === it.id ? ({ ...row, imei_sn: val } as any) : row)));
                      }}
                      onBlur={(e) => handleCellChange(it.id, "imei_sn", e.target.value.trim())}
                      onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "imei_sn")}
                    />
                  )}
                  <CopyBtn value={imeiSn} title="Copy IMEI/SN" />
                </div>
              </td>

              {showExtraSn && (
                <td className="px-1 py-0.5 border">
                  <input
                    className="bb-input h-7 text-[11px] px-1 w-full"
                    value={manualSn}
                    disabled={rowBooked}
                    onChange={(e) => {
                      const val = e.target.value;
                      setItems((prev) => prev.map((row) => (row.id === it.id ? ({ ...row, manual_sn: val } as any) : row)));
                    }}
                    onBlur={(e) => handleCellChange(it.id, "manual_sn", e.target.value.trim())}
                    onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "manual_sn")}
                  />
                </td>
              )}

             {/* SKU + autocomplete */}
              <td className="px-1 py-0.5 border">
                <SkuAutocompleteCell
                  value={it.sku ?? ""}
                  vatScheme={vatScheme}
                  disabled={rowBooked}
                  onChange={async (nextSku) => {
                    await handleCellChange(it.id, "sku", nextSku);
                  }}
                  onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "sku")}
                />
              </td>

              {/* Used parts */}
              <td className="px-1 py-0.5 border">
                <UsedPartsCell
                  rawValue={it.used_parts ?? ""}
                  locked={rowBooked}
                  onChange={(raw) => handleCellChange(it.id, "used_parts", raw)}
                  onPasteToColumn={(e) => handlePasteToColumn(e, pasteStartRowIndex, "used_parts")}
                />
              </td>

              {/* Price (toggle) */}
              {showPrice && (
                <td className="px-1 py-0.5 border">
                  {lockedPrice ? (
                    <span>{money(it.price_cents)}</span>
                  ) : (
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full text-right"
                      defaultValue={typeof it.price_cents === "number" ? (it.price_cents / 100).toString() : ""}
                      disabled={rowBooked}
                      placeholder="0,00"
                      onBlur={(e) => handleCellChange(it.id, "price_cents", e.target.value)}
                      onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "price_cents")}
                    />
                  )}
                </td>
              )}

              {/* Description */}
              <td className="px-1 py-0.5 border">
                {lockedDesc ? (
                  <span className="block truncate max-w-[260px]" title={it.description ?? ""}>
                    {it.description}
                  </span>
                ) : (
                  <input
                    className="bb-input h-7 text-[11px] px-1 w-full"
                    defaultValue={it.description ?? ""}
                    disabled={rowBooked}
                    onBlur={(e) => handleCellChange(it.id, "description", e.target.value)}
                    onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "description")}
                  />
                )}
              </td>

              {/* Supplier remarks (toggle) */}
              {showSupplierRemarks && (
                <td className="px-1 py-0.5 border">
                  {lockedSuppErr ? (
                    <span className="block truncate max-w-[260px]" title={it.supplier_device_errors ?? ""}>
                      {it.supplier_device_errors}
                    </span>
                  ) : (
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full"
                      defaultValue={it.supplier_device_errors ?? ""}
                      disabled={rowBooked}
                      onBlur={(e) => handleCellChange(it.id, "supplier_device_errors", e.target.value)}
                      onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "supplier_device_errors")}
                    />
                  )}
                </td>
              )}

              {/* Supplier grading */}
              <td className="px-1 py-0.5 border">
                {lockedSuppGrad ? (
                  <span>{it.supplier_grading}</span>
                ) : (
                  <input
                    className="bb-input h-7 text-[11px] px-1 w-full"
                    defaultValue={it.supplier_grading ?? ""}
                    disabled={rowBooked}
                    onBlur={(e) => handleCellChange(it.id, "supplier_grading", e.target.value)}
                    onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "supplier_grading")}
                  />
                )}
              </td>

              {showAdvanced && (
                <>
                  <td className="px-1 py-0.5 border">
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full"
                      defaultValue={it.refurb_diagnostics ?? ""}
                      disabled={rowBooked}
                      onBlur={(e) => handleCellChange(it.id, "refurb_diagnostics", e.target.value)}
                      onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "refurb_diagnostics")}
                    />
                  </td>

                  <td className="px-1 py-0.5 border">
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full"
                      defaultValue={it.rma_defect_description ?? ""}
                      disabled={rowBooked}
                      onBlur={(e) => handleCellChange(it.id, "rma_defect_description", e.target.value)}
                      onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "rma_defect_description")}
                    />
                  </td>

                  <td className="px-1 py-0.5 border">
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full"
                      defaultValue={it.rma ?? ""}
                      disabled={rowBooked}
                      onBlur={(e) => handleCellChange(it.id, "rma", e.target.value)}
                      onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "rma")}
                    />
                  </td>

                  <td className="px-1 py-0.5 border">
                    <input
                      className="bb-input h-7 text-[11px] px-1 w-full text-right"
                      defaultValue={typeof it.compensation_cents === "number" ? (it.compensation_cents / 100).toString() : ""}
                      disabled={rowBooked}
                      placeholder="0,00"
                      onBlur={(e) => handleCellChange(it.id, "compensation_cents", e.target.value)}
                      onPaste={(e) => handlePasteToColumn(e, pasteStartRowIndex, "compensation_cents")}
                    />
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </>
    );
  };

  return (
    <div className="mt-4 space-y-3">
      {/* Bulk Update (collapsible) */}
      <div className="border rounded-md bg-white text-xs">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 border-b bg-slate-50"
          onClick={() => setBulkOpen((v) => !v)}
        >
          <div className="font-medium text-[11px] uppercase tracking-wide text-slate-700">Bulk Update</div>
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            {isBulkUpdating && (
              <>
                <span
                  className="inline-flex w-3 h-3 rounded-full border border-slate-400 border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                <span>Bezig...</span>
              </>
            )}
            <span className="ml-2">{bulkOpen ? "▲" : "▼"}</span>
          </div>
        </button>

        {bulkOpen && (
          <div className="p-3">
            <div className="md:flex gap-3 items-stretch">
              {/* links */}
              <div className="flex-1 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={bulkEnableStatus}
                    onChange={(e) => setBulkEnableStatus(e.target.checked)}
                  />
                  <div className="flex-1">
                    <div className="text-[11px] text-slate-500 mb-1">Status</div>
                    <select
                      className="bb-select bb-select-sm w-full"
                      disabled={!bulkEnableStatus}
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value)}
                    >
                      <option value="">—</option>
                      {statusOptions.map((opt: any) => {
                        const disabled = Boolean(opt?.admin_only) && !canUseAdminStatuses;
                        return (
                          <option key={opt.value} value={opt.value} disabled={disabled}>
                            {opt.label}
                          </option>
                        );
                      })}
                    </select>
                    {!canUseAdminStatuses && statusOptions.some((o: any) => o?.admin_only) && (
                      <div className="mt-1 text-[11px] text-slate-500">Sommige statussen zijn admin-only.</div>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={bulkEnableLocation}
                    onChange={(e) => setBulkEnableLocation(e.target.checked)}
                  />
                  <div className="flex-1">
                    <div className="text-[11px] text-slate-500 mb-1">Locatie</div>
                    <select
                      className="bb-select bb-select-sm w-full"
                      disabled={!bulkEnableLocation}
                      value={bulkLocation}
                      onChange={(e) => setBulkLocation(e.target.value)}
                    >
                      <option value="">—</option>
                      {locationOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 mb-1">Used parts (SKU’s)</div>
                  <textarea
                    className="bb-input w-full text-[11px] p-2 min-h-[110px]"
                    value={bulkPartsText}
                    onChange={(e) => setBulkPartsText(e.target.value)}
                    placeholder={"Plak hier used parts SKU’s (komma/enter) ..."}
                  />
                </div>
              </div>

              {/* rechts */}
              <div className="flex-1 flex flex-col mt-3 md:mt-0">
                <div className="text-[11px] text-slate-500 mb-1">IMEI/SN lijst (voor target “op IMEI/SN”)</div>
                <textarea
                  className="bb-input w-full text-[11px] p-2 flex-1 h-full min-h-[calc(110px+72px)]"
                  value={bulkImeiText}
                  onChange={(e) => setBulkImeiText(e.target.value)}
                  placeholder={"Plak hier IMEI/SN ..."}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="text-[11px] text-slate-500">Toepassen op:</div>
                <label className="flex items-center gap-2 text-[11px]">
                  <input
                    type="radio"
                    name="bulkTarget"
                    checked={bulkTarget === "selected"}
                    onChange={() => setBulkTarget("selected")}
                  />
                  geselecteerde rijen
                </label>
                <label className="flex items-center gap-2 text-[11px]">
                  <input type="radio" name="bulkTarget" checked={bulkTarget === "imei"} onChange={() => setBulkTarget("imei")} />
                  rijen met IMEI/SN uit textarea
                </label>
              </div>

              <button
                type="button"
                className="bb-btn text-[11px] px-3 py-2"
                onClick={runBulkUpdate}
                disabled={isBulkUpdating}
              >
                Apply bulk update
              </button>
            </div>
          </div>
        )}
      </div>
      {/* RMA overzicht */}
      <div className="overflow-hidden rounded-md border border-red-200 bg-white text-xs">
        <div className="flex w-full items-center justify-between border-b border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white">
              {rmaItems.length}
            </span>

            <span className="font-medium uppercase tracking-wide text-red-800">
              RMA overzicht
            </span>
          </div>

          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-red-200 bg-white text-[11px] text-red-700 hover:bg-red-100"
            onClick={() => setRmaOpen((value) => !value)}
            aria-label={
              rmaOpen
                ? "RMA-overzicht inklappen"
                : "RMA-overzicht uitklappen"
            }
            title={rmaOpen ? "Inklappen" : "Uitklappen"}
          >
            {rmaOpen ? "▲" : "▼"}
          </button>
        </div>

        {rmaOpen && (
          <div className="space-y-3 p-3">
            <div className="flex flex-col gap-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Supplier invoice nr
                </div>

                <div className="mt-1 font-mono text-[12px] font-semibold text-slate-900">
                  {supplierInvoiceNr || "—"}
                </div>
              </div>

              <button
                type="button"
                className="inline-flex h-8 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!rmaItems.length}
                onClick={copyCompleteRmaOverview}
                title="Kopieer volledig RMA-overzicht als HTML"
              >
                <span aria-hidden="true">
                  {rmaCopied ? "✓" : "⧉"}
                </span>

                <span>
                  {rmaCopied
                    ? "Gekopieerd"
                    : "Kopieer voor e-mail"}
                </span>
              </button>
            </div>

            {rmaItems.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-[11px] text-slate-500">
                Er zijn momenteel geen items met status RMA.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full border-collapse text-[11px]">
                  <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="border-b px-3 py-2">
                        IMEI/SN
                      </th>

                      <th className="border-b px-3 py-2">
                        Description
                      </th>

                      <th className="border-b px-3 py-2">
                        RMA defect description
                      </th>

                      <th className="border-b px-3 py-2 text-right">
                        Compensation
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rmaItems.map((item) => {
                      const imeiOrSn =
                        (item as any).imei_sn ||
                        (item as any).manual_sn ||
                        "";

                      return (
                        <tr
                          key={item.id}
                          className="border-t hover:bg-red-50/30"
                        >
                          <td className="whitespace-nowrap px-3 py-2 font-mono">
                            {imeiOrSn || "—"}
                          </td>

                          <td className="min-w-[240px] px-3 py-2">
                            {item.description || "—"}
                          </td>

                          <td className="min-w-[280px] px-3 py-2">
                            {item.rma_defect_description || "—"}
                          </td>

                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {typeof item.compensation_cents ===
                            "number"
                              ? money(
                                  item.compensation_cents
                                )
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="border-t border-red-200 bg-red-50">
                      <td
                        colSpan={3}
                        className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-red-800"
                      >
                        Totale compensatie
                      </td>

                      <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-bold text-red-700">
                        {money(
                          totalRmaCompensationCents
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {/* Table */}
      <div className="border rounded-md overflow-x-auto text-xs">
        <div className="flex items-center justify-between px-2 py-1 border-b bg-slate-50">
          <span className="font-medium text-[11px] uppercase tracking-wide">Refurb Reception items</span>

          <div className="flex items-center gap-3">
            {isPasting && (
              <div className="flex items-center gap-2 text-[11px] text-slate-600">
                <span
                  className="inline-flex w-3 h-3 rounded-full border border-slate-400 border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                <span>Bezig met plakken...</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowExtraSn((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
            >
              <span className="inline-flex items-center justify-center w-4 h-4 border rounded-full" aria-hidden="true">
                {showExtraSn ? "▲" : "▼"}
              </span>
              <span>Extra SN</span>
            </button>

            <button
              type="button"
              onClick={() => setShowPrice((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
            >
              <span className="inline-flex items-center justify-center w-4 h-4 border rounded-full" aria-hidden="true">
                {showPrice ? "▲" : "▼"}
              </span>
              <span>Price</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSupplierRemarks((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
            >
              <span className="inline-flex items-center justify-center w-4 h-4 border rounded-full" aria-hidden="true">
                {showSupplierRemarks ? "▲" : "▼"}
              </span>
              <span>Supplier remarks</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
            >
              <span className="inline-flex items-center justify-center w-4 h-4 border rounded-full" aria-hidden="true">
                {showAdvanced ? "▲" : "▼"}
              </span>
              <span>RMA</span>
            </button>
          </div>
        </div>

        {/* Niet afgewerkt block */}
        <div className="border-b">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 bg-white"
            onClick={() => setOpenNotDone((v) => !v)}
          >
            <div className="font-medium text-[11px] uppercase tracking-wide text-slate-700">
              Niet afgewerkt ({filteredNotDoneRows.length})
            </div>
            <div className="text-[11px] text-slate-600">{openNotDone ? "▲" : "▼"}</div>
          </button>

          {openNotDone && (
            <table className="min-w-full border-collapse">
              {renderHeader()}
              <tbody>
                {hasItems && filteredNotDoneRows.length > 0 && renderRows(filteredNotDoneRows.map((r) => ({ it: r.it })))}

                {!hasItems && (
                  <>
                    <tr className="border-t">
                      <td className="px-2 py-0.5 border" />
                      {canDelete && <td className="px-2 py-0.5 border" />}

                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          placeholder="Plak status hier"
                          onPaste={(e) => handlePasteToColumn(e, 0, "refurb_status")}
                        />
                      </td>

                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          placeholder="Plak locaties hier"
                          onPaste={(e) => handlePasteToColumn(e, 0, "location")}
                        />
                      </td>

                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          placeholder="Plak IMEI/SN kolom hier"
                          onPaste={(e) => handlePasteToColumn(e, 0, "imei_sn")}
                        />
                      </td>

                      {showExtraSn && (
                        <td className="px-1 py-0.5 border">
                          <input
                            className="bb-input h-7 text-[11px] px-1 w-full"
                            placeholder="Plak SN kolom hier"
                            onPaste={(e) => handlePasteToColumn(e, 0, "manual_sn")}
                          />
                        </td>
                      )}

                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          placeholder="Plak SKU-kolom hier"
                          onPaste={(e) => handlePasteToColumn(e, 0, "sku")}
                        />
                      </td>

                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          placeholder="Plak Used parts-kolom hier"
                          onPaste={(e) => handlePasteToColumn(e, 0, "used_parts")}
                        />
                      </td>

                      {showPrice && (
                        <td className="px-1 py-0.5 border">
                          <input
                            className="bb-input h-7 text-[11px] px-1 w-full text-right"
                            placeholder="Plak prijzen hier"
                            onPaste={(e) => handlePasteToColumn(e, 0, "price_cents")}
                          />
                        </td>
                      )}

                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          placeholder="Plak Description-kolom hier"
                          onPaste={(e) => handlePasteToColumn(e, 0, "description")}
                        />
                      </td>

                      {showSupplierRemarks && (
                        <td className="px-1 py-0.5 border">
                          <input
                            className="bb-input h-7 text-[11px] px-1 w-full"
                            placeholder="Plak Supplier remarks hier"
                            onPaste={(e) => handlePasteToColumn(e, 0, "supplier_device_errors")}
                          />
                        </td>
                      )}

                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          placeholder="Plak grading hier"
                          onPaste={(e) => handlePasteToColumn(e, 0, "supplier_grading")}
                        />
                      </td>

                      {showAdvanced && (
                        <>
                          <td className="px-1 py-0.5 border">
                            <input
                              className="bb-input h-7 text-[11px] px-1 w-full"
                              placeholder="Plak refurb diagnostics hier"
                              onPaste={(e) => handlePasteToColumn(e, 0, "refurb_diagnostics")}
                            />
                          </td>

                          <td className="px-1 py-0.5 border">
                            <input
                              className="bb-input h-7 text-[11px] px-1 w-full"
                              placeholder="Plak RMA defect beschrijving hier"
                              onPaste={(e) => handlePasteToColumn(e, 0, "rma_defect_description")}
                            />
                          </td>

                          <td className="px-1 py-0.5 border">
                            <input
                              className="bb-input h-7 text-[11px] px-1 w-full"
                              placeholder="Plak RMA-codes hier"
                              onPaste={(e) => handlePasteToColumn(e, 0, "rma")}
                            />
                          </td>

                          <td className="px-1 py-0.5 border">
                            <input
                              className="bb-input h-7 text-[11px] px-1 w-full text-right"
                              placeholder="Plak compensaties hier"
                              onPaste={(e) => handlePasteToColumn(e, 0, "compensation_cents")}
                            />
                          </td>
                        </>
                      )}
                    </tr>

                    <tr>
                      <td className="px-2 py-3 border text-[11px] text-slate-500" colSpan={colSpan}>
                        Nog geen toestellen in deze receptie. Plak een kolom uit Excel in één van de velden hierboven (bv.
                        IMEI/SN, SKU, Description, Price...) om rijen aan te maken. Status en Location gebruiken hun
                        ingestelde default-waarde bij het importeren.
                      </td>
                    </tr>
                  </>
                )}

                {hasItems && filteredNotDoneRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 border text-[11px] text-slate-500" colSpan={colSpan}>
                      Geen rijen (niet afgewerkt) voor deze filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Afgewerkt block */}
        <div>
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 bg-white"
            onClick={() => setOpenDone((v) => !v)}
          >
            <div className="font-medium text-[11px] uppercase tracking-wide text-slate-700">
              Afgewerkt ({filteredDoneRows.length})
            </div>
            <div className="text-[11px] text-slate-600">{openDone ? "▲" : "▼"}</div>
          </button>

          {openDone && (
            <table className="min-w-full border-collapse">
              {renderHeader()}
              <tbody>
                {hasItems && filteredDoneRows.length > 0 && renderRows(filteredDoneRows.map((r) => ({ it: r.it })))}

                {hasItems && filteredDoneRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 border text-[11px] text-slate-500" colSpan={colSpan}>
                      Geen rijen (afgewerkt) voor deze filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
