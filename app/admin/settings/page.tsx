// app/admin/settings/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";
import Link from "next/link";

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

type TemplateRow = {
  id: number;
  key: string;
  language: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  updated_at: string | null;
};

async function loadSettings(): Promise<SettingsRow> {
  const { data, error } = await supabaseAdmin
    .from("buyback_settings")
    .select("id, brand_name, brand_color, logo_url, email_disclaimer, updated_at")
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

async function loadEmailTemplates(): Promise<TemplateRow[]> {
  try {
    // Gebruik select("*") om niet te crashen op kolomnamen
    const { data, error } = await supabaseAdmin
      .from("buyback_email_templates")
      .select("*")
      .order("key", { ascending: true });

    if (error) {
      console.warn("[SETTINGS][email-templates] load error:", error);
      return [];
    }

    const rows = (data || []) as any[];

    const out: TemplateRow[] = [];
    for (const row of rows) {
      if (!row) continue;

      // key kan 'key' of 'type' zijn
      const key: string =
        (row.key as string | undefined) ??
        (row.type as string | undefined) ??
        "";

      if (!key) continue;

      // language kan 'language', 'locale' of 'lang' zijn
      const language: string =
        (row.language as string | undefined) ??
        (row.locale as string | undefined) ??
        (row.lang as string | undefined) ??
        "nl";

      out.push({
        id: row.id as number,
        key,
        language,
        subject: (row.subject as string | null) ?? "",
        body_html: (row.body_html as string | null) ?? "",
        body_text: (row.body_text as string | null) ?? "",
        updated_at: (row.updated_at as string | null) ?? null,
      });
    }

    return out;
  } catch (e) {
    console.warn("[SETTINGS][email-templates] exception:", e);
    return [];
  }
}

export default async function SettingsPage() {
  const row = await loadSettings();
  const templates = await loadEmailTemplates();

  // ---- Server Action branding (inline, geen extra export!) ----
  async function actionSaveBranding(formData: FormData) {
    "use server";

    const brand_name = (formData.get("brand_name") as string | null) ?? "";
    const brand_color = (formData.get("brand_color") as string | null) ?? "";
    const logo_url = (formData.get("logo_url") as string | null) ?? "";
    const email_disclaimer =
      (formData.get("email_disclaimer") as string | null) ?? "";

    // Upsert naar id=1
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

  // ---- Server Action e-mailtemplate bewaren ----
  async function actionSaveTemplate(formData: FormData) {
    "use server";

    const idRaw = (formData.get("template_id") as string | null) ?? "";
    const id = idRaw ? Number(idRaw) : undefined;

    const key =
      ((formData.get("template_key") as string | null) ?? "").trim();
    const language =
      ((formData.get("template_language") as string | null) ?? "nl").trim() ||
      "nl";
    const subject = (formData.get("subject") as string | null) ?? "";
    const body_html = (formData.get("body_html") as string | null) ?? "";
    const body_text = (formData.get("body_text") as string | null) ?? "";

    if (!key) {
      return { ok: false as const, message: "Template key ontbreekt." };
    }

    const payload: any = {
      key,
      language,
      subject,
      body_html,
      body_text,
      updated_at: new Date().toISOString(),
    };
    if (id) payload.id = id;

    const { error } = await supabaseAdmin
      .from("buyback_email_templates")
      .upsert(payload, {
        onConflict: "key,language",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("[SETTINGS][email-templates] upsert error:", error);
      return { ok: false as const, message: error.message };
    }

    revalidatePath("/admin/settings");
    return { ok: true as const, message: "Template bewaard." };
  }

  // Groepeer templates per key voor overzicht
  const templatesByKey = templates.reduce<Record<string, TemplateRow[]>>(
    (acc, t) => {
      if (!acc[t.key]) acc[t.key] = [];
      acc[t.key].push(t);
      return acc;
    },
    {}
  );

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
              Logo, merknaam, kleur en e-maildisclaimer voor buyback e-mails &amp;
              UI.
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
                placeholder="https://.../uploads/logo.png"
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

      {/* E-MAIL TEMPLATES */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <header>
          <h2 className="text-lg font-medium">E-mailtemplates</h2>
          <p className="text-sm text-gray-500">
            Bevestigings- en statusupdate-mails voor buyback orders. Tekst wordt
            dynamisch uit deze templates gehaald, per <code>key</code> en taal.
            <br />
            <span className="text-xs text-gray-400">
              Verwachte tabel in Supabase:{" "}
              <code>buyback_email_templates</code> met minimaal{" "}
              <code>id</code>, <code>key</code> (of <code>type</code>),{" "}
              <code>language</code> (of <code>locale</code>),{" "}
              <code>subject</code>, <code>body_html</code>,{" "}
              <code>body_text</code>, <code>updated_at</code>.
            </span>
          </p>
        </header>

        {templates.length === 0 ? (
          <p className="text-sm text-gray-500">
            Er werden geen e-mailtemplates geladen. Controleer in Supabase of er
            rijen bestaan in <code>buyback_email_templates</code> en of kolommen{" "}
            <code>key</code> (of <code>type</code>) en{" "}
            <code>language/locale</code> aanwezig zijn.
          </p>
        ) : (
          <div className="space-y-5">
            {Object.entries(templatesByKey).map(([key, list]) => (
              <div key={key} className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-md font-semibold">
                    Template key: <code>{key}</code>
                  </h3>
                  <span className="text-xs text-gray-400">
                    {list.length} taal/varianten
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {list.map((tpl) => (
                    <form
                      key={tpl.id}
                      action={actionSaveTemplate}
                      className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/60"
                    >
                      <input type="hidden" name="template_id" value={tpl.id} />
                      <input type="hidden" name="template_key" value={tpl.key} />
                      <input
                        type="hidden"
                        name="template_language"
                        value={tpl.language}
                      />

                      <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span>
                          Key: <code>{tpl.key}</code> • Taal:{" "}
                          <code>{tpl.language}</code>
                        </span>
                        <span>
                          Laatst bijgewerkt:{" "}
                          {tpl.updated_at
                            ? new Date(tpl.updated_at).toLocaleString("nl-BE")
                            : "—"}
                        </span>
                      </div>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">Onderwerp</span>
                        <input
                          name="subject"
                          defaultValue={tpl.subject ?? ""}
                          className="bb-input h-9 text-sm px-2"
                          placeholder="bv. [{{brand_name}}] Bevestiging buyback-aanvraag {{order_code}}"
                        />
                        <span className="text-xs text-gray-500">
                          Je kan placeholders gebruiken zoals{" "}
                          <code>{`{{first_name}}`}</code>,{" "}
                          <code>{`{{order_code}}`}</code>,{" "}
                          <code>{`{{brand_name}}`}</code>…
                        </span>
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">HTML body</span>
                        <textarea
                          name="body_html"
                          defaultValue={tpl.body_html ?? ""}
                          rows={8}
                          className="bb-input text-xs px-2 py-2 font-mono"
                          placeholder="HTML-template met placeholders zoals {{full_name}}, {{details_table}}, {{delivery_block}}…"
                        />
                        <span className="text-xs text-gray-500">
                          Volledige HTML-template. Beschikbare variabelen o.a.:{" "}
                          <code>{`{{full_name}}`}</code>,{" "}
                          <code>{`{{order_code}}`}</code>,{" "}
                          <code>{`{{details_table}}`}</code>,{" "}
                          <code>{`{{delivery_block}}`}</code>,{" "}
                          <code>{`{{payout_block}}`}</code>,{" "}
                          <code>{`{{next_steps}}`}</code>,{" "}
                          <code>{`{{disclaimer_html}}`}</code>.
                        </span>
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">
                          Tekstversie (optional)
                        </span>
                        <textarea
                          name="body_text"
                          defaultValue={tpl.body_text ?? ""}
                          rows={5}
                          className="bb-input text-xs px-2 py-2 font-mono"
                          placeholder="Platte tekst (fallback). Je kan dezelfde placeholders gebruiken als in de HTML body."
                        />
                        <span className="text-xs text-gray-500">
                          Wordt gebruikt als tekst-only fallback. Laat leeg om de
                          standaard gegenereerde tekst te gebruiken.
                        </span>
                      </label>

                      <div className="pt-1 flex justify-end">
                        <button
                          type="submit"
                          className="bb-btn primary h-8 text-xs px-3"
                        >
                          Template bewaren
                        </button>
                      </div>
                    </form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
