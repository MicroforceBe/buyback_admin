// app/admin/settings/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { actionSaveBranding } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BrandingRow = {
  brand_name: string | null;
  brand_logo_url: string | null;
  mail_brand_name: string | null;
  mail_from: string | null;
  mail_reply_to: string | null;
  email_disclaimer_html: string | null;
};

async function loadBranding() {
  const { data, error } = await supabaseAdmin
    .from("buyback_settings")
    .select(
      [
        "brand_name",
        "brand_logo_url",
        "mail_brand_name",
        "mail_from",
        "mail_reply_to",
        "email_disclaimer_html",
      ].join(",")
    )
    .eq("key", "branding")
    .single();

  if (error) {
    console.warn("[SETTINGS][branding] load warning:", error.message);
  }

  const row = (data as Partial<BrandingRow> | null) ?? {};

  return {
    brand_name: row.brand_name ?? "",
    brand_logo_url: row.brand_logo_url ?? "",
    mail_brand_name: row.mail_brand_name ?? "",
    mail_from: row.mail_from ?? "",
    mail_reply_to: row.mail_reply_to ?? "",
    email_disclaimer_html: row.email_disclaimer_html ?? "",
  };
}

export default async function SettingsPage() {
  const defaults = await loadBranding();

  const inputCls =
    "bb-input h-9 text-sm px-3 py-2 w-full border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200";
  const taCls =
    "bb-input text-sm px-3 py-2 w-full min-h-[140px] border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200";
  const btnPrimary =
    "bb-btn primary inline-flex items-center gap-2 px-4 h-10 rounded-md bg-blue-600 text-white hover:bg-blue-700";
  const card =
    "bg-white border border-gray-200 rounded-lg p-4 shadow-sm";

  return (
    <div className="w-full p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Instellingen</h1>
        <Link href="/admin" className="bb-btn h-9 text-xs px-3">← Terug</Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin/settings"
          aria-current="page"
          className="px-3 py-2 text-sm rounded-md border border-gray-300 bg-white font-medium"
        >
          Branding
        </Link>
        <Link
          href="/admin/settings/shops"
          className="px-3 py-2 text-sm rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700"
        >
          Shops
        </Link>
      </div>

      {/* Branding */}
      <div className={card}>
        <h2 className="text-lg font-semibold mb-1">Branding & E-mail</h2>
        <p className="text-sm text-gray-600 mb-4">
          Deze waarden worden gebruikt in je bevestigingsmails (Resend): merknaam + logo bovenaan, disclaimer onderaan.
        </p>

        <form action={actionSaveBranding} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Merknaam (in e-mails)
              </label>
              <input
                name="mail_brand_name"
                defaultValue={defaults.mail_brand_name}
                placeholder="bv. Microforce Buyback"
                className={inputCls}
              />
              <p className="text-xs text-gray-500 mt-1">
                Verschijnt in onderwerp en groet.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">MAIL_FROM</label>
                <input
                  name="mail_from"
                  defaultValue={defaults.mail_from}
                  placeholder="bv. klantenservice@microforce.be"
                  className={inputCls}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Afzender (domein moet in Resend geverifieerd zijn).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  MAIL_REPLY_TO (optioneel)
                </label>
                <input
                  name="mail_reply_to"
                  defaultValue={defaults.mail_reply_to}
                  placeholder="bv. support@microforce.be"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Brand name (UI)</label>
              <input
                name="brand_name"
                defaultValue={defaults.brand_name}
                placeholder="bv. Microforce"
                className={inputCls}
              />
              <p className="text-xs text-gray-500 mt-1">
                Optioneel, voor intern gebruik of UI.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Logo-URL</label>
              <input
                name="brand_logo_url"
                defaultValue={defaults.brand_logo_url}
                placeholder="https://…/logo.png"
                className={inputCls}
              />
              <p className="text-xs text-gray-500 mt-1">
                Transparante PNG, ~600px breed aangeraden.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              E-mail disclaimer (HTML toegestaan)
            </label>
            <textarea
              name="email_disclaimer_html"
              defaultValue={defaults.email_disclaimer_html}
              placeholder="bv. Dit is een automatische bevestiging…"
              className={taCls}
            />
            <p className="text-xs text-gray-500 mt-1">
              Wordt onderaan elke bevestigingsmail toegevoegd.
            </p>
          </div>

          <div className="flex items-center justify-end">
            <button type="submit" className={btnPrimary}>💾 Bewaren</button>
          </div>
        </form>
      </div>

      {defaults.brand_logo_url ? (
        <div className={card}>
          <h3 className="text-sm font-medium mb-2">Logo-preview</h3>
          <img
            src={defaults.brand_logo_url}
            alt="Logo preview"
            className="h-12 w-auto object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
