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
  | "compensation_cents";

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
];

function parseMoneyToCents(raw: string): number | null {
  const v = raw.replace(",", ".").trim();
  if (!v) return null;
  const n = Number.parseFloat(v);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
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
      "id, reception_id, row_index, refurb_status, sku, used_parts, price_cents, description, supplier_device_errors, supplier_grading, refurb_diagnostics, rma_defect_description, rma, compensation_cents"
    )
    .eq("reception_id", receptionId)
    .order("row_index", { ascending: true });

  if (error) {
    console.error("[REFURB] fetchItemsForReception error", error);
    return [];
  }

  return data as RefurbItem[];
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
 * Multi-line paste in één kolom (Excel-stijl).
 *
 * - Voor LOCK_AFTER_FILL_FIELDS: alleen invullen als cel nog leeg is.
 * - Voor ALWAYS_EDITABLE_FIELDS: bestaande waarde mag overschreven worden.
 *
 * Bestaat de rij nog niet? -> nieuwe rij aanmaken met opgegeven waarde.
 */
export async function pasteIntoRefurbColumn(
  receptionId: string,
  startRowIndex: number,
  field: PasteField,
  rawLines: string[]
): Promise<RefurbItem[]> {
  const lines = rawLines
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length) {
    return fetchItemsForReception(receptionId);
  }

  const existing = await fetchItemsForReception(receptionId);

  const updates: { id: string; patch: Partial<RefurbItem> }[] = [];
  const inserts: Partial<RefurbItem & { reception_id: string }>[] = [];

  const isLockAfterFill = LOCK_AFTER_FILL_FIELDS.includes(field);

  for (let i = 0; i < lines.length; i++) {
    const rowIndex = startRowIndex + i;
    const line = lines[i];

    let value: any = line;
    if (field === "price_cents" || field === "compensation_cents") {
      value = parseMoneyToCents(line);
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
      // Interne kolom of lege supplier-kolom: gewoon updaten
      updates.push({
        id: existingItem.id,
        patch: {
          [field]: value,
        } as Partial<RefurbItem>,
      });
    } else {
      // Nieuwe rij
      inserts.push({
        reception_id: receptionId,
        row_index: rowIndex,
        refurb_status: "new",
        [field]: value,
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
    const { error } = await supabaseAdmin
      .from("refurb_reception_items")
      .insert(
        inserts.map((row) => ({
          ...row,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
  const contact_email = (formData.get("contact_email") || "").toString().trim();

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
 * - Checkt of receptienummer al bestaat.
 * - Bij duplicate: veldfout op "Receptie nr" met "Nr bestaat reeds".
 * - Bij succes: redirect naar detailpagina.
 *
 * ⚠️ Signature: (prevState, formData) voor useFormState.
 */
export async function createRefurbReception(
  _prevState: CreateReceptionFormState,
  formData: FormData
): Promise<CreateReceptionFormState> {
  const reception_number = (formData.get("reception_number") || "").toString().trim();
  const reception_date = (formData.get("reception_date") || "").toString().trim();
  const supplier_id = (formData.get("supplier_id") || "").toString().trim();
  const vat_scheme_raw = (formData.get("vat_scheme") || "").toString().trim();
  const supplier_invoice_nr = (formData.get("supplier_invoice_nr") || "").toString().trim();
  const internal_invoice_nr = (formData.get("internal_invoice_nr") || "").toString().trim();

  const vat_scheme: VatScheme =
    vat_scheme_raw === "normal" ? "normal" : "margin"; // default margin

  // Basis-check verplichte velden
  if (!reception_number || !reception_date || !supplier_id || !supplier_invoice_nr) {
    return {
      success: false,
      fieldErrors: {
        reception_number: !reception_number ? "Verplicht veld" : undefined,
      },
      formError: "Verplichte velden ontbreken.",
    };
  }

  // 🔍 1) Unieke check op receptienummer
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
    // → Nr bestaat reeds → veldfout op receptie nr
    return {
      success: false,
      fieldErrors: {
        reception_number: "Nr bestaat reeds",
      },
      formError: null,
    };
  }

  // 🔎 2) Leveranciersnaam ophalen voor oude 'supplier' kolom (NOT NULL)
  let supplierName = "";
  const supplierRes = await supabaseAdmin
    .from("refurb_suppliers")
    .select("name")
    .eq("id", supplier_id)
    .limit(1)
    .single();

  if (supplierRes.error) {
    console.warn("[REFURB] could not fetch supplier name", supplierRes.error);
    // we laten supplierName gewoon leeg, maar NIET null
  } else if (supplierRes.data?.name) {
    supplierName = supplierRes.data.name;
  }

  // 🔵 3) Insert uitvoeren (zowel supplier_id als supplier invullen)
  const { data, error } = await supabaseAdmin
    .from("refurb_receptions")
    .insert({
      reception_number,
      reception_date,
      supplier_id,
      supplier: supplierName || "", // ← belangrijk: geen NULL
      vat_scheme,
      supplier_invoice_nr,
      internal_invoice_nr: internal_invoice_nr || null,
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

  // Succes → redirect naar detailpagina
  redirect(`/admin/refurb/${id}`);
}
