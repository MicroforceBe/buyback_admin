// app/admin/settings/email-templates/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import { hasPermission } from "@/lib/adminPermissions";
import StatusTemplatesTabs from "../StatusTemplatesTabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TemplateRow = {
  id: number;
  key: string;
  language: string;
  subject: string | null;
  body_html: string | null;
  updated_at: string | null;
};

type TemplateRowWithMeta = TemplateRow & { _isNew?: boolean };

type StatusMeta = {
  key: string;
  label: string;
  description: string;
};

// Deze keys moeten overeenkomen met de order-statussen in je admin/leads
const ORDER_STATUS_KEYS: StatusMeta[] = [
  {
    key: "new",
    label: "Nieuw",
    description: "E-mail wanneer een nieuwe buyback-aanvraag wordt aangemaakt.",
  },
  {
    key: "received_store",
    label: "Ontvangen in winkel",
    description: "E-mail wanneer het toestel in de winkel werd ontvangen.",
  },
  {
    key: "label_created",
    label: "Label aangemaakt",
    description: "E-mail wanneer het verzendlabel is aangemaakt.",
  },
  {
    key: "shipment_received",
    label: "Zending ontvangen",
    description:
      "E-mail wanneer de zending is ontvangen in het controlecentrum.",
  },
  {
    key: "check_passed",
    label: "Controle OK",
    description: "E-mail wanneer de controle is goedgekeurd.",
  },
  {
    key: "check_failed",
    label: "Controle NOK",
    description: "E-mail wanneer de controle niet is goedgekeurd.",
  },
  {
    key: "done",
    label: "Afgehandeld",
    description: "Slotsituatie: buyback-order is volledig afgehandeld.",
  },
];

async function loadEmailTemplates(): Promise<TemplateRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("buyback_email_templates")
      .select("*")
      .order("id", { ascending: true });

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
        updated_at: (row.updated_at as string | null) ?? null,
      });
    }

    return out;
  } catch (e) {
    console.warn("[SETTINGS][email-templates] exception:", e);
    return [];
  }
}

export default async function EmailTemplatesSettingsPage() {
  const adminUser = await getCurrentAdminUser();

  if (!adminUser) {
    redirect("/admin/login");
  }

  const canRead = hasPermission(adminUser, "settings", "read");
  const canWrite = hasPermission(adminUser, "settings", "write");

  if (!canRead) {
    return (
      <div className="w-full p-4">
        <h1 className="text-xl font-semibold mb-2">Instellingen – E-mailtemplates</h1>
        <p className="text-sm text-red-600">
          Je hebt geen rechten om deze pagina te bekijken.
        </p>
      </div>
    );
  }

  const templates = await loadEmailTemplates();

  // ---- Server Action e-mailtemplate bewaren ----
  async function actionSaveTemplate(formData: FormData) {
    "use server";

    const adminUserInner = await getCurrentAdminUser();
    if (!adminUserInner || !hasPermission(adminUserInner, "settings", "write")) {
      return { ok: false as const, message: "Je hebt geen rechten om templates te wijzigen." };
    }

    const idRaw = (formData.get("template_id") as string | null) ?? "";
    const id = idRaw && idRaw !== "0" ? Number(idRaw) : undefined;

    const keyInput =
      ((formData.get("template_key") as string | null) ?? "").trim();
    const languageInput =
      ((formData.get("template_language") as string | null) ?? "nl").trim() ||
      "nl";
    const subject = (formData.get("subject") as string | null) ?? "";
    const body_html = (formData.get("body_html") as string | null) ?? "";

    if (!keyInput) {
      return { ok: false as const, message: "Template key ontbreekt." };
    }

    const key = keyInput;
    const language = languageInput;

    // Alleen kolommen gebruiken die echt in de tabel staan:
    // id, key, language, subject, body_html, updated_at
    const payload: any = {
      key,
      language,
      subject,
      body_html,
      updated_at: new Date().toISOString(),
    };
    if (id && Number.isFinite(id)) {
      payload.id = id;
    }

    try {
      const { error } = await supabaseAdmin
        .from("buyback_email_templates")
        .upsert(payload);

      if (error) {
        console.error("[SETTINGS][email-templates] upsert error:", error);
        return { ok: false as const, message: error.message };
      }
    } catch (e: any) {
      console.error(
        "[SETTINGS][email-templates] upsert exception:",
        e?.message || e
      );
      return {
        ok: false as const,
        message: "Onbekende fout bij bewaren van template.",
      };
    }

    revalidatePath("/admin/settings/email-templates");
    return { ok: true as const, message: "Template bewaard." };
  }

  // ====== AFLEIDINGEN VOOR STATUS + TALEN ======

  const languagesFromData = Array.from(
    new Set(templates.map((t) => t.language))
  ).sort();

  const LANGUAGES = languagesFromData.length > 0 ? languagesFromData : ["nl"];

  const statusKeysSet = new Set(ORDER_STATUS_KEYS.map((s) => s.key));

  const statusTemplates = ORDER_STATUS_KEYS.map((status) => {
    const rows: TemplateRowWithMeta[] = LANGUAGES.map((lang) => {
      const existing = templates.find(
        (t) => t.key === status.key && t.language === lang
      );
      if (existing) {
        return existing as TemplateRowWithMeta;
      }
      return {
        id: 0,
        key: status.key,
        language: lang,
        subject: "",
        body_html: "",
        updated_at: null,
        _isNew: true,
      };
    });
    return { ...status, rows };
  });

  const templatesByKey = templates.reduce<Record<string, TemplateRow[]>>(
    (acc, t) => {
      if (statusKeysSet.has(t.key)) return acc;
      if (!acc[t.key]) acc[t.key] = [];
      acc[t.key].push(t);
      return acc;
    },
    {}
  );

  return (
    <div className="w-full p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Instellingen – E-mailtemplates</h1>
        <Link href="/admin" className="bb-btn h-9 text-xs px-3">
          ← Terug
        </Link>
      </div>

      {/* E-MAIL TEMPLATES (statussen met tabs + variabelen + preview) */}
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <header>
          <h2 className="text-lg font-medium">E-mailtemplates per orderstatus</h2>
          <p className="text-sm text-gray-500">
            Bevestigings- en statusupdate-mails voor buyback orders. Tekst
            wordt dynamisch uit deze templates gehaald, per <code>key</code> en
            taal.
          </p>
          <p className="text-xs text-gray-400">
            Verwachte tabel in Supabase:{" "}
            <code>buyback_email_templates</code> met minimaal <code>id</code>,{" "}
            <code>key</code>, <code>language</code>, <code>subject</code>,{" "}
            <code>body_html</code>, <code>updated_at</code>.
          </p>
          {!canWrite && (
            <p className="mt-1 text-xs text-gray-500">
              Je hebt alleen leesrechten; opslaan is wel beveiligd en zal niets wijzigen.
            </p>
          )}
        </header>

        <StatusTemplatesTabs
          statusTemplates={statusTemplates}
          languages={LANGUAGES}
          onSaveTemplate={actionSaveTemplate}
          // optioneel: kun je nog gebruiken in de component om knoppen te disablen
          canEdit={!canWrite}
        />

        {/* OVERIGE / GEVANCEERDE TEMPLATES */}
        <div className="pt-6 space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-md font-semibold">
              Overige e-mailtemplates (geavanceerd)
            </h3>
            <span className="text-xs text-gray-500">
              Templates waarvan de <code>key</code> geen orderstatus is.
            </span>
          </div>

          {Object.keys(templatesByKey).length === 0 ? (
            <p className="text-sm text-gray-500">
              Er zijn momenteel geen extra e-mailtemplates buiten de
              orderstatussen.
            </p>
          ) : (
            <div className="space-y-5">
              {Object.entries(templatesByKey).map(([key, list]) => (
                <div key={key} className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-sm font-semibold">
                      Template key: <code>{key}</code>
                    </h4>
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
                        <input
                          type="hidden"
                          name="template_id"
                          value={tpl.id}
                        />
                        <input
                          type="hidden"
                          name="template_key"
                          value={tpl.key}
                        />
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
                              ? new Date(tpl.updated_at).toLocaleString(
                                  "nl-BE"
                                )
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
                            disabled={!canWrite}
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
                            placeholder="HTML-template met placeholders zoals {{full_name}}, {{details_table}}…"
                            disabled={!canWrite}
                          />
                          <span className="text-xs text-gray-500">
                            Volledige HTML-template. Beschikbare variabelen
                            o.a.: <code>{`{{full_name}}`}</code>,{" "}
                            <code>{`{{order_code}}`}</code>,{" "}
                            <code>{`{{details_table}}`}</code>,{" "}
                            <code>{`{{delivery_block}}`}</code>,{" "}
                            <code>{`{{payout_block}}`}</code>,{" "}
                            <code>{`{{next_steps}}`}</code>,{" "}
                            <code>{`{{disclaimer_html}}`}</code>.
                          </span>
                        </label>

                        <div className="pt-1 flex justify-end">
                          <button
                            type="submit"
                            className="bb-btn primary h-8 text-xs px-3"
                            disabled={!canWrite}
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
        </div>
      </section>
    </div>
  );
}
