// app/admin/refurb/new/page.tsx
import { createRefurbReception } from "../actions";
import { getCurrentAdminUser } from "@/lib/getCurrentAdminUser";
import SupplierField from "../SupplierField";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewRefurbReceptionPage() {
  const user = await getCurrentAdminUser();

  // simpele admin-check; pas aan naar je echte rol/permissie model indien nodig
  const canCreateSupplier = user?.role === "admin";

  return (
    <div className="p-4 max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Nieuwe Refurb reception</h1>
        <p className="text-xs text-slate-500 mt-1">
          Maak een nieuwe receptie aan voor een leverancier. Daarna kun je in de tabel
          toestellen plakken of importeren.
        </p>
      </div>

      <form action={createRefurbReception} className="space-y-3 text-sm">
        <div className="grid grid-cols-1 gap-3">
          {/* Receptie nr */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reception_number"
              className="text-[11px] font-medium text-slate-600 uppercase"
            >
              Receptie nr
            </label>
            <input
              id="reception_number"
              name="reception_number"
              type="text"
              required
              className="bb-input h-9 text-sm px-2"
              placeholder="Bijv. RFB-2025-0001"
            />
          </div>

          {/* Receptiedatum */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reception_date"
              className="text-[11px] font-medium text-slate-600 uppercase"
            >
              Receptiedatum
            </label>
            <input
              id="reception_date"
              name="reception_date"
              type="date"
              required
              className="bb-input h-9 text-sm px-2"
            />
          </div>

          {/* Leverancier (via SupplierField) */}
          <SupplierField canCreate={!!canCreateSupplier} />

          {/* BTW-regeling */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600 uppercase">
              BTW regeling
            </span>
            <div className="flex gap-4 text-xs">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="vat_scheme"
                  value="margin"
                  defaultChecked
                  className="h-3 w-3"
                />
                <span>Margin VAT</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="vat_scheme"
                  value="normal"
                  className="h-3 w-3"
                />
                <span>Normal VAT</span>
              </label>
            </div>
          </div>

          {/* Supplier invoice nr */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="supplier_invoice_nr"
              className="text-[11px] font-medium text-slate-600 uppercase"
            >
              Supplier invoice nr
            </label>
            <input
              id="supplier_invoice_nr"
              name="supplier_invoice_nr"
              type="text"
              required
              className="bb-input h-9 text-sm px-2"
              placeholder="Factuurnummer van leverancier"
            />
          </div>

          {/* Intern factuurnr (optioneel) */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="internal_invoice_nr"
              className="text-[11px] font-medium text-slate-600 uppercase"
            >
              Intern factuurnr (optioneel)
            </label>
            <input
              id="internal_invoice_nr"
              name="internal_invoice_nr"
              type="text"
              className="bb-input h-9 text-sm px-2"
              placeholder="Eigen referentie, mag leeg blijven"
            />
          </div>
        </div>

        <div className="pt-2 flex gap-2">
          <button
            type="submit"
            className="bb-btn bb-btn-primary text-sm px-4 h-9"
          >
            Receptie aanmaken
          </button>
        </div>
      </form>
    </div>
  );
}
