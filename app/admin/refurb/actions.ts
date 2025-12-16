// app/admin/refurb/actions.ts
"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";

export type VatScheme = "margin" | "normal";

export type RefurbItem = {
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
  "manual_sn",
  "location",
];

function parseMoneyToCents(raw: string): number | null {
  const v = raw.replace(",", ".").trim();
  if (!v) return null;
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
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
      refurb_diagnostics,
      rma_defect_description,
      rma,
      compensation_cents,
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
  return fetchItemsForReception(receptionId);
}

/**
 * Probeer (optioneel) een default location te bepalen op de server,
 * als defaultLocationValue niet werd meegegeven.
 * (Best-effort: als tabel/kolommen niet bestaan -> fallback null)
 */
async function resolveDefaultLocationValue(
  defaultLocationValue?: string
): Promise<string | null> {
  const direct = (defaultLocationValue || "").trim();
  if (direct) return direct;

  try {
    // best effort: vermoedelijke settings tabel
    const { data, error } = await supabaseAdmin
      .from("refurb_location_options")
      .select("value, is_default, default, isDefault")
      .order("sort_order", { ascending: true })
      .limit(50);

    if (error) return null;

    const list = (data || []) as any[];
    const flagged =
      list.find((l) => l?.is_default === true) ||
      list.find((l) => l?.default === true) ||
      list.find((l) => l?.isDefault === true) ||
      null;

    const v = (flagged?.value ?? list[0]?.value ?? "").toString().trim();
    return v || null;
  } catch {
    return null;
  }
}

/**
 * Eén cel updaten (inline edit vanuit UI).
 * UI zorgt ervoor dat "locked" kolommen geen input tonen als ze al gevuld zijn.
 */
export async function updateRefurbItemCell(
  itemId: string,
  field: EditableField,
  value: string
): Promise<void> {
  const patch: Partial<RefurbItem> = {};

  if (field === "price_cents" || field === "compensation_cents") {
    (patch as any)[field] = parseMoneyToCents(value);
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
 * ✅ Bulk update (snel: 1–3 DB updates)
 * - location / used_parts: in één update op alle niet-booked rows
 * - refurb_status: alleen op rows waar statusregels het toelaten (ook in 1 update)
 */
export async function bulkUpdateRefurbItems(input: {
  receptionId: string;
  itemIds: string[];
  patch: { refurb_status?: string; location?: string; used_parts?: string };
  defaultStatusValue: string;
  readyToBookValue: string;
}): Promise<{ updated: number; skipped: number; reasons: Record<string, number> }> {
  const { receptionId, itemIds, patch, defaultStatusValue, readyToBookValue } = input;

  if (!itemIds?.length) return { updated: 0, skipped: 0, reasons: {} };

  const { data, error } = await supabaseAdmin
    .from("refurb_reception_items")
    .select("id, refurb_status")
    .eq("reception_id", receptionId)
    .in("id", itemIds);

  if (error) {
    console.error("[REFURB] bulkUpdateRefurbItems fetch error", error);
    throw error;
  }

  const rows = (data || []) as Array<{ id: string; refurb_status: string | null }>;
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
      reasons["Status is booked (locked)"] =
        (reasons["Status is booked (locked)"] ?? 0) + rows.length;
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
      reasons["Status is booked (locked)"] =
        (reasons["Status is booked (locked)"] ?? 0) + rows.length;
    }
  }

  // refurb_status (per rij evalueren, dan 1 update op allowed ids)
  if (typeof patch.refurb_status === "string" && patch.refurb_status.trim()) {
    const allowed: string[] = [];
    for (const r of rows) {
      const current = r.refurb_status ?? "";
      if (isBooked(current)) {
        skipped += 1;
        reasons["Status is booked (locked)"] =
          (reasons["Status is booked (locked)"] ?? 0) + 1;
        continue;
      }

      const verdict = canChangeStatus({
        current,
        next: patch.refurb_status,
        defaultStatusValue,
        readyToBookValue,
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
        .update({ refurb_status: patch.refurb_status, updated_at: now })
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
 * - Voor LOCK_AFTER_FILL_FIELDS: alleen invullen als cel nog leeg is.
 * - Voor ALWAYS_EDITABLE_FIELDS: bestaande waarde mag overschreven worden.
 *
 * Bestaat de rij nog niet? -> nieuwe rij aanmaken met opgegeven waarde.
 *
 * ✅ Nieuwe rij krijgt refurb_status = defaultStatusValue (geen "new" tenzij caller niets meegeeft)
 * ✅ Nieuwe rij krijgt location = defaultLocationValue (of server best-effort default)
 */
export async function pasteIntoRefurbColumn(
  receptionId: string,
  startRowIndex: number,
  field: PasteField,
  rawLines: string[],
  defaultStatusValue?: string,
  defaultLocationValue?: string
): Promise<RefurbItem[]> {
  // we strippen enkel carriage returns, maar bewaren lege lijnen
  const lines = rawLines.map((l) => l.replace(/\r/g, ""));

  if (!lines.length) {
    return fetchItemsForReception(receptionId);
  }

  const existing = await fetchItemsForReception(receptionId);

  const updates: { id: string; patch: Partial<RefurbItem> }[] = [];
  const inserts: Partial<RefurbItem & { reception_id: string }>[] = [];

  const isLockAfterFill = LOCK_AFTER_FILL_FIELDS.includes(field);

  const resolvedDefaultLoc = await resolveDefaultLocationValue(defaultLocationValue);
  const resolvedDefaultStatus = (defaultStatusValue || "").trim() || "new";

  for (let i = 0; i < lines.length; i++) {
    const rowIndex = startRowIndex + i;
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();

    // lege broncel: rowIndex schuift wél door, maar we doen niets op die rij
    if (trimmed === "") {
      continue;
    }

    let value: any = trimmed;
    if (field === "price_cents" || field === "compensation_cents") {
      value = parseMoneyToCents(trimmed);
    }

    const existingItem = existing.find((it) => it.row_index === rowIndex);

    if (existingItem) {
      // Bestaande rij
      if (isLockAfterFill) {
        // Supplier-kolom: alleen invullen als nog leeg
        if (!isCellEmpty(existingItem, field)) {
          continue; // skip, niet overschrijven
        }
      }

      updates.push({
        id: existingItem.id,
        patch: { [field]: value } as Partial<RefurbItem>,
      });
    } else {
      // Nieuwe rij
      // ✅ location altijd zetten op default (behalve als je effectief de location-kolom aan het plakken bent)
      const base: any = {
        reception_id: receptionId,
        row_index: rowIndex,
        refurb_status: resolvedDefaultStatus,
        location: field === "location" ? null : resolvedDefaultLoc,
      };

      inserts.push({
        ...base,
        [field]: value,
        // als je location-kolom plakt, zetten we location expliciet op de geplakte value
        ...(field === "location" ? { location: value } : {}),
      });
    }
  }

  // Updates
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

  // Inserts in batch
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

  // Alles opnieuw ophalen zodat client state klopt
  return fetchItemsForReception(receptionId);
}

/**
 * ✅ 1) Verwijder één rij uit een receptie (refurb_reception_items)
 * - Admin only
 * - Booked rijen worden niet verwijderd
 * - Re-index row_index zodat alles mooi aansluit
 * - Return: fresh items
 */
export async function deleteRefurbReceptionItem(input: {
  receptionId: string;
  itemId: string;
}): Promise<RefurbItem[]> {
  const user = await getCurrentAdminUser();
  if (!user || user.role !== "admin") {
    throw new Error("Je hebt geen rechten om rijen te verwijderen.");
  }

  const { receptionId, itemId } = input;

  const { data: row, error: e0 } = await supabaseAdmin
    .from("refurb_reception_items")
    .select("id, reception_id, row_index, refurb_status")
    .eq("id", itemId)
    .eq("reception_id", receptionId)
    .single();

  if (e0) {
    console.error("[REFURB] deleteRefurbReceptionItem fetch error", e0);
    throw new Error(e0.message || "Kon rij niet ophalen.");
  }

  if (isBooked((row as any).refurb_status)) {
    throw new Error("Status is booked: deze rij kan niet verwijderd worden.");
  }

  const deletedIndex = Number((row as any).row_index);

  const { error: e1 } = await supabaseAdmin
    .from("refurb_reception_items")
    .delete()
    .eq("id", itemId)
    .eq("reception_id", receptionId);

  if (e1) {
    console.error("[REFURB] deleteRefurbReceptionItem delete error", e1);
    throw new Error(e1.message || "Kon rij niet verwijderen.");
  }

  // re-index: alle rijen met row_index > deletedIndex 1 naar boven schuiven
  const { data: tail, error: e2 } = await supabaseAdmin
    .from("refurb_reception_items")
    .select("id, row_index")
    .eq("reception_id", receptionId)
    .gt("row_index", deletedIndex)
    .order("row_index", { ascending: true });

  if (e2) {
    console.error("[REFURB] deleteRefurbReceptionItem tail fetch error", e2);
    throw new Error(e2.message || "Kon rijen niet hernummeren.");
  }

  const now = new Date().toISOString();
  for (const r of (tail || []) as any[]) {
    const newIndex = Number(r.row_index) - 1;
    const { error: e3 } = await supabaseAdmin
      .from("refurb_reception_items")
      .update({ row_index: newIndex, updated_at: now })
      .eq("id", r.id)
      .eq("reception_id", receptionId);

    if (e3) {
      console.error("[REFURB] deleteRefurbReceptionItem reindex error", { r, e3 });
      throw new Error(e3.message || "Kon rijen niet hernummeren.");
    }
  }

  revalidatePath(`/admin/refurb/${receptionId}`);
  return fetchItemsForReception(receptionId);
}

/**
 * ✅ 2) Verwijder een volledige receptie
 * - Admin only
 * - Verwijdert eerst items, dan receptie
 * - Revalidate + redirect naar /admin/refurb
 */
export async function deleteRefurbReception(receptionId: string): Promise<void> {
  const user = await getCurrentAdminUser();
  if (!user || user.role !== "admin") {
    throw new Error("Je hebt geen rechten om recepties te verwijderen.");
  }

  // (optioneel) blokkeer als er booked items zijn
  const { data: bookedRows, error: e0 } = await supabaseAdmin
    .from("refurb_reception_items")
    .select("id, refurb_status")
    .eq("reception_id", receptionId);

  if (e0) {
    console.error("[REFURB] deleteRefurbReception precheck error", e0);
    throw new Error(e0.message || "Kon receptie-items niet controleren.");
  }

  const hasBooked = (bookedRows || []).some((r: any) => isBooked(r.refurb_status));
  if (hasBooked) {
    throw new Error("Deze receptie bevat booked items en kan niet verwijderd worden.");
  }

  const { error: e1 } = await supabaseAdmin
    .from("refurb_reception_items")
    .delete()
    .eq("reception_id", receptionId);

  if (e1) {
    console.error("[REFURB] deleteRefurbReception delete items error", e1);
    throw new Error(e1.message || "Kon receptie-items niet verwijderen.");
  }

  const { error: e2 } = await supabaseAdmin
    .from("refurb_receptions")
    .delete()
    .eq("id", receptionId);

  if (e2) {
    console.error("[REFURB] deleteRefurbReception delete reception error", e2);
    throw new Error(e2.message || "Kon receptie niet verwijderen.");
  }

  revalidatePath("/admin/refurb");
  redirect("/admin/refurb");
}

/**
 * Supplier zoeken (type-ahead) vanuit tabel refurb_suppliers.
 */
export async function searchRefurbSuppliers(query: string): Promise<RefurbSupplier[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabaseAdmin
    .from("refurb_suppliers")
    .select("id, name, vat_number, contact_email")
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
  name: string;
  vat_number?: string;
  contact_email?: string;
}): Promise<RefurbSupplier> {
  const user = await getCurrentAdminUser();
  if (!user || user.role !== "admin") {
    console.warn("[REFURB] createRefurbSupplier forbidden for user", {
      email: user?.email,
      role: user?.role,
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, name, vat_number, contact_email")
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
  const name = (formData.get("name") || "").toString().trim();
  const vat_number = (formData.get("vat_number") || "").toString().trim();
  const contact_email = (formData.get("contact_email") || "")
    .toString()
    .trim();

  await createRefurbSupplier({
    name,
    vat_number,
    contact_email,
  });

  // lijst opnieuw inladen op de leverancierspagina
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
  const reception_number = (formData.get("reception_number") || "").toString().trim();
  const reception_date = (formData.get("reception_date") || "").toString().trim();
  const supplier_id = (formData.get("supplier_id") || "").toString().trim();
  const vat_scheme_raw = (formData.get("vat_scheme") || "").toString().trim();
  const supplier_invoice_nr = (formData.get("supplier_invoice_nr") || "")
    .toString()
    .trim();
  const internal_invoice_nr = (formData.get("internal_invoice_nr") || "")
    .toString()
    .trim();
  const rma_expiry_date = (formData.get("rma_expiry_date") || "")
    .toString()
    .trim();

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

  const existing = await supabaseAdmin
    .from("refurb_receptions")
    .select("id")
    .eq("reception_number", reception_number)
    .limit(1);

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
  const supplierRes = await supabaseAdmin
    .from("refurb_suppliers")
    .select("name")
    .eq("id", supplier_id)
    .limit(1)
    .single();

  if (supplierRes.error) {
    console.warn("[REFURB] could not fetch supplier name", supplierRes.error);
  } else if (supplierRes.data?.name) {
    supplierName = supplierRes.data.name;
  }

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
      rma_expiry_date: rma_expiry_date || null,
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
