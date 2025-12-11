// app/admin/refurb/locations/page.tsx
import { revalidatePath } from "next/cache";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import {
  getRefurbLocationOptions,
  saveRefurbLocationRow,
  deleteRefurbLocationRow,
  setDefaultRefurbLocation,
  type RefurbLocationOption,
} from "../settingsActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Wrappers rond de settingsActions zodat de pagina direct ververst
async function saveLocationRowAction(formData: FormData) {
  "use server";
  await saveRefurbLocationRow(formData);
  revalidatePath("/admin/refurb/locations");
}

async function deleteLocationRowAction(formData: FormData) {
  "use server";
  await deleteRefurbLocationRow(formData);
  revalidatePath("/admin/refurb/locations");
}

async function setDefaultLocationAction(formData: FormData) {
  "use server";
  await setDefaultRefurbLocation(formData);
  revalidatePath("/admin/refurb/locations");
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

  const locations: RefurbLocationOption[] = await getRefurbLocationOptions();

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Refurb locaties</h1>
        <p className="text-xs text-slate-500 mt-1">
          Beheer de mogelijke refurb locaties (bv. Stock, Werkbank, RMA). De{" "}
          <strong>default</strong> wordt gebruikt bij import/paste wanneer er
          geen locatie meegegeven is.
        </p>
      </div>

      {/* Nieuwe locatie aanmaken */}
      <div className="border rounded-md bg-white p-3 text-xs space-y-2">
        <h2 className="text-sm font-semibold mb-1">Nieuwe locatie toevoegen</h2>
        <form
          action={saveLocationRowAction}
          className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_80px_auto] gap-2 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Label*</label>
            <input
              name="label"
              className="bb-input h-8 text-xs px-2"
              placeholder="bv. Werkbank"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Value*</label>
            <input
              name="value"
              className="bb-input h-8 text-xs px-2"
              placeholder="bv. workbench"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Sort order</label>
            <input
              type="number"
              name="sort_order"
              className="bb-input h-8 text-xs px-2 w-20 text-center"
              placeholder="10"
              defaultValue="0"
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

      {/* Overzicht + inline bewerken */}
      <div className="border rounded-md bg-white text-xs overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase">
            <tr>
              <th className="px-2 py-1 border text-left" colSpan={5}>
                <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_70px_90px_auto] gap-2 items-center">
                  <span>Label</span>
                  <span>Value</span>
                  <span className="text-center">Sort</span>
                  <span className="text-center">Default</span>
                  <span className="text-right">Acties</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {locations.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-2 py-1 border" colSpan={5}>
                  <form
                    action={saveLocationRowAction}
                    className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_70px_90px_auto] gap-2 items-center"
                  >
                    <input type="hidden" name="id" value={row.id} />

                    <input
                      name="label"
                      defaultValue={row.label}
                      className="bb-input h-7 text-[11px] px-1 w-full"
                    />
                    <input
                      name="value"
                      defaultValue={row.value}
                      className="bb-input h-7 text-[11px] px-1 w-full"
                    />
                    <input
                      name="sort_order"
                      defaultValue={row.sort_order.toString()}
                      className="bb-input h-7 text-[11px] px-1 w-full text-center"
                      type="number"
                    />

                    <button
                      type="submit"
                      name="default_btn"
                      formAction={setDefaultLocationAction}
                      className={`inline-flex items-center justify-center h-7 rounded-full text-[10px] ${
                        row.is_default
                          ? "bg-emerald-500 text-white px-3"
                          : "bg-slate-100 text-slate-500 px-3"
                      }`}
                      title="Maak deze locatie default"
                    >
                      {row.is_default ? "✓ default" : "default maken"}
                    </button>

                    <div className="flex justify-end gap-1">
                      <button
                        type="submit"
                        className="bb-btn text-[11px] px-2"
                      >
                        Bewaar
                      </button>
                      <button
                        type="submit"
                        formAction={deleteLocationRowAction}
                        className="bb-btn text-[11px] px-2"
                      >
                        Del
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}
            {locations.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-2 py-3 text-[11px] text-slate-500 text-center"
                >
                  Nog geen refurb locatie opties gedefinieerd.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
