// app/admin/erp/sync/page.tsx

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as XLSX from "xlsx";
import ftp from "basic-ftp";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import SyncButton from "./SyncButton";

export const dynamic = "force-dynamic";

type ErpSettingsRow = {
  ftp_host: string | null;
  ftp_port: number | null;
  ftp_user: string | null;
  ftp_password: string | null;
  ftp_directory: string | null;
  ftp_filename: string | null;
  ftp_secure: boolean | null;
};

async function syncErpAction() {
  "use server";

  try {
    const { data: settings } = await supabaseAdmin
      .from("erp_settings")
      .select("*")
      .limit(1)
      .maybeSingle<ErpSettingsRow>();

    if (!settings) {
      throw new Error("ERP settings niet gevonden.");
    }

    if (
      !settings.ftp_host ||
      !settings.ftp_user ||
      !settings.ftp_password ||
      !settings.ftp_filename
    ) {
      throw new Error(
        "FTP instellingen zijn onvolledig."
      );
    }

    const client = new ftp.Client(30000);

    client.ftp.verbose = false;

    await client.access({
      host: settings.ftp_host.replace(
        "ftp://",
        ""
      ),
      port: settings.ftp_port || 21,
      user: settings.ftp_user,
      password: settings.ftp_password,
      secure: settings.ftp_secure || false,
    });

    const chunks: Buffer[] = [];

    const remotePath = `${settings.ftp_directory || ""}/${settings.ftp_filename}`.replace(
      /^\/+/,
      ""
    );

    await client.downloadTo(
      {
        write(chunk: Buffer) {
          chunks.push(Buffer.from(chunk));
        },

        end() {},

        on() {
          return this;
        },
      } as any,
      remotePath
    );

    await client.close();

    const buffer = Buffer.concat(chunks);

    const workbook = XLSX.read(buffer, {
      type: "buffer",
    });

    const sheetName =
      workbook.SheetNames[0];

    const sheet =
      workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<any>(
      sheet,
      {
        defval: "",
      }
    );

    let imported = 0;

    for (const row of rows) {
      const title = String(
        row["Title"] || ""
      ).trim();

      const sku = String(
        row["Variant SKU [ID]"] || ""
      ).trim();

      if (!sku) continue;

      const price =
        Number(
          String(
            row["Variant Price"] || "0"
          ).replace(",", ".")
        ) || 0;

      const comparePrice =
        Number(
          String(
            row["Variant Compare At Price"] ||
              "0"
          ).replace(",", ".")
        ) || 0;

      const inventoryQty =
        Number(
          row["Variant Inventory Qty"] || 0
        ) || 0;

      const active =
        String(row["Status"] || "")
          .toLowerCase()
          .trim() === "active";

      const published =
        String(row["Published"] || "")
          .toLowerCase()
          .trim() === "true";

      const vatMargin =
        String(
          row[
            "Metafield: custom.vat_margin"
          ] || ""
        )
          .toLowerCase()
          .trim() === "true";

      const refurbished =
        String(
          row[
            "Metafield: custom.refurbished_product"
          ] || ""
        )
          .toLowerCase()
          .trim() === "true";

      const stockGentbrugge =
        Number(
          row[
            "Inventory Available: Microforce Gentbrugge"
          ] || 0
        ) || 0;

      const stockOudenaarde =
        Number(
          row[
            "Inventory Available: Microforce Oudenaarde"
          ] || 0
        ) || 0;

      const stockAntwerpen =
        Number(
          row[
            "Inventory Available: Microforce Antwerpen"
          ] || 0
        ) || 0;

      await supabaseAdmin
        .from("erp_articles")
        .upsert(
          {
            sku,
            title,

            active,
            published,

            refurbished_product:
              refurbished,

            vat_margin: vatMargin,

            inventory_qty: inventoryQty,

            stock_gentbrugge:
              stockGentbrugge,

            stock_oudenaarde:
              stockOudenaarde,

            stock_antwerpen:
              stockAntwerpen,

            price_cents: Math.round(
              price * 100
            ),

            compare_price_cents:
              comparePrice > 0
                ? Math.round(
                    comparePrice * 100
                  )
                : null,
          },
          {
            onConflict: "sku",
          }
        );

      imported++;
    }

    revalidatePath("/admin/erp/articles");

    redirect(
      `/admin/erp/sync?success=1&imported=${imported}`
    );
  } catch (e: any) {
    console.error("[ERP SYNC]", e);

    redirect(
      `/admin/erp/sync?error=${encodeURIComponent(
        e?.message || "Sync mislukt"
      )}`
    );
  }
}

export default async function ErpSyncPage({
  searchParams,
}: {
  searchParams?: {
    success?: string;
    imported?: string;
    error?: string;
  };
}) {
  const success =
    searchParams?.success === "1";

  const imported =
    searchParams?.imported || null;

  const error =
    searchParams?.error || null;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-slate-950 p-8 text-white">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-200">
            ERP Synchronisatie
          </div>

          <h1 className="mt-3 text-3xl font-bold">
            ERP artikel synchronisatie
          </h1>

          <p className="mt-3 text-sm text-slate-300">
            Download automatisch het XLSX
            bestand via FTP en synchroniseer
            de ERP artikeldatabase met
            Supabase.
          </p>
        </div>
      </div>

      {success && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          ✅ Synchronisatie voltooid.

          {imported && (
            <div className="mt-1">
              {imported} artikelen verwerkt.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            ERP sync starten
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Het XLSX bestand wordt opgehaald
            via FTP en daarna automatisch
            verwerkt in de ERP artikeltabel.
          </p>
        </div>

        <form action={syncErpAction}>
          <SyncButton />
        </form>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">
          Wat wordt gesynchroniseerd?
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-medium">
              Artikeldatabase
            </div>

            <div className="mt-1 text-xs text-slate-500">
              SKU, titel, prijs, voorraad,
              VAT type en publicatie status.
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-medium">
              Voorraad per locatie
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Gentbrugge, Oudenaarde en
              Antwerpen voorraadstanden.
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-medium">
              Refurb herkenning
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Detectie van refurbished
              artikelen en VAT margin.
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-medium">
              SKU koppelingen
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Voor leads, refurb,
              labelprinting en toekomstige
              automatisaties.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
