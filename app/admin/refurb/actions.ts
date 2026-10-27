// app/admin/refurb/actions.ts
"use server";
import { parseReceptionBattery } from "@/lib/receptionBattery";
import { parseRmaDays, rmaExpiryDate } from '@/lib/receptionTerms';
import { requireAccess } from '@/lib/security/access';


import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";

export type VatScheme = "margin" | "normal";

export type RefurbItem = {
  battery_percentage?: number | null;
  rma_registered?: boolean;
  id: string;
  reception_id: string;
  row_index: number;
  refurb_status: string;
  sku: string | null;
  used_parts: string | null;
  price_cents: number | null;
  description: string | null;
  supplier_device_errors: string | null;
  supplier_grading: string | null;
  refurb_diagnostics: string | null;
  rma_defect_description: string | null;
  rma: string | null;
  compensation_cents: number | null;
  // nieuwe kolommen voor inline/paste
  imei_sn: string | null;
  manual_sn: string | null;
  location: string | null;
};

export type RefurbSupplier = {
  rma_expiry_days: number;
  id: string;
  name: string;
  vat_number: string | null;
  contact_email: string | null;
};

type EditableField =
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
  | "battery_percentage"
  | "manual_sn"
  | "location";

type PasteField = EditableField;

// Kolommen die NA eerste invulling niet meer wijzigbaar zijn (supplier data)
const LOCK_AFTER_FILL_FIELDS: PasteField[] = [
  "sku",
  "used_parts",
  "price_cents",
  "description",
  "supplier_device_errors",
  "supplier_grading",
];

// Kolommen die altijd overschrijfbaar zijn (interne refurb workflow)
const ALWAYS_EDITABLE_FIELDS: PasteField[] = [
  "refurb_status",
  "refurb_diagnostics",
  "rma_defect_description",
  "rma",
  "compensation_cents",
  "imei_sn",
  "battery_percentage",
  "manual_sn",
  "location",
];

function parseMoneyToCents(raw: string): number | null {
  const v = raw.replace(",", ".").trim();
  if (!v) throw new Error("Status ontbreekt.");
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function norm(s: string) {
  return (s || "").trim().toLowerCase();
}

function isBooked(status: string | null | undefined) {
  return norm(status || "") === "booked";
}

function hasValidSku(v: string | null | undefined) {
  return Boolean((v ?? "").trim().length > 0);
}

/**
 * ✅ ADMIN CHECK (SOURCE OF TRUTH = buyback_admin_users.role)
 * - Jij gaf aan: roles staan in Supabase tabel buyback_admin_users, kolom "role"
 * - admin user heeft role === "admin"
 *
 * We proberen:
 * 1) Als getCurrentAdminUser() al .role heeft -> ok (fallback)
 * 2) Anders lookup in buyback_admin_users op email (meest gangbaar)
 * 3) En ook op id indien aanwezig (fallback)
 */
async function isAdminServer(): Promise<boolean> {
  const user = await getCurrentAdminUser();
  if (!user) return false;

  // Fallback: sommige implementaties zetten role al op user
  if (String((user as any).role || "").toLowerCase() === "admin") return true;

  const email = String((user as any).email || "").trim().toLowerCase();
  const userId = String((user as any).id || (user as any).user_id || "").trim();

  // 1) lookup by email
  if (email) {
    const { data, error } = await supabaseAdmin
      .from("buyback_admin_users")
      .select("role")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[REFURB] isAdminServer lookup by email error", { email, error });
    } else if (data?.role && String(data.role).toLowerCase() === "admin") {
      return true;
    }
  }

  // 2) lookup by user id (als jouw tabel een user_id kolom heeft)
  if (userId) {
    const { data, error } = await supabaseAdmin
      .from("buyback_admin_users")
      .select("role")
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[REFURB] isAdminServer lookup by id error", { userId, error });
    } else if (data?.role && String(data.role).toLowerCase() === "admin") {
      return true;
    }
  }

  return false;
}

async function getStatusOptionFlagsByValue(
  value: string
): Promise<{ admin_only: boolean; need_sku: boolean } | null> {
  const v = (value || "").trim();
  if (!v) return null;

  const { data, error } = await supabaseAdmin
    .from("refurb_status_options")
    .select("admin_only, need_sku")
    .eq("value", v)
    .limit(1)
    .single();

  if (error || !data) throw new Error("Statusregels konden niet gecontroleerd worden.");

  return {
    admin_only: Boolean((data as any)?.admin_only),
    need_sku: Boolean((data as any)?.need_sku),
  };
}

/**
 * Resolve status "value" robust:
 * - Normal case: input is already refurb_status_options.value
 * - If input is accidentally a label (bv "New"), map label -> value
 *
 * Returns:
 * - { value, id } if found
 * - null if not found
 */
async function resolveStatusValueAndId(input: string): Promise<{ value: string; id: string } | null> {
  const raw = (input || "").trim();
  if (!raw) return null;

  // 1) Exact match on value
  const byValue = await supabaseAdmin
    .from("refurb_status_options")
    .select("id, value")
    .ilike("value", raw.replace(/[\\%_]/g, char => "\\" + char))
    .limit(1);

  if (byValue.error) {
    throw new Error("Status kon niet gecontroleerd worden.");
  } else if (byValue.data && byValue.data.length > 0) {
    const row = byValue.data[0] as any;
    return { id: String(row.id), value: String(row.value) };
  }

  // 2) Case-insensitive match on label (fallback)
  const byLabel = await supabaseAdmin
    .from("refurb_status_options")
    .select("id, value, label")
    .ilike("label", raw)
    .limit(1);

  if (byLabel.error) {
    throw new Error("Status kon niet gecontroleerd worden.");
  }

  if (byLabel.data && byLabel.data.length > 0) {
    const row = byLabel.data[0] as any;
    return { id: String(row.id), value: String(row.value) };
  }

  return null;
}

/**
 * ================================
 * STATUS TRANSITIONS (ID-based)
 * ================================
 * Tabel: refurb_status_transitions (id, from_status_id, to_status_id, created_at)
 *
 * - Zonder geconfigureerde transities worden statuswijzigingen geweigerd.
 * - Als er wél transitions bestaan: enkel expliciet toegelaten paden.
 */
async function hasAnyStatusTransitionsConfigured(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("refurb_status_transitions").select("id").limit(1);

  if (error) {
    console.error("[REFURB] hasAnyStatusTransitionsConfigured error", error);
    throw new Error("Statustransities konden niet gecontroleerd worden.");
  }

  return (data || []).length > 0;
}

async function isTransitionAllowed(currentValue: string, nextValue: string): Promise<boolean> {
  const curRaw = (currentValue || "").trim();
  const nxtRaw = (nextValue || "").trim();

  if (!curRaw || !nxtRaw) return false;
  if (curRaw === nxtRaw) return true;

  const configured = await hasAnyStatusTransitionsConfigured();
  if (!configured) return false;

  // Map current/next to option ids (via value; fallback label->value)
  const curResolved = await resolveStatusValueAndId(curRaw);
  const nxtResolved = await resolveStatusValueAndId(nxtRaw);

  // Onbekende statussen mogen de transitiecontrole niet omzeilen.
  if (!curResolved || !nxtResolved) {
    console.error("[REFURB] isTransitionAllowed could not resolve status option IDs", {
      currentValue: curRaw,
      nextValue: nxtRaw,
      curResolved,
      nxtResolved,
    });
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("refurb_status_transitions")
    .select("id")
    .eq("from_status_id", curResolved.id)
    .eq("to_status_id", nxtResolved.id)
    .limit(1);

  if (error) {
    console.error("[REFURB] isTransitionAllowed error", error);
    throw new Error("Statustransitie kon niet gecontroleerd worden.");
  }

  return (data || []).length > 0;
}

async function canChangeStatus(opts: {
  current: string | null | undefined;
  next: string;
}): Promise<{ ok: true; nextValue: string } | { ok: false; reason: string }> {
  const currentRaw = (opts.current ?? "").trim();
  const nextRaw = (opts.next ?? "").trim();

  // booked blijft immutable (harde regel)
  if (isBooked(currentRaw) && norm(nextRaw) !== norm(currentRaw)) {
    return { ok: false, reason: "Status is booked en kan niet meer gewijzigd worden." };
  }

  // Resolve next (label->value) zodat we altijd VALUE opslaan in refurb_reception_items
  const nextResolved = await resolveStatusValueAndId(nextRaw);
  if (!nextResolved) return { ok: false, reason: "Onbekende status." };
  const nextValue = nextResolved?.value ?? nextRaw;

  // Resolve current ook, want oude rows kunnen label bevatten
  const currentResolved = await resolveStatusValueAndId(currentRaw);
  const currentValue = currentResolved?.value ?? currentRaw;

  const allowed = await isTransitionAllowed(currentValue, nextValue);
  if (!allowed) {
    return {
      ok: false,
      reason: `Status "${currentRaw}" kan niet naar "${nextRaw}" gezet worden.`,
    };
  }

  return { ok: true, nextValue };
}

function isCellEmpty(item: RefurbItem, field: PasteField): boolean {
  const current = (item as any)[field];

  if (field === "price_cents" || field === "compensation_cents") {
    return current === null || current === undefined;
  }

  return current === null || current === undefined || current === "";
}

// Helper: alle items voor een receptie ophalen
async function fetchItemsForReception(receptionId: string): Promise<RefurbItem[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_reception_items")
    .select(
      `
      id,
      reception_id,
      row_index,
      refurb_status,
      sku,
      used_parts,
      price_cents,
      description,
      supplier_device_errors,
      supplier_grading,
      battery_percentage,
      refurb_diagnostics,
      rma_defect_description,
      rma,
      compensation_cents,
      rma_registered,
      imei_sn,
      manual_sn,
      location
    `
    )
    .eq("reception_id", receptionId)
    .order("row_index", { ascending: true });

  if (error) {
    console.error("[REFURB] fetchItemsForReception error", error);
    return [];
  }

  return data as RefurbItem[];
}

// ✅ Export zodat client na bulk/paste de items in 1 call kan herladen
export async function fetchReceptionItems(receptionId: string): Promise<RefurbItem[]> {
  await requireAccess('refurb', 'read', false);

  return fetchItemsForReception(receptionId);
}

/**
 * Eén cel updaten (inline edit vanuit UI).
 *
 * ✅ Statuswijziging wordt server-side gevalideerd via transitions (ID-based).
 * ✅ We slaan altijd de STATUS "value" op (niet label).
 * ✅ admin_only + need_sku rules
 *
 * 🔧 FIX: admin-check via buyback_admin_users
 */
export async function updateRefurbItemCell(
  itemId: string,
  field: EditableField,
  value: string
): Promise<void> {
  await requireAccess('refurb', 'write', false);

  const isAdmin = await isAdminServer();

  // status rules (server-side)
  if (![...LOCK_AFTER_FILL_FIELDS, ...ALWAYS_EDITABLE_FIELDS].includes(field)) {
    throw new Error("Ongeldig veld.");
  }
  const { data: current, error: currentError } = await supabaseAdmin
    .from("refurb_reception_items")
    .select("refurb_status")
    .eq("id", itemId)
    .single();
  if (currentError || !current) throw new Error("Toestel kon niet gecontroleerd worden.");
  if (isBooked(current.refurb_status)) throw new Error("Geboekte toestellen zijn vergrendeld.");
  if (field === "refurb_status") {
    const { data: row, error: e0 } = await supabaseAdmin
      .from("refurb_reception_items")
      .select("id, refurb_status, sku")
      .eq("id", itemId)
      .single();

    if (e0) {
      console.error("[REFURB] updateRefurbItemCell fetch current status error", e0);
      throw e0;
    }

    const currentRaw = (row as any)?.refurb_status ?? "";
    const currentSku = (row as any)?.sku ?? null;

    const verdict = await canChangeStatus({ current: currentRaw, next: value });

    if (!verdict.ok) {
      throw new Error(verdict.reason);
    }

    // overwrite value -> canonical status value
    value = verdict.nextValue;

    // ✅ admin_only + need_sku
    const flags = await getStatusOptionFlagsByValue(value);
    if (flags?.admin_only && !isAdmin) {
      throw new Error("Je hebt geen rechten om deze status te kiezen.");
    }
    if (flags?.need_sku && !hasValidSku(currentSku)) {
      throw new Error("SKU is verplicht om deze status te kiezen.");
    }
  }

  const patch: Partial<RefurbItem> = {};

  if (field === "price_cents" || field === "compensation_cents") {
    (patch as any)[field] = parseMoneyToCents(value);
  } else if (field === "battery_percentage") {
    patch.battery_percentage = parseReceptionBattery(value);
  } else {
    (patch as any)[field] = value || null;
  }

  const { error } = await supabaseAdmin
    .from("refurb_reception_items")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    console.error("[REFURB] updateRefurbItemCell error", {
      itemId,
      field,
      value,
      error,
    });
    throw error;
  }
}

/**
 * ✅ Bulk update
 * ✅ admin_only + need_sku rules
 *
 * 🔧 FIX: admin-check via buyback_admin_users
 */
export async function bulkUpdateRefurbItems(input: {
  receptionId: string;
  itemIds: string[];
  patch: { refurb_status?: string; location?: string; used_parts?: string };
  defaultStatusValue: string;
  readyToBookValue: string;
}): Promise<{ updated: number; skipped: number; reasons: Record<string, number> }> {
  await requireAccess('refurb', 'write', false);

  const isAdmin = await isAdminServer();

  const { receptionId, itemIds, patch } = input;

  if (!itemIds?.length) return { updated: 0, skipped: 0, reasons: {} };

  const { data, error } = await supabaseAdmin
    .from("refurb_reception_items")
    .select("id, refurb_status, sku")
    .eq("reception_id", receptionId)
    .in("id", itemIds);

  if (error) {
    console.error("[REFURB] bulkUpdateRefurbItems fetch error", error);
    throw error;
  }

  const rows = (data || []) as Array<{ id: string; refurb_status: string | null; sku: string | null }>;
  const now = new Date().toISOString();

  const reasons: Record<string, number> = {};
  let skipped = 0;
  let updated = 0;

  const notBookedIds = rows.filter((r) => !isBooked(r.refurb_status)).map((r) => r.id);

  // used_parts
  if (typeof patch.used_parts === "string") {
    if (notBookedIds.length) {
      const { error: e1 } = await supabaseAdmin
        .from("refurb_reception_items")
        .update({ used_parts: patch.used_parts || null, updated_at: now })
        .in("id", notBookedIds);

      if (e1) throw e1;
      updated += notBookedIds.length;
    } else {
      skipped += rows.length;
      reasons["Status is booked (locked)"] = (reasons["Status is booked (locked)"] ?? 0) + rows.length;
    }
  }

  // location
  if (typeof patch.location === "string") {
    if (notBookedIds.length) {
      const { error: e2 } = await supabaseAdmin
        .from("refurb_reception_items")
        .update({ location: patch.location || null, updated_at: now })
        .in("id", notBookedIds);

      if (e2) throw e2;
      updated += notBookedIds.length;
    } else if (!patch.used_parts) {
      skipped += rows.length;
      reasons["Status is booked (locked)"] = (reasons["Status is booked (locked)"] ?? 0) + rows.length;
    }
  }

  // refurb_status (per rij evalueren, dan 1 update op allowed ids)
  if (typeof patch.refurb_status === "string" && patch.refurb_status.trim()) {
    // resolve patch status to canonical value once
    const resolvedPatch = await resolveStatusValueAndId(patch.refurb_status.trim());
    const patchValue = resolvedPatch?.value ?? patch.refurb_status.trim();

    // ✅ admin_only + need_sku flags once
    const flags = await getStatusOptionFlagsByValue(patchValue);

    if (flags?.admin_only && !isAdmin) {
      skipped += rows.length;
      reasons["Je hebt geen rechten om deze status te kiezen."] =
        (reasons["Je hebt geen rechten om deze status te kiezen."] ?? 0) + rows.length;
      return { updated, skipped, reasons };
    }

    const allowed: string[] = [];

    for (const r of rows) {
      const currentRaw = r.refurb_status ?? "";

      if (isBooked(currentRaw)) {
        skipped += 1;
        reasons["Status is booked (locked)"] = (reasons["Status is booked (locked)"] ?? 0) + 1;
        continue;
      }

      if (flags?.need_sku && !hasValidSku(r.sku)) {
        skipped += 1;
        reasons["SKU is verplicht om deze status te kiezen."] =
          (reasons["SKU is verplicht om deze status te kiezen."] ?? 0) + 1;
        continue;
      }

      const verdict = await canChangeStatus({
        current: currentRaw,
        next: patchValue,
      });

      if (!verdict.ok) {
        skipped += 1;
        reasons[verdict.reason] = (reasons[verdict.reason] ?? 0) + 1;
        continue;
      }

      allowed.push(r.id);
    }

    if (allowed.length) {
      const { error: e3 } = await supabaseAdmin
        .from("refurb_reception_items")
        .update({ refurb_status: patchValue, updated_at: now })
        .in("id", allowed);

      if (e3) throw e3;
      updated += allowed.length;
    }
  }

  return { updated, skipped, reasons };
}

/**
 * Multi-line paste in één kolom (Excel-stijl).
 *
 * ✅ admin_only + need_sku rules
 *
 * 🔧 FIX: admin-check via buyback_admin_users
 */
export async function pasteIntoRefurbColumn(
  receptionId: string,
  startRowIndex: number,
  field: PasteField,
  rawLines: string[],
  defaultStatusValue?: string,
  defaultLocationValue?: string
): Promise<RefurbItem[]> {
  await requireAccess('refurb', 'write', false);

  const isAdmin = await isAdminServer();

  const lines = rawLines.map((l) => l.replace(/\r/g, ""));
  if (![...LOCK_AFTER_FILL_FIELDS, ...ALWAYS_EDITABLE_FIELDS].includes(field)) {
    throw new Error("Ongeldig veld.");
  }
  if (!Number.isInteger(startRowIndex) || startRowIndex < 0 || lines.length > 1000) {
    throw new Error("Ongeldig plakbereik (maximaal 1000 rijen).");
  }

  if (!lines.length) {
    return fetchItemsForReception(receptionId);
  }

  const existing = await fetchItemsForReception(receptionId);

  const updates: { id: string; patch: Partial<RefurbItem> }[] = [];
  const inserts: Partial<RefurbItem & { reception_id: string }>[] = [];

  const isLockAfterFill = LOCK_AFTER_FILL_FIELDS.includes(field);

  for (let i = 0; i < lines.length; i++) {
    const rowIndex = startRowIndex + i;
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();

    if (trimmed === "") continue;

    let value: any = trimmed;

    if (field === "price_cents" || field === "compensation_cents") {
      value = parseMoneyToCents(trimmed);
    }

    if (field === "battery_percentage") value = parseReceptionBattery(trimmed);

    // ✅ If pasting status, normalize to canonical value
    let pastedFlags: { admin_only: boolean; need_sku: boolean } | null = null;

    if (field === "refurb_status") {
      const resolved = await resolveStatusValueAndId(trimmed);
      const pastedStatusValue = (resolved?.value ?? trimmed).trim();
      value = pastedStatusValue;

      pastedFlags = await getStatusOptionFlagsByValue(pastedStatusValue);
      if (pastedFlags?.admin_only && !isAdmin) {
        continue;
      }
    }

    const existingItem = existing.find((it) => it.row_index === rowIndex);

    if (existingItem) {
      if (isBooked(existingItem.refurb_status)) continue;
      if (isLockAfterFill) {
        if (!isCellEmpty(existingItem, field)) continue;
      }

      if (field === "refurb_status") {
        const verdict = await canChangeStatus({
          current: existingItem.refurb_status ?? "",
          next: String(value ?? ""),
        });
        if (!verdict.ok) {
          continue;
        }
        value = verdict.nextValue;

        const flags = pastedFlags ?? (await getStatusOptionFlagsByValue(String(value ?? "")));
        if (flags?.need_sku && !hasValidSku(existingItem.sku)) {
          continue;
        }
        if (flags?.admin_only && !isAdmin) {
          continue;
        }
      }

      updates.push({
        id: existingItem.id,
        patch: { [field]: value } as Partial<RefurbItem>,
      });
    } else {
      // NEW ROW insert
      const initialStatus = await resolveStatusValueAndId(field === "refurb_status" ? String(value) : (defaultStatusValue || "new"));
      if (!initialStatus) throw new Error("Onbekende beginstatus.");
      const initialFlags = await getStatusOptionFlagsByValue(initialStatus.value);
      if (initialFlags?.admin_only && !isAdmin) throw new Error("Geen rechten voor deze beginstatus.");
      if (initialFlags?.need_sku && !(field === "sku" && hasValidSku(String(value)))) {
        throw new Error("SKU is verplicht voor deze beginstatus.");
      }
      if (field === "refurb_status") {
        const flags = pastedFlags ?? (await getStatusOptionFlagsByValue(String(value ?? "")));
        if (flags?.need_sku) continue;
        if (flags?.admin_only && !isAdmin) continue;
      }

      inserts.push({
        reception_id: receptionId,
        row_index: rowIndex,
        refurb_status: initialStatus.value,
        location: defaultLocationValue || null,
        [field]: value,
      });
    }
  }

  for (const u of updates) {
    const { error } = await supabaseAdmin
      .from("refurb_reception_items")
      .update({
        ...u.patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", u.id);

    if (error) {
      console.error("[REFURB] pasteIntoRefurbColumn update error", { u, error });
      throw error;
    }
  }

  if (inserts.length) {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("refurb_reception_items").insert(
      inserts.map((row) => ({
        ...row,
        created_at: now,
        updated_at: now,
      }))
    );

    if (error) {
      console.error("[REFURB] pasteIntoRefurbColumn insert error", {
        inserts,
        error,
      });
      throw error;
    }
  }

  return fetchItemsForReception(receptionId);
}

export type ErpSkuSearchResult = {
  sku: string;
  title: string | null;
  price_cents: number | null;
  vat_margin: boolean | null;
  inventory_qty: number | null;
};

export async function searchErpArticlesForSku(
  q: string,
  vatScheme: "margin" | "normal"
): Promise<ErpSkuSearchResult[]> {
  await requireAccess('refurb', 'read', false);

  const search = (q || "").trim();

  if (search.length < 2) return [];

  const terms = search
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const compactSearch = search
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  // gebruik eerste term voor DB prefilter
  const primaryTerm = terms[0] || "";

  let query = supabaseAdmin
    .from("erp_articles")
    .select(`
      sku,
      title,
      price_cents,
      vat_margin,
      inventory_qty
    `)
    .eq("refurbished_product", true)
    .eq("missing_from_erp", false)
    .or(`title.ilike.%${primaryTerm}%,sku.ilike.%${primaryTerm}%`)
    .limit(2000);

  // zowel actieve als inactieve artikels
  // GEEN active=true filter

  query =
    vatScheme === "margin"
      ? query.eq("vat_margin", true)
      : query.eq("vat_margin", false);

  const { data, error } = await query;

  if (error) {
    console.error("[REFURB] searchErpArticlesForSku error", error);
    return [];
  }

  const filtered = (data || []).filter((row) => {
    const sku = String(row.sku || "").toLowerCase();
    const title = String(row.title || "").toLowerCase();

    const normalizedSku = sku.replace(/[^a-z0-9]/g, "");
    const haystack = `${sku} ${title}`;

    // ALLE zoektermen moeten voorkomen
    const allTermsMatch = terms.every((term) =>
      haystack.includes(term)
    );

    // SKU-match telt enkel vanaf 4 opeenvolgende chars
    const hasStrongSkuMatch =
      compactSearch.length >= 4 &&
      normalizedSku.includes(compactSearch);

    // Titel bevat alle termen
    const hasTitleMatch = terms.every((term) =>
      title.includes(term)
    );

    return allTermsMatch && (hasTitleMatch || hasStrongSkuMatch);
  });

  // sorteer beste matches eerst
  filtered.sort((a, b) => {
    const aTitle = String(a.title || "").toLowerCase();
    const bTitle = String(b.title || "").toLowerCase();

    const aExact = terms.every((t) => aTitle.includes(t)) ? 1 : 0;
    const bExact = terms.every((t) => bTitle.includes(t)) ? 1 : 0;

    return bExact - aExact;
  });

  return filtered.slice(0, 20) as ErpSkuSearchResult[];
}



/**
 * Supplier zoeken (type-ahead) vanuit tabel refurb_suppliers.
 */
export async function searchRefurbSuppliers(query: string): Promise<RefurbSupplier[]> {
  await requireAccess('refurb', 'read', false);

  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabaseAdmin
    .from("refurb_suppliers")
    .select("id, name, vat_number, contact_email, rma_expiry_days")
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(10);

  if (error) {
    console.error("[REFURB] searchRefurbSuppliers error", error);
    throw new Error(error.message || "Zoeken naar leveranciers mislukt.");
  }

  return data as RefurbSupplier[];
}

/**
 * Supplier aanmaken – basisactie (wordt gebruikt door client componenten).
 * Enkel voor admin users.
 */
export async function createRefurbSupplier(input: {
  rma_expiry_days?: number;
  name: string;
  vat_number?: string;
  contact_email?: string;
}): Promise<RefurbSupplier> {
  await requireAccess('refurb', 'write', false);

  const isAdmin = await isAdminServer();
  const user = await getCurrentAdminUser();

  if (!user || !isAdmin) {
    console.warn("[REFURB] createRefurbSupplier forbidden for user", {
      email: (user as any)?.email,
      role: (user as any)?.role,
    });
    throw new Error("Je hebt geen rechten om leveranciers aan te maken.");
  }

  const name = input.name.trim();
  const vat_number = input.vat_number?.trim() || null;
  const contact_email = input.contact_email?.trim() || null;

  if (!name) {
    throw new Error("Naam leverancier is verplicht.");
  }

  const { data, error } = await supabaseAdmin
    .from("refurb_suppliers")
    .insert({
      name,
      vat_number,
      contact_email,
      rma_expiry_days: parseRmaDays(input.rma_expiry_days ?? 30),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, name, vat_number, contact_email, rma_expiry_days")
    .single();

  if (error) {
    console.error("[REFURB] createRefurbSupplier error", error);
    throw new Error(error.message || "Kon leverancier niet aanmaken.");
  }

  return data as RefurbSupplier;
}

/**
 * Supplier aanmaken vanuit een form action in de Leveranciers-tab.
 * Gebruikt de basisactie hierboven + revalidatePath.
 */
export async function createRefurbSupplierFromForm(formData: FormData) {
  await requireAccess('refurb', 'write', false);

  const name = (formData.get("name") || "").toString().trim();
  const vat_number = (formData.get("vat_number") || "").toString().trim();
  const contact_email = (formData.get("contact_email") || "").toString().trim();

  await createRefurbSupplier({
    rma_expiry_days: parseRmaDays(formData.get("rma_expiry_days") ?? 30),
    name,
    vat_number,
    contact_email,
  });

  revalidatePath("/admin/refurb/suppliers");
}

/** 🔴 Form state type voor nieuwe receptie */
export type CreateReceptionFormState = {
  success: boolean;
  fieldErrors: {
    reception_number?: string;
  };
  formError: string | null;
};

/**
 * Nieuwe Refurb Reception aanmaken.
 */
export async function createRefurbReception(
  _prevState: CreateReceptionFormState,
  formData: FormData
): Promise<CreateReceptionFormState> {
  await requireAccess('refurb', 'write', false);

  const reception_number = (formData.get("reception_number") || "").toString().trim();
  const reception_date = (formData.get("reception_date") || "").toString().trim();
  const supplier_id = (formData.get("supplier_id") || "").toString().trim();
  const vat_scheme_raw = (formData.get("vat_scheme") || "").toString().trim();
  const supplier_invoice_nr = (formData.get("supplier_invoice_nr") || "").toString().trim();
  const internal_invoice_nr = (formData.get("internal_invoice_nr") || "").toString().trim();
  const rma_days_input = (formData.get("rma_expiry_days") || "").toString().trim();

  const vat_scheme: VatScheme = vat_scheme_raw === "normal" ? "normal" : "margin";

  if (!reception_number || !reception_date || !supplier_id || !supplier_invoice_nr) {
    return {
      success: false,
      fieldErrors: {
        reception_number: !reception_number ? "Verplicht veld" : undefined,
      },
      formError: "Verplichte velden ontbreken.",
    };
  }

  const existing = await supabaseAdmin.from("refurb_receptions").select("id").eq("reception_number", reception_number).limit(1);

  if (existing.error) {
    console.error("[REFURB] createRefurbReception unique-check error", existing.error);
    return {
      success: false,
      fieldErrors: {},
      formError: "Kon niet controleren of het receptienummer reeds bestaat.",
    };
  }

  if (existing.data && existing.data.length > 0) {
    return {
      success: false,
      fieldErrors: {
        reception_number: "Nr bestaat reeds",
      },
      formError: null,
    };
  }

  let supplierName = "";
  const supplierRes = await supabaseAdmin.from("refurb_suppliers").select("name,rma_expiry_days").eq("id", supplier_id).limit(1).single();

  if (supplierRes.error) {
    console.warn("[REFURB] could not fetch supplier name", supplierRes.error);
  } else if (supplierRes.data?.name) {
    supplierName = supplierRes.data.name;
  }

  if(supplierRes.error||!supplierRes.data)return {success:false,fieldErrors:{},formError:'Kies een bestaande leverancier.'};
  let rma_expiry_days:number;let rma_expiry_date:string;
  try {rma_expiry_days=parseRmaDays(rma_days_input!==''?rma_days_input:(supplierRes.data.rma_expiry_days??30));rma_expiry_date=rmaExpiryDate(reception_date,rma_expiry_days);}
  catch(error){return {success:false,fieldErrors:{},formError:error instanceof Error?error.message:'Controleer de RMA-termijn en datum.'};}
  if(internal_invoice_nr.length>250)return {success:false,fieldErrors:{},formError:'Intern factuurnummer mag maximaal 250 tekens bevatten.'};
  const { data, error } = await supabaseAdmin
    .from("refurb_receptions")
    .insert({
      reception_number,
      reception_date,
      supplier_id,
      supplier: supplierName || "",
      vat_scheme,
      supplier_invoice_nr,
      internal_invoice_nr: internal_invoice_nr || null,
      rma_expiry_days,
      rma_expiry_date,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[REFURB] createRefurbReception insert error", error);
    return {
      success: false,
      fieldErrors: {},
      formError: error.message || "Kon receptie niet aanmaken.",
    };
  }

  const id = (data as any)?.id;
  if (!id) {
    return {
      success: false,
      fieldErrors: {},
      formError: "Kon receptie niet aanmaken (geen ID ontvangen).",
    };
  }

  redirect(`/admin/refurb/${id}`);
}

/**
 * ✅ 1) Verwijder één rij uit een receptie
 */
export async function deleteRefurbReceptionItem(input: {
  receptionId: string;
  itemId: string;
}): Promise<RefurbItem[]> {
  await requireAccess('refurb', 'write', true);
  const { receptionId, itemId } = input;
  const { error } = await supabaseAdmin.rpc('delete_refurb_reception_item_secure', {
    p_reception_id: receptionId,
    p_item_id: itemId,
  });
  if (error) throw new Error('Rij kon niet verwijderd worden; controleer op geboekte toestellen.');
  revalidatePath(`/admin/refurb/${receptionId}`);
  return fetchItemsForReception(receptionId);
}

/**
 * ✅ 2) Verwijder een volledige receptie
 */
export async function deleteRefurbReception(receptionId: string): Promise<void> {
  await requireAccess('refurb', 'write', false);

  const isAdmin = await isAdminServer();
  if (!isAdmin) {
    throw new Error("Je hebt geen rechten om recepties te verwijderen.");
  }

  if (!receptionId?.trim()) {
    throw new Error("Missing receptionId.");
  }

  // This server-only RPC locks the reception and items and deletes atomically.
  const { error } = await supabaseAdmin.rpc("delete_refurb_reception_secure", { p_id: receptionId });
  if (error) throw new Error("Receptie kon niet verwijderd worden; controleer op geboekte toestellen.");

  revalidatePath("/admin/refurb");
}



export async function tryUpdateRefurbItemCell(itemId: string, field: EditableField, value: string): Promise<{ error?: string }> {
  await requireAccess('refurb', 'write', false);
  try { await updateRefurbItemCell(itemId, field, value); return {}; }
  catch (error) {
    const message=error instanceof Error?error.message:'';
    if (message.includes('RMA_COMPENSATION_REQUIRED')) return {error:'Vul eerst een compensatiebedrag in voordat dit artikel aan RMA Supplier wordt gekoppeld.'};
    if (message.includes('RMA_REFUNDED')) return {error:'Een refunded artikel kan niet opnieuw als RMA worden gemeld.'};
    if (message.includes('vergrendeld')) return {error:'Dit artikel is geboekt. Gebruik Nieuw RMA melden (ook na afwerking) in het RMA-overzicht.'};
    if (message.startsWith('Status "') || message.includes('SKU is verplicht') || message.includes('rechten om deze status')) return {error:message};
    return {error:'De wijziging is niet opgeslagen. Controleer de toegelaten statustransitie en probeer opnieuw.'};
  }
}
