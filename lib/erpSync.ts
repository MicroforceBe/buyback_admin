// lib/erpSync.ts

import { Writable } from "stream";
import * as XLSX from "xlsx";
import { Client } from "basic-ftp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ErpSettingsRow = {
  ftp_host: string | null;
  ftp_port: number | null;
  ftp_user: string | null;
  ftp_password: string | null;
  ftp_directory: string | null;
  ftp_filename: string | null;
  ftp_secure: boolean | null;
};

export type ErpSyncResult = {
  success: boolean;
  imported: number;
  skipped: number;
  rows: number;
  duration_seconds: number;
};

function toNumber(value: any) {
  return (
    Number(
      String(value ?? "0")
        .replace(",", ".")
        .trim()
    ) || 0
  );
}

function toBool(value: any) {
  const v = String(value ?? "")
    .toLowerCase()
    .trim();

  return ["true", "1", "yes", "ja", "active"].includes(v);
}

async function getErpSettings() {
  const { data, error } = await supabaseAdmin
    .from("erp_settings")
    .select("*")
    .limit(1)
    .maybeSingle<ErpSettingsRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("ERP settings ontbreken");
  }

  if (
    !data.ftp_host ||
    !data.ftp_user ||
    !data.ftp_password ||
    !data.ftp_filename
  ) {
    throw new Error("FTP instellingen zijn onvolledig");
  }

  return data;
}

async function downloadErpXlsx(settings: ErpSettingsRow) {
  const client = new Client(30000);
  client.ftp.verbose = false;

  await client.access({
    host: settings.ftp_host!
      .replace("ftp://", "")
      .replace("ftps://", ""),
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

  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  await client.downloadTo(writable, remotePath);
  client.close();

  return {
    buffer: Buffer.concat(chunks),
    remotePath,
  };
}

function parseRows(buffer: Buffer) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
  });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json<any>(sheet, {
    defval: "",
  });
}

function rowToPayload(row: any) {
  const sku = String(row["Variant SKU [ID]"] || "").trim();

  if (!sku) {
    return null;
  }

  const title = String(row["Title"] || "").trim();

  const price = toNumber(row["Variant Price"]);
  const comparePrice = toNumber(row["Variant Compare At Price"]);

  return {
    sku,
    title,

    active:
      String(row["Status"] || "")
        .toLowerCase()
        .trim() === "active",

    published: toBool(row["Published"]),

    refurbished_product: toBool(
      row["Metafield: custom.refurbished_product"]
    ),

    vat_margin: toBool(row["Metafield: custom.vat_margin"]),

    inventory_qty: Math.round(toNumber(row["Variant Inventory Qty"])),

    stock_gentbrugge: Math.round(
      toNumber(row["Inventory Available: Microforce Gentbrugge"])
    ),

    stock_oudenaarde: Math.round(
      toNumber(row["Inventory Available: Microforce Oudenaarde"])
    ),

    stock_antwerpen: Math.round(
      toNumber(row["Inventory Available: Microforce Antwerpen"])
    ),

    price_cents: Math.round(price * 100),

    compare_price_cents:
      comparePrice > 0 ? Math.round(comparePrice * 100) : null,

    updated_at: new Date().toISOString(),
  };
}

async function bulkUpsertArticles(payloads: any[]) {
  const chunkSize = 500;
  let imported = 0;

  for (let i = 0; i < payloads.length; i += chunkSize) {
    const chunk = payloads.slice(i, i + chunkSize);

    const { error } = await supabaseAdmin
      .from("erp_articles")
      .upsert(chunk, {
        onConflict: "sku",
      });

    if (error) {
      throw new Error(error.message);
    }

    imported += chunk.length;

    console.log(
      `[ERP SYNC] Chunk verwerkt: ${imported}/${payloads.length}`
    );
  }

  return imported;
}

export async function runErpSync(): Promise<ErpSyncResult> {
  const startedAt = Date.now();

  console.log("[ERP SYNC] Sync gestart");

  const settings = await getErpSettings();

  const { buffer, remotePath } = await downloadErpXlsx(settings);

  console.log("[ERP SYNC] Bestand gedownload:", remotePath);

  const rows = parseRows(buffer);

  console.log("[ERP SYNC] Rows gevonden:", rows.length);

  const payloads: any[] = [];
  let skipped = 0;

  for (const row of rows) {
    const payload = rowToPayload(row);

    if (!payload) {
      skipped++;
      continue;
    }

    payloads.push(payload);
  }

  const imported = await bulkUpsertArticles(payloads);

  const duration = Math.round((Date.now() - startedAt) / 1000);

  console.log(
    `[ERP SYNC] Sync succesvol. ${imported} artikels geïmporteerd, ${skipped} overgeslagen in ${duration}s`
  );

  return {
    success: true,
    imported,
    skipped,
    rows: rows.length,
    duration_seconds: duration,
  };
}

export async function findMissingErpArticles() {
  const settings = await getErpSettings();
  const { buffer } = await downloadErpXlsx(settings);
  const rows = parseRows(buffer);

  const xlsxSkus = new Set<string>();

  for (const row of rows) {
    const sku = String(row["Variant SKU [ID]"] || "").trim();
    if (sku) xlsxSkus.add(sku);
  }

  const { data, error } = await supabaseAdmin
    .from("erp_articles")
    .select("id, sku, title, active, missing_from_erp")
    .order("sku", { ascending: true });

  if (error) throw new Error(error.message);

  const missing = (data || []).filter((article: any) => {
    const sku = String(article.sku || "").trim();
    return sku && !xlsxSkus.has(sku);
  });

  return {
    totalInXlsx: xlsxSkus.size,
    missing,
  };
}

export async function markMissingErpArticlesInactive() {
  const result = await findMissingErpArticles();
  const ids = result.missing.map((x: any) => x.id).filter(Boolean);

  if (!ids.length) {
    return {
      updated: 0,
      totalInXlsx: result.totalInXlsx,
    };
  }

  const { error } = await supabaseAdmin
    .from("erp_articles")
    .update({
      active: false,
      missing_from_erp: true,
      missing_from_erp_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (error) throw new Error(error.message);

  return {
    updated: ids.length,
    totalInXlsx: result.totalInXlsx,
  };
}

