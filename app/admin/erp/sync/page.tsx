// app/admin/erp/sync/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Client } from "basic-ftp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

async function fetchCsvPreview(settings: ErpSettings) {
  const client = new Client();
  client.ftp.verbose = false;

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

    const writable = new (require("stream").Writable)({
      write(chunk: Buffer, _enc: any, cb: any) {
        chunks.push(chunk);
        cb();
      },
    });

    await client.downloadTo(
      writable,
      settings.ftp_filename || ""
    );

    const content = Buffer.concat(chunks).toString("utf8");

    const lines = content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 15);

    return {
      success: true,
      lines,
      totalLines: content.split(/\r?\n/).length,
    };
  } catch (e: any) {
    console.error("[ERP SYNC] ftp error", e);

    return {
      success: false,
      error: e?.message || "FTP fout",
      lines: [],
      totalLines: 0,
    };
  } finally {
    client.close();
  }
}

export default async function ErpSyncPage() {
  const settings = await getSettings();

  let preview:
    | {
        success: boolean;
        lines: string[];
        totalLines: number;
        error?: string;
      }
    | null = null;

  if (settings?.ftp_host && settings?.ftp_filename) {
    preview = await fetchCsvPreview(settings);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ERP
          </div>

          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            ERP synchronisatie
          </h1>

          <p className="mt-2 text-sm text-slate-500 max-w-3xl">
            Test de FTP verbinding en laad het ERP artikelbestand in voor
            synchronisatie met de centrale artikel database.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/erp/settings" className="bb-btn text-sm">
            FTP settings
          </Link>

          <Link href="/admin/erp" className="bb-btn text-sm">
            ERP home
          </Link>
        </div>
      </div>

      {!settings && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Geen ERP FTP instellingen gevonden.
        </div>
      )}

      {settings && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                FTP host
              </div>

              <div className="mt-2 text-sm font-medium text-slate-900 break-all">
                {settings.ftp_host || "—"}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Bestand
              </div>

              <div className="mt-2 text-sm font-medium text-slate-900 break-all">
                {settings.ftp_filename || "—"}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Directory
              </div>

              <div className="mt-2 text-sm font-medium text-slate-900 break-all">
                {settings.ftp_directory || "/"}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Verbinding
              </div>

              <div className="mt-2">
                {preview?.success ? (
                  <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                    Verbonden
                  </span>
                ) : (
                  <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                    Fout
                  </span>
                )}
              </div>
            </div>
          </div>

          {preview && !preview.success && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
              <div className="text-sm font-medium text-red-800">
                FTP fout
              </div>

              <div className="mt-2 text-sm text-red-700">
                {preview.error}
              </div>
            </div>
          )}

          {preview?.success && (
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    CSV preview
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Eerste lijnen uit ERP bestand
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  {preview.totalLines} lijnen
                </div>
              </div>

              <div className="overflow-x-auto">
                <pre className="p-4 text-xs leading-6 text-slate-800 whitespace-pre-wrap">
                  {preview.lines.join("\n")}
                </pre>
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">
                  ERP import
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Volgende stap: CSV parser en automatische artikel sync naar
                  erp_articles.
                </p>
              </div>

              <button
                disabled
                className="rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 cursor-not-allowed"
              >
                Binnenkort beschikbaar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
