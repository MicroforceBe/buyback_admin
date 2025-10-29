import { actionSaveBranding } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SettingsBrandingPage() {
  // (Optioneel) huidige waarden ophalen om defaults te tonen
  // Laat het licht; je kan hier supabaseAdmin select('brand_name, logo_url, email_disclaimer') doen.

  return (
    <div className="space-y-4">
      <div className="border rounded-lg bg-white p-4">
        <h2 className="text-lg font-medium mb-3">Branding & e-mail</h2>

        <form action={actionSaveBranding} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col">
              <span className="text-sm text-gray-600 mb-1">Merknaam</span>
              <input
                name="brand_name"
                className="bb-input h-9 text-sm px-2"
                placeholder="bv. Microforce Buyback"
              />
            </label>

            <label className="flex flex-col">
              <span className="text-sm text-gray-600 mb-1">Logo URL</span>
              <input
                name="logo_url"
                className="bb-input h-9 text-sm px-2"
                placeholder="https://…/logo.png"
              />
              <span className="text-[11px] text-gray-500 mt-1">
                Tip: upload een logo via <em>Uploads</em> en plak hier de absolute URL.
              </span>
            </label>
          </div>

          <label className="flex flex-col">
            <span className="text-sm text-gray-600 mb-1">E-mail disclaimer</span>
            <textarea
              name="email_disclaimer"
              rows={4}
              className="bb-textarea text-sm px-2 py-2"
              placeholder="Jouw disclaimer …"
            />
          </label>

          <div className="flex gap-2">
            <button type="submit" className="bb-btn primary h-9 text-sm px-3">Bewaren</button>
            <a href="/admin/uploads" className="bb-btn subtle h-9 text-sm px-3">Naar Uploads</a>
          </div>
        </form>
      </div>
    </div>
  );
}
