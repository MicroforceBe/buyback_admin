//app/admin/catalog/table.tsx
'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import type { CatalogRow } from './actions';
import {
  saveCatalogRowField,
  uploadCatalogRowImage,
  deleteCatalogRow,
  createCatalogRow,
} from './actions';

/* Zelfde mapping als in actions.ts */
const BRAND_BY_CATEGORY: Record<string, string> = {
  iPad: 'Apple',
  iPhone: 'Apple',
  Samsung: 'Samsung',
};

type Props = {
  category: string | null;
  rows: CatalogRow[];
  allCategories: string[];
};

type Draft = {
  brand: string;
  category: string; // als string in UI
  model: string;
  variant: string | null;
  capacity_gb: string; // als string in UI, naar number bij save
  base_price_cents: string; // idem
  active: boolean;
};

type SortKey = 'variant' | 'capacity_gb' | 'base_price_cents';
type SortDir = 'asc' | 'desc';

function inferBrand(category: string | null, currentBrand: string): string {
  if (currentBrand?.trim()) return currentBrand.trim();
  if (category && BRAND_BY_CATEGORY[category]) return BRAND_BY_CATEGORY[category];
  return 'Apple'; // veilige default
}

export default function Table({ category, rows }: Props) {
  const [localRows, setLocalRows] = useState<CatalogRow[]>(rows);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [savingNew, startSavingNew] = useTransition();

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Nieuw-model draft state
  const [draft, setDraft] = useState<Draft>({
    brand: inferBrand(category, ''),
    category: category ?? '',
    model: '',
    variant: null,
    capacity_gb: '',
    base_price_cents: '',
    active: true,
  });

  // Sync houden met props.rows (bij filter/zoeken)
  useMemo(() => {
    setLocalRows(rows);
    setSortKey(null);
    setSortDir('asc');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // File inputs per rij (voor image upload)
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  const showingAllCategories = !category;

  function toggleSort(column: SortKey) {
    setSortKey((prevKey) => {
      if (prevKey === column) {
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir('asc');
      return column;
    });
  }

  const displayRows = useMemo(() => {
    if (!sortKey) return localRows;

    const sorted = [...localRows].sort((a, b) => {
      let av: any;
      let bv: any;

      if (sortKey === 'variant') {
        av = (a.variant || '').toString().toLowerCase();
        bv = (b.variant || '').toString().toLowerCase();
      } else if (sortKey === 'capacity_gb') {
        av = a.capacity_gb ?? 0;
        bv = b.capacity_gb ?? 0;
      } else {
        // base_price_cents
        av = a.base_price_cents ?? 0;
        bv = b.base_price_cents ?? 0;
      }

      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });

    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [localRows, sortKey, sortDir]);

  async function onToggleActive(row: CatalogRow, next: boolean) {
    try {
      setPendingId(row.id);
      setLocalRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, active: next } : r)),
      );
      await saveCatalogRowField(row.id, 'active', next);
    } catch (e: any) {
      alert(e?.message || 'Opslaan mislukt');
      setLocalRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, active: row.active } : r)),
      );
    } finally {
      setPendingId(null);
    }
  }

  async function onEditNumber(
    row: CatalogRow,
    key: 'capacity_gb' | 'base_price_cents',
    value: string,
  ) {
    const n = value.trim() === '' ? null : Number(value);
    if (value.trim() !== '' && Number.isNaN(n)) return;
    try {
      setPendingId(row.id);
      setLocalRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                [key]:
                  n == null
                    ? key === 'capacity_gb'
                      ? r.capacity_gb
                      : r.base_price_cents
                    : n,
              }
            : r,
        ),
      );
      if (n != null) await saveCatalogRowField(row.id, key, n);
    } catch (e: any) {
      alert(e?.message || 'Opslaan mislukt');
    } finally {
      setPendingId(null);
    }
  }

  async function onEditText(
    row: CatalogRow,
    key: 'brand' | 'model' | 'variant' | 'category',
    value: string,
  ) {
    const v = value.trim();
    try {
      setPendingId(row.id);
      setLocalRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, [key]: v || (key === 'category' ? null : '') }
            : r,
        ),
      );
      await saveCatalogRowField(row.id, key, v || null);
    } catch (e: any) {
      alert(e?.message || 'Opslaan mislukt');
    } finally {
      setPendingId(null);
    }
  }

  async function onDelete(row: CatalogRow) {
    if (
      !confirm(`Model "${row.model}" (${row.capacity_gb} GB) verwijderen?`)
    )
      return;
    try {
      setPendingId(row.id);
      await deleteCatalogRow(row.id);
      setLocalRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e: any) {
      alert(e?.message || 'Verwijderen mislukt');
    } finally {
      setPendingId(null);
    }
  }

  async function onPickImage(row: CatalogRow) {
    const input = fileInputs.current[row.id];
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function onFileChange(row: CatalogRow, file?: File | null) {
    const f = file ?? fileInputs.current[row.id]?.files?.[0] ?? null;
    if (!f) return;
    try {
      setPendingId(row.id);
      const fd = new FormData();
      fd.append('rowId', String(row.id));
      fd.append('file', f);
      const res = await uploadCatalogRowImage(fd);
      const newUrl = (res && (res as any).url) as string | null;
      if (typeof newUrl === 'string' && newUrl.length > 0) {
        setLocalRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, image_url: newUrl } : r)),
        );
      }
    } catch (e: any) {
      alert(e?.message || 'Upload mislukt');
    } finally {
      setPendingId(null);
    }
  }

  // === Nieuw model toevoegen ===
  function openAddRow() {
    setDraft({
      brand: inferBrand(category, ''),
      category: category ?? '',
      model: '',
      variant: null,
      capacity_gb: '',
      base_price_cents: '',
      active: true,
    });
    setIsAdding(true);
  }

  function cancelAddRow() {
    setIsAdding(false);
  }

  const addValid = useMemo(() => {
    const cap =
      draft.capacity_gb.trim() === '' ? NaN : Number(draft.capacity_gb);
    const price =
      draft.base_price_cents.trim() === ''
        ? NaN
        : Number(draft.base_price_cents);
    return (
      draft.model.trim().length > 0 &&
      Number.isFinite(cap) &&
      Number.isFinite(price)
    );
  }, [draft]);

  async function saveAddRow() {
    if (!addValid) return;
    startSavingNew(async () => {
      try {
        const payload = {
          brand: inferBrand(draft.category || null, draft.brand),
          category: draft.category.trim() || (category ?? null),
          model: draft.model.trim(),
          variant: draft.variant?.trim() || null,
          capacity_gb: Number(draft.capacity_gb),
          base_price_cents: Number(draft.base_price_cents),
          active: draft.active,
        } as Partial<CatalogRow>;

        const created = await createCatalogRow(payload);
        const id = (created as any)?.id as number | undefined;

        const nowIso = new Date().toISOString();
        const newRow: CatalogRow = {
          id: id ?? Math.floor(Math.random() * 1e9),
          brand: payload.brand as string,
          category: payload.category ?? null,
          model: payload.model as string,
          submodel: null,
          variant: payload.variant ?? null,
          year: null,
          capacity_gb: payload.capacity_gb as number,
          connectivity: null,
          cpu: null,
          ram_gb: null,
          ssd_gb: null,
          base_price_cents: payload.base_price_cents as number,
          image_url: null,
          active: payload.active ?? true,
          created_at: nowIso,
          updated_at: nowIso,
        };

        setLocalRows((prev) => [newRow, ...prev]);
        setIsAdding(false);
      } catch (e: any) {
        alert(e?.message || 'Aanmaken mislukt');
      }
    });
  }

  return (
    <div className="bb-card overflow-x-auto p-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3">
        <div className="text-sm text-gray-600">
          {category ? (
            <>
              Categorie:{' '}
              <span className="font-medium">
                {category}
              </span>
            </>
          ) : (
            'Alle categorieën'
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="bb-btn"
            onClick={openAddRow}
            disabled={isAdding}
          >
            + Model toevoegen
          </button>
        </div>
      </div>

      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            <th className="px-3 py-2 text-left">Foto</th>
            <th className="px-3 py-2 text-left">Brand</th>
            {!category && (
              <th className="px-3 py-2 text-left">Categorie</th>
            )}
            <th className="px-3 py-2 text-left">Model</th>
            <th className="px-3 py-2 text-left">
              <button
                type="button"
                className="inline-flex items-center gap-1"
                onClick={() => toggleSort('variant')}
              >
                Variant
                {sortKey === 'variant' && (
                  <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                )}
              </button>
            </th>
            <th className="px-3 py-2 text-left">
              <button
                type="button"
                className="inline-flex items-center gap-1"
                onClick={() => toggleSort('capacity_gb')}
              >
                Cap. (GB)
                {sortKey === 'capacity_gb' && (
                  <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                )}
              </button>
            </th>
            <th className="px-3 py-2 text-left">
              <button
                type="button"
                className="inline-flex items-center gap-1"
                onClick={() => toggleSort('base_price_cents')}
              >
                Basisprijs (€)
                {sortKey === 'base_price_cents' && (
                  <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
                )}
              </button>
            </th>
            <th className="px-3 py-2 text-left">Actief</th>
            <th className="px-3 py-2 text-left">Acties</th>
          </tr>
        </thead>

        <tbody>
          {/* Invoegstrook voor nieuw model */}
          {isAdding && (
            <tr className="bg-amber-50 border-b border-amber-200/60">
              <td className="px-3 py-2 text-gray-400 italic">—</td>
              <td className="px-3 py-2">
                <input
                  className="bb-input bb-input-wide"
                  value={draft.brand}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, brand: e.target.value }))
                  }
                  placeholder="bv. Apple"
                  maxLength={50}
                />
              </td>
              {!category && (
                <td className="px-3 py-2">
                  <input
                    className="bb-input"
                    value={draft.category}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, category: e.target.value }))
                    }
                    placeholder="bv. iPhone, iPad, Watch…"
                  />
                </td>
              )}
              <td className="px-3 py-2">
                <input
                  className="bb-input bb-input-wide"
                  value={draft.model}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, model: e.target.value }))
                  }
                  placeholder="bv. iPad 10.2 (9th)"
                  maxLength={50}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="bb-input"
                  value={draft.variant ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      variant: e.target.value || null,
                    }))
                  }
                  placeholder="(optioneel)"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="bb-input"
                  inputMode="numeric"
                  value={draft.capacity_gb}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      capacity_gb: e.target.value,
                    }))
                  }
                  placeholder="64"
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <input
                    className="bb-input"
                    inputMode="numeric"
                    value={draft.base_price_cents}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        base_price_cents: e.target.value,
                      }))
                    }
                    placeholder="bv. 12000 (voor €120)"
                    title="Prijs in centen"
                  />
                </div>
              </td>
              <td className="px-3 py-2">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={draft.active}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, active: e.target.checked }))
                    }
                  />
                  <div className="w-10 h-5 bg-gray-300 rounded-full peer-checked:bg-green-600 relative transition-colors">
                    <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                  </div>
                </label>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <button
                    className={`bb-btn border is-active ${
                      !addValid || savingNew
                        ? 'opacity-60 cursor-not-allowed'
                        : ''
                    }`}
                    disabled={!addValid || savingNew}
                    onClick={saveAddRow}
                  >
                    Opslaan
                  </button>
                  <button
                    className="bb-btn"
                    onClick={cancelAddRow}
                    disabled={savingNew}
                  >
                    Annuleren
                  </button>
                </div>
              </td>
            </tr>
          )}

          {/* Bestaande rijen */}
          {displayRows.map((row) => {
            const isPending = pendingId === row.id;
            return (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-12 rounded border bg-white overflow-hidden flex items-center justify-center">
                      {row.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          geen foto
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={(el) => {
                          fileInputs.current[row.id] = el;
                          return undefined;
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={() => onFileChange(row)}
                      />
                      <button
                        type="button"
                        className="bb-btn"
                        onClick={() => onPickImage(row)}
                        disabled={isPending}
                        title="Foto uploaden"
                      >
                        Upload
                      </button>
                    </div>
                  </div>
                </td>

                <td className="px-3 py-2">
                  <input
                    className="bb-input bb-input-wide"
                    defaultValue={row.brand}
                    onBlur={(e) => onEditText(row, 'brand', e.target.value)}
                    disabled={isPending}
                    maxLength={50}
                  />
                </td>
                {!category && (
                  <td className="px-3 py-2">
                    <input
                      className="bb-input"
                      defaultValue={row.category ?? ''}
                      onBlur={(e) =>
                        onEditText(row, 'category', e.target.value)
                      }
                      disabled={isPending}
                      placeholder="bv. iPhone"
                    />
                  </td>
                )}
                <td className="px-3 py-2">
                  <input
                    className="bb-input bb-input-wide"
                    defaultValue={row.model}
                    onBlur={(e) => onEditText(row, 'model', e.target.value)}
                    disabled={isPending}
                    maxLength={50}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="bb-input"
                    defaultValue={row.variant ?? ''}
                    onBlur={(e) => onEditText(row, 'variant', e.target.value)}
                    disabled={isPending}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="bb-input"
                    inputMode="numeric"
                    defaultValue={String(row.capacity_gb)}
                    onBlur={(e) =>
                      onEditNumber(row, 'capacity_gb', e.target.value)
                    }
                    disabled={isPending}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="bb-input"
                    inputMode="numeric"
                    defaultValue={String(row.base_price_cents)}
                    onBlur={(e) =>
                      onEditNumber(row, 'base_price_cents', e.target.value)
                    }
                    disabled={isPending}
                    title="Prijs in centen"
                  />
                </td>
                <td className="px-3 py-2">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={row.active}
                      onChange={(e) => onToggleActive(row, e.target.checked)}
                      disabled={isPending}
                    />
                    <div className="w-10 h-5 bg-gray-300 rounded-full peer-checked:bg-green-600 relative transition-colors">
                      <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                    </div>
                  </label>
                </td>
                <td className="px-3 py-2">
                  <button
                    className="bb-btn"
                    onClick={() => onDelete(row)}
                    disabled={isPending}
                    title="Verwijderen"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <style jsx>{`
        .bb-input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #fff;
          outline: none;
        }
        .bb-input-wide {
          max-width: 320px; /* breedte voor Brand + Model */
        }
        .bb-input:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }
        .bb-btn {
          border: 1px solid #e5e7eb;
          padding: 6px 10px;
          border-radius: 8px;
          background: #fff;
        }
        .bb-btn:hover {
          background: #f9fafb;
        }
        .bb-btn.is-active {
          background: #10b981;
          color: #fff;
          border-color: #10b981;
        }
        .bb-card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
        }
      `}</style>
    </div>
  );
}
