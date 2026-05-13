// app/admin/erp/sync/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { runErpSync } from "@/lib/erpSync";
import SyncButton from "./SyncButton";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function syncErpAction() {
  "use server";

  try {
    const result = await runErpSync();

    revalidatePath("/admin/erp/articles");
    revalidatePath("/admin/erp/sync");

    redirect(
      `/admin/erp/sync?success=1&imported=${result.imported}&skipped=${result.skipped}&rows=${result.rows}&duration=${result.duration_seconds}`
    );
  } catch (e: any) {
    console.error("[ERP MANUAL SYNC]", e);

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
    skipped?: string;
    rows?: string;
    duration?: string;
    error?: string;
  };
}) {
  const success = searchParams?.success === "1";
  const imported = searchParams?.imported || null;
  const skipped = searchParams?.skipped || null;
  const rows = searchParams?.rows || null;
  const duration = searchParams?.duration || null;
  const error = searchParams?.error || null;

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
            Download automatisch het XLSX bestand via FTP en synchroniseer de
            ERP artikeldatabase met Supabase.
          </p>
        </div>
      </div>

      {success && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          ✅ Synchronisatie voltooid.

          <div className="mt-2 grid gap-2 md:grid-cols-4">
            <div>
              <b>{imported || 0}</b>
              <div className="text-xs">geïmporteerd</div>
            </div>

            <div>
              <b>{skipped || 0}</b>
              <div className="text-xs">overgeslagen</div>
            </div>

            <div>
              <b>{rows || 0}</b>
              <div className="text-xs">rows gelezen</div>
            </div>

            <div>
              <b>{duration || 0}s</b>
              <div className="text-xs">duur</div>
            </div>
          </div>
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
            De manuele sync gebruikt exact dezelfde centrale sync-engine als de
            automatische cron job.
          </p>
        </div>

        <form action={syncErpAction}>
          <SyncButton />
        </form>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">
          Centrale sync-engine
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-medium">1 broncode</div>
            <div className="mt-1 text-xs text-slate-500">
              Cron en manuele sync gebruiken beide <code>runErpSync()</code>.
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-medium">Bulk upsert</div>
            <div className="mt-1 text-xs text-slate-500">
              Artikelen worden in chunks verwerkt voor betere performance.
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-medium">FTP + XLSX</div>
            <div className="mt-1 text-xs text-slate-500">
              Het XLSX bestand wordt via FTP opgehaald en automatisch gelezen.
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-medium">ERP artikelen</div>
            <div className="mt-1 text-xs text-slate-500">
              SKU, titel, prijs, voorraad, BTW en refurb status worden
              bijgewerkt.
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Link href="/admin/erp/articles" className="bb-btn text-sm">
            Naar artikelen
          </Link>

          <Link href="/admin/erp/settings" className="bb-btn text-sm">
            FTP instellingen
          </Link>
        </div>
      </div>
    </div>
  );
}
