// app/admin/erp/sync/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Writable } from "stream";
import { Client } from "basic-ftp";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type ErpSettings = {
  ftp_host: string | null;
  ftp_port: number | null;
  ftp_secure: boolean | null;
  ftp_user: string | null;
  ftp_password: string | null;
  ftp_directory: string | null;
  ftp_filename: string | null;
};

async function getSettings(): Promise<ErpSettings | null> {
  const { data, error } = await supabaseAdmin
    .from("erp_settings")
    .select("*")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ERP SYNC] settings error", error);
    return null;
  }

  return data as ErpSettings | null;
}

function toCents(value: any) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(String(value).replace(",", "."));

  if (Number.isNaN(n)) {
    return null;
  }

  return Math.round(n * 100);
}

function toInt(value: any) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(String(value).replace(",", "."));

  if (Number.isNaN(n)) {
    return null;
  }

  return Math.round(n);
}

function toBool(value: any) {
  const v = String(value ?? "").trim().toLowerCase();

  return [
    "true",
    "yes",
    "ja",
    "1",
    "active",
    "published",
  ].includes(v);
}

async function downloadFtpFile(
  settings: ErpSettings
): Promise<Buffer> {
  const client = new Client();

  try {
    await client.access({
      host: settings.ftp_host || "",
      port: settings.ftp_port || 21,
      user: settings.ftp_user || "",
      password: settings.ftp_password || "",
      secure: !!settings.ftp_secure,
    });

    if (settings.ftp_directory) {
      await client.cd(settings.ftp_directory);
    }

    const chunks: Buffer[] = [];

    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });

    await client.downloadTo(
      writable,
      settings.ftp_filename || ""
    );

    return Buffer.concat(chunks);
  } finally {
    client.close();
  }
}

async function syncErpArticlesAction() {
  "use server";

  const settings = await getSettings();

  if (
    !settings?.ftp_host ||
    !settings?.ftp_user ||
    !settings?.ftp_password ||
    !settings?.ftp_filename
  ) {
    redirect("/admin/erp/sync?msg=missing_ftp_settings");
  }

  let processed = 0;
  let skipped = 0;
  let errorMessage: string | null = null;

  try {
    const fileBuffer = await downloadFtpFile(settings);

    const workbook = XLSX.read(fileBuffer, {
      type: "buffer",
    });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<
      Record<string, any>
    >(sheet, {
      defval: "",
    });

    const payloads: any[] = [];

    for (const row of rows) {
      const sku = String(
        row["Variant SKU [ID]"] || ""
      ).trim();

      const title = String(
        row["Title"] || ""
      ).trim();

      if (!sku || !title) {
        skipped++;
        continue;
      }

      payloads.push({
        sku,
        title,

        category:
          String(row["Type"] || "").trim() || null,

        active:
          String(row["Status"] || "")
            .trim()
            .toLowerCase() === "active",

        price_cents: toCents(
          row["Variant Price"]
        ),

        compare_price_cents: toCents(
          row["Variant Compare At Price"]
        ),

        inventory_qty: toInt(
          row["Variant Inventory Qty"]
        ),

        inventory_tracker:
          String(
            row["Variant Inventory Tracker"] || ""
          ).trim() || null,

        taxable: toBool(
          row["Variant Taxable"]
        ),

        vat_margin: toBool(
          row["Metafield: custom.vat_margin"]
        ),

        refurbished_product: toBool(
          row["Metafield: custom.refurbished_product"]
        ),

        stock_gentbrugge: toInt(
          row[
            "Inventory Available: Microforce Gentbrugge"
          ]
        ),

        stock_oudenaarde: toInt(
          row[
            "Inventory Available: Microforce Oudenaarde"
          ]
        ),

        stock_antwerpen: toInt(
          row[
            "Inventory Available: Microforce Antwerpen"
          ]
        ),

        published: toBool(
          row["Published"]
        ),

        published_scope:
          String(
            row["Published Scope"] || ""
          ).trim() || null,

        requires_shipping: toBool(
          row["Variant Requires Shipping"]
        ),

        gift_card: toBool(
          row["Gift Card"]
        ),

        raw_erp_row: row,

        updated_at: new Date().toISOString(),
      });
    }

    const chunkSize = 500;

    for (
      let i = 0;
      i < payloads.length;
      i += chunkSize
    ) {
      const chunk = payloads.slice(
        i,
        i + chunkSize
      );

      const { error } = await supabaseAdmin
        .from("erp_articles")
        .upsert(chunk, {
          onConflict: "sku",
        });

      if (error) {
        console.error(
          "[ERP SYNC] bulk upsert error",
          error
        );

        errorMessage = error.message;
        break;
      }

      processed += chunk.length;
    }

    revalidatePath("/admin/erp/articles");
    revalidatePath("/admin/erp/sync");
  } catch (e: any) {
    console.error("[ERP SYNC] error", e);

    errorMessage =
      e?.message || "sync_failed";
  }

  if (errorMessage) {
    redirect(
      `/admin/erp/sync?msg=${encodeURIComponent(
        errorMessage
      )}`
    );
  }

  redirect(
    `/admin/erp/sync?msg=synced&inserted=${processed}&updated=bulk&skipped=${skipped}`
  );
}

export default async function ErpSyncPage({
  searchParams,
}: {
  searchParams?: {
    msg?: string;
    inserted?: string;
    updated?: string;
    skipped?: string;
  };
}) {
  const settings = await getSettings();

  const msg = String(searchParams?.msg || "");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ERP
          </div>

          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            ERP XLSX synchronisatie
          </h1>

          <p className="mt-2 text-sm text-slate-500 max-w-3xl">
            Download het XLSX artikelbestand via FTP
            en synchroniseer de SKU database.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/erp/settings"
            className="bb-btn text-sm"
          >
            FTP settings
          </Link>

          <Link
            href="/admin/erp/articles"
            className="bb-btn text-sm"
          >
            Artikelen
          </Link>
        </div>
      </div>

      {msg === "synced" && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Sync voltooid. Verwerkt:{" "}
          {searchParams?.inserted || 0} ·
          Updated: {searchParams?.updated || 0} ·
          Overgeslagen:{" "}
          {searchParams?.skipped || 0}
        </div>
      )}

      {msg && msg !== "synced" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Fout: {msg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            FTP host
          </div>

          <div className="mt-2 text-sm font-medium break-all">
            {settings?.ftp_host || "—"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Bestand
          </div>

          <div className="mt-2 text-sm font-medium break-all">
            {settings?.ftp_filename || "—"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Directory
          </div>

          <div className="mt-2 text-sm font-medium break-all">
            {settings?.ftp_directory || "/"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Type
          </div>

          <div className="mt-2 text-sm font-medium">
            XLSX
          </div>
        </div>
      </div>

      <form
        action={syncErpArticlesAction}
        className="rounded-xl border bg-white p-5 shadow-sm"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900">
              Artikelbestand synchroniseren
            </div>

            <p className="mt-1 text-sm text-slate-500">
              SKU matching gebeurt op{" "}
              <b>Variant SKU [ID]</b>.
              Bestaande artikelen worden automatisch
              bijgewerkt.
            </p>
          </div>

          <button
            type="submit"
            className="bb-btn bb-btn-primary text-sm"
          >
            Start sync
          </button>
        </div>
      </form>
    </div>
  );
}
