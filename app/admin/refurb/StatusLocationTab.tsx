// app/admin/refurb/StatusLocationTab.tsx
import {
  RefurbStatusOption,
  RefurbLocationOption,
  saveRefurbStatusRow,
  deleteRefurbStatusRow,
  setDefaultRefurbStatus,
  saveRefurbLocationRow,
  deleteRefurbLocationRow,
  setDefaultRefurbLocation,
} from "./settings//settingsActions";

type Props = {
  initialStatuses: RefurbStatusOption[];
  initialLocations: RefurbLocationOption[];
};

export default function StatusLocationTab({
  initialStatuses,
  initialLocations,
}: Props) {
  return (
    <div className="space-y-8 text-xs">
      {/* STATUSSEN */}
      <section className="border rounded-md p-4">
        <h2 className="font-semibold text-sm mb-2">Refurb statussen</h2>
        <p className="text-[11px] text-slate-500 mb-3">
          Beheer de mogelijke statussen in de refurb receptie. Duid één status
          als <strong>default</strong> aan; bij import of plakken wordt die
          gebruikt als er geen status meegegeven is.
        </p>

        <table className="min-w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase">
            <tr>
              <th className="px-2 py-1 border text-left">Label</th>
              <th className="px-2 py-1 border text-left">Value</th>
              <th className="px-2 py-1 border text-center">Sort</th>
              <th className="px-2 py-1 border text-center">Default</th>
              <th className="px-2 py-1 border text-right">Acties</th>
            </tr>
          </thead>
          <tbody>
            {initialStatuses.map((row) => (
              <tr key={row.id} className="border-t">
                <td colSpan={5} className="px-2 py-1 border">
                  {/* Eén form per rij, met meerdere server actions via formAction */}
                  <form
                    action={saveRefurbStatusRow}
                    className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_70px_70px_auto] gap-2 items-center"
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

                    {/* Default toggle */}
                    <button
                      type="submit"
                      name="default_btn"
                      formAction={setDefaultRefurbStatus}
                      className={`inline-flex items-center justify-center h-7 rounded-full text-[10px] ${
                        row.is_default
                          ? "bg-emerald-500 text-white px-2"
                          : "bg-slate-100 text-slate-500 px-2"
                      }`}
                      title="Maak deze status default"
                    >
                      {row.is_default ? "✓ default" : "default"}
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
                        formAction={deleteRefurbStatusRow}
                        className="bb-btn text-[11px] px-2"
                      >
                        Del
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}

            {/* Nieuwe status */}
            <tr className="border-t bg-slate-50/40">
              <td colSpan={5} className="px-2 py-2">
                <form
                  action={saveRefurbStatusRow}
                  className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_70px_auto] gap-2 items-center"
                >
                  <input
                    name="label"
                    placeholder="Nieuwe status label"
                    className="bb-input h-7 text-[11px] px-1 w-full"
                  />
                  <input
                    name="value"
                    placeholder="waarde (bv. received_store)"
                    className="bb-input h-7 text-[11px] px-1 w-full"
                  />
                  <input
                    name="sort_order"
                    type="number"
                    defaultValue="0"
                    className="bb-input h-7 text-[11px] px-1 w-full text-center"
                  />
                  <button
                    type="submit"
                    className="bb-btn text-[11px] px-3 justify-self-end"
                  >
                    + Status
                  </button>
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* LOCATIONS */}
      <section className="border rounded-md p-4">
        <h2 className="font-semibold text-sm mb-2">Refurb locations</h2>
        <p className="text-[11px] text-slate-500 mb-3">
          Beheer de mogelijke locations. De <strong>default</strong> wordt
          gebruikt bij import/paste wanneer er geen locatie meegegeven is.
        </p>

        <table className="min-w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-[11px] uppercase">
            <tr>
              <th className="px-2 py-1 border text-left">Label</th>
              <th className="px-2 py-1 border text-left">Value</th>
              <th className="px-2 py-1 border text-center">Sort</th>
              <th className="px-2 py-1 border text-center">Default</th>
              <th className="px-2 py-1 border text-right">Acties</th>
            </tr>
          </thead>
          <tbody>
            {initialLocations.map((row) => (
              <tr key={row.id} className="border-t">
                <td colSpan={5} className="px-2 py-1 border">
                  <form
                    action={saveRefurbLocationRow}
                    className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_70px_70px_auto] gap-2 items-center"
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
                      formAction={setDefaultRefurbLocation}
                      className={`inline-flex items-center justify-center h-7 rounded-full text-[10px] ${
                        row.is_default
                          ? "bg-emerald-500 text-white px-2"
                          : "bg-slate-100 text-slate-500 px-2"
                      }`}
                      title="Maak deze locatie default"
                    >
                      {row.is_default ? "✓ default" : "default"}
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
                        formAction={deleteRefurbLocationRow}
                        className="bb-btn text-[11px] px-2"
                      >
                        Del
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}

            {/* Nieuwe locatie */}
            <tr className="border-t bg-slate-50/40">
              <td colSpan={5} className="px-2 py-2">
                <form
                  action={saveRefurbLocationRow}
                  className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_70px_auto] gap-2 items-center"
                >
                  <input
                    name="label"
                    placeholder="Nieuwe location label"
                    className="bb-input h-7 text-[11px] px-1 w-full"
                  />
                  <input
                    name="value"
                    placeholder="waarde (bv. warehouse_1)"
                    className="bb-input h-7 text-[11px] px-1 w-full"
                  />
                  <input
                    name="sort_order"
                    type="number"
                    defaultValue="0"
                    className="bb-input h-7 text-[11px] px-1 w-full text-center"
                  />
                  <button
                    type="submit"
                    className="bb-btn text-[11px] px-3 justify-self-end"
                  >
                    + Location
                  </button>
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
