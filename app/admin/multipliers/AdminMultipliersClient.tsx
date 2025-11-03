// app/admin/multipliers/AdminMultipliersClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
type AdminFieldError = { type?: string; message?: string };

type QType = 'percent' | 'fixed';

type QOption = {
  key: string;
  label?: string | null;
  tip?: string | null;
  type: QType;
  value: number;
  priority?: number | null;
  active?: boolean | null;
};

type Questions = Record<string, { title?: string | null; options: QOption[] }>;

type CategoryInfo = { name: string; has_json: boolean };
type ModelRow = { model: string; uses_category: boolean; has_custom: boolean };


type QuestionErrors = {
  title?: AdminFieldError;
  options?: Array<{
    key?: AdminFieldError;
    label?: AdminFieldError;
    type?: AdminFieldError;
    value?: AdminFieldError;
  }>;
};
type ValidationErrors = {
  // questionKey -> errors
  [qk: string]: QuestionErrors & { _questionKey?: AdminFieldError };
};

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function normalizeKey(v: string) {
  return v.trim();
}

function validateQuestions(qs: Questions): ValidationErrors {
  const errors: ValidationErrors = {};
  const questionKeys = Object.keys(qs);

  // 1) Unieke question keys
  const seenQ = new Set<string>();
  for (const qk of questionKeys) {
    const nk = normalizeKey(qk);
    if (!nk) {
      errors[qk] = { ...(errors[qk] || {}), _questionKey: { msg: 'Vraag-sleutel mag niet leeg zijn.' } };
    } else if (seenQ.has(nk)) {
      errors[qk] = { ...(errors[qk] || {}), _questionKey: { msg: 'Vraag-sleutel is niet uniek.' } };
    }
    seenQ.add(nk);
  }

  // 2) Binnen elke vraag: velden + unieke option keys
  for (const qk of questionKeys) {
    const block = qs[qk];
    const optErrs: Array<{
        key?: AdminFieldError;
        label?: AdminFieldError;
        type?: AdminFieldError;
        value?: AdminFieldError;
    }> = [];
    const options = block?.options ?? [];
    const seenOpt = new Set<string>();
    
    options.forEach((opt, idx) => {
      const rowErr: {
        key?: AdminFieldError;
        label?: AdminFieldError;
        type?: AdminFieldError;
        value?: AdminFieldError;
      } = {};
    
      if (!opt.key?.trim()) {
        rowErr.key = { type: 'validate', message: 'verplicht' } as AdminFieldError;
      }
      if (!opt.label?.trim()) {
        rowErr.label = { type: 'validate', message: 'verplicht' } as AdminFieldError;
      }
      if (opt.type !== 'percent' && opt.type !== 'fixed') {
        rowErr.type = { type: 'validate', message: 'percent/fixed' } as AdminFieldError;
      }
      if (typeof opt.value !== 'number' || Number.isNaN(opt.value)) {
        rowErr.value = { type: 'validate', message: 'getal' } as AdminFieldError;
      }
      // ⬅️ Belangrijk: nooit 'undefined' toewijzen; gebruik een leeg object
      optErrs[idx] = Object.keys(rowErr).length ? rowErr : {};
    });
    
    // Check of er ergens fouten zijn ({} telt niet als fout)
    const anyOptErr = optErrs.some(e => e && Object.keys(e).length > 0);
  }
  return errors;
}

function hasErrors(errs: ValidationErrors) {
  return Object.keys(errs).some((k) => {
    const v = errs[k];
    if (v._questionKey || v.title) return true;
    if (v.options?.some(Boolean)) return true;
    return false;
  });
}

export default function AdminMultipliersClient() {
  const [cats, setCats] = useState<CategoryInfo[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [baseQs, setBaseQs] = useState<Questions>({});
  const [baseTips, setBaseTips] = useState<Record<string, string>>({});
  const [baseDirty, setBaseDirty] = useState(false);

  const [editModel, setEditModel] = useState<string | null>(null);
  const [editQs, setEditQs] = useState<Questions>({});
  const [editTips, setEditTips] = useState<Record<string, string>>({});
  const [editDirty, setEditDirty] = useState(false);

  // Validatie-status (recompute bij wijziging)
  const baseErrors = useMemo(() => validateQuestions(baseQs), [baseQs]);
  const baseHasErrors = useMemo(() => hasErrors(baseErrors), [baseErrors]);

  const editErrors = useMemo(() => validateQuestions(editQs), [editQs]);
  const editHasErrors = useMemo(() => hasErrors(editErrors), [editErrors]);

  // Load categories on mount
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/multipliers/categories', { cache: 'no-store' });
      const j = await r.json();
      setCats(j.categories ?? []);
      if ((j.categories ?? []).length && !activeCat) {
        setActiveCat(j.categories[0].name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load category content
  useEffect(() => {
    if (!activeCat) return;
    setLoading(true);
    (async () => {
      const r = await fetch(
        `/api/admin/multipliers/category?category=${encodeURIComponent(activeCat)}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      setModels(j.models ?? []);
      setBaseQs(j.base?.questions ?? {});
      setBaseTips(j.base?.tips ?? {});
      setBaseDirty(false);
    })().finally(() => setLoading(false));
  }, [activeCat]);

  /* ------------------------- helpers: base (category) ------------------------ */
  function addBaseQuestion() {
    const qk = prompt('Nieuwe vraag-sleutel (bijv. "battery", "screen")?')?.trim();
    if (!qk) return;
    if (baseQs[qk]) {
      alert('Die vraag-sleutel bestaat al.');
      return;
    }
    setBaseQs((prev) => ({
      ...prev,
      [qk]: { title: '', options: [] },
    }));
    setBaseDirty(true);
  }
  function renameBaseQuestion(oldKey: string) {
    const newKey = prompt('Nieuwe sleutel voor deze vraag?', oldKey)?.trim();
    if (!newKey || newKey === oldKey) return;
    if (baseQs[newKey]) {
      alert('Die vraag-sleutel bestaat al.');
      return;
    }
    setBaseQs((prev) => {
      const copy = deepClone(prev);
      copy[newKey] = copy[oldKey];
      delete copy[oldKey];
      return copy;
    });
    setBaseDirty(true);
  }
  function removeBaseQuestion(qk: string) {
    if (!confirm(`Vraag "${qk}" verwijderen?`)) return;
    setBaseQs((prev) => {
      const copy = deepClone(prev);
      delete copy[qk];
      return copy;
    });
    setBaseDirty(true);
  }

  function addBaseOption(qk: string) {
    setBaseQs((prev) => {
      const block = prev[qk] ?? { options: [] as QOption[] };
      const opts = [...(block.options ?? [])];
      // default percent 1.0
      opts.push({
        key: `opt_${opts.length + 1}`,
        label: '',
        tip: '',
        type: 'percent',
        value: 1,
        priority: (opts.length + 1) * 10,
        active: true,
      });
      return { ...prev, [qk]: { ...block, options: opts } };
    });
    setBaseDirty(true);
  }
  function removeBaseOption(qk: string, idx: number) {
    setBaseQs((prev) => {
      const block = prev[qk] ?? { options: [] as QOption[] };
      const opts = [...(block.options ?? [])];
      opts.splice(idx, 1);
      return { ...prev, [qk]: { ...block, options: opts } };
    });
    setBaseDirty(true);
  }
  function moveBaseOption(qk: string, idx: number, dir: -1 | 1) {
    setBaseQs((prev) => {
      const block = prev[qk] ?? { options: [] as QOption[] };
      const opts = [...(block.options ?? [])];
      const to = idx + dir;
      if (to < 0 || to >= opts.length) return prev;
      const [item] = opts.splice(idx, 1);
      opts.splice(to, 0, item);
      return { ...prev, [qk]: { ...block, options: opts } };
    });
    setBaseDirty(true);
  }
  function updateBaseQuestionTitle(k: string, v: string) {
    setBaseQs((prev) => ({ ...prev, [k]: { ...(prev[k] ?? { options: [] }), title: v } }));
    setBaseDirty(true);
  }
  function updateBaseOption(qk: string, idx: number, patch: Partial<QOption>) {
    setBaseQs((prev) => {
      const block = prev[qk] ?? { options: [] as QOption[] };
      const nextOpts = [...(block.options ?? [])];
      nextOpts[idx] = { ...nextOpts[idx], ...patch };
      return { ...prev, [qk]: { ...block, options: nextOpts } };
    });
    setBaseDirty(true);
  }

  async function saveCategory() {
    if (!activeCat) return;
    if (baseHasErrors) {
      alert('Los eerst de validatiefouten in de categorie-set op.');
      return;
    }
    const res = await fetch('/api/admin/multipliers/category', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: activeCat, questions: baseQs, tips: baseTips }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Opslaan categorie mislukt: ${j?.error || res.status}`);
      return;
    }
    setBaseDirty(false);
  }

  /* ---------------------------- helpers: models list ---------------------------- */
  async function toggleModel(m: ModelRow, useCategory: boolean) {
    if (!activeCat) return;
    const res = await fetch('/api/admin/multipliers/model/toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: m.model, category: activeCat, use_category: useCategory }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || res.status);

    // refresh list
    const r = await fetch(
      `/api/admin/multipliers/category?category=${encodeURIComponent(activeCat)}`,
      { cache: 'no-store' }
    );
    const d = await r.json();
    setModels(d.models ?? []);
  }

  async function startEditCustom(m: ModelRow) {
    // Als het model nog categorie gebruikt, eerst custom aanmaken (copy from category)
    if (m.uses_category) {
      await toggleModel(m, false);
    }
    setEditModel(m.model);

    // Initieer editor met kopie van category-set als er nog geen custom was
    const baseQsClone = deepClone(baseQs || {});
    const baseTipsClone = deepClone(baseTips || {});
    setEditQs(baseQsClone);
    setEditTips(baseTipsClone);
    setEditDirty(false);
  }

  async function saveCustom() {
    if (!editModel) return;
    if (editHasErrors) {
      alert('Los eerst de validatiefouten in de custom set op.');
      return;
    }
    const res = await fetch('/api/admin/multipliers/model/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: editModel, questions: editQs, tips: editTips }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || res.status);
    setEditDirty(false);
    setEditModel(null);

    // Refresh overzicht
    if (activeCat) {
      const r = await fetch(
        `/api/admin/multipliers/category?category=${encodeURIComponent(activeCat)}`,
        { cache: 'no-store' }
      );
      const d = await r.json();
      setModels(d.models ?? []);
    }
  }

  /* ------------------------- helpers: edit (custom model) ------------------------ */
  function addEditQuestion() {
    const qk = prompt('Nieuwe vraag-sleutel?')?.trim();
    if (!qk) return;
    if (editQs[qk]) {
      alert('Die vraag-sleutel bestaat al.');
      return;
    }
    setEditQs((prev) => ({ ...prev, [qk]: { title: '', options: [] } }));
    setEditDirty(true);
  }
  function renameEditQuestion(oldKey: string) {
    const newKey = prompt('Nieuwe sleutel voor deze vraag?', oldKey)?.trim();
    if (!newKey || newKey === oldKey) return;
    if (editQs[newKey]) {
      alert('Die vraag-sleutel bestaat al.');
      return;
    }
    setEditQs((prev) => {
      const copy = deepClone(prev);
      copy[newKey] = copy[oldKey];
      delete copy[oldKey];
      return copy;
    });
    setEditDirty(true);
  }
  function removeEditQuestion(qk: string) {
    if (!confirm(`Vraag "${qk}" verwijderen?`)) return;
    setEditQs((prev) => {
      const copy = deepClone(prev);
      delete copy[qk];
      return copy;
    });
    setEditDirty(true);
  }
  function addEditOption(qk: string) {
    setEditQs((prev) => {
      const block = prev[qk] ?? { options: [] as QOption[] };
      const opts = [...(block.options ?? [])];
      opts.push({
        key: `opt_${opts.length + 1}`,
        label: '',
        tip: '',
        type: 'percent',
        value: 1,
        priority: (opts.length + 1) * 10,
        active: true,
      });
      return { ...prev, [qk]: { ...block, options: opts } };
    });
    setEditDirty(true);
  }
  function removeEditOption(qk: string, idx: number) {
    setEditQs((prev) => {
      const block = prev[qk] ?? { options: [] as QOption[] };
      const opts = [...(block.options ?? [])];
      opts.splice(idx, 1);
      return { ...prev, [qk]: { ...block, options: opts } };
    });
    setEditDirty(true);
  }
  function moveEditOption(qk: string, idx: number, dir: -1 | 1) {
    setEditQs((prev) => {
      const block = prev[qk] ?? { options: [] as QOption[] };
      const opts = [...(block.options ?? [])];
      const to = idx + dir;
      if (to < 0 || to >= opts.length) return prev;
      const [item] = opts.splice(idx, 1);
      opts.splice(to, 0, item);
      return { ...prev, [qk]: { ...block, options: opts } };
    });
    setEditDirty(true);
  }
  function updateEditQuestionTitle(k: string, v: string) {
    setEditQs((prev) => ({ ...prev, [k]: { ...(prev[k] ?? { options: [] }), title: v } }));
    setEditDirty(true);
  }
  function updateEditOption(qk: string, idx: number, patch: Partial<QOption>) {
    setEditQs((prev) => {
      const block = prev[qk] ?? { options: [] as QOption[] };
      const nextOpts = [...(block.options ?? [])];
      nextOpts[idx] = { ...nextOpts[idx], ...patch };
      return { ...prev, [qk]: { ...block, options: nextOpts } };
    });
    setEditDirty(true);
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {cats.map((c) => {
          const active = c.name === activeCat;
          return (
            <button
              key={c.name}
              className={`px-3 py-2 ${active ? 'border-b-2 border-black font-medium' : 'text-gray-500'}`}
              onClick={() => setActiveCat(c.name)}
            >
              {c.name}
              {c.has_json ? '' : ' • nieuw'}
            </button>
          );
        })}
      </div>

      {/* Category editor */}
      <div className="bb-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Categorie-set {activeCat ? `— ${activeCat}` : ''}</h2>
          <div className="flex gap-2">
            <button className="bb-btn" onClick={addBaseQuestion}>+ Vraag</button>
            <button
              className={`bb-btn ${baseDirty && !baseHasErrors ? 'is-active' : ''}`}
              disabled={!baseDirty || baseHasErrors}
              onClick={saveCategory}
              title={baseHasErrors ? 'Los eerst validatiefouten op.' : undefined}
            >
              Bewaar categorie-set
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500 mt-3">Laden…</div>
        ) : (
          <div className="mt-3 space-y-5">
            {Object.entries(baseQs).length === 0 && (
              <div className="text-sm text-gray-500">Nog geen vragen. Voeg vragen toe.</div>
            )}

            {Object.entries(baseQs).map(([qk, block]) => {
              const qErr = baseErrors[qk];
              return (
                <div key={qk} className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      className={`border rounded px-2 py-1 w-64 ${qErr?._questionKey ? 'border-red-500' : ''}`}
                      defaultValue={qk}
                      readOnly
                      title={qErr?._questionKey?.msg}
                    />
                    <button className="bb-btn" onClick={() => renameBaseQuestion(qk)}>Hernoem sleutel</button>

                    <input
                      className={`border rounded px-2 py-1 flex-1 ${qErr?.title ? 'border-red-500' : ''}`}
                      value={block?.title ?? ''}
                      onChange={(e) => updateBaseQuestionTitle(qk, e.target.value)}
                      placeholder={`Titel voor ${qk}`}
                      title={qErr?.title?.msg}
                    />
                    <button className="bb-btn" onClick={() => removeBaseQuestion(qk)}>Verwijder vraag</button>
                  </div>

                  <div className="space-y-2">
                    {(block?.options ?? []).map((o, idx) => {
                      const oe = qErr?.options?.[idx];
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <input
                            className={`border rounded px-2 py-1 col-span-2 ${oe?.label ? 'border-red-500' : ''}`}
                            value={o.label ?? ''}
                            onChange={(e) => updateBaseOption(qk, idx, { label: e.target.value })}
                            placeholder="Label"
                            title={oe?.label?.msg}
                          />
                          <input
                            className={`border rounded px-2 py-1 col-span-2 ${oe?.key ? 'border-red-500' : ''}`}
                            value={o.key}
                            onChange={(e) => updateBaseOption(qk, idx, { key: e.target.value })}
                            placeholder="Key"
                            title={oe?.key?.msg}
                          />
                          <select
                            className={`border rounded px-2 py-1 col-span-2 ${oe?.type ? 'border-red-500' : ''}`}
                            value={o.type}
                            onChange={(e) => updateBaseOption(qk, idx, { type: e.target.value as QType })}
                            title={oe?.type?.msg}
                          >
                            <option value="percent">percent</option>
                            <option value="fixed">fixed</option>
                          </select>
                          <input
                            className={`border rounded px-2 py-1 col-span-2 ${oe?.value ? 'border-red-500' : ''}`}
                            type="number"
                            step={o.type === 'percent' ? 0.01 : 1}
                            value={o.value}
                            onChange={(e) => updateBaseOption(qk, idx, { value: Number(e.target.value) })}
                            placeholder={o.type === 'percent' ? '1.00' : '100'}
                            title={oe?.value?.msg}
                          />
                          <input
                            className="border rounded px-2 py-1 col-span-2"
                            value={o.tip ?? ''}
                            onChange={(e) => updateBaseOption(qk, idx, { tip: e.target.value })}
                            placeholder="tip"
                          />
                          <div className="col-span-2 flex gap-2">
                            <button className="bb-btn" onClick={() => moveBaseOption(qk, idx, -1)} title="Omhoog">↑</button>
                            <button className="bb-btn" onClick={() => moveBaseOption(qk, idx, 1)} title="Omlaag">↓</button>
                            <button className="bb-btn" onClick={() => removeBaseOption(qk, idx)}>Verwijder</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2">
                    <button className="bb-btn" onClick={() => addBaseOption(qk)}>+ Optie</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {baseHasErrors && (
          <div className="mt-3 text-sm text-red-600">
            Er zijn validatiefouten. Beweeg met je muis over de rode velden voor details.
          </div>
        )}
      </div>

      {/* Modellen-lijst + toggles */}
      <div className="bb-card p-4">
        <h3 className="font-medium mb-3">Modellen in deze categorie</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-600">
              <tr>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Gebruik categorie-set</th>
                <th className="py-2 pr-3">Acties</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.model} className="border-t">
                  <td className="py-2 pr-3">{m.model}</td>
                  <td className="py-2 pr-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-green-600"
                        checked={m.uses_category}
                        onChange={(e) => toggleModel(m, e.target.checked)}
                      />
                      <span className="text-xs text-gray-600">
                        {m.uses_category ? 'Categorie' : 'Custom'}
                      </span>
                    </label>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      {!m.uses_category && (
                        <button className="bb-btn" onClick={() => startEditCustom(m)}>
                          Bewerk custom
                        </button>
                      )}
                      {!m.uses_category && (
                        <button
                          className="bb-btn"
                          onClick={() => toggleModel(m, true)}
                          title="Verwijder custom en gebruik categorie-set"
                        >
                          Reset → categorie
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {models.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={3}>
                    Geen modellen gevonden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inline editor voor custom per-model */}
      {editModel && (
        <div className="bb-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Custom multipliers — {editModel}</h3>
            <div className="flex gap-2">
              <button className="bb-btn" onClick={() => setEditModel(null)}>
                Annuleren
              </button>
              <button
                className={`bb-btn ${editDirty && !editHasErrors ? 'is-active' : ''}`}
                disabled={!editDirty || editHasErrors}
                onClick={saveCustom}
                title={editHasErrors ? 'Los eerst validatiefouten op.' : undefined}
              >
                Bewaar custom
              </button>
            </div>
          </div>

          <div className="mt-2 mb-3">
            <button className="bb-btn" onClick={addEditQuestion}>+ Vraag</button>
          </div>

          <div className="mt-3 space-y-5">
            {Object.entries(editQs).map(([qk, block]) => {
              const qErr = editErrors[qk];
              return (
                <div key={qk} className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      className={`border rounded px-2 py-1 w-64 ${qErr?._questionKey ? 'border-red-500' : ''}`}
                      defaultValue={qk}
                      readOnly
                      title={qErr?._questionKey?.msg}
                    />
                    <button className="bb-btn" onClick={() => renameEditQuestion(qk)}>
                      Hernoem sleutel
                    </button>

                    <input
                      className={`border rounded px-2 py-1 flex-1 ${qErr?.title ? 'border-red-500' : ''}`}
                      value={block?.title ?? ''}
                      onChange={(e) => updateEditQuestionTitle(qk, e.target.value)}
                      placeholder={`Titel voor ${qk}`}
                      title={qErr?.title?.msg}
                    />
                    <button className="bb-btn" onClick={() => removeEditQuestion(qk)}>
                      Verwijder vraag
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(block?.options ?? []).map((o, idx) => {
                      const oe = qErr?.options?.[idx];
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <input
                            className={`border rounded px-2 py-1 col-span-2 ${oe?.label ? 'border-red-500' : ''}`}
                            value={o.label ?? ''}
                            onChange={(e) => updateEditOption(qk, idx, { label: e.target.value })}
                            placeholder="Label"
                            title={oe?.label?.msg}
                          />
                          <input
                            className={`border rounded px-2 py-1 col-span-2 ${oe?.key ? 'border-red-500' : ''}`}
                            value={o.key}
                            onChange={(e) => updateEditOption(qk, idx, { key: e.target.value })}
                            placeholder="Key"
                            title={oe?.key?.msg}
                          />
                          <select
                            className={`border rounded px-2 py-1 col-span-2 ${oe?.type ? 'border-red-500' : ''}`}
                            value={o.type}
                            onChange={(e) => updateEditOption(qk, idx, { type: e.target.value as QType })}
                            title={oe?.type?.msg}
                          >
                            <option value="percent">percent</option>
                            <option value="fixed">fixed</option>
                          </select>
                          <input
                            className={`border rounded px-2 py-1 col-span-2 ${oe?.value ? 'border-red-500' : ''}`}
                            type="number"
                            step={o.type === 'percent' ? 0.01 : 1}
                            value={o.value}
                            onChange={(e) => updateEditOption(qk, idx, { value: Number(e.target.value) })}
                            placeholder={o.type === 'percent' ? '1.00' : '100'}
                            title={oe?.value?.msg}
                          />
                          <input
                            className="border rounded px-2 py-1 col-span-2"
                            value={o.tip ?? ''}
                            onChange={(e) => updateEditOption(qk, idx, { tip: e.target.value })}
                            placeholder="tip"
                          />
                          <div className="col-span-2 flex gap-2">
                            <button className="bb-btn" onClick={() => moveEditOption(qk, idx, -1)} title="Omhoog">↑</button>
                            <button className="bb-btn" onClick={() => moveEditOption(qk, idx, 1)} title="Omlaag">↓</button>
                            <button className="bb-btn" onClick={() => removeEditOption(qk, idx)}>Verwijder</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2">
                    <button className="bb-btn" onClick={() => addEditOption(qk)}>+ Optie</button>
                  </div>
                </div>
              );
            })}
            {Object.keys(editQs).length === 0 && (
              <div className="text-sm text-gray-500">
                Deze custom set startte leeg; voeg vragen/opties toe.
              </div>
            )}
          </div>

          {editHasErrors && (
            <div className="mt-3 text-sm text-red-600">
              Er zijn validatiefouten. Beweeg met je muis over de rode velden voor details.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
