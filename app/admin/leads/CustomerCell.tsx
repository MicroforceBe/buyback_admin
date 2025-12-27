// app/admin/leads/CustomerCell.tsx
"use client";

import { useMemo, useState } from "react";
import { updateLeadInlineAction } from "./actions";

type Props = {
  id: string;
  customer_number: string | null;
  iban: string | null;
  first_name: string | null;
  last_name: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null; // read-only
  canEdit?: boolean;
};

const input = "bb-input h-9 text-xs px-2 py-1";
const label = "text-[11px] text-gray-500";
const copyBtn =
  "inline-flex items-center justify-center h-7 w-7 rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed";

export default function CustomerCell(p: Props) {
  const [open, setOpen] = useState(false);
  const missingCustomer = !p.customer_number || p.customer_number.trim() === "";
  const canEdit = p.canEdit ?? true;

  const fullName = useMemo(() => {
    const ln = (p.last_name ?? "").trim();
    const fn = (p.first_name ?? "").trim();
    return `${ln} ${fn}`.trim();
  }, [p.last_name, p.first_name]);

  const streetNr = useMemo(() => {
    const s = (p.street ?? "").trim();
    const n = (p.house_number ?? "").trim();
    return `${s} ${n}`.trim();
  }, [p.street, p.house_number]);

  const postalOnly = useMemo(() => {
    return (p.postal_code ?? "").trim();
  }, [p.postal_code]);

  const upper = (s: string) => (s ?? "").trim().toUpperCase();

  async function copyUpper(text: string) {
    const t = upper(text);
    if (!t) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        return;
      }
    } catch {
      // fallthrough
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      // noop
    }
  }

  const CopyIcon = ({ title }: { title: string }) => (
    <span aria-hidden title={title}>
      📋
    </span>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate">{fullName || "—"}</div>
          <div className="text-[11px] text-gray-500 truncate">
            {p.customer_number || "—"}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs px-2 h-7 border rounded"
          aria-expanded={open}
          title={open ? "Sluiten" : "Bewerken"}
        >
          {open ? "▴" : "▾"}
        </button>
      </div>

      {open && (
        <form action={updateLeadInlineAction} className="mt-2 flex flex-col gap-1">
          <input type="hidden" name="id" value={p.id} />

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="flex flex-col">
              <label className={label}>Klantnummer</label>
              <input
                name="customer_number"
                className={`${input} ${missingCustomer ? "border-red-400" : ""}`}
                defaultValue={p.customer_number ?? ""}
                placeholder="Klantnummer"
                disabled={!canEdit}
              />
            </div>
            <button
              type="button"
              className={copyBtn}
              onClick={() => copyUpper(p.customer_number ?? "")}
              disabled={!((p.customer_number ?? "").trim().length > 0)}
              aria-label="Kopieer klantnummer"
              title="Kopieer klantnummer"
            >
              <CopyIcon title="Kopieer" />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="flex flex-col">
              <label className={label}>IBAN</label>
              <input
                name="iban"
                className={input}
                defaultValue={p.iban ?? ""}
                placeholder="IBAN"
                disabled={!canEdit}
              />
            </div>
            <button
              type="button"
              className={copyBtn}
              onClick={() => copyUpper(p.iban ?? "")}
              disabled={!((p.iban ?? "").trim().length > 0)}
              aria-label="Kopieer IBAN"
              title="Kopieer IBAN"
            >
              <CopyIcon title="Kopieer" />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="flex flex-col">
              <label className={label}>Naam</label>
              <input
                name="last_name"
                className={input}
                defaultValue={p.last_name ?? ""}
                placeholder="Naam"
                disabled={!canEdit}
              />
            </div>
            <button
              type="button"
              className={copyBtn}
              onClick={() => copyUpper(fullName)}
              disabled={!fullName}
              aria-label="Kopieer naam + voornaam"
              title="Kopieer naam + voornaam"
            >
              <CopyIcon title="Kopieer" />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="flex flex-col">
              <label className={label}>Voornaam</label>
              <input
                name="first_name"
                className={input}
                defaultValue={p.first_name ?? ""}
                placeholder="Voornaam"
                disabled={!canEdit}
              />
            </div>
            <button
              type="button"
              className={copyBtn}
              onClick={() => copyUpper(fullName)}
              disabled={!fullName}
              aria-label="Kopieer naam + voornaam"
              title="Kopieer naam + voornaam"
            >
              <CopyIcon title="Kopieer" />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <div className="flex flex-col">
                <label className={label}>Straat</label>
                <input
                  name="street"
                  className={input}
                  defaultValue={p.street ?? ""}
                  placeholder="Straat"
                  disabled={!canEdit}
                />
              </div>
              <div className="flex flex-col w-24">
                <label className={label}>Nr</label>
                <input
                  name="house_number"
                  className={input}
                  defaultValue={p.house_number ?? ""}
                  placeholder="Nr"
                  disabled={!canEdit}
                />
              </div>
            </div>
            <button
              type="button"
              className={copyBtn}
              onClick={() => copyUpper(streetNr)}
              disabled={!streetNr}
              aria-label="Kopieer straat + nr"
              title="Kopieer straat + nr"
            >
              <CopyIcon title="Kopieer" />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col">
                <label className={label}>Postcode</label>
                <input
                  name="postal_code"
                  className={input}
                  defaultValue={p.postal_code ?? ""}
                  placeholder="Postcode"
                  disabled={!canEdit}
                />
              </div>
              <div className="flex flex-col">
                <label className={label}>Gemeente</label>
                <input
                  name="city"
                  className={input}
                  defaultValue={p.city ?? ""}
                  placeholder="Gemeente"
                  disabled={!canEdit}
                />
              </div>
              <div className="flex flex-col">
                <label className={label}>Land</label>
                <input
                  name="country"
                  className={input}
                  defaultValue={p.country ?? ""}
                  placeholder="Land"
                  disabled={!canEdit}
                />
              </div>
            </div>
            {/* ✅ enkel POSTCODE kopiëren (geen gemeente) */}
            <button
              type="button"
              className={copyBtn}
              onClick={() => copyUpper(postalOnly)}
              disabled={!postalOnly}
              aria-label="Kopieer postcode"
              title="Kopieer postcode"
            >
              <CopyIcon title="Kopieer" />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="flex flex-col">
              <label className={label}>Tel</label>
              <input
                name="phone"
                className={input}
                defaultValue={p.phone ?? ""}
                placeholder="Tel"
                disabled={!canEdit}
              />
            </div>
            <button
              type="button"
              className={copyBtn}
              onClick={() => copyUpper(p.phone ?? "")}
              disabled={!((p.phone ?? "").trim().length > 0)}
              aria-label="Kopieer telefoon"
              title="Kopieer telefoon"
            >
              <CopyIcon title="Kopieer" />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="flex flex-col opacity-70 pointer-events-none">
              <label className={label}>Email (read-only)</label>
              <input className={input} defaultValue={p.email ?? ""} readOnly />
            </div>
            <button
              type="button"
              className={copyBtn}
              onClick={() => copyUpper(p.email ?? "")}
              disabled={!((p.email ?? "").trim().length > 0)}
              aria-label="Kopieer email"
              title="Kopieer email"
            >
              <CopyIcon title="Kopieer" />
            </button>
          </div>

          <div className="pt-1">
            <button
              className="bb-btn h-8 text-xs px-3"
              type="submit"
              aria-label="Opslaan"
              disabled={!canEdit}
            >
              💾
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
