// app/admin/settings/page.tsx
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function fetchSettings() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_ADMIN_ORIGIN || ""}/api/admin/settings`, {
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) {
    return { brand_name: null, brand_color: null, logo_url: null, email_disclaimer: null };
  }
  return res.json();
}

export default async function AdminSettingsPage() {
  const settings = await fetchSettings();

  return (
    <div className="w-full p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Buyback instellingen</h1>
      </div>

      <p className="text-sm text-gray-600">
        Pas hier merknaam, kleur, logo en e-maildisclaimer aan. Deze instellingen sturen automatisch de inhoud van je bevestigingsmails.
      </p>

      <div className="border rounded-lg bg-white p-4">
        {/* SettingsForm is client-side; we geven beginsituatie mee */}
        <SettingsForm initialSettings={settings} />
      </div>
    </div>
  );
}
