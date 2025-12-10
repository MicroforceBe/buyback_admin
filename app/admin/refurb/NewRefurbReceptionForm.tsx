// app/admin/refurb/NewRefurbReceptionForm.tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createRefurbReception, type CreateReceptionFormState } from "./actions";
import SupplierField from "./SupplierField";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bb-btn bb-btn-primary text-sm px-4 h-9"
    >
      {pending ? "Opslaan..." : "Receptie aanmaken"}
    </button>
  );
}

const initialState: CreateReceptionFormState = {
  success: false,
  fieldErrors: {},
  formError: null,
};

export default function NewRefurbReceptionForm({
  canCreateSupplier,
}: {
  canCreateSupplier: boolean;
}) {
  const [state, formAction] = useFormState(createRefurbReception, initialState);

  const receptionNrError = state.fieldErrors.reception_number;

  return (
    <div className="p-4 max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Nieuwe Refurb reception</h1>
        <p className="text-xs text-slate-500 mt-1">
          Maak een nieuwe receptie aan voor een leverancier. Daarna kun je in
          de tabel toestellen plakken of importeren.
        </p>
      </div>

      {state.formError && (
        <div className="p-2 border border-red-200 bg-red-50 text-[11px] text-red-700 rounded">
          {state.formError}
        </div>
      )}

      <form action={formAction} className="space-y-3 text-sm">
        <div className="grid grid-cols-1 gap-3">
          {/* Receptie nr */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reception_number"
              className="text-[11px] font-medium text-slate-600 uppercase flex items-center gap-1"
            >
              Receptie nr
              {receptionNrError && (
                <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  !
                </span>
              )}
            </label>
            <input
              id="reception_number"
              name="reception_number"
              type="text"
              required
              className={`bb-input h-9 text-sm px-2 ${
                receptionNrError
                  ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                  : ""
              }`}
              placeholder="Bijv. RFB-2025-0001"
            />
            {receptionNrError && (
              <p className="text-[11px] text-red-600 mt-0.5">
                {receptionNrError}
              </p>
            )}
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
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
