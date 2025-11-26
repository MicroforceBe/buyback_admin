import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";
import StatusTemplatesTabs from "../StatusTemplatesTabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Zelfde types als eerder
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

// Deze keys moeten overeenkomen met de orderstatussen
const ORDER_STATUS_KEYS: StatusMeta[] = [
  { key: "new", label: "Nieuw", description: "E-mail wanneer een nieuwe buyback aanvraag wordt aangemaakt." },
  { key: "received_store", label: "Ontvangen in winkel", description: "E-mail wanneer toestel in winkel is ontvangen." },
  { key: "label_created", label: "Label aangemaakt", description: "" },
  { key: "shipment_received", label: "Zending ontvangen", description: "" },
  { key: "check_passed", label: "Controle OK", description: "" },
  { key: "check_failed", label: "Controle NOK", description: "" },
  { key: "done", label: "Afgehandeld", description: "" },
];

// -------- DATA LOADERS ---------

async function loadEmailTemplates(): Promise<TemplateRow[]> {
  const { data } = await supabaseAdmin
    .from("buyback_email_templates")
    .select("*")
    .order("id");

  return (data || []).map((row: any) => ({
    id: row.id,
    key: row.key ?? row.type ?? "",
    language: row.language ?? row.locale ?? row.lang ?? "nl",
    subject: row.subject ?? "",
    body_html: row.body_html ?? "",
    updated_at: row.updated_at ?? null,
  }));
}

// -------- SERVER ACTION ---------

async function actionSaveTemplate(formData: FormData) {
  "use server";

  const idRaw = (formData.get("template_id") as string) || "";
  const id = idRaw && idRaw !== "0" ? Number(idRaw) : undefined;

  const payload = {
    id,
    key: (formData.get("template_key") as string).trim(),
    language: (formData.get("template_language") as string).trim() || "nl",
    subject: formData.get("subject") as string,
    body_html: formData.get("body_html") as string,
    updated_at: new Date().toISOString(),
  };

  await supabaseAdmin.from("buyback_email_templates").upsert(payload);
  revalidatePath("/admin/settings/email-templates");

  return { ok: true };
}

// -------- PAGE ---------

export default async function EmailTemplatesPage() {
  const templates = await loadEmailTemplates();

  const languages = Array.from(new Set(templates.map((t) => t.language))).sort();
  const LANGUAGES = languages.length ? languages : ["nl"];
  const statusKeys = new Set(ORDER_STATUS_KEYS.map((s) => s.key));

  const statusTemplates = ORDER_STATUS_KEYS.map((status) => ({
    ...status,
    rows: LANGUAGES.map((lang) => {
      const found = templates.find((t) => t.key === status.key && t.language === lang);
      return (
        found || {
          id: 0,
          key: status.key,
          language: lang,
          subject: "",
          body_html: "",
          updated_at: null,
          _isNew: true,
        }
      );
    }),
  }));

  const templatesByKey = templates.reduce<Record<string, TemplateRow[]>>(
    (acc, t) => {
      if (!statusKeys.has(t.key)) {
        acc[t.key] = acc[t.key] || [];
        acc[t.key].push(t);
      }
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Email Templates</h2>

      <StatusTemplatesTabs
        statusTemplates={statusTemplates}
        languages={LANGUAGES}
        onSaveTemplate={actionSaveTemplate}
      />

      {/* overige templates */}
      <section className="pt-6">
        <h3 className="font-semibold mb-2">Overige templates</h3>
        {Object.keys(templatesByKey).length === 0 && (
          <p className="text-sm text-gray-500">Geen extra templates.</p>
        )}

        {Object.entries(templatesByKey).map(([key, list]) => (
          <div key={key} className="space-y-3">
            <h4 className="font-medium">Key: {key}</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {list.map((tpl) => (
                <form key={tpl.id} action={actionSaveTemplate} className="p-3 border rounded bg-gray-50 space-y-3">
                  <input type="hidden" name="template_id" value={tpl.id} />
                  <input type="hidden" name="template_key" value={tpl.key} />
                  <input type="hidden" name="template_language" value={tpl.language} />

                  <label className="block text-sm">
                    Onderwerp
                    <input
                      className="bb-input h-9 text-sm mt-1"
                      name="subject"
                      defaultValue={tpl.subject ?? ""}
                    />
                  </label>

                  <label className="block text-sm">
                    HTML Body
                    <textarea
                      name="body_html"
                      defaultValue={tpl.body_html ?? ""}
                      rows={6}
                      className="bb-input text-sm mt-1"
                    />
                  </label>

                  <button className="bb-btn primary h-8 text-xs px-3">Opslaan</button>
                </form>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
