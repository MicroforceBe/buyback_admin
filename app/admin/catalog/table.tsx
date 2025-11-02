"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  addModel,
  updateModelField,
  deleteModel,
  addVariant,
  updateCapacityField,
  toggleCapacityActive,
  deleteCapacity,
  uploadModelImage,
  clearModelImage,
} from "./actions";

type Capacity = {
  id: string;
  model_id: string;
  variant: string | null;
  capacity_gb: number | null;
  price_cents: number | null;
  active: boolean | null;
};

type ModelRow = {
  id: string;
  category_id: string;
  brand: string | null;
  model: string | null;
  image_url: string | null;
  capacities: Capacity[];
};

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-emerald-500" : "bg-gray-300"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/* ---------- Helper: client-side resize naar max 1200px ---------- */
async function resizeImage(file: File, maxSize = 1200, quality = 0.9): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      let newW = w, newH = h;
      if (w > h && w > maxSize) {
        newW = maxSize;
        newH = Math.round((h * maxSize) / w);
      } else if (h >= w && h > maxSize) {
        newH = maxSize;
        newW = Math.round((w * maxSize) / h);
      }
      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, newW, newH);

      // Bewaar type (jpeg/png/webp). Fallback naar image/jpeg voor betere compressie.
      const mime = /^image\/(png|webp|jpeg|jpg)$/i.test(file.type) ? file.type : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) return resolve(file);
          const resized = new File([blob], file.name.replace(/\.(png|jpg|jpeg|webp)$/i, "") + ".jpg", {
            type: mime,
            lastModified: Date.now(),
          });
          resolve(resized);
        },
        mime,
        quality
      );
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

/** ImageUploader met drag&drop, preview, resizing en voortgang */
function ImageUploader({
  modelId,
  currentUrl,
  onUploaded,
}: {
  modelId: string;
  currentUrl: string | null;
  onUploaded: (url: string | null) => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, startTransition] = useTransition();
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "reading" | "resizing" | "uploading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetState = () => {
    setProgress(0);
    setStatus("idle");
    setErrorMsg(null);
  };

  async function handleFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    resetState();
    const file = files[0];
    if (!/^image\//i.test(file.type)) {
      setErrorMsg("Alleen afbeeldingen zijn toegestaan.");
      setStatus("error");
      return;
    }
    // Voorvertoning
    setLocalPreview(URL.createObjectURL(file));

    setStatus("reading");
    setProgress(20);

    // Resize client-side
    setStatus("resizing");
    setProgress(60);
    const resized = await resizeImage(file, 1200, 0.9);

    // Stop het bestand in een FormData en submitten via server action
    setStatus("uploading");
    setProgress(85);

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("model_id", modelId);
        fd.set("file", resized);
        const res = await uploadModelImage(fd);
        onUploaded(res?.image_url || null);
        setStatus("done");
        setProgress(100);
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e?.message || "Upload mislukt");
        setStatus("error");
      } finally {
        // revoke preview url bij succes of fout (na korte delay zodat img kan renderen)
        setTimeout(() => {
          if (localPreview) {
            URL.revokeObjectURL(localPreview);
            setLocalPreview(null);
          }
        }, 800);
      }
    });
  }

  return (
    <div className="space-y-2">
      <form ref={formRef} action={() => { /* niet gebruikt; we doen handmatig via uploadModelImage */ }}>
        <input ref={fileInputRef} name="file" type="file" accept="image/*" className="hidden"
          onChange={(e) => handleFiles(e.currentTarget.files)} />
      </form>

      {/* Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`rounded border px-3 py-3 text-xs cursor-pointer select-none ${
          dragOver ? "border-emerald-400 ring-2 ring-emerald-200 bg-emerald-50/40"
                   : "border-gray-300 hover:border-gray-400 bg-white"
        }`}
        aria-label="Afbeelding uploaden: klik of sleep een afbeelding hier"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded bg-gray-50 border flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={localPreview || currentUrl || "/placeholder.svg"}
                alt="preview"
                className="h-10 w-10 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }}
              />
            </div>
            <div>
              <div className="font-medium text-gray-800">Afbeelding</div>
              <div className="text-[11px] text-gray-500">
                Klik om te kiezen of sleep een afbeelding hier (max. 1200px wordt automatisch toegepast)
              </div>
            </div>
          </div>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            Kies bestand…
          </button>
        </div>

        {/* Progress */}
        {status !== "idle" && (
          <div className="mt-2">
            <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
              <div className="h-2 bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-gray-600">
              {status === "reading" && "Bestand lezen…"}
              {status === "resizing" && "Afbeelding verkleinen…"}
              {status === "uploading" && "Uploaden…"}
              {status === "done" && "Klaar!"}
              {status === "error" && <span className="text-red-600">{errorMsg}</span>}
            </div>
          </div>
        )}

        {/* Acties */}
        <div className="mt-2 flex items-center gap-2">
          {currentUrl && (
            <a href={currentUrl} target="_blank" className="text-xs underline text-gray-600" onClick={(e)=>e.stopPropagation()}>
              Open huidige
            </a>
          )}
          {currentUrl && (
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
              onClick={(e) => {
                e.stopPropagation();
                // verwijder alleen de DB referentie
                startTransition(async () => {
                  await clearModelImage(modelId);
                  onUploaded(null);
                });
              }}
            >
              Verwijder referentie
            </button>
          )}
          {busy && <span className="text-xs text-gray-500">Verwerken…</span>}
        </div>
      </div>
    </div>
  );
}

export default function CatalogTable({
  categoryId,
  initialModels,
}: {
  categoryId: string;
  initialModels: ModelRow[];
}) {
  const [models, setModels] = useState<ModelRow[]>(initialModels);
  const [q, setQ] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return models;
    return models.filter((m) => [m.brand || "", m.model || ""].join(" ").toLowerCase().includes(s));
  }, [models, q]);

  function updateLocalModel(id: string, patch: Partial<ModelRow>) {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function updateLocalCapacity(capId: string, patch: Partial<Capacity>) {
    setModels((prev) =>
      prev.map((m) => ({
        ...m,
        capacities: m.capacities.map((c) => (c.id === capId ? { ...c, ...patch } : c)),
      }))
    );
  }

  return (
    <div className="space-y-3">
      {/* Topbar: search + add */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <input
          placeholder="Zoek op model…"
          className="border rounded px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="px-3 py-2 text-sm rounded border hover:bg-gray-50"
          onClick={() =>
            startTransition(async () => {
              const id = await addModel(categoryId);
              setModels((prev) => [
                {
                  id,
                  category_id: categoryId,
                  brand: "",
                  model: "Nieuw model",
                  image_url: null,
                  capacities: [],
                },
                ...prev,
              ]);
            })
          }
        >
          + Nieuw model
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-3 py-2 w-[14rem]">Brand</th>
              <th className="px-3 py-2 w-[18rem]">Model</th>
              <th className="px-3 py-2 w-[24rem]">Afbeelding (drag & drop)</th>
              <th className="px-3 py-2">Varianten / Capaciteiten</th>
              <th className="px-3 py-2 w-[8rem]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="align-top border-t">
                {/* brand */}
                <td className="px-3 py-2">
                  <input
                    className="w-full border rounded px-2 py-1.5"
                    value={m.brand ?? ""}
                    onChange={(e) => updateLocalModel(m.id, { brand: e.target.value })}
                    onBlur={(e) => startTransition(() => updateModelField(m.id, "brand", e.target.value))}
                    placeholder="bv. Apple"
                  />
                </td>
                {/* model */}
                <td className="px-3 py-2">
                  <input
                    className="w-full border rounded px-2 py-1.5"
                    value={m.model ?? ""}
                    onChange={(e) => updateLocalModel(m.id, { model: e.target.value })}
                    onBlur={(e) => startTransition(() => updateModelField(m.id, "model", e.target.value))}
                    placeholder="bv. iPhone 11"
                  />
                </td>
                {/* image upload */}
                <td className="px-3 py-2">
                  <ImageUploader
                    modelId={m.id}
                    currentUrl={m.image_url}
                    onUploaded={(url) => updateLocalModel(m.id, { image_url: url })}
                  />
                </td>

                {/* capacities */}
                <td className="px-3 py-2">
                  <div className="space-y-2">
                    {m.capacities.length === 0 && <div className="text-xs text-gray-500">Nog geen varianten</div>}

                    {m.capacities.map((c) => (
                      <div
                        key={c.id}
                        className={`
                          grid grid-cols-[1.2fr_0.9fr_1fr_auto]
                          items-center gap-2 border rounded px-2 py-2
                        `}
                      >
                        <input
                          className="border rounded px-2 py-1.5"
                          value={c.variant ?? ""}
                          onChange={(e) => updateLocalCapacity(c.id, { variant: e.target.value })}
                          onBlur={(e) =>
                            startTransition(() => updateCapacityField(c.id, "variant", e.target.value))
                          }
                          placeholder="Variant (bv. EU, Pro, …)"
                        />
                        <input
                          className="border rounded px-2 py-1.5 text-right"
                          value={(c.capacity_gb ?? "").toString()}
                          onChange={(e) =>
                            updateLocalCapacity(c.id, { capacity_gb: Number(e.target.value) || 0 })
                          }
                          onBlur={(e) =>
                            startTransition(() =>
                              updateCapacityField(c.id, "capacity_gb", Number(e.target.value) || 0)
                            )
                          }
                          placeholder="GB"
                          inputMode="numeric"
                        />
                        <input
                          className="border rounded px-2 py-1.5 text-right"
                          value={(c.price_cents ?? "").toString()}
                          onChange={(e) =>
                            updateLocalCapacity(c.id, { price_cents: Number(e.target.value) || 0 })
                          }
                          onBlur={(e) =>
                            startTransition(() =>
                              updateCapacityField(c.id, "price_cents", Number(e.target.value) || 0)
                            )
                          }
                          placeholder="prijs (cents)"
                          inputMode="numeric"
                        />

                        <div className="flex items-center gap-2 justify-end">
                          <Switch
                            checked={!!c.active}
                            onChange={(v) =>
                              startTransition(async () => {
                                updateLocalCapacity(c.id, { active: v });
                                await toggleCapacityActive(c.id, v);
                              })
                            }
                          />
                          <button
                            className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                            onClick={() =>
                              startTransition(async () => {
                                await deleteCapacity(c.id);
                                setModels((prev) =>
                                  prev.map((mm) =>
                                    mm.id === m.id
                                      ? {
                                          ...mm,
                                          capacities: mm.capacities.filter((x) => x.id !== c.id),
                                        }
                                      : mm
                                  )
                                );
                              })
                            }
                          >
                            Verwijder
                          </button>
                        </div>
                      </div>
                    ))}
                    <div>
                      <button
                        className="mt-1 text-xs px-2 py-1 rounded border hover:bg-gray-50"
                        onClick={() =>
                          startTransition(async () => {
                            await addVariant(m.id);
                            setModels((prev) =>
                              prev.map((mm) =>
                                mm.id === m.id
                                  ? {
                                      ...mm,
                                      capacities: [
                                        ...mm.capacities,
                                        {
                                          id: Math.random().toString(36).slice(2),
                                          model_id: m.id,
                                          variant: "",
                                          capacity_gb: 64,
                                          price_cents: 0,
                                          active: true,
                                        },
                                      ],
                                    }
                                  : mm
                              )
                            );
                          })
                        }
                      >
                        + Variant
                      </button>
                    </div>
                  </div>
                </td>

                {/* actions */}
                <td className="px-3 py-2 text-right">
                  <button
                    className="text-xs px-2 py-1 rounded border hover:bg-red-50 hover:border-red-300"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteModel(m.id);
                        setModels((prev) => prev.filter((x) => x.id !== m.id));
                      })
                    }
                  >
                    Verwijder model
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Geen modellen gevonden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isPending && <div className="text-xs text-gray-500">Wijzigingen worden verwerkt…</div>}
    </div>
  );
}
