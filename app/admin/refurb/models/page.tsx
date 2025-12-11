// app/admin/refurb/models/page.tsx
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import {
  getRefurbModelRows,
  saveRefurbModelRow,
  deleteRefurbModelRow,
} from "../modelsActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RefurbModelsPage() {
  const user = await getCurrentAdminUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold mb-2">Refurb modellen</h1>
        <p className="text-sm text-red-600">
          Je hebt geen toegang tot dit onderdeel (enkel voor admins).
        </p>
      </div>
    );
  }

  const models = await getRefurbModelRows();

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Refurb modellen</h1>
        <p className="text-xs text-slate-500 mt-1">
          Beheer de modellen. Gebruik{" "}
          <strong>model-zoekwoorden</strong> (gescheiden door komma&apos;s of
          puntkomma&apos;s) om automatisch het model van een toestel te
          bepalen op basis van SKU, beschrijving, enz.
        </p>
      </div>

      {/* Nieuw model */}
      <div className="border rounded-md bg-white p-3 text-xs space-y-2">
        <h2 className="text-sm font-semibold mb-1">Nieuw model toevoegen</h2>
        <form
          action={saveRefurbModelRow}
          className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_auto] gap-2 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Modelnaam*</label>
            <input
              name="name"
              className="bb-input h-8 text-xs px-2"
              placeholder="bv. iPhone 13 128GB"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">
              Zoekwoorden (komma of ; gescheiden)
            </label>
            <input
              name="search_keywords"
              className="bb-input h-8 text-xs px-2"
              placeholder="bv. iphone 13; a2633; 13/128"
            />
          </div>
          <button
            type="submit"
            className="bb-btn bb-btn-primary h-8 px-3 text-xs justify-self-end"
          >
            Toevoegen
          </button>
        </form>
      </div>

      {/* Overzicht + inline edit */}
      <div className="border rounded-md bg-white text-xs overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase">
            <tr>
              <th className="px-2 py-1 border text-left" colSpan={3}>
                <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_auto] gap-2 items-center">
                  <span>Modelnaam</span>
                  <span>Model-zoekwoorden</span>
                  <span className="text-right">Acties</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {models.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-2 py-1 border" colSpan={3}>
                  <form
                    action={saveRefurbModelRow}
                    className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_auto] gap-2 items-center"
                  >
                    <input type="hidden" name="id" value={row.id} />

                    <input
                      name="name"
                      defaultValue={row.name}
                      className="bb-input h-7 text-[11px] px-1 w-full"
                    />
                    <input
                      name="search_keywords"
                      defaultValue={row.search_keywords}
                      className="bb-input h-7 text-[11px] px-1 w-full"
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        type="submit"
                        className="bb-btn text-[11px] px-2"
                      >
                        Bewaar
                      </button>
                      <button
                        type="submit"
                        formAction={deleteRefurbModelRow}
                        className="bb-btn text-[11px] px-2"
                      >
                        Del
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-2 py-3 text-[11px] text-slate-500 text-center"
                >
                  Nog geen refurb modellen gedefinieerd.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
