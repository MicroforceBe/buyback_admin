// app/api/erp-sync/route.ts

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import ftp from "basic-ftp";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ErpSettingsRow = {
  ftp_host: string | null;
  ftp_port: number | null;
  ftp_user: string | null;
  ftp_password: string | null;
  ftp_directory: string | null;
  ftp_filename: string | null;
  ftp_secure: boolean | null;
};

export async function GET() {
  try {
    const { data: settings } = await supabaseAdmin
      .from("erp_settings")
      .select("*")
      .limit(1)
      .maybeSingle<ErpSettingsRow>();

    if (!settings) {
      throw new Error("ERP settings ontbreken");
    }

    const client = new ftp.Client(30000);

    client.ftp.verbose = false;

    await client.access({
      host: settings.ftp_host!.replace(
        "ftp://",
        ""
      ),
      port: settings.ftp_port || 21,
      user: settings.ftp_user!,
      password: settings.ftp_password!,
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

    const sheet =
      workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json<any>(
      sheet,
      {
        defval: "",
      }
    );

    let imported = 0;

    for (const row of rows) {
      const sku = String(
        row["Variant SKU [ID]"] || ""
      ).trim();

      if (!sku) continue;

      const title = String(
        row["Title"] || ""
      ).trim();

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
              Number(
                row[
                  "Inventory Available: Microforce Gentbrugge"
                ] || 0
              ) || 0,

            stock_oudenaarde:
              Number(
                row[
                  "Inventory Available: Microforce Oudenaarde"
                ] || 0
              ) || 0,

            stock_antwerpen:
              Number(
                row[
                  "Inventory Available: Microforce Antwerpen"
                ] || 0
              ) || 0,

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

    return NextResponse.json({
      success: true,
      imported,
    });
  } catch (e: any) {
    console.error("[ERP AUTO SYNC]", e);

    return NextResponse.json(
      {
        success: false,
        error: e?.message || "Sync mislukt",
      },
      {
        status: 500,
      }
    );
  }
}
