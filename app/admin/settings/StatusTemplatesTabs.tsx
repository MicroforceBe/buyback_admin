// app/admin/settings/StatusTemplatesTabs.tsx
"use client";

import { useState } from "react";

type TemplateRow = {
  id: number;
  key: string;
  language: string;
  subject: string | null;
  body_html: string | null;
  updated_at: string | null;
  _isNew?: boolean;
};

type StatusTemplateGroup = {
  key: string;
  label: string;
  description: string;
  rows: TemplateRow[];
};

type Props = {
  statusTemplates: StatusTemplateGroup[];
  languages: string[];
  onSaveTemplate: (formData: FormData) => Promise<any>;
};

type VariableDef = {
  code: string;
  label: string;
  description?: string;
};

const VARIABLE_GROUPS: { title: string; vars: VariableDef[] }[] = [
  {
    title: "Klant & order",
    vars: [
      { code: "{{first_name}}", label: "Voornaam" },
      { code: "{{last_name}}", label: "Achternaam" },
      { code: "{{full_name}}", label: "Volledige naam" },
      { code: "{{order_code}}", label: "Ordercode" },
      { code: "{{email}}", label: "E-mailadres klant" },
    ],
  },
  {
    title: "Merk & branding",
    vars: [
      { code: "{{brand_name}}", label: "Merknaam" },
      { code: "{{brand_color}}", label: "Merk-kleur (hex)" },
      { code: "{{logo_url}}", label: "Logo URL" },
      { code: "{{disclaimer_html}}", label: "Disclaimer (HTML)" },
    ],
  },
  {
    title: "Toestel & details",
    vars: [
      { code: "{{model}}", label: "Modelnaam" },
      { code: "{{capacity_gb}}", label: "Opslag (GB)" },
      {
        code: "{{details_table}}",
        label: "Detailtabel",
        description: "HTML-tabel met toestel + richtprijs.",
      },
    ],
  },
  {
    title: "Levering & tracking",
    vars: [
      {
        code: "{{delivery_block}}",
        label: "Leveringsblok",
        description: "Tekstblok over verzending / inleveren in winkel.",
      },
      { code: "{{tracking_code}}", label: "Tracking code" },
      { code: "{{tracking_url}}", label: "Tracking URL" },
      { code: "{{label_pdf_url}}", label: "Label PDF URL" },
    ],
  },
  {
    title: "Uitbetaling & vervolg",
    vars: [
      {
        code: "{{payout_block}}",
        label: "Uitbetalingsblok",
        description: "Tekstblok met info over voucher / overschrijving.",
      },
      {
        code: "{{next_steps}}",
        label: "Volgende stappen",
        description: "Tekstblok met wat de klant kan verwachten.",
      },
      { code: "{{iban}}", label: "Rekeningnummer IBAN" },
    ],
  },
];

type ActiveField = HTMLInputElement | HTMLTextAreaElement | null;

export default function StatusTemplatesTabs({
  statusTemplates,
  languages,
  onSaveTemplate,
}: Props) {
  const [activeKey, setActiveKey] = useState<string>(
    statusTemplates[0]?.key ?? ""
  );

  // Huidig actieve statusgroep
  const activeGroup =
    statusTemplates.find((g) => g.key === activeKey) ?? statusTemplates[0];

  // Laatst gefocuste input/textarea (voor variabele insert & preview & editor-buttons)
  const [activeFieldEl, setActiveFieldEl] = useState<ActiveField>(null);

  // HTML preview content
  const [previewHtml, setPreviewHtml] = useState<string>("");

  function handleVariableClick(code: string) {
    const el = activeFieldEl;
    if (!el) return;

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const current = el.value ?? "";

    const next =
      current.slice(0, start) + code + current.slice(end, current.length);

    el.value = next;

    const newPos = start + code.length;
    el.selectionStart = newPos;
    el.selectionEnd = newPos;
    el.focus();
  }

  function handlePreviewClick() {
    const el = activeFieldEl;
    if (!el) return;

    // alleen preview uit de HTML body textarea
    if (
      el.tagName === "TEXTAREA" &&
      el.getAttribute("name") === "body_html"
    ) {
      setPreviewHtml(el.value || "");
    }
  }

  /** Eenvoudige “HTML editor”-functie: wrap selectie in een tag */
  function wrapSelection(tag: string, attrs?: string) {
    const el = activeFieldEl;
    if (!el) return;
    if (
      el.tagName !== "TEXTAREA" ||
      el.getAttribute("name") !== "body_html"
    ) {
      return;
    }

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const current = el.value ?? "";
    const selected = current.slice(start, end) || "tekst";

    const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
    const closeTag = `</${tag}>`;

    const next =
      current.slice(0, start) +
      openTag +
      selected +
      closeTag +
      current.slice(end);

    el.value = next;

    const newPos = start + openTag.length + selected.length + closeTag.length;
    el.selectionStart = newPos;
    el.selectionEnd = newPos;
    el.focus();
  }

  function insertSnippet(snippet: string) {
    const el = activeFieldEl;
    if (!el) return;
    if (
      el.tagName !== "TEXTAREA" ||
      el.getAttribute("name") !== "body_html"
    ) {
      return;
    }

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const current = el.value ?? "";

    const next =
      current.slice(0, start) + snippet + current.slice(end, current.length);

    el.value = next;

    const newPos = start + snippet.length;
    el.selectionStart = newPos;
    el.selectionEnd = newPos;
    el.focus();
  }

  if (!activeGroup) {
    return (
      <p className="text-sm text-gray-500">
        Geen status-templates gevonden om te bewerken.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b border-gray-200 flex flex-wrap gap-2">
        {statusTemplates.map((status) => {
          const isActive = status.key === activeKey;
          return (
            <button
              key={status.key}
              type="button"
              onClick={() => setActiveKey(status.key)}
              className={[
                "px-3 py-1.5 text-sm rounded-t-md border-b-2",
                isActive
                  ? "border-sky-500 text-sky-600 font-medium bg-sky-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              {status.label}
            </button>
          );
        })}
      </div>

      {/* Beschrijving */}
      <div className="text-xs text-gray-500">
        <p>{activeGroup.description}</p>
        <p className="mt-1">
          1 template per taal. Actieve talen:{" "}
          {languages.map((lang, idx) => (
            <span key={lang}>
              {idx > 0 ? ", " : ""}
              <code>{lang}</code>
            </span>
          ))}
        </p>
      </div>

      {/* Forms (breed) */}
      <div className="grid grid-cols-1 gap-4">
        {activeGroup.rows.map((tpl) => (
          <form
            key={`${tpl.key}-${tpl.language}`}
            action={onSaveTemplate}
            className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/60"
          >
            <input type="hidden" name="template_id" value={tpl.id ?? 0} />
            <input type="hidden" name="template_key" value={tpl.key} />
            <input
              type="hidden"
              name="template_language"
              value={tpl.language}
            />

            <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
              <span>
                Key: <code>{tpl.key}</code> • Taal: <code>{tpl.language}</code>
              </span>
              <span>
                Laatst bijgewerkt:{" "}
                {tpl.updated_at
                  ? new Date(tpl.updated_at).toLocaleString("nl-BE")
                  : "—"}
              </span>
            </div>

            {/* Onderwerp */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Onderwerp</span>
              <input
                name="subject"
                defaultValue={tpl.subject ?? ""}
                className="bb-input h-9 text-sm px-2"
                placeholder="bv. [{{brand_name}}] Bevestiging buyback-aanvraag {{order_code}}"
                onFocus={(e) => setActiveFieldEl(e.currentTarget)}
              />
              <span className="text-xs text-gray-500">
                Placeholders: <code>{`{{first_name}}`}</code>,{" "}
                <code>{`{{order_code}}`}</code>,{" "}
                <code>{`{{brand_name}}`}</code>…
              </span>
            </label>

            {/* HTML-editor toolbar + textarea */}
            <label className="flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-medium">HTML body</span>
                <div className="flex flex-wrap items-center gap-1">
                  {/* Simpele “HTML editor” knoppen */}
                  <button
                    type="button"
                    onClick={() => wrapSelection("strong")}
                    className="text-xs px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50"
                  >
                    &lt;strong&gt;
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapSelection("em")}
                    className="text-xs px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50"
                  >
                    &lt;em&gt;
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapSelection("h2")}
                    className="text-xs px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50"
                  >
                    &lt;h2&gt;
                  </button>
                  <button
                    type="button"
                    onClick={() => wrapSelection("p")}
                    className="text-xs px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50"
                  >
                    &lt;p&gt;
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      insertSnippet("<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n</ul>\n")
                    }
                    className="text-xs px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50"
                  >
                    &lt;ul&gt;
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const url = window.prompt("URL voor link:");
                      if (!url) return;
                      wrapSelection("a", `href="${url}" style="color:#0ea5e9;"`);
                    }}
                    className="text-xs px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50"
                  >
                    &lt;a&gt;
                  </button>

                  <button
                    type="button"
                    onClick={handlePreviewClick}
                    className="text-xs px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 ml-1"
                  >
                    Preview HTML
                  </button>
                </div>
              </div>

              <textarea
                name="body_html"
                defaultValue={tpl.body_html ?? ""}
                rows={18}
                className="bb-input text-xs px-2 py-2 font-mono resize-y min-h-[260px]"
                placeholder="HTML-template met placeholders zoals {{full_name}}, {{details_table}}, {{delivery_block}}…"
                onFocus={(e) => setActiveFieldEl(e.currentTarget)}
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

      {/* Beschikbare variabelen – volledig zichtbaar (geen scroll) */}
      <section className="border border-gray-200 rounded-lg p-3 bg-gray-50/80 space-y-3">
        <h3 className="text-sm font-semibold">Beschikbare variabelen</h3>
        <p className="text-xs text-gray-500">
          Klik op een variabele om de placeholder in te voegen op de huidige
          cursorpositie in het onderwerp of de HTML body.
        </p>

        <div className="space-y-3">
          {VARIABLE_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1.5">
              <h4 className="text-xs font-semibold text-gray-600">
                {group.title}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {group.vars.map((v) => (
                  <button
                    key={v.code}
                    type="button"
                    onClick={() => handleVariableClick(v.code)}
                    className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white hover:bg-sky-50 hover:border-sky-400 whitespace-nowrap"
                    title={v.description || v.label}
                  >
                    {v.label}{" "}
                    <span className="text-[10px] text-gray-500">
                      ({v.code})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HTML preview – onder het template blok */}
      <section className="border border-gray-200 rounded-lg bg-white">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
          <h3 className="text-sm font-semibold">HTML preview</h3>
          <span className="text-xs text-gray-400">
            Gebaseerd op de laatst geklikte <strong>Preview HTML</strong>.
          </span>
        </div>
        <div className="p-3 min-h-[160px] max-h-[420px] overflow-auto bg-white">
          {previewHtml ? (
            <div
              className="text-sm leading-relaxed"
              // Admin-only: HTML komt van jou, dus ok
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <p className="text-xs text-gray-400">
              Nog geen preview. Bewerk de HTML-body en klik op{" "}
              <strong>Preview HTML</strong>.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
