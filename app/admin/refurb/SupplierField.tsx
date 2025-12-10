// app/admin/refurb/SupplierField.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import {
  RefurbSupplier,
  searchRefurbSuppliers,
  createRefurbSupplier,
} from "./actions";

type Props = {
  canCreate: boolean; // alleen admins true
};

export default function SupplierField({ canCreate }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RefurbSupplier | null>(null);
  const [results, setResults] = useState<RefurbSupplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, startCreating] = useTransition();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVat, setNewVat] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 🔍 Type-ahead search (debounced)
  useEffect(() => {
    if (!query || selected) {
      setResults([]);
      return;
    }

    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchRefurbSuppliers(query);
        setResults(res);
      } catch (err) {
        console.error("[REFURB] supplier search error", err);
        setError("Zoeken naar leveranciers mislukt.");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [query, selected]);

  function handleSelectSupplier(s: RefurbSupplier) {
    setSelected(s);
    setQuery(s.name);
    setResults([]);
    setShowCreateForm(false);
    setError(null);
  }

  function handleClearSelection() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setError(null);
  }

  function handleOpenCreate() {
    setShowCreateForm(true);
    setNewName(query || "");
    setNewVat("");
    setError(null);
  }

  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = newName.trim();
    if (!name) {
      setError("Naam leverancier is verplicht.");
      return;
    }

    startCreating(async () => {
      try {
        const s = await createRefurbSupplier({
          name,
          vat_number: newVat,
        });
        handleSelectSupplier(s);
      } catch (err: any) {
        console.error("[REFURB] create supplier error", err);
        setError(err?.message || "Kon leverancier niet aanmaken.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="supplier_search"
        className="text-[11px] font-medium text-slate-600 uppercase"
      >
        Leverancier
      </label>

      {/* Verborgen field dat uiteindelijk naar server gaat */}
      <input
        type="hidden"
        name="supplier_id"
        value={selected?.id ?? ""}
      />

      <div className="relative">
        <input
          id="supplier_search"
          type="text"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selected) {
              // als je in de naam begint te typen → selectie wissen
              setSelected(null);
            }
          }}
          className="bb-input h-9 text-sm px-2 pr-8 w-full"
          placeholder="Leverancier zoeken..."
        />
        {selected && (
          <button
            type="button"
            onClick={handleClearSelection}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* Suggestielijst */}
      {loading && (
        <div className="text-[11px] text-slate-500 mt-1">
          Leveranciers laden...
        </div>
      )}

      {!loading && !selected && query.length >= 2 && results.length > 0 && (
        <ul className="mt-1 bg-white border border-slate-200 rounded-md shadow-sm max-h-48 overflow-auto text-xs">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => handleSelectSupplier(s)}
                className="w-full text-left px-2 py-1 hover:bg-slate-100 flex flex-col"
              >
                <span className="font-medium">{s.name}</span>
                {s.vat_number && (
                  <span className="text-[10px] text-slate-500">
                    BTW: {s.vat_number}
                  </span>
                )}
                {s.contact_email && (
                  <span className="text-[10px] text-slate-500">
                    {s.contact_email}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Geen resultaten */}
      {!loading && !selected && query.length >= 2 && results.length === 0 && (
        <div className="text-[11px] text-slate-500 mt-1">
          Geen leveranciers gevonden op "{query}".
        </div>
      )}

      {/* Nieuwe leverancier knop, enkel voor admins */}
      {canCreate && (
        <div className="mt-1">
          {!showCreateForm ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="text-[11px] text-sky-700 hover:underline"
            >
              Nieuwe leverancier…
            </button>
          ) : (
            <form
              onSubmit={handleCreateSupplier}
              className="mt-1 p-2 border border-sky-200 rounded bg-sky-50 flex flex-col gap-1"
            >
              <div className="text-[11px] font-medium text-sky-900">
                Nieuwe leverancier
              </div>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bb-input h-8 text-xs px-2"
                placeholder="Naam"
              />
              <input
                type="text"
                value={newVat}
                onChange={(e) => setNewVat(e.target.value)}
                className="bb-input h-8 text-xs px-2"
                placeholder="BTW-nummer (optioneel)"
              />
              {error && (
                <div className="text-[11px] text-red-600">{error}</div>
              )}
              <div className="flex justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setError(null);
                  }}
                  className="text-[11px] text-slate-600 hover:underline"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="bb-btn bb-btn-primary h-7 px-3 text-[11px]"
                >
                  {creating ? "Opslaan..." : "Opslaan"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {!canCreate && (
        <p className="text-[10px] text-slate-400 mt-1">
          Leveranciers worden beheerd door een admin.
        </p>
      )}

      {selected && (
        <p className="text-[11px] text-emerald-700 mt-1">
          Geselecteerde leverancier: <span className="font-medium">{selected.name}</span>
        </p>
      )}
    </div>
  );
}
