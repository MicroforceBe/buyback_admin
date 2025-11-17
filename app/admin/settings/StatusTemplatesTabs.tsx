"use client";

import { useState } from "react";

type TemplateRowWithMeta = {
  id: number;
  key: string;
  language: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  updated_at: string | null;
  _isNew?: boolean;
};

type StatusWithTemplates = {
  key: string;
  label: string;
  description: string;
  rows: TemplateRowWithMeta[];
};

type Props = {
  statusTemplates: StatusWithTemplates[];
  // Server action doorgegeven als prop
  actionSaveTemplate: (formData: FormData) => void;
};

export default function StatusTemplatesTabs({
  statusTemplates,
  actionSaveTemplate,
}: Props) {
  const [activeKey, setActiveKey] = useState(
    statusTemplates[0]?.key ?? ""
  );

  const active =
    statusTemplates.find((s) => s.key === activeKey) ?? statusTemplates[0];

  if (!active) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Tabs header */}
      <div className="border-b border-gray-200">
        <div className="flex flex-wrap gap-1">
          {statusTemplates.map((status) => {
            const isActive = status.key === activeKey;
            return (
              <button
                key={status.key}
                type="button"
                onClick={() => setActiveKey(status.key)}
                className={
                  "px-3 py-1.5 text-xs md:text-sm rounded-t border-b-2 -mb-px transition-colors" +
                  (isActive
                    ? " border-sky-500 text-sky-700 bg-white"
                    : " border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300")
                }
              >
                {status.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actieve tab inhoud */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              <span>{active.label}</span>
              <code className="text-xs text-gray-500">{active.key}</code>
            </div>
            <p className="text-xs text-gray-500">{active.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {active.rows.map((tpl) => (
            <form
              key={`${tpl.key}-${tpl.language}`}
              action={actionSaveTemplate}
              className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/60"
            >
              {!tpl._isNew && tpl.id ? (
                <input type="hidden" name="template_id" value={tpl.id} />
              ) : null}
              <input type="hidden" name="template_key" value={tpl.key} />
              <input
                type="hidden"
                name="template_language"
                value={tpl.language}
              />

              <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                <span>
                  Status-key: <code>{tpl.key}</code> • Taal:{" "}
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
                  placeholder="bv. [{{brand_name}}] Update over je buyback-order {{order_code}}"
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
                  placeholder="HTML-template met placeholders zoals {{full_name}}, {{details_table}}, {{delivery_block}}, {{payout_block}}…"
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
                <span className="font-medium">Tekstversie (optional)</span>
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
    </div>
  );
}
