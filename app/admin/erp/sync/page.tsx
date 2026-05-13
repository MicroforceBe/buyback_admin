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

  let redirectUrl = "";

  try {
    const result = await runErpSync();

    revalidatePath("/admin/erp/articles");
    revalidatePath("/admin/erp/sync");

    redirectUrl =
      `/admin/erp/sync?success=1` +
      `&imported=${result.imported}` +
      `&skipped=${result.skipped}` +
      `&rows=${result.rows}` +
      `&duration=${result.duration_seconds}`;
  } catch (e: any) {
    console.error("[ERP MANUAL SYNC]", e);

    redirectUrl =
      `/admin/erp/sync?error=${encodeURIComponent(
        e?.message || "Sync mislukt"
      )}`;
  }

  redirect(redirectUrl);
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
      <div className="overflow-hidden rounded-3xl border bg-slate-950 shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.18),transparent_30%)] p-8 text-white">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-100">
              ERP Synchronisatie
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight">
              ERP artikel synchronisatie
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              Synchroniseer automatisch de ERP artikeldatabase vanuit het XLSX
              bestand op de FTP server naar Supabase.
            </p>
          </div>
        </div>
      </div>

      {success && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-800 shadow-sm">
          <div className="flex items-center gap-2 text-base font-semibold">
            <span>✅</span>
            <span>Synchronisatie voltooid</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-green-200 bg-white p-4">
              <div className="text-2xl font-bold text-green-700">
                {imported || 0}
              </div>

              <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                Geïmporteerd
              </div>
            </div>

            <div className="rounded-xl border border-green-200 bg-white p-4">
              <div className="text-2xl font-bold text-amber-600">
                {skipped || 0}
              </div>

              <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                Overgeslagen
              </div>
            </div>

            <div className="rounded-xl border border-green-200 bg-white p-4">
              <div className="text-2xl font-bold text-slate-900">
                {rows || 0}
              </div>

              <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                Rows gelezen
              </div>
            </div>

            <div className="rounded-xl border border-green-200 bg-white p-4">
              <div className="text-2xl font-bold text-sky-700">
                {duration || 0}s
              </div>

              <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                Duur
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">
          <div className="flex items-center gap-2 font-semibold">
            <span>❌</span>
            <span>Synchronisatie mislukt</span>
          </div>

          <div className="mt-2 text-sm">{error}</div>
        </div>
      )}

      <div className="rounded-3xl border bg-white shadow-sm">
        <div className="border-b px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            ERP sync starten
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Start een manuele synchronisatie van de ERP artikeldatabase.
          </p>
        </div>

        <div className="p-6">
          <form action={syncErpAction}>
            <SyncButton />
          </form>
        </div>
      </div>

      <div className="rounded-3xl border bg-white shadow-sm">
        <div className="border-b px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Centrale sync-engine
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Zowel de automatische cronjob als de manuele sync gebruiken exact
            dezelfde ERP synchronisatie-engine.
          </p>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-900">
              Eén centrale sync functie
            </div>

            <div className="mt-2 text-sm leading-6 text-slate-500">
              Alle ERP synchronisatie-logica zit centraal in{" "}
              <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">
                lib/erpSync.ts
              </code>
              .
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-900">
              Bulk database updates
            </div>

            <div className="mt-2 text-sm leading-6 text-slate-500">
              Artikels worden in grote chunks verwerkt voor maximale snelheid en
              stabiliteit.
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-900">
              FTP + XLSX verwerking
            </div>

            <div className="mt-2 text-sm leading-6 text-slate-500">
              Het XLSX exportbestand wordt automatisch via FTP opgehaald en
              verwerkt.
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-900">
              Volledig automatische cron sync
            </div>

            <div className="mt-2 text-sm leading-6 text-slate-500">
              Vercel Cron synchroniseert automatisch de ERP database op vaste
              intervallen.
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t px-6 py-5">
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
