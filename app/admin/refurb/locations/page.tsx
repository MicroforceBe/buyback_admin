// app/admin/refurb/locations/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import {
  createRefurbLocationFromForm,
  deleteRefurbLocationFromForm,
} from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RefurbLocationRow = {
  id: string;
  name: string;
  active: boolean;
};

async function getLocations(): Promise<RefurbLocationRow[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_locations")
    .select("id, name, active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[REFURB] getLocations error", error);
    return [];
  }

  return (data || []) as RefurbLocationRow[];
}

export default async function RefurbLocationsPage() {
  const user = await getCurrentAdminUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold mb-2">Refurb locaties</h1>
        <p className="text-sm text-red-600">
          Je hebt geen toegang tot dit onderdeel (enkel voor admins).
        </p>
      </div>
    );
  }

  const locations = await getLocations();

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Refurb locaties</h1>
        <p className="text-xs text-slate-500 mt-1">
          Beheer de mogelijke refurb locaties (bv. Stock, Werkbank, RMA).
        </p>
      </div>

      {/* Nieuwe locatie aanmaken */}
      <div className="border rounded-md bg-white p-3 text-xs space-y-2">
        <h2 className="text-sm font-semibold mb-1">Nieuwe locatie toevoegen</h2>
        <form
          action={createRefurbLocationFromForm}
          className="flex flex-wrap gap-2 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Naam*</label>
            <input
              name="name"
              className="bb-input h-8 text-xs px-2"
              placeholder="bv. Werkbank"
              required
            />
          </div>
          <button
            type="submit"
            className="bb-btn bb-btn-primary h-8 px-3 text-xs"
          >
            Toevoegen
          </button>
        </form>
      </div>

      {/* Overzicht */}
      <div className="border rounded-md bg-white text-xs overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase">
            <tr>
              <th className="px-2 py-1 border text-left">Naam</th>
              <th className="px-2 py-1 border text-left">Actief</th>
              <th className="px-2 py-1 border text-right">Actie</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <tr key={loc.id} className="border-t">
                <td className="px-2 py-1 border">{loc.name}</td>
                <td className="px-2 py-1 border">
                  {loc.active ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px]">
                      Actief
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-50 text-slate-500 px-2 py-0.5 text-[10px]">
                      Inactief
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 border text-right">
                  <form action={deleteRefurbLocationFromForm}>
                    <input type="hidden" name="id" value={loc.id} />
                    <button
                      type="submit"
                      className="text-[11px] text-red-600 hover:text-red-800"
                    >
                      Verwijderen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {locations.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-2 py-3 text-[11px] text-slate-500 text-center"
                >
                  Nog geen refurb locaties gedefinieerd.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
