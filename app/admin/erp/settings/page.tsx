// app/admin/erp/settings/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ErpSettings = {
  id: string;
  ftp_host: string | null;
  ftp_port: number | null;
  ftp_secure: boolean | null;
  ftp_user: string | null;
  ftp_password: string | null;
  ftp_directory: string | null;
  ftp_filename: string | null;
  active: boolean | null;
};

async function getSettings(): Promise<ErpSettings | null> {
  const { data, error } = await supabaseAdmin
    .from("erp_settings")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ERP SETTINGS] fetch error", error);
    return null;
  }

  return data as ErpSettings | null;
}

async function saveErpSettingsAction(formData: FormData) {
  "use server";

  const id = String(formData.get("id") || "").trim();

  const ftpHost = String(formData.get("ftp_host") || "").trim();
  const ftpPort = Number(formData.get("ftp_port") || 21);
  const ftpSecure = String(formData.get("ftp_secure") || "") === "on";
  const ftpUser = String(formData.get("ftp_user") || "").trim();
  const ftpPassword = String(formData.get("ftp_password") || "").trim();
  const ftpDirectory = String(formData.get("ftp_directory") || "").trim();
  const ftpFilename = String(formData.get("ftp_filename") || "").trim();

  const payload: any = {
    ftp_host: ftpHost || null,
    ftp_port: Number.isFinite(ftpPort) ? ftpPort : 21,
    ftp_secure: ftpSecure,
    ftp_user: ftpUser || null,
    ftp_directory: ftpDirectory || null,
    ftp_filename: ftpFilename || null,
    active: true,
    updated_at: new Date().toISOString(),
  };

  if (ftpPassword) {
    payload.ftp_password = ftpPassword;
  }

  if (id) {
    const { error } = await supabaseAdmin
      .from("erp_settings")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("[ERP SETTINGS] update error", error);
      redirect(`/admin/erp/settings?msg=${encodeURIComponent(error.message)}`);
    }
  } else {
    if (!ftpPassword) {
      redirect("/admin/erp/settings?msg=ftp_password_required");
    }

    const { error } = await supabaseAdmin
      .from("erp_settings")
      .insert({
        ...payload,
        ftp_password: ftpPassword,
      });

    if (error) {
      console.error("[ERP SETTINGS] insert error", error);
      redirect(`/admin/erp/settings?msg=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath("/admin/erp/settings");
  redirect("/admin/erp/settings?msg=saved");
}

export default async function ErpSettingsPage({
  searchParams,
}: {
  searchParams?: { msg?: string };
}) {
  const settings = await getSettings();
  const msg = String(searchParams?.msg || "");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ERP
          </div>

          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            ERP FTP instellingen
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Stel hier de FTP locatie in waar de artikel database vanuit de ERP
            software wordt opgehaald.
          </p>
        </div>

        <Link href="/admin/erp" className="bb-btn text-sm">
          Terug naar ERP
        </Link>
      </div>

      {msg && (
        <div className="rounded-md border bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {msg === "saved"
            ? "ERP FTP instellingen opgeslagen."
            : `Melding: ${msg}`}
        </div>
      )}

      <form
        action={saveErpSettingsAction}
        className="rounded-xl border bg-white p-5 shadow-sm space-y-5"
      >
        <input type="hidden" name="id" value={settings?.id || ""} />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              FTP host
            </label>
            <input
              name="ftp_host"
              defaultValue={settings?.ftp_host || ""}
              placeholder="ftp.example.com"
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              FTP poort
            </label>
            <input
              name="ftp_port"
              type="number"
              defaultValue={settings?.ftp_port || 21}
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              FTP gebruiker
            </label>
            <input
              name="ftp_user"
              defaultValue={settings?.ftp_user || ""}
              placeholder="username"
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              FTP wachtwoord
            </label>
            <input
              name="ftp_password"
              type="password"
              placeholder={
                settings?.ftp_password
                  ? "Laat leeg om huidig wachtwoord te behouden"
                  : "Wachtwoord"
              }
              className="w-full rounded-md border px-3 py-2 text-sm"
              required={!settings?.ftp_password}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Map / directory
            </label>
            <input
              name="ftp_directory"
              defaultValue={settings?.ftp_directory || ""}
              placeholder="/exports"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Bestandsnaam
            </label>
            <input
              name="ftp_filename"
              defaultValue={settings?.ftp_filename || ""}
              placeholder="artikelen.csv"
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="ftp_secure"
            defaultChecked={!!settings?.ftp_secure}
          />
          Gebruik secure FTP/FTPS
        </label>

        <div className="rounded-md border bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Het wachtwoord wordt server-side opgeslagen en wordt niet opnieuw in
          het formulier getoond.
        </div>

        <div className="flex justify-end">
          <button type="submit" className="bb-btn bb-btn-primary text-sm">
            Instellingen opslaan
          </button>
        </div>
      </form>
    </div>
  );
}
