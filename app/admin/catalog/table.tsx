"use client";

import { useOptimistic, useRef, useState } from "react";
import { updateModelFieldAction, uploadModelImageAction, toggleCapacityActiveAction } from "./actions";

type Capacity = {
  id: string;
  model_id: string;
  variant: string | null;
  capacity_gb: number | null;
  price_cents: number | null;
  active: boolean;
};

type ModelRow = {
  id: string;
  brand: string | null;
  model: string;
  image_url: string | null;
  active: boolean;
  category_id: string | null;
  buyback_capacities?: Capacity[];
};

export default function CatalogTable({
  categoryId,
  models,
  search,
}: {
  categoryId: string | null;
  models: ModelRow[];
  search: string;
}) {
  const [q, setQ] = useState(search || "");
  const [openVariants, setOpenVariants] = useState<Record<string, boolean>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const [optModels, setOptModels] = useOptimistic(models, (state, patch: Partial<ModelRow> & { id: string }) =>
    state.map(m => (m.id === patch.id ? { ...m, ...patch } : m))
  );

  const onSubmitModelField = async (id: string, patch: Record<string, any>) => {
    const fd = new FormData();
    fd.set("id", id);
    for (const [k, v] of Object.entries(patch)) fd.set(k, String(v));
    setOptModels({ id, ...patch } as any);
    const res = await updateModelFieldAction(fd);
    if (!res?.ok) alert(res?.error || "Opslaan mislukt");
  };

  const onUploadImage = async (id: string, file: File) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("file", file);
    const res = await uploadModelImageAction(fd);
    if (!res?.ok) {
      alert(res?.error || "Upload mislukt");
    } else {
      setOptModels({ id, image_url: res.image_url } as any);
    }
  };

  const filtered = q.trim()
    ? optModels.filter(m => m.model.toLowerCase().includes(q.trim().toLowerCase()))
    : optModels;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Modellen</h2>
        <form action="/admin/catalog" method="get" className="flex items-center gap-2">
          {categoryId && <input type="hidden" name="category" value={categoryId} />}
          <input
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek op modelnaam…"
            className="border rounded px-3 py-1.5 text-sm w-64"
          />
          <button className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50">
            Filter
          </button>
        </form>
      </div>

      {/* Tabel */}
      <div className="overflow-auto rounded border bg-white">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-3 py-2 w-[72px]">Actief</th>
              <th className="px-3 py-2 w-[84px]">Foto</th>
              <th className="px-3 py-2">Merk</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2 w-[120px]">Varianten</th>
              <th className="px-3 py-2 w-[140px]">Opslaan</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-t align-top">
                {/* Actief slider */}
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-pressed={m.active}
                    onClick={() => onSubmitModelField(m.id, { active: !m.active })}
                    className={`inline-flex items-center h-6 w-11 rounded-full transition
                      ${m.active ? "bg-green-600" : "bg-gray-300"}`}
                    title={m.active ? "Actief" : "Inactief"}
                  >
                    <span
                      className={`h-5 w-5 bg-white rounded-full shadow transform transition
                        ${m.active ? "translate-x-5" : "translate-x-1"}`}
                    />
                  </button>
                </td>

                {/* Foto upload */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded border bg-gray-50 overflow-hidden">
                      {m.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-[10px] text-gray-400">geen</div>
                      )}
                    </div>
                    <div>
                      <input
                        ref={(el) => (fileInputs.current[m.id] = el)}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.currentTarget.files?.[0];
                          if (f) onUploadImage(m.id, f);
                          // reset zodat dezelfde file opnieuw kan gekozen worden
                          e.currentTarget.value = "";
                        }}
                      />
                      <button
                        type="button"
                        className="px-2 py-1 rounded border hover:bg-gray-50"
                        onClick={() => fileInputs.current[m.id]?.click()}
                      >
                        Upload…
                      </button>
                    </div>
                  </div>
                </td>

                {/* Merk */}
                <td className="px-3 py-2">
                  <input
                    defaultValue={m.brand || ""}
                    onBlur={(e) => {
                      const v = e.currentTarget.value;
                      if ((m.brand || "") !== v) onSubmitModelField(m.id, { brand: v });
                    }}
                    className="w-full border rounded px-2 py-1.5"
                    placeholder="Merk"
                  />
                </td>

                {/* Model */}
                <td className="px-3 py-2">
                  <input
                    defaultValue={m.model || ""}
                    onBlur={(e) => {
                      const v = e.currentTarget.value;
                      if ((m.model || "") !== v) onSubmitModelField(m.id, { model: v });
                    }}
                    className="w-full border rounded px-2 py-1.5"
                    placeholder="Modelnaam"
                  />
                </td>

                {/* Variants toggle open/closed */}
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="px-2 py-1 rounded border hover:bg-gray-50"
                    onClick={() => setOpenVariants((s) => ({ ...s, [m.id]: !s[m.id] }))}
                  >
                    {openVariants[m.id] ? "Verberg" : "Toon"} ({m.buyback_capacities?.length || 0})
                  </button>
                </td>

                {/* Opslaan expliciet is niet nodig (we saven onBlur / onToggle), maar laten knop voor UX */}
                <td className="px-3 py-2">
                  <span className="text-gray-400 select-none">Auto-save</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Varianten blokken onder de tabel */}
        {filtered.map((m) =>
          openVariants[m.id] ? (
            <div key={`${m.id}-variants`} className="border-t bg-gray-50/60">
              <div className="px-3 py-2 text-xs text-gray-600">Varianten voor <strong>{m.model}</strong></div>
              <div className="overflow-auto">
                <table className="min-w-[680px] w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr className="text-left">
                      <th className="px-3 py-2 w-[72px]">Actief</th>
                      <th className="px-3 py-2 w-[160px]">Variant</th>
                      <th className="px-3 py-2 w-[120px]">Capaciteit</th>
                      <th className="px-3 py-2 w-[120px]">Prijs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(m.buyback_capacities || []).map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            aria-pressed={c.active}
                            onClick={async () => {
                              const fd = new FormData();
                              fd.set("id", c.id);
                              fd.set("active", (!c.active).toString());
                              // optimistic: pas lokale state aan
                              setOptModels({
                                id: m.id,
                                buyback_capacities: (m.buyback_capacities || []).map(cc =>
                                  cc.id === c.id ? { ...cc, active: !c.active } : cc
                                ),
                              } as any);
                              const res = await toggleCapacityActiveAction(fd);
                              if (!res?.ok) alert(res?.error || "Opslaan mislukt");
                            }}
                            className={`inline-flex items-center h-6 w-11 rounded-full transition
                              ${c.active ? "bg-green-600" : "bg-gray-300"}`}
                            title={c.active ? "Actief" : "Inactief"}
                          >
                            <span
                              className={`h-5 w-5 bg-white rounded-full shadow transform transition
                                ${c.active ? "translate-x-5" : "translate-x-1"}`}
                            />
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-block px-2 py-1 rounded bg-white border">{c.variant || "—"}</span>
                        </td>
                        <td className="px-3 py-2">{c.capacity_gb ?? "—"} GB</td>
                        <td className="px-3 py-2">€ {(Math.max(0, c.price_cents || 0) / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                    {!(m.buyback_capacities || []).length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-gray-500 text-sm">
                          Geen varianten gevonden.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null
        )}
      </div>
    </section>
  );
}

