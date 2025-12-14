// app/admin/refurb/RefurbReceptionTable.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  RefurbItem,
  updateRefurbItemCell,
  pasteIntoRefurbColumn,
} from "./actions";
import type { RefurbStatusOption, RefurbLocationOption } from "./settingsActions";

type Props = {
  receptionId: string;
  initialItems: RefurbItem[];
  statusOptions: RefurbStatusOption[];
  locationOptions: RefurbLocationOption[];

  // ✅ doorgegeven vanuit page.tsx
  defaultStatusValue: string;
  readyToBookValue: string;
};

// Alleen deze velden blijven "lock after fill" (SKU + used_parts NIET meer)
const LOCK_AFTER_FILL_FIELDS = new Set<
  | "price_cents"
  | "description"
  | "supplier_device_errors"
  | "supplier_grading"
>(["price_cents", "description", "supplier_device_errors", "supplier_grading"]);

function money(cents: number | null) {
  if (typeof cents !== "number") return "";
  return (cents / 100).toLocaleString("nl-BE", {
    style: "currency",
    currency: "EUR",
  });
}

// eenvoudige client-side parse naar cents (zelfde idee als server)
function parseMoneyToCents(raw: string): number | null {
  const v = raw.replace(",", ".").trim();
  if (!v) return null;
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

// status + location + IMEI/SN + SKU + used + price + desc + supp remarks + supp grading
const BASE_COL_COUNT = 9;
const EXTRA_SN_COL_COUNT = 1; // optionele SN kolom
const ADVANCED_COL_COUNT = 4; // refurb diagnostics + rma defect + rma + compensation

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

function canChangeStatus(opts: {
  current: string | null | undefined;
  next: string;
  defaultStatusValue: string;
  readyToBookValue: string;
}): { ok: true } | { ok: false; reason: string } {
  const current = opts.current ?? "";
  const next = opts.next;
  const def = opts.defaultStatusValue;

  // finished-status mag enkel naar Ready to Book
  if (containsFinished(current) && norm(next) !== norm(opts.readyToBookValue)) {
    return {
      ok: false,
      reason: "Finished-status kan enkel op Ready to Book gezet worden.",
    };
  }

  // booked is immutable
  if (isBooked(current) && norm(next) !== norm(current)) {
    return {
      ok: false,
      reason: "Status is booked en kan niet meer gewijzigd worden.",
    };
  }

  // only Ready to Book -> booked
  if (isBooked(next) && !isReadyToBook(current)) {
    return {
      ok: false,
      reason: "Status kan alleen op booked gezet worden vanuit Ready to Book.",
    };
  }

  // cannot go back to default if current isn't default
  if (norm(next) === norm(def) && norm(current) !== norm(def)) {
    return {
      ok: false,
      reason: "Je kan niet terug naar de default status zodra je daarvan afwijkt.",
    };
  }

  return { ok: true };
}

function statusForPaste(opts: {
  currentStatus: string | null | undefined;
  defaultStatusValue: string;
  readyToBookValue: string;
}) {
  if (containsFinished(opts.currentStatus)) return opts.readyToBookValue;
  return opts.defaultStatusValue;
}

function parseTokens(raw: string): string[] {
  return (raw || "")
    .split(/[\r\n\t,; ]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function copyToClipboard(text: string) {
  try {
    if (!text) return;
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error("[REFURB] clipboard error", e);
  }
}

function CopyBtn({ value, title }: { value: string; title?: string }) {
  return (
    <button
      type="button"
      className="bb-btn text-[11px] px-2 h-7"
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
  onPasteToColumn?: (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
};

function UsedPartsCell({
  rawValue,
  locked,
  onChange,
  onPasteToColumn,
}: UsedPartsCellProps) {
  const [parts, setParts] = useState<string[]>(() => parseUsedParts(rawValue));

  useEffect(() => {
    setParts(parseUsedParts(rawValue));
  }, [rawValue]);

  if (locked) {
    const list = parseUsedParts(rawValue || "");
    if (!list.length) {
      return <span className="text-slate-400">—</span>;
    }
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

  const addPart = () => {
    setParts((prev) => [...prev, ""]);
  };

  const removePart = (index: number) => {
    setParts((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      const raw = next
        .map((p) => p.trim())
        .filter(Boolean)
        .join(", ");
      onChange(raw);
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
            onPaste={
              i === 0 && onPasteToColumn ? (e) => onPasteToColumn(e) : undefined
            }
          />
          <CopyBtn value={part.trim()} title="Copy used part SKU" />
          {rows.length > 1 && (
            <button
              type="button"
              className="bb-btn text-[11px] px-2 h-7"
              onClick={() => removePart(i)}
              title="Verwijderen"
            >
              –
            </button>
          )}
          {i === rows.length - 1 && (
            <button
              type="button"
              className="bb-btn text-[11px] px-2 h-7"
              onClick={addPart}
              title="Toevoegen"
            >
              +
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function RefurbReceptionTable({
  receptionId,
  initialItems,
  statusOptions,
  locationOptions,
  defaultStatusValue,
  readyToBookValue,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<RefurbItem[]>(initialItems);
  const [isPasting, setIsPasting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExtraSn, setShowExtraSn] = useState(false);

  // ✅ header filters
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [locationFilter, setLocationFilter] = useState<string>("__all__");

  // ✅ selectie checkboxes
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  // ✅ bulk update blok (collapse)
  const [bulkOpen, setBulkOpen] = useState(false);

  const [bulkEnableStatus, setBulkEnableStatus] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkEnableLocation, setBulkEnableLocation] = useState(false);
  const [bulkLocation, setBulkLocation] = useState<string>("");
  const [bulkPartsText, setBulkPartsText] = useState<string>("");
  const [bulkImeiText, setBulkImeiText] = useState<string>("");
  const [bulkTarget, setBulkTarget] = useState<"imei" | "selected">("selected");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const hasItems = items.length > 0;
  const colSpan =
    BASE_COL_COUNT +
    (showExtraSn ? EXTRA_SN_COL_COUNT : 0) +
    (showAdvanced ? ADVANCED_COL_COUNT : 0);

  const statusColorByValue = new Map(
    statusOptions.map((s: any) => [s.value, s.color ?? null])
  );

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

  const presentStatuses = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      const v = (it.refurb_status ?? "").trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const presentLocations = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      const v = ((it as any).location ?? "").trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredRows = useMemo(() => {
    return items
      .map((it, originalIndex) => ({ it, originalIndex }))
      .filter(({ it }) => {
        const okStatus =
          statusFilter === "__all__" || (it.refurb_status ?? "") === statusFilter;
        const okLoc =
          locationFilter === "__all__" ||
          (((it as any).location ?? "") === locationFilter);
        return okStatus && okLoc;
      });
  }, [items, statusFilter, locationFilter]);

  const filteredIds = useMemo(
    () => filteredRows.map((r) => r.it.id),
    [filteredRows]
  );

  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected =
    filteredIds.some((id) => selectedIds.has(id)) && !allFilteredSelected;

  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    headerCheckboxRef.current.indeterminate = someFilteredSelected;
  }, [someFilteredSelected, allFilteredSelected]);

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
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

    // row lock: booked => niets wijzigen (incl. SKU/parts)
    if (isBooked(before?.refurb_status ?? "")) {
      window.alert("Status is booked en deze rij kan niet meer gewijzigd worden.");
      setItems((prev) => [...prev]);
      return;
    }

    // status rules
    if (field === "refurb_status") {
      const verdict = canChangeStatus({
        current: before?.refurb_status ?? "",
        next: value,
        defaultStatusValue,
        readyToBookValue,
      });
      if (!verdict.ok) {
        window.alert(verdict.reason);
        setItems((prev) => [...prev]);
        return;
      }
    }

    // optimistic update
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;

        if (field === "price_cents" || field === "compensation_cents") {
          return {
            ...it,
            [field]: value ? parseMoneyToCents(value) : null,
          } as RefurbItem;
        }

        return {
          ...it,
          [field]: value || null,
        } as RefurbItem;
      })
    );

    try {
      await updateRefurbItemCell(itemId, field as any, value);
      if (field === "refurb_status" || field === "location") {
        router.refresh();
      }
    } catch (e) {
      console.error("[REFURB] updateCell client error", e);
      router.refresh();
    }
  }

  async function applyAutoStatusesAfterPaste(opts: {
    updated: RefurbItem[];
    startRowIndex: number;
    lineCount: number;
  }): Promise<RefurbItem[]> {
    const { updated, startRowIndex, lineCount } = opts;
    const end = startRowIndex + Math.max(0, lineCount - 1);

    const targets = updated
      .map((row, idx) => ({ row, idx }))
      .filter(({ idx }) => idx >= startRowIndex && idx <= end)
      .map(({ row }) => row);

    if (!targets.length) return updated;

    let working = updated;

    for (const row of targets) {
      const desired = statusForPaste({
        currentStatus: row.refurb_status ?? "",
        defaultStatusValue,
        readyToBookValue,
      });

      if (norm(desired) === norm(row.refurb_status ?? "")) continue;

      const verdict = canChangeStatus({
        current: row.refurb_status ?? "",
        next: desired,
        defaultStatusValue,
        readyToBookValue,
      });

      if (!verdict.ok) continue;

      try {
        await updateRefurbItemCell(row.id, "refurb_status" as any, desired);
        working = working.map((it) =>
          it.id === row.id ? ({ ...it, refurb_status: desired } as any) : it
        );
      } catch (e) {
        console.error("[REFURB] auto-status after paste failed", e);
      }
    }

    return working;
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
        lines
      );

      const withAutoStatus = await applyAutoStatusesAfterPaste({
        updated,
        startRowIndex,
        lineCount: lines.filter((l) => l !== undefined).length,
      });

      setItems(withAutoStatus);
      router.refresh();
    } catch (err) {
      console.error("[REFURB] pasteToColumn client error", err);
    } finally {
      setIsPasting(false);
    }
  }

  function getTargetsForBulk(): RefurbItem[] {
    if (bulkTarget === "selected") {
      return items.filter((it) => selectedIds.has(it.id));
    }

    const tokens = new Set(parseTokens(bulkImeiText).map(norm));
    if (!tokens.size) return [];

    return items.filter((it) => {
      const imei = norm((it as any).imei_sn ?? "");
      const sn = norm((it as any).manual_sn ?? "");
      return (imei && tokens.has(imei)) || (sn && tokens.has(sn));
    });
  }

  async function runBulkUpdate() {
    const targets = getTargetsForBulk();

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

    if (!targets.length) {
      window.alert(
        bulkTarget === "selected"
          ? "Geen rijen geselecteerd."
          : "Geen rijen gevonden met IMEI/SN uit de textarea."
      );
      return;
    }

    setIsBulkUpdating(true);

    let changedStatusOrLocation = false;

    let skipped = 0;
    const skipReasons: Record<string, number> = {};

    // ✅ chunked parallel (sneller dan 1 per 1)
    const BATCH_SIZE = 12;
    const batches = chunk(targets, BATCH_SIZE);

    const nextItems = new Map(items.map((it) => [it.id, it]));

    for (const batch of batches) {
      const jobs: Promise<any>[] = [];

      for (const row of batch) {
        const current = nextItems.get(row.id) ?? row;

        // booked => niets doen
        if (isBooked(current.refurb_status ?? "")) {
          skipped += 1;
          skipReasons["Status is booked (locked)"] =
            (skipReasons["Status is booked (locked)"] ?? 0) + 1;
          continue;
        }

        if (wantParts) {
          jobs.push(
            (async () => {
              try {
                await updateRefurbItemCell(row.id, "used_parts" as any, partsRaw);
                nextItems.set(row.id, {
                  ...(nextItems.get(row.id) as any),
                  used_parts: partsRaw,
                });
              } catch (e) {
                console.error("[REFURB] bulk used_parts update failed", e);
              }
            })()
          );
        }

        if (wantLocation) {
          jobs.push(
            (async () => {
              try {
                await updateRefurbItemCell(row.id, "location" as any, bulkLocation);
                nextItems.set(row.id, {
                  ...(nextItems.get(row.id) as any),
                  location: bulkLocation,
                });
                changedStatusOrLocation = true;
              } catch (e) {
                console.error("[REFURB] bulk location update failed", e);
              }
            })()
          );
        }

        if (wantStatus) {
          const verdict = canChangeStatus({
            current: (nextItems.get(row.id) as any)?.refurb_status ?? row.refurb_status ?? "",
            next: bulkStatus,
            defaultStatusValue,
            readyToBookValue,
          });

          if (!verdict.ok) {
            skipped += 1;
            skipReasons[verdict.reason] = (skipReasons[verdict.reason] ?? 0) + 1;
          } else {
            jobs.push(
              (async () => {
                try {
                  await updateRefurbItemCell(row.id, "refurb_status" as any, bulkStatus);
                  nextItems.set(row.id, {
                    ...(nextItems.get(row.id) as any),
                    refurb_status: bulkStatus,
                  });
                  changedStatusOrLocation = true;
                } catch (e) {
                  console.error("[REFURB] bulk status update failed", e);
                }
              })()
            );
          }
        }
      }

      await Promise.allSettled(jobs);
    }

    setItems(Array.from(nextItems.values()));
    if (changedStatusOrLocation) router.refresh();

    const reasons = Object.entries(skipReasons)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    window.alert(
      `Bulk update uitgevoerd op ${targets.length} rij(en).\n` +
        (skipped > 0 ? `Overgeslagen: ${skipped}\n${reasons}` : "Alles succesvol toegepast.")
    );

    setIsBulkUpdating(false);
  }

  return (
    <div className="mt-4 space-y-3">
      {/* ✅ Bulk Update (collapsible) */}
      <div className="border rounded-md bg-white text-xs">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 border-b bg-slate-50"
          onClick={() => setBulkOpen((v) => !v)}
        >
          <div className="font-medium text-[11px] uppercase tracking-wide text-slate-700">
            Bulk Update
          </div>
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
            {/* Layout: links 3 controls, rechts IMEI textarea even hoog */}
            <div className="md:flex gap-3 items-stretch">
              {/* links */}
              <div className="flex-1 flex flex-col gap-3">
                {/* Status */}
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
                      {statusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {opt.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Locatie */}
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
                          {opt.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Used parts textarea */}
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

              {/* rechts: IMEI textarea, even hoog als links */}
              <div className="flex-1 flex flex-col mt-3 md:mt-0">
                <div className="text-[11px] text-slate-500 mb-1">
                  IMEI/SN lijst (voor target “op IMEI/SN”)
                </div>
                <textarea
                  className="bb-input w-full text-[11px] p-2 flex-1 h-full min-h-[calc(110px+72px)]"
                  value={bulkImeiText}
                  onChange={(e) => setBulkImeiText(e.target.value)}
                  placeholder={"Plak hier IMEI/SN (1 per lijn of gescheiden) ..."}
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
                  <input
                    type="radio"
                    name="bulkTarget"
                    checked={bulkTarget === "imei"}
                    onChange={() => setBulkTarget("imei")}
                  />
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

      {/* Tabel */}
      <div className="border rounded-md overflow-x-auto text-xs">
        <div className="flex items-center justify-between px-2 py-1 border-b bg-slate-50">
          <span className="font-medium text-[11px] uppercase tracking-wide">
            Refurb Reception items
          </span>
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

        <table className="min-w-full border-collapse">
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

              {/* Status filter */}
              <th className="px-2 py-1 border">
                <div className="flex items-center gap-2">
                  <span>Status</span>
                  <select
                    className="bb-select bb-select-sm text-[11px]"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    title="Filter op status"
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

              {/* Location filter */}
              <th className="px-2 py-1 border">
                <div className="flex items-center gap-2">
                  <span>Location</span>
                  <select
                    className="bb-select bb-select-sm text-[11px]"
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    title="Filter op locatie"
                  >
                    <option value="__all__">Alles</option>
                    {presentLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        {locationOptionByValue.get(loc)?.label ?? loc}
                      </option>
                    ))}
                  </select>
                </div>
              </th>

              <th className="px-2 py-1 border">IMEI/SN</th>
              {showExtraSn && <th className="px-2 py-1 border">SN</th>}
              <th className="px-2 py-1 border">SKU</th>
              <th className="px-2 py-1 border">Used parts</th>
              <th className="px-2 py-1 border">Price</th>
              <th className="px-2 py-1 border">Description</th>
              <th className="px-2 py-1 border">Supplier remarks</th>
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

          <tbody>
            {hasItems &&
              filteredRows.map(({ it, originalIndex }) => {
                const currentStatus = it.refurb_status ?? "";
                const rowBooked = isBooked(currentStatus);

                const lockedPrice = isLockedAfterFill(it, "price_cents");
                const lockedDesc = isLockedAfterFill(it, "description");
                const lockedSuppErr = isLockedAfterFill(it, "supplier_device_errors");
                const lockedSuppGrad = isLockedAfterFill(it, "supplier_grading");

                const imeiSn = (it as any).imei_sn ?? "";
                const manualSn = (it as any).manual_sn ?? "";
                const locationValue = (it as any).location ?? "";
                const imeiLocked = !!imeiSn; // zoals vroeger

                const statusColor =
                  statusColorByValue.get(it.refurb_status ?? "") ?? null;

                const isFinishedRow = containsFinished(currentStatus);
                const rowChecked = selectedIds.has(it.id);

                const statusValue = it.refurb_status ?? "";
                const statusLabel =
                  statusOptionByValue.get(statusValue)?.label ?? statusValue;

                const locationLabel =
                  locationOptionByValue.get(locationValue)?.label ?? locationValue;

                return (
                  <tr key={it.id} className="border-t hover:bg-slate-50/50">
                    <td className="px-2 py-0.5 border">
                      <input
                        type="checkbox"
                        checked={rowChecked}
                        onChange={(e) => toggleSelectOne(it.id, e.target.checked)}
                        aria-label={`Selecteer rij ${it.id}`}
                      />
                    </td>

                    {/* Status (geen "kies status") */}
                    <td className="px-1 py-0.5 border">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex w-3 h-3 rounded-full border border-slate-300 shrink-0"
                          style={{ background: statusColor ?? "transparent" }}
                          title={statusLabel}
                          aria-hidden="true"
                        />
                        <select
                          value={statusValue}
                          disabled={rowBooked}
                          onChange={(e) =>
                            handleCellChange(it.id, "refurb_status", e.target.value)
                          }
                          className="bb-select bb-select-sm w-full text-slate-900"
                        >
                          {/* fallback: als huidige value niet in options zit */}
                          {statusValue && !statusOptionByValue.has(statusValue) && (
                            <option value={statusValue}>{statusLabel}</option>
                          )}

                          {statusOptions.map((opt) => {
                            const optValue = opt.value;

                            if (isFinishedRow && norm(optValue) !== norm(readyToBookValue)) {
                              return null;
                            }

                            const cannotGoBackToDefault =
                              norm(optValue) === norm(defaultStatusValue) &&
                              norm(currentStatus) !== norm(defaultStatusValue);

                            const cannotSetBooked =
                              norm(optValue) === "booked" && !isReadyToBook(currentStatus);

                            const disabled = rowBooked || cannotGoBackToDefault || cannotSetBooked;

                            return (
                              <option key={opt.value} value={opt.value} disabled={disabled}>
                                {opt.label}
                                {opt.is_default ? " (default)" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </td>

                    {/* Location (geen "kies locatie") */}
                    <td className="px-1 py-0.5 border">
                      <select
                        value={locationValue}
                        disabled={rowBooked}
                        onChange={(e) => handleCellChange(it.id, "location", e.target.value)}
                        className="bb-select bb-select-sm w-full text-slate-900"
                      >
                        {locationValue && !locationOptionByValue.has(locationValue) && (
                          <option value={locationValue}>{locationLabel}</option>
                        )}
                        {locationOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                            {opt.is_default ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* IMEI/SN + copy */}
                    <td className="px-1 py-0.5 border">
                      <div className="flex items-center gap-1">
                        {imeiLocked ? (
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
                              setItems((prev) =>
                                prev.map((row) =>
                                  row.id === it.id ? ({ ...row, imei_sn: val } as any) : row
                                )
                              );
                            }}
                            onBlur={(e) =>
                              handleCellChange(it.id, "imei_sn", e.target.value.trim())
                            }
                            onPaste={(e) => handlePasteToColumn(e, originalIndex, "imei_sn")}
                          />
                        )}
                        <CopyBtn value={imeiSn} title="Copy IMEI/SN" />
                      </div>
                    </td>

                    {/* SN */}
                    {showExtraSn && (
                      <td className="px-1 py-0.5 border">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          value={manualSn}
                          disabled={rowBooked}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((row) =>
                                row.id === it.id ? ({ ...row, manual_sn: val } as any) : row
                              )
                            );
                          }}
                          onBlur={(e) =>
                            handleCellChange(it.id, "manual_sn", e.target.value.trim())
                          }
                          onPaste={(e) => handlePasteToColumn(e, originalIndex, "manual_sn")}
                        />
                      </td>
                    )}

                    {/* SKU editable behalve booked + copy */}
                    <td className="px-1 py-0.5 border">
                      <div className="flex items-center gap-1">
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          defaultValue={it.sku ?? ""}
                          disabled={rowBooked}
                          onBlur={(e) => handleCellChange(it.id, "sku", e.target.value)}
                          onPaste={(e) => handlePasteToColumn(e, originalIndex, "sku")}
                        />
                        <CopyBtn value={(it.sku ?? "").trim()} title="Copy SKU" />
                      </div>
                    </td>

                    {/* Used parts editable behalve booked */}
                    <td className="px-1 py-0.5 border">
                      <UsedPartsCell
                        rawValue={it.used_parts ?? ""}
                        locked={rowBooked}
                        onChange={(raw) => handleCellChange(it.id, "used_parts", raw)}
                        onPasteToColumn={(e) =>
                          handlePasteToColumn(e, originalIndex, "used_parts")
                        }
                      />
                    </td>

                    {/* Price */}
                    <td className="px-1 py-0.5 border">
                      {lockedPrice ? (
                        <span>{money(it.price_cents)}</span>
                      ) : (
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full text-right"
                          defaultValue={
                            typeof it.price_cents === "number"
                              ? (it.price_cents / 100).toString()
                              : ""
                          }
                          disabled={rowBooked}
                          placeholder="0,00"
                          onBlur={(e) => handleCellChange(it.id, "price_cents", e.target.value)}
                          onPaste={(e) =>
                            handlePasteToColumn(e, originalIndex, "price_cents")
                          }
                        />
                      )}
                    </td>

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
                          onBlur={(e) =>
                            handleCellChange(it.id, "description", e.target.value)
                          }
                          onPaste={(e) =>
                            handlePasteToColumn(e, originalIndex, "description")
                          }
                        />
                      )}
                    </td>

                    {/* Supplier remarks */}
                    <td className="px-1 py-0.5 border">
                      {lockedSuppErr ? (
                        <span
                          className="block truncate max-w-[260px]"
                          title={it.supplier_device_errors ?? ""}
                        >
                          {it.supplier_device_errors}
                        </span>
                      ) : (
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          defaultValue={it.supplier_device_errors ?? ""}
                          disabled={rowBooked}
                          onBlur={(e) =>
                            handleCellChange(it.id, "supplier_device_errors", e.target.value)
                          }
                          onPaste={(e) =>
                            handlePasteToColumn(e, originalIndex, "supplier_device_errors")
                          }
                        />
                      )}
                    </td>

                    {/* Supplier Grading */}
                    <td className="px-1 py-0.5 border">
                      {lockedSuppGrad ? (
                        <span>{it.supplier_grading}</span>
                      ) : (
                        <input
                          className="bb-input h-7 text-[11px] px-1 w-full"
                          defaultValue={it.supplier_grading ?? ""}
                          disabled={rowBooked}
                          onBlur={(e) =>
                            handleCellChange(it.id, "supplier_grading", e.target.value)
                          }
                          onPaste={(e) =>
                            handlePasteToColumn(e, originalIndex, "supplier_grading")
                          }
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
                            onBlur={(e) =>
                              handleCellChange(it.id, "refurb_diagnostics", e.target.value)
                            }
                            onPaste={(e) =>
                              handlePasteToColumn(e, originalIndex, "refurb_diagnostics")
                            }
                          />
                        </td>

                        <td className="px-1 py-0.5 border">
                          <input
                            className="bb-input h-7 text-[11px] px-1 w-full"
                            defaultValue={it.rma_defect_description ?? ""}
                            disabled={rowBooked}
                            onBlur={(e) =>
                              handleCellChange(it.id, "rma_defect_description", e.target.value)
                            }
                            onPaste={(e) =>
                              handlePasteToColumn(e, originalIndex, "rma_defect_description")
                            }
                          />
                        </td>

                        <td className="px-1 py-0.5 border">
                          <input
                            className="bb-input h-7 text-[11px] px-1 w-full"
                            defaultValue={it.rma ?? ""}
                            disabled={rowBooked}
                            onBlur={(e) => handleCellChange(it.id, "rma", e.target.value)}
                            onPaste={(e) => handlePasteToColumn(e, originalIndex, "rma")}
                          />
                        </td>

                        <td className="px-1 py-0.5 border">
                          <input
                            className="bb-input h-7 text-[11px] px-1 w-full text-right"
                            defaultValue={
                              typeof it.compensation_cents === "number"
                                ? (it.compensation_cents / 100).toString()
                                : ""
                            }
                            disabled={rowBooked}
                            placeholder="0,00"
                            onBlur={(e) =>
                              handleCellChange(it.id, "compensation_cents", e.target.value)
                            }
                            onPaste={(e) =>
                              handlePasteToColumn(e, originalIndex, "compensation_cents")
                            }
                          />
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}

            {!hasItems && (
              <tr>
                <td className="px-2 py-3 border text-[11px] text-slate-500" colSpan={colSpan + 1}>
                  Nog geen toestellen in deze receptie.
                </td>
              </tr>
            )}

            {hasItems && filteredRows.length === 0 && (
              <tr>
                <td className="px-2 py-3 border text-[11px] text-slate-500" colSpan={colSpan + 1}>
                  Geen rijen voor deze filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
