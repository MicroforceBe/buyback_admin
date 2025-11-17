"use client";

import { useRef, useState } from "react";

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

// Beschikbare placeholders rechts
const PLACEHOLDERS: { token: string; label: string; group?: string }[] = [
  { token: "{{first_name}}", label: "Voornaam", group: "Contact" },
  { token: "{{last_name}}", label: "Familienaam", group: "Contact" },
  { token: "{{full_name}}", label: "Volledige naam", group: "Contact" },
  { token: "{{email}}", label: "E-mailadres", group: "Contact" },

  { token: "{{order_code}}", label: "Ordercode", group: "Order" },
  { token: "{{order_date}}", label: "Orderdatum", group: "Order" },
  { token: "{{status}}", label: "Orderstatus (leesbaar)", group: "Order" },

  { token: "{{brand_name}}", label: "Merknaam / shopnaam", group: "Branding" },
  { token: "{{logo_url}}", label: "Logo URL", group: "Branding" },

  { token: "{{details_table}}", label: "Tabel met toesteldetails", group: "Blocks" },
  { token: "{{delivery_block}}", label: "Blok met verzend-/afleverinfo", group: "Blocks" },
  { token: "{{payout_block}}", label: "Blok met uitbetalingsinfo", group: "Blocks" },
  { token: "{{next_steps}}", label: "Volgende stappen (tekstblok)", group: "Blocks" },
  { token: "{{disclaimer_html}}", label: "Disclaimer (HTML)", group: "Blocks" },
];

export default function StatusTemplatesTabs({
  statusTemplates,
  actionSaveTemplate,
}: Props) {
  const [activeKey, setActiveKey] = useState(
    statusTemplates[0]?.key ?? ""
  );

  const active =
    statusTemplates.find((s) => s.key === activeKey) ?? statusTemplates[0];

  // Houd bij in welk veld de gebruiker het laatst aan het typen was
  const lastFocusedRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(
    null
  );

  if (!active) {
    return null;
  }

  function handleFieldFocus(
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    lastFocusedRef.current = e.target;
  }

  function insertToken(token: string) {
    const el = lastFocusedRef.current;
    if (!el) {
      return;
    }

    const value = el.value ?? "";
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;

    const newValue = value.slice(0, start) + token + value.slice(end);

    el.value = newValue;

    // cursor na de ingevoegde token plaatsen
    const cursorPos = start + token.length;
    el.selectionStart = cursorPos;
    el.selectionEnd = cursorPos;

    // Voor React/uncontrolled forms is dit genoeg; om zeker te zijn dat
    // eventuele listeners ook getriggerd worden, dispatchen we een input event.
    const event = new Event("input", { bubbles: true });
    el.dispatchEvent(event);
    el.focus();
  }

  // Groepeer placeholders per group voor wat meer structuur
  const groupedPlaceholders = PLACEHOLDERS.reduce<
    Record<string, { token: string; label: string }[]>
  >((acc, ph) => {
    const group = ph.group ?? "Overig";
    if (!acc[group]) acc[group] = [];
    acc[group].push({ token: ph.token, label: ph.label });
    return acc;
  }, {});

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
                {/* Enkel de orderstatus-naam, geen DB-key */}
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
              {/* Key laten we nog zien voor jou als dev; mag weg als je wil */}
              <code className="text-xs text-gray-500">{active.key}</code>
            </div>
            <p className="text-xs text-gray-500">{active.description}</p>
          </div>
        </div>

        {/* Linkerkolom: forms, rechterkolom: placeholders */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* LEFT: forms per taal */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                    onFocus={handleFieldFocus}
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
                    onFocus={handleFieldFocus}
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
                    onFocus={handleFieldFocus}
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

          {/* RIGHT: placeholder lijst */}
          <aside className="w-full lg:w-64 border border-dashed border-gray-200 rounded-lg p-3 bg-white/60 text-xs space-y-2">
            <div>
              <h4 className="font-semibold text-xs mb-1">
                Beschikbare variabelen
              </h4>
              <p className="text-[11px] text-gray-500 mb-1">
                Klik om een placeholder in te voegen op de plaats waar je aan
                het typen bent.
              </p>
            </div>

            <div className="space-y-2 max-h-80 overflow-auto pr-1">
              {Object.entries(groupedPlaceholders).map(
                ([group, items]) => (
                  <div key={group} className="space-y-1">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {group}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {items.map((ph) => (
                        <button
                          key={ph.token}
                          type="button"
                          onClick={() => insertToken(ph.token)}
                          className="px-1.5 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] font-mono"
                        >
                          {ph.token}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
