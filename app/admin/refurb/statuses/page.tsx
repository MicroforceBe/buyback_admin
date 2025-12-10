// app/admin/refurb/statuses/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import {
  createRefurbStatusFromForm,
  deleteRefurbStatusFromForm,
} from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RefurbStatusRow = {
  id: string;
  code: string;
  label: string;
  sort_order: number | null;
  active: boolean;
};

async function getStatuses(): Promise<RefurbStatusRow[]> {
  const { data, error } = await supabaseAdmin
    .from("refurb_statuses")
    .select("id, code, label, sort_order, active")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    console.error("[REFURB] getStatuses error", error);
    return [];
  }

  return (data || []) as RefurbStatusRow[];
}

export default async function RefurbStatusesPage() {
  const user = await getCurrentAdminUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold mb-2">Refurb statussen</h1>
        <p className="text-sm text-red-600">
          Je hebt geen toegang tot dit onderdeel (enkel voor admins).
        </p>
      </div>
    );
  }

  const statuses = await getStatuses();

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Refurb statussen</h1>
        <p className="text-xs text-slate-500 mt-1">
          Beheer de mogelijke refurb status waardes voor recepties en toestellen.
        </p>
      </div>

      {/* Nieuwe status aanmaken */}
      <div className="border rounded-md bg-white p-3 text-xs space-y-2">
        <h2 className="text-sm font-semibold mb-1">Nieuwe status toevoegen</h2>
        <form
          action={createRefurbStatusFromForm}
          className="flex flex-wrap gap-2 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Code*</label>
            <input
              name="code"
              className="bb-input h-8 text-xs px-2"
              placeholder="bv. in_check"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Label*</label>
            <input
              name="label"
              className="bb-input h-8 text-xs px-2"
              placeholder="bv. In controle"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Sort order</label>
            <input
              type="number"
              name="sort_order"
              className="bb-input h-8 text-xs px-2 w-24"
              placeholder="10"
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
              <th className="px-2 py-1 border text-left">Label</th>
              <th className="px-2 py-1 border text-left">Code</th>
              <th className="px-2 py-1 border text-left">Sort order</th>
              <th className="px-2 py-1 border text-left">Actief</th>
              <th className="px-2 py-1 border text-right">Actie</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((st) => (
              <tr key={st.id} className="border-t">
                <td className="px-2 py-1 border">{st.label}</td>
                <td className="px-2 py-1 border">
                  <code className="text-[11px] bg-slate-50 px-1 py-0.5 rounded">
                    {st.code}
                  </code>
                </td>
                <td className="px-2 py-1 border">
                  {st.sort_order ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-2 py-1 border">
                  {st.active ? (
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
                  <form action={deleteRefurbStatusFromForm}>
                    <input type="hidden" name="id" value={st.id} />
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
            {statuses.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-2 py-3 text-[11px] text-slate-500 text-center"
                >
                  Nog geen refurb statussen gedefinieerd.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
