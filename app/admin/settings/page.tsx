// app/admin/settings/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SettingsRow = {
  id: number;
  brand_name: string | null;
  brand_color: string | null;
  logo_url: string | null;
  email_disclaimer: string | null;
  updated_at?: string | null;
};

async function loadSettings(): Promise<SettingsRow> {
  const { data, error } = await supabaseAdmin
    .from("buyback_settings")
    .select(
      "id, brand_name, brand_color, logo_url, email_disclaimer, updated_at"
    )
    .eq("id", 1)
    .single();

  if (error) {
    // Als er nog geen rij is, geven we lege defaults terug
    return {
      id: 1,
      brand_name: "",
      brand_color: "",
      logo_url: "",
      email_disclaimer: "",
      updated_at: null,
    };
  }

  return {
    id: data?.id ?? 1,
    brand_name: data?.brand_name ?? "",
    brand_color: data?.brand_color ?? "",
    logo_url: data?.logo_url ?? "",
    email_disclaimer: data?.email_disclaimer ?? "",
    updated_at: data?.updated_at ?? null,
  };
}

export default async function SettingsPage() {
  // 🔐 rechten-check
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login");
  }

  if (!hasPermission(adminUser, "settings", "read")) {
    return (
      <div className="w-full p-4">
        <p className="text-sm text-red-600">
          Je hebt geen rechten om deze pagina te bekijken.
        </p>
      </div>
    );
  }

  const row = await loadSettings();

  // ---- Server Action branding (inline) ----
  async function actionSaveBranding(formData: FormData) {
    "use server";

    // extra write-check
    const current = await getCurrentAdminUser();
    if (!current || !hasPermission(current, "settings", "write")) {
      throw new Error("Je hebt geen schrijfrechten voor instellingen.");
    }

    const brand_name = (formData.get("brand_name") as string | null) ?? "";
    const brand_color = (formData.get("brand_color") as string | null) ?? "";
    const logo_url = (formData.get("logo_url") as string | null) ?? "";
    const email_disclaimer =
      (formData.get("email_disclaimer") as string | null) ?? "";

    const { error } = await supabaseAdmin
      .from("buyback_settings")
      .upsert(
        {
          id: 1,
          brand_name,
          brand_color,
          logo_url,
          email_disclaimer,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id", ignoreDuplicates: false }
      );

    if (error) {
      console.error("[SETTINGS][branding] upsert error:", error);
      return { ok: false as const, message: error.message };
    }

    revalidatePath("/admin/settings");
    return { ok: true as const, message: "Instellingen bewaard." };
  }

  return (
    <div className="w-full p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Instellingen</h1>
        <Link href="/admin" className="bb-btn h-9 text-xs px-3">
          ← Terug
        </Link>
      </div>

      {/* BRANDING */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Branding</h2>
            <p className="text-sm text-gray-500">
              Logo, merknaam, kleur en e-maildisclaimer voor buyback e-mails
              &amp; UI.
            </p>
          </div>
          <Link href="/admin/uploads" className="text-sm underline">
            ➜ Uploads (logo uploaden)
          </Link>
        </header>

        <form action={actionSaveBranding} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Merknaam</span>
              <input
                name="brand_name"
                defaultValue={row.brand_name ?? ""}
                placeholder="bv. Microforce Buyback"
                className="bb-input h-9 text-sm px-2"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Merk-kleur (hex)</span>
              <div className="flex items-center gap-2">
                <input
                  name="brand_color"
                  defaultValue={row.brand_color ?? ""}
                  placeholder="#00AEEF"
                  className="bb-input h-9 text-sm px-2 flex-1"
                />
                <span
                  title="Preview"
                  className="inline-block w-8 h-8 rounded border"
                  style={{ backgroundColor: row.brand_color || "#ffffff" }}
                />
              </div>
              <span className="text-xs text-gray-500">
                Gebruik een geldige hex-kleur (bv. #0EA5E9).
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium">Logo URL</span>
              <input
                name="logo_url"
                defaultValue={row.logo_url ?? ""}
                placeholder={String("https://.../uploads/logo.png")}
                className="bb-input h-9 text-sm px-2"
              />
              <span className="text-xs text-gray-500">
                Kies een bestand via{" "}
                <Link href="/admin/uploads" className="underline">
                  Uploads
                </Link>{" "}
                en plak hier de URL.
              </span>
            </label>

            {row.logo_url ? (
              <div className="md:col-span-2">
                <span className="block text-sm text-gray-500 mb-1">
                  Logo voorbeeld
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.logo_url}
                  alt="Logo preview"
                  className="h-12 object-contain bg-white border rounded p-2"
                />
              </div>
            ) : null}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">E-mail disclaimer</span>
            <textarea
              name="email_disclaimer"
              defaultValue={row.email_disclaimer ?? ""}
              placeholder="Tekst die onderaan in bevestigingsmails verschijnt."
              rows={6}
              className="bb-input text-sm px-2 py-2"
            />
            <span className="text-xs text-gray-500">
              Platte tekst; eenvoudige opmaak (zoals regels) kan, HTML is niet
              nodig.
            </span>
          </label>

          <div className="pt-2">
            <button type="submit" className="bb-btn primary h-9 text-sm px-4">
              Bewaren
            </button>
          </div>
        </form>

        <footer className="pt-2">
          <p className="text-xs text-gray-400">
            Laatst bijgewerkt:{" "}
            {row.updated_at
              ? new Date(row.updated_at).toLocaleString("nl-BE")
              : "—"}
          </p>
        </footer>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-medium">Tip</h3>
        <p className="text-sm text-gray-600">
          Deze instellingen worden gebruikt in je bevestigingsmails (via Resend)
          en kunnen later eenvoudig uitgebreid worden (bijv. extra
          huisstijl-varianten per shop of extra e-mailtypes).
        </p>
      </section>
    </div>
  );
}
