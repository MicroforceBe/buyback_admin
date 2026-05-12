// app/admin/erp/sync/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ErpSettings = {
  ftp_host: string | null;
  ftp_port: number | null;
  ftp_secure: boolean | null;
  ftp_user: string | null;
  ftp_directory: string | null;
  ftp_filename: string | null;
};

async function getSettings(): Promise<ErpSettings | null> {
  const { data, error } = await supabaseAdmin
    .from("erp_settings")
    .select(
      "ftp_host, ftp_port, ftp_secure, ftp_user, ftp_directory, ftp_filename"
    )
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ERP SYNC] settings error", error);
    return null;
  }

  return data as ErpSettings | null;
}

export default async function ErpSyncPage() {
  const settings = await getSettings();

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
            FTP instellingen zijn voorbereid. De echte FTP connectie wordt
            geactiveerd zodra de dependency <code>basic-ftp</code> in het
            project staat.
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
              Status
            </div>
            <div className="mt-2">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                Klaar voor FTP module
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-base font-semibold text-slate-900">
          Volgende actie nodig
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Voeg <code>basic-ftp</code> toe aan <code>package.json</code>. Daarna
          kan deze pagina het ERP bestand echt ophalen en previewen.
        </p>
      </div>
    </div>
  );
}
