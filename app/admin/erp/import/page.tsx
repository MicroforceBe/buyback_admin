// app/admin/erp/import/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminUser } from "@/lib/requireAdminUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ImportResult = {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
};

function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ";" && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function getValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return null;
}

function parseCapacity(value: string | null) {
  if (!value) return null;

  const match = value.match(/\d+/);
  if (!match) return null;

  return Number(match[0]);
}

async function importErpArticlesAction(formData: FormData) {
  "use server";

  const csv = String(formData.get("csv") || "").trim();

  if (!csv) {
    redirect("/admin/erp/import?msg=missing_csv");
  }

  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    redirect("/admin/erp/import?msg=not_enough_rows");
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);

  let total = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const line of lines.slice(1)) {
    total++;

    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    const sku = getValue(row, ["sku", "artikelnummer", "article_number", "item_no", "item_number"]);
    const title = getValue(row, ["title", "titel", "omschrijving", "description", "artikelomschrijving"]);

    if (!sku || !title) {
      skipped++;
      continue;
    }

    const payload = {
      sku,
      ean: getValue(row, ["ean", "barcode", "gtin"]),
      title,
      description: getValue(row, ["description", "omschrijving", "artikelomschrijving"]),
      brand: getValue(row, ["brand", "merk"]),
      model: getValue(row, ["model", "type"]),
      capacity_gb: parseCapacity(getValue(row, ["capacity_gb", "capaciteit", "capacity", "gb"])),
      color: getValue(row, ["color", "kleur"]),
      category: getValue(row, ["category", "categorie", "groep"]),
      condition_grade: getValue(row, ["condition_grade", "grade", "conditie"]),
      active: true,
      erp_id: getValue(row, ["erp_id", "id"]),
      external_reference: getValue(row, ["external_reference", "external_ref", "referentie"]),
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabaseAdmin
      .from("erp_articles")
      .select("id")
      .eq("sku", sku)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("erp_articles")
        .update(payload)
        .eq("id", existing.id);

      if (error) {
        console.error("[ERP IMPORT] update error", error);
        skipped++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabaseAdmin
        .from("erp_articles")
        .insert(payload);

      if (error) {
        console.error("[ERP IMPORT] insert error", error);
        skipped++;
      } else {
        inserted++;
      }
    }
  }

  revalidatePath("/admin/erp/articles");
  revalidatePath("/admin/erp/import");

  const result: ImportResult = {
    total,
    inserted,
    updated,
    skipped,
  };

  redirect(
    `/admin/erp/import?msg=imported&total=${result.total}&inserted=${result.inserted}&updated=${result.updated}&skipped=${result.skipped}`
  );
}

export default async function ErpImportPage({
  searchParams,
}: {
  searchParams?: {
    msg?: string;
    total?: string;
    inserted?: string;
    updated?: string;
    skipped?: string;
  };
}) {
  await requireAdminUser();
  const msg = String(searchParams?.msg || "");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ERP
          </div>

          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            ERP artikelen importeren
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Plak hier een CSV export uit de ERP software. Bestaande SKU’s worden
            bijgewerkt, nieuwe SKU’s worden toegevoegd.
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/admin/erp/articles" className="bb-btn text-sm">
            Artikelen
          </Link>

          <Link href="/admin/erp" className="bb-btn text-sm">
            ERP home
          </Link>
        </div>
      </div>

      {msg === "imported" && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Import voltooid. Totaal: {searchParams?.total || 0} · Nieuw:{" "}
          {searchParams?.inserted || 0} · Bijgewerkt:{" "}
          {searchParams?.updated || 0} · Overgeslagen:{" "}
          {searchParams?.skipped || 0}
        </div>
      )}

      {msg && msg !== "imported" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Fout: {msg}
        </div>
      )}

      <form
        action={importErpArticlesAction}
        className="rounded-xl border bg-white p-5 shadow-sm space-y-4"
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            CSV data
          </label>

          <textarea
            name="csv"
            rows={18}
            className="w-full rounded-md border px-3 py-2 font-mono text-xs"
            placeholder={`sku;titel;ean;merk;model;capaciteit;kleur;grade
211000041130;iPhone 16e 128GB Black;1234567890123;Apple;iPhone 16e;128;Black;A`}
            required
          />
        </div>

        <div className="rounded-md border bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Ondersteunde kolommen: <b>sku</b>, <b>titel</b>, <b>ean</b>,{" "}
          <b>merk</b>, <b>model</b>, <b>capaciteit</b>, <b>kleur</b>,{" "}
          <b>categorie</b>, <b>grade</b>.
        </div>

        <div className="flex justify-end">
          <button type="submit" className="bb-btn bb-btn-primary text-sm">
            Importeren
          </button>
        </div>
      </form>
    </div>
  );
}
