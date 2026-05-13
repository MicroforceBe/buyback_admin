// app/admin/erp/sync/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  runErpSync,
  findMissingErpArticles,
  markMissingErpArticlesInactive,
} from "@/lib/erpSync";

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

    redirectUrl = `/admin/erp/sync?error=${encodeURIComponent(
      e?.message || "Sync mislukt"
    )}`;
  }

  redirect(redirectUrl);
}

async function checkMissingAction() {
  "use server";

  let redirectUrl = "";

  try {
    const result = await findMissingErpArticles();

    redirectUrl =
      `/admin/erp/sync?cleanup=1` +
      `&xlsx=${result.totalInXlsx}` +
      `&missing=${result.missing.length}`;
  } catch (e: any) {
    console.error("[ERP CLEANUP CHECK]", e);

    redirectUrl = `/admin/erp/sync?error=${encodeURIComponent(
      e?.message || "Controle mislukt"
    )}`;
  }

  redirect(redirectUrl);
}

async function markMissingInactiveAction() {
  "use server";

  let redirectUrl = "";

  try {
    const result = await markMissingErpArticlesInactive();

    revalidatePath("/admin/erp/articles");
    revalidatePath("/admin/erp/sync");

    redirectUrl =
      `/admin/erp/sync?cleanupDone=1` +
      `&updated=${result.updated}` +
      `&xlsx=${result.totalInXlsx}`;
  } catch (e: any) {
    console.error("[ERP CLEANUP MARK]", e);

    redirectUrl = `/admin/erp/sync?error=${encodeURIComponent(
      e?.message || "Opkuisen mislukt"
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

    cleanup?: string;
    cleanupDone?: string;
    xlsx?: string;
    missing?: string;
    updated?: string;
  };
}) {
  const success = searchParams?.success === "1";
  const imported = searchParams?.imported || null;
  const skipped = searchParams?.skipped || null;
  const rows = searchParams?.rows || null;
  const duration = searchParams?.duration || null;
  const error = searchParams?.error || null;

  const cleanup = searchParams?.cleanup === "1";
  const cleanupDone = searchParams?.cleanupDone === "1";
  const xlsx = searchParams?.xlsx || null;
  const missing = searchParams?.missing || null;
  const updated = searchParams?.updated || null;

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
              Synchroniseer de ERP artikeldatabase vanuit het XLSX bestand op
              de FTP server. Artikels die niet meer in het XLSX bestand staan
              kunnen veilig slapend gezet worden.
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

      {cleanup && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          <div className="flex items-center gap-2 text-base font-semibold">
            <span>⚠️</span>
            <span>Controle voltooid</span>
          </div>

          <div className="mt-3">
            XLSX bevat <b>{xlsx || 0}</b> SKU’s. Er werden{" "}
            <b>{missing || 0}</b> artikels gevonden die niet meer in het XLSX
            bestand staan.
          </div>

          {Number(missing || 0) > 0 && (
            <form action={markMissingInactiveAction} className="mt-4">
              <button
                type="submit"
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Markeer ontbrekende artikels als slapend
              </button>
            </form>
          )}
        </div>
      )}

      {cleanupDone && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-800 shadow-sm">
          <div className="flex items-center gap-2 text-base font-semibold">
            <span>✅</span>
            <span>Database opgekuist</span>
          </div>

          <div className="mt-3">
            <b>{updated || 0}</b> artikels werden slapend gezet. XLSX bevat{" "}
            <b>{xlsx || 0}</b> SKU’s.
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">
          <div className="flex items-center gap-2 font-semibold">
            <span>❌</span>
            <span>Actie mislukt</span>
          </div>

          <div className="mt-2 text-sm">{error}</div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
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
              Opkuisen database
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Controleer welke artikels nog in Supabase staan, maar niet meer
              in het huidige ERP XLSX bestand voorkomen.
            </p>
          </div>

          <div className="space-y-4 p-6">
            <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-600">
              Artikels worden niet verwijderd. Ze worden slapend gezet:
              <div className="mt-2 rounded-xl bg-white p-3 font-mono text-xs text-slate-700">
                active = false
                <br />
                missing_from_erp = true
              </div>
            </div>

            <form action={checkMissingAction}>
              <button
                type="submit"
                className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Controleer ontbrekende artikels
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border bg-white shadow-sm">
        <div className="border-b px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Centrale sync-engine
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Zowel de automatische cronjob als de manuele sync gebruiken dezelfde
            ERP synchronisatie-engine. De opkuisactie draait enkel manueel.
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
              Veilige cleanup
            </div>

            <div className="mt-2 text-sm leading-6 text-slate-500">
              Ontbrekende artikels blijven bestaan voor historiek en koppelingen,
              maar worden als slapend gemarkeerd.
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
