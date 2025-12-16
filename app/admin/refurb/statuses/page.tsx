// app/admin/refurb/statuses/page.tsx
import { revalidatePath } from "next/cache";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import {
  getRefurbStatusOptions,
  saveRefurbStatusRow,
  deleteRefurbStatusRow,
  setDefaultRefurbStatus,
  getRefurbStatusTransitions,
  saveRefurbStatusTransitions,
  type RefurbStatusOption,
  type RefurbStatusTransitionsMap,
} from "../settingsActions";
import ColorPickerField from "./ColorPickerField";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Wrappers rond de settingsActions zodat de pagina direct ververst
async function saveStatusRowAction(formData: FormData) {
  "use server";
  await saveRefurbStatusRow(formData);
  revalidatePath("/admin/refurb/statuses");
}

async function deleteStatusRowAction(formData: FormData) {
  "use server";
  await deleteRefurbStatusRow(formData);
  revalidatePath("/admin/refurb/statuses");
}

async function setDefaultStatusAction(formData: FormData) {
  "use server";
  await setDefaultRefurbStatus(formData);
  revalidatePath("/admin/refurb/statuses");
}

async function saveTransitionsAction(formData: FormData) {
  "use server";
  const from_status_id = (formData.get("from_status_id") || "").toString();
  const to_status_ids = (formData.getAll("to_status_ids") || []).map((x) =>
    String(x)
  );

  await saveRefurbStatusTransitions({
    from_status_id,
    to_status_ids,
  });

  revalidatePath("/admin/refurb/statuses");
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

  const [statuses, transitions]: [RefurbStatusOption[], RefurbStatusTransitionsMap] =
    await Promise.all([getRefurbStatusOptions(), getRefurbStatusTransitions()]);

  const allowedSetFor = (fromId: string) => new Set(transitions[fromId] || []);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Refurb statussen</h1>
        <p className="text-xs text-slate-500 mt-1">
          Beheer de mogelijke refurb status opties voor recepties en toestellen.
          Je kan één status als <strong>default</strong> aanduiden; die wordt
          gebruikt wanneer er geen status meegegeven is bij import/paste.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          <strong>Nieuw:</strong> per status kan je nu via multi-checkbox aanduiden
          naar welke <strong>vervolgstatussen</strong> deze status mag veranderen.
        </p>
      </div>

      {/* Nieuwe status aanmaken */}
      <div className="border rounded-md bg-white p-3 text-xs space-y-2">
        <h2 className="text-sm font-semibold mb-1">Nieuwe status toevoegen</h2>
        <form
          action={saveStatusRowAction}
          className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_140px_80px_auto] gap-2 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Label*</label>
            <input
              name="label"
              className="bb-input h-8 text-xs px-2"
              placeholder="bv. Ontvangen in winkel"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Value / code*</label>
            <input
              name="value"
              className="bb-input h-8 text-xs px-2"
              placeholder="bv. received_store"
              required
            />
          </div>

          {/* kleur (synced picker + hex) */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-600">Kleur</label>
            <ColorPickerField defaultValue="#64748b" />
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

      {/* Overzicht + inline bewerken + transitions */}
      <div className="border rounded-md bg-white text-xs overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase">
            <tr>
              <th className="px-2 py-1 border text-left" colSpan={6}>
                <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_140px_70px_90px_auto] gap-2 items-center">
                  <span>Label</span>
                  <span>Value / code</span>
                  <span>Kleur</span>
                  <span className="text-center">Sort</span>
                  <span className="text-center">Default</span>
                  <span className="text-right">Acties</span>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {statuses.map((row) => {
              const allowed = allowedSetFor(row.id);

              return (
                <tr key={row.id} className="border-t">
                  <td className="px-2 py-2 border" colSpan={6}>
                    {/* Row edit form */}
                    <form
                      action={saveStatusRowAction}
                      className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_140px_70px_90px_auto] gap-2 items-center"
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

                      {/* Kleur synced (picker ↔ hex) */}
                      <ColorPickerField
                        defaultValue={(row as any).color ?? "#64748b"}
                        compact
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
                        formAction={setDefaultStatusAction}
                        className={`inline-flex items-center justify-center h-7 rounded-full text-[10px] ${
                          row.is_default
                            ? "bg-emerald-500 text-white px-3"
                            : "bg-slate-100 text-slate-500 px-3"
                        }`}
                        title="Maak deze status default"
                      >
                        {row.is_default ? "✓ default" : "default maken"}
                      </button>

                      <div className="flex justify-end gap-1">
                        <button type="submit" className="bb-btn text-[11px] px-2">
                          Bewaar
                        </button>
                        <button
                          type="submit"
                          formAction={deleteStatusRowAction}
                          className="bb-btn text-[11px] px-2"
                        >
                          Del
                        </button>
                      </div>
                    </form>

                    {/* Transitions (multi-checkbox) */}
                    <div className="mt-2 border-t pt-2">
                      <div className="text-[11px] font-medium text-slate-600 mb-1">
                        Mag veranderen naar:
                      </div>

                      <form action={saveTransitionsAction} className="flex flex-col gap-2">
                        <input type="hidden" name="from_status_id" value={row.id} />

                        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
                          {statuses
                            .filter((s) => s.id !== row.id)
                            .map((s) => (
                              <label key={s.id} className="flex items-center gap-2 text-[11px]">
                                <input
                                  type="checkbox"
                                  name="to_status_ids"
                                  value={s.id}
                                  defaultChecked={allowed.has(s.id)}
                                />
                                <span className="truncate" title={s.label}>
                                  {s.label}
                                </span>
                              </label>
                            ))}
                        </div>

                        <div className="flex justify-end">
                          <button type="submit" className="bb-btn text-[11px] px-2">
                            Bewaar vervolgstatussen
                          </button>
                        </div>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}

            {statuses.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-2 py-3 text-[11px] text-slate-500 text-center"
                >
                  Nog geen refurb status opties gedefinieerd.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
