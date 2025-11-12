// app/admin/multipliers/AdminMultipliersClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

/* ================== Types ================== */

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
type ModelRow = {
  model: string;
  uses_category: boolean;
  has_custom: boolean;
  assigned_set?: string | null;
};

type QuestionErrors = {
  title?: AdminFieldError;
  options?: Array<{
    key?: AdminFieldError;
    label?: AdminFieldError;
    type?: AdminFieldError;
    value?: AdminFieldError;
  } | undefined>;
};
type ValidationErrors = {
  [qk: string]: QuestionErrors & { _questionKey?: AdminFieldError };
};

type QuestionSet = {
  name: string;                // Unieke naam binnen categorie
  questions: Questions;        // Inhoud
  qOrder?: string[];           // Volgorde van vragen (keys)
};

/* ================== Utils ================== */

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
function normalizeKey(v: string) {
  return v.trim();
}
function orderedEntries(qs: Questions, qOrder?: string[]) {
  const keys = qOrder && qOrder.length ? qOrder : Object.keys(qs);
  return keys
    .filter((k) => qs[k])
    .map((k) => [k, qs[k]] as const);
}

function validateQuestions(qs: Questions): ValidationErrors {
  const errors: ValidationErrors = {};
  const questionKeys = Object.keys(qs);

  const seenQ = new Set<string>();
  for (const qk of questionKeys) {
    const nk = normalizeKey(qk);
    if (!nk) {
      errors[qk] = { ...(errors[qk] || {}), _questionKey: { message: 'Vraag-sleutel mag niet leeg zijn.' } };
    } else if (seenQ.has(nk)) {
      errors[qk] = { ...(errors[qk] || {}), _questionKey: { message: 'Vraag-sleutel is niet uniek.' } };
    } else {
      seenQ.add(nk);
    }
  }

  for (const qk of questionKeys) {
    const block = qs[qk];
    const options = block?.options ?? [];
    const optErrs: QuestionErrors['options'] = [];
    const seenOpt = new Set<string>();

    options.forEach((opt, idx) => {
      const rowErr: NonNullable<QuestionErrors['options']>[number] = {};
      const key = opt.key?.trim() ?? '';
      const label = opt.label?.toString().trim() ?? '';
      const type = opt.type;
      const value = opt.value;

      if (!key) {
        rowErr.key = { type: 'validate', message: 'verplicht' };
      } else if (seenOpt.has(key)) {
        rowErr.key = { type: 'validate', message: 'niet uniek' };
      } else {
        seenOpt.add(key);
      }

      if (!label) {
        rowErr.label = { type: 'validate', message: 'verplicht' };
      }

      if (type !== 'percent' && type !== 'fixed') {
        rowErr.type = { type: 'validate', message: 'percent/fixed' };
      }

      if (typeof value !== 'number' || Number.isNaN(value)) {
        rowErr.value = { type: 'validate', message: 'getal' };
      }

      optErrs[idx] = Object.keys(rowErr).length ? rowErr : undefined;
    });

    if (optErrs.some((e) => e && Object.keys(e).length > 0)) {
      errors[qk] = { ...(errors[qk] || {}), options: optErrs };
    }
  }

  return errors;
}
function hasErrors(errs: ValidationErrors) {
  return Object.keys(errs).some((k) => {
    const v = errs[k];
    if (v._questionKey || v.title) return true;
    if (Array.isArray(v.options)) {
      return v.options.some((e) => !!(e && Object.keys(e).length > 0));
    }
    return false;
  });
}

/* ================== Component ================== */

export default function AdminMultipliersClient() {
  /* ---- Categorie + sets ---- */
  const [cats, setCats] = useState<CategoryInfo[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  // Collapsibles
  const [openBase, setOpenBase] = useState(false);          // categorie-set (default dicht)
  const [openSets, setOpenSets] = useState<Record<string, boolean>>({}); // custom sets (default dicht)

  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelRow[]>([]);

  // Basis (categorie) set
  const [baseQs, setBaseQs] = useState<Questions>({});
  const [baseOrder, setBaseOrder] = useState<string[]>([]);
  const [baseTips, setBaseTips] = useState<Record<string, string>>({});
  const [baseDirty, setBaseDirty] = useState(false);

  // Beschikbare custom sets binnen deze categorie
  const [sets, setSets] = useState<QuestionSet[]>([]);

  /* ---- Per-model ad-hoc custom (optioneel) ---- */
  const [editModel, setEditModel] = useState<string | null>(null);
  const [editQs, setEditQs] = useState<Questions>({});
  const [editOrder, setEditOrder] = useState<string[]>([]);
  const [editTips, setEditTips] = useState<Record<string, string>>({});
  const [editDirty, setEditDirty] = useState(false);

  /* ---- Validatie ---- */
  const baseErrors = useMemo(() => validateQuestions(baseQs), [baseQs]);
  const baseHasErrors = useMemo(() => hasErrors(baseErrors), [baseErrors]);

  const editErrors = useMemo(() => validateQuestions(editQs), [editQs]);
  const editHasErrors = useMemo(() => hasErrors(editErrors), [editErrors]);

  /* ---- Init ---- */
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/multipliers/categories', { cache: 'no-store' });
      const j = await r.json();
      setCats(j.categories ?? []);
    })();
  }, []);

  /* ---- Load NA categorie-keuze ---- */
  useEffect(() => {
    if (!activeCat) {
      setModels([]);
      setBaseQs({});
      setBaseOrder([]);
      setBaseTips({});
      setBaseDirty(false);
      setSets([]);
      setOpenSets({});
      setOpenBase(false);
      return;
    }

    setLoading(true);
    (async () => {
      // 1) basis + modellen
      const r = await fetch(
        `/api/admin/multipliers/category?category=${encodeURIComponent(activeCat)}`,
        { cache: 'no-store' }
      );
      const j = await r.json();

      setModels(j.models ?? []);
      const qBase: Questions = j.base?.questions ?? {};
      setBaseQs(qBase);
      const incomingOrder: string[] =
        (Array.isArray(j.base?.order) && j.base.order) ||
        (Array.isArray(j.base?.q_order) && j.base.q_order) ||
        (Array.isArray(j.base?.questions_order) && j.base.questions_order) ||
        Object.keys(qBase);
      setBaseOrder(incomingOrder);
      setBaseTips(j.base?.tips ?? {});
      setBaseDirty(false);

      // 2) sets (exclusief basis)
      const s = await fetch(`/api/admin/multipliers/sets?category=${encodeURIComponent(activeCat)}`, { cache: 'no-store' });
      const sj = await s.json();
      const incoming: QuestionSet[] = (sj?.sets ?? []).map((row: any) => ({
        name: String(row?.name ?? ''),
        questions: row?.questions ?? {},
        qOrder:
          (Array.isArray(row?.order) && row.order) ||
          (Array.isArray(row?.q_order) && row.q_order) ||
          (Array.isArray(row?.questions_order) && row.questions_order) ||
          Object.keys(row?.questions ?? {}),
      }));
      setSets(incoming);

      const allClosed: Record<string, boolean> = {};
      for (const it of incoming) allClosed[it.name] = false;
      setOpenSets(allClosed);

      setOpenBase(false);
    })().finally(() => setLoading(false));
  }, [activeCat]);

  /* ================== Helpers: vraag-volgorde ================== */

  function moveQuestion(order: string[], qs: Questions, key: string, dir: -1 | 1): string[] {
    const idx = order.indexOf(key);
    if (idx < 0) return order;
    const to = idx + dir;
    if (to < 0 || to >= order.length) return order;
    const next = [...order];
    const [it] = next.splice(idx, 1);
    next.splice(to, 0, it);
    const onlyExisting = next.filter((k) => !!qs[k]);
    const missing = Object.keys(qs).filter((k) => !onlyExisting.includes(k));
    return [...onlyExisting, ...missing];
  }

  /* ================== Basis set (categorie) actions ================== */

  function addBaseQuestion() {
    const qk = prompt('Nieuwe vraag-sleutel (bijv. "battery", "screen")?')?.trim();
    if (!qk) return;
    if (baseQs[qk]) {
      alert('Die vraag-sleutel bestaat al.');
      return;
    }
    setBaseQs((prev) => ({ ...prev, [qk]: { title: '', options: [] } }));
    setBaseOrder((prev) => [...prev, qk]);
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
    setBaseOrder((prev) => prev.map((k) => (k === oldKey ? newKey : k)));
    setBaseDirty(true);
  }
  function removeBaseQuestion(qk: string) {
    if (!confirm(`Vraag "${qk}" verwijderen?`)) return;
    setBaseQs((prev) => {
      const copy = deepClone(prev);
      delete copy[qk];
      return copy;
    });
    setBaseOrder((prev) => prev.filter((k) => k !== qk));
    setBaseDirty(true);
  }
  function moveBaseQuestion(qk: string, dir: -1 | 1) {
    setBaseOrder((prev) => moveQuestion(prev, baseQs, qk, dir));
    setBaseDirty(true);
  }

  function addBaseOption(qk: string) {
    setBaseQs((prev) => {
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
    const payload = {
      category: activeCat,
      questions: baseQs,
      tips: baseTips,
      order: baseOrder,
      q_order: baseOrder,
      questions_order: baseOrder,
    };
    const res = await fetch('/api/admin/multipliers/category', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Opslaan categorie mislukt: ${j?.error || res.status}`);
      return;
    }
    setBaseDirty(false);
  }

  /* ================== Modellen: toggle + set-toewijzing ================== */

  async function toggleModel(m: ModelRow, useCategory: boolean) {
    if (!activeCat) return;
    const res = await fetch('/api/admin/multipliers/model/toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: m.model, category: activeCat, use_category: useCategory }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || res.status);

    const r = await fetch(
      `/api/admin/multipliers/category?category=${encodeURIComponent(activeCat)}`,
      { cache: 'no-store' }
    );
    const d = await r.json();
    setModels(d.models ?? []);
  }

  async function assignModelSet(m: ModelRow, setName: string | '') {
    if (!activeCat) return;
    const res = await fetch('/api/admin/multipliers/model/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: m.model,
        category: activeCat,
        set: setName || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || res.status);

    // Optimistisch updaten
    setModels((prev) =>
      prev.map((row) => {
        if (row.model !== m.model) return row;
        const hasSet = !!setName;
        return {
          ...row,
          assigned_set: hasSet ? setName : null,
          uses_category: !hasSet,
          has_custom: hasSet,
        } as ModelRow & { assigned_set?: string | null };
      })
    );
  }

  /* ================== Custom sets beheer (per categorie) ================== */

  async function reloadSetsClosed() {
    if (!activeCat) return;
    const s = await fetch(`/api/admin/multipliers/sets?category=${encodeURIComponent(activeCat)}`, { cache: 'no-store' });
    const sj = await s.json();
    const incoming: QuestionSet[] = (sj?.sets ?? []).map((row: any) => ({
      name: String(row?.name ?? ''),
      questions: row?.questions ?? {},
      qOrder:
        (Array.isArray(row?.order) && row.order) ||
        (Array.isArray(row?.q_order) && row.q_order) ||
        (Array.isArray(row?.questions_order) && row.questions_order) ||
        Object.keys(row?.questions ?? {}),
    }));
    setSets(incoming);
    const allClosed: Record<string, boolean> = {};
    for (const it of incoming) allClosed[it.name] = false;
    setOpenSets(allClosed);
  }

  async function createSet() {
    if (!activeCat) return;
    const name = prompt('Naam voor nieuwe custom set (uniek binnen categorie)?')?.trim();
    if (!name) return;

    const mode = window.confirm('Wil je starten met een kopie van de categorie-set?\nOK = kopie • Annuleren = leeg')
      ? 'copy_base'
      : 'empty';

    const payload: any = { category: activeCat, name };
    if (mode === 'empty') {
      payload.questions = {};
      payload.order = [];
      payload.q_order = [];
      payload.questions_order = [];
    } else {
      payload.questions = deepClone(baseQs);
      payload.order = [...baseOrder];
      payload.q_order = [...baseOrder];
      payload.questions_order = [...baseOrder];
    }

    const res = await fetch('/api/admin/multipliers/set/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || res.status);

    await reloadSetsClosed();
  }

  async function saveSet(set: QuestionSet) {
    if (!activeCat) return;
    const errs = validateQuestions(set.questions);
    if (hasErrors(errs)) {
      alert(`Validatiefouten in set "${set.name}".`);
      return;
    }
    const ord = set.qOrder ?? Object.keys(set.questions);
    const res = await fetch('/api/admin/multipliers/set/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: activeCat,
        name: set.name,
        questions: set.questions,
        order: ord,
        q_order: ord,
        questions_order: ord,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || res.status);
    await reloadSetsClosed();
  }

  async function deleteSet(name: string) {
    if (!activeCat) return;
    if (!confirm(`Set "${name}" verwijderen?`)) return;
    const res = await fetch('/api/admin/multipliers/set/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: activeCat, name }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || res.status);
    await reloadSetsClosed();
  }

  function updateSetQuestionTitle(setName: string, qk: string, title: string) {
    setSets((prev) =>
      prev.map((s) =>
        s.name !== setName
          ? s
          : { ...s, questions: { ...s.questions, [qk]: { ...(s.questions[qk] ?? { options: [] }), title } } }
      )
    );
  }
  function addSetQuestion(setName: string) {
    const qk = prompt('Nieuwe vraag-sleutel?')?.trim();
    if (!qk) return;
    setSets((prev) =>
      prev.map((s) => {
        if (s.name !== setName) return s;
        if (s.questions[qk]) {
          alert('Die vraag-sleutel bestaat al.');
          return s;
        }
        const qs = { ...s.questions, [qk]: { title: '', options: [] } };
        const order = [...(s.qOrder ?? Object.keys(s.questions)), qk];
        return { ...s, questions: qs, qOrder: order };
      })
    );
  }
  function renameSetQuestion(setName: string, oldKey: string) {
    const newKey = prompt('Nieuwe sleutel voor deze vraag?', oldKey)?.trim();
    if (!newKey || newKey === oldKey) return;
    setSets((prev) =>
      prev.map((s) => {
        if (s.name !== setName) return s;
        if (s.questions[newKey]) {
          alert('Die vraag-sleutel bestaat al.');
          return s;
        }
        const qs = deepClone(s.questions);
        qs[newKey] = qs[oldKey];
        delete qs[oldKey];
        const order = (s.qOrder ?? Object.keys(s.questions)).map((k) => (k === oldKey ? newKey : k));
        return { ...s, questions: qs, qOrder: order };
      })
    );
  }
  function removeSetQuestion(setName: string, qk: string) {
    if (!confirm(`Vraag "${qk}" verwijderen?`)) return;
    setSets((prev) =>
      prev.map((s) => {
        if (s.name !== setName) return s;
        const qs = deepClone(s.questions);
        delete qs[qk];
        const order = (s.qOrder ?? Object.keys(s.questions)).filter((k) => k !== qk);
        return { ...s, questions: qs, qOrder: order };
      })
    );
  }
  function moveSetQuestion(setName: string, qk: string, dir: -1 | 1) {
    setSets((prev) =>
      prev.map((s) => {
        if (s.name !== setName) return s;
        const order = moveQuestion(s.qOrder ?? Object.keys(s.questions), s.questions, qk, dir);
        return { ...s, qOrder: order };
      })
    );
  }
  function updateSetOption(setName: string, qk: string, idx: number, patch: Partial<QOption>) {
    setSets((prev) =>
      prev.map((s) => {
        if (s.name !== setName) return s;
        const blk = s.questions[qk] ?? { options: [] as QOption[] };
        const next = [...(blk.options ?? [])];
        next[idx] = { ...next[idx], ...patch };
        return { ...s, questions: { ...s.questions, [qk]: { ...blk, options: next } } };
      })
    );
  }
  function addSetOption(setName: string, qk: string) {
    setSets((prev) =>
      prev.map((s) => {
        if (s.name !== setName) return s;
        const blk = s.questions[qk] ?? { options: [] as QOption[] };
        const next = [...(blk.options ?? [])];
        next.push({
          key: `opt_${next.length + 1}`,
          label: '',
          tip: '',
          type: 'percent',
          value: 1,
          priority: (next.length + 1) * 10,
          active: true,
        });
        return { ...s, questions: { ...s.questions, [qk]: { ...blk, options: next } } };
      })
    );
  }
  function removeSetOption(setName: string, qk: string, idx: number) {
    setSets((prev) =>
      prev.map((s) => {
        if (s.name !== setName) return s;
        const blk = s.questions[qk] ?? { options: [] as QOption[] };
        const next = [...(blk.options ?? [])];
        next.splice(idx, 1);
        return { ...s, questions: { ...s.questions, [qk]: { ...blk, options: next } } };
      })
    );
  }
  function moveSetOption(setName: string, qk: string, idx: number, dir: -1 | 1) {
    setSets((prev) =>
      prev.map((s) => {
        if (s.name !== setName) return s;
        const blk = s.questions[qk] ?? { options: [] as QOption[] };
        const next = [...(blk.options ?? [])];
        const to = idx + dir;
        if (to < 0 || to >= next.length) return s;
        const [it] = next.splice(idx, 1);
        next.splice(to, 0, it);
        return { ...s, questions: { ...s.questions, [qk]: { ...blk, options: next } } };
      })
    );
  }

  /* ================== Per-model ad-hoc custom (optioneel) ================== */

  async function startEditCustom(m: ModelRow) {
    if (m.uses_category) {
      await toggleModel(m, false);
    }
    setEditModel(m.model);

    const baseQsClone = deepClone(baseQs || {});
    setEditQs(baseQsClone);
    setEditOrder([...baseOrder]);
    setEditTips({});
    setEditDirty(false);
  }

  async function saveCustom() {
    if (!editModel) return;
    if (editHasErrors) {
      alert('Los eerst de validatiefouten in de custom set op.');
      return;
    }
    const ord = editOrder ?? Object.keys(editQs);
    const res = await fetch('/api/admin/multipliers/model/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: editModel,
        questions: editQs,
        tips: editTips,
        order: ord,
        q_order: ord,
        questions_order: ord,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j?.error || res.status);
    setEditDirty(false);
    setEditModel(null);

    if (activeCat) {
      const r = await fetch(
        `/api/admin/multipliers/category?category=${encodeURIComponent(activeCat)}`,
        { cache: 'no-store' }
      );
      const d = await r.json();
      setModels(d.models ?? []);
    }
  }

  function addEditQuestion() {
    const qk = prompt('Nieuwe vraag-sleutel?')?.trim();
    if (!qk) return;
    if (editQs[qk]) {
      alert('Die vraag-sleutel bestaat al.');
      return;
    }
    setEditQs((prev) => ({ ...prev, [qk]: { title: '', options: [] } }));
    setEditOrder((prev) => [...prev, qk]);
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
    setEditOrder((prev) => prev.map((k) => (k === oldKey ? newKey : k)));
    setEditDirty(true);
  }
  function removeEditQuestion(qk: string) {
    if (!confirm(`Vraag "${qk}" verwijderen?`)) return;
    setEditQs((prev) => {
      const copy = deepClone(prev);
      delete copy[qk];
      return copy;
    });
    setEditOrder((prev) => prev.filter((k) => k !== qk));
    setEditDirty(true);
  }
  function moveEditQuestion(qk: string, dir: -1 | 1) {
    setEditOrder((prev) => moveQuestion(prev, editQs, qk, dir));
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

  /* ================== Render ================== */

  return (
    <div className="space-y-4">
      {/* Categorie tabs */}
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

      {!activeCat && (
        <div className="bb-card p-4 text-sm text-gray-600">
          Kies eerst een categorie hierboven om de modellen en vragensets te beheren.
        </div>
      )}

      {activeCat && (
        <>
          {/* === Vragensets (eerst) === */}
          <div className="bb-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Vragensets — {activeCat}</h2>
              <div className="flex gap-2">
                <button className="bb-btn" onClick={createSet}>+ Nieuwe custom set</button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {/* Categorie-set (collapsible) */}
              <div className="border rounded">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      className="bb-btn"
                      title={openBase ? 'Sluit' : 'Open'}
                      onClick={() => setOpenBase((v) => !v)}
                    >
                      {openBase ? '▾' : '▸'}
                    </button>
                    <div className="font-medium">Categorie-set — {activeCat}</div>
                    {baseHasErrors && <span className="text-xs text-red-600">• validatiefouten</span>}
                  </div>
                  <div className="flex items-center gap-2">
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

                {openBase && (
                  <div className="px-3 pb-3">
                    {loading ? (
                      <div className="text-sm text-gray-500 mt-3">Laden…</div>
                    ) : (
                      <div className="mt-3 space-y-5">
                        {orderedEntries(baseQs, baseOrder).length === 0 && (
                          <div className="text-sm text-gray-500">Nog geen vragen. Voeg vragen toe.</div>
                        )}

                        {orderedEntries(baseQs, baseOrder).map(([qk, block]) => {
                          const qErr = baseErrors[qk];
                          return (
                            <div key={qk} className="border rounded p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <input
                                  className={`border rounded px-2 py-1 w-64 ${qErr?._questionKey ? 'border-red-500' : ''}`}
                                  defaultValue={qk}
                                  readOnly
                                  title={qErr?._questionKey?.message}
                                />
                                <button className="bb-btn" onClick={() => renameBaseQuestion(qk)}>Hernoem sleutel</button>

                                <input
                                  className={`border rounded px-2 py-1 flex-1 ${qErr?.title ? 'border-red-500' : ''}`}
                                  value={block?.title ?? ''}
                                  onChange={(e) => updateBaseQuestionTitle(qk, e.target.value)}
                                  placeholder={`Titel voor ${qk}`}
                                  title={qErr?.title?.message}
                                />
                                <div className="flex gap-1">
                                  <button className="bb-btn" title="Vraag omhoog" onClick={() => moveBaseQuestion(qk, -1)}>↑</button>
                                  <button className="bb-btn" title="Vraag omlaag" onClick={() => moveBaseQuestion(qk, 1)}>↓</button>
                                </div>
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
                                        title={oe?.label?.message}
                                      />
                                      <input
                                        className={`border rounded px-2 py-1 col-span-2 ${oe?.key ? 'border-red-500' : ''}`}
                                        value={o.key}
                                        onChange={(e) => updateBaseOption(qk, idx, { key: e.target.value })}
                                        placeholder="Key"
                                        title={oe?.key?.message}
                                      />
                                      <select
                                        className={`border rounded px-2 py-1 col-span-2 ${oe?.type ? 'border-red-500' : ''}`}
                                        value={o.type}
                                        onChange={(e) => updateBaseOption(qk, idx, { type: e.target.value as QType })}
                                        title={oe?.type?.message}
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
                                        title={oe?.value?.message}
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
                )}
              </div>

              {/* Custom sets (collapsible items) */}
              {sets.length === 0 ? (
                <div className="text-sm text-gray-500 border rounded px-3 py-2">
                  Nog geen custom sets. Maak er één via “+ Nieuwe custom set”.
                </div>
              ) : (
                <div className="space-y-2">
                  {sets.map((s) => {
                    const setErrs = validateQuestions(s.questions);
                    const setHasErrs = hasErrors(setErrs);
                    const isOpen = openSets[s.name] ?? false;
                    return (
                      <div key={s.name} className="border rounded">
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              className="bb-btn"
                              title={isOpen ? 'Sluit' : 'Open'}
                              onClick={() =>
                                setOpenSets((prev) => ({ ...prev, [s.name]: !(prev[s.name] ?? false) }))
                              }
                            >
                              {isOpen ? '▾' : '▸'}
                            </button>
                            <div className="font-medium">{s.name}</div>
                            {setHasErrs && <span className="text-xs text-red-600">• validatiefouten</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="bb-btn" onClick={() => saveSet(s)}>Bewaar set</button>
                            <button className="bb-btn" onClick={() => deleteSet(s.name)}>Verwijder set</button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="px-3 pb-3 space-y-4">
                            <div>
                              <button className="bb-btn" onClick={() => addSetQuestion(s.name)}>+ Vraag</button>
                            </div>

                            {orderedEntries(s.questions, s.qOrder).map(([qk, block]) => {
                              const qErr = setErrs[qk];
                              return (
                                <div key={qk} className="border rounded p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <input
                                      className={`border rounded px-2 py-1 w-64 ${qErr?._questionKey ? 'border-red-500' : ''}`}
                                      defaultValue={qk}
                                      readOnly
                                      title={qErr?._questionKey?.message}
                                    />
                                    <button className="bb-btn" onClick={() => renameSetQuestion(s.name, qk)}>Hernoem sleutel</button>

                                    <input
                                      className={`border rounded px-2 py-1 flex-1 ${qErr?.title ? 'border-red-500' : ''}`}
                                      value={block?.title ?? ''}
                                      onChange={(e) => updateSetQuestionTitle(s.name, qk, e.target.value)}
                                      placeholder={`Titel voor ${qk}`}
                                      title={qErr?.title?.message}
                                    />
                                    <div className="flex gap-1">
                                      <button className="bb-btn" title="Vraag omhoog" onClick={() => moveSetQuestion(s.name, qk, -1)}>↑</button>
                                      <button className="bb-btn" title="Vraag omlaag" onClick={() => moveSetQuestion(s.name, qk, 1)}>↓</button>
                                    </div>
                                    <button className="bb-btn" onClick={() => removeSetQuestion(s.name, qk)}>Verwijder vraag</button>
                                  </div>

                                  <div className="space-y-2">
                                    {(block?.options ?? []).map((o, idx) => {
                                      const oe = qErr?.options?.[idx];
                                      return (
                                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                          <input
                                            className={`border rounded px-2 py-1 col-span-2 ${oe?.label ? 'border-red-500' : ''}`}
                                            value={o.label ?? ''}
                                            onChange={(e) => updateSetOption(s.name, qk, idx, { label: e.target.value })}
                                            placeholder="Label"
                                            title={oe?.label?.message}
                                          />
                                          <input
                                            className={`border rounded px-2 py-1 col-span-2 ${oe?.key ? 'border-red-500' : ''}`}
                                            value={o.key}
                                            onChange={(e) => updateSetOption(s.name, qk, idx, { key: e.target.value })}
                                            placeholder="Key"
                                            title={oe?.key?.message}
                                          />
                                          <select
                                            className={`border rounded px-2 py-1 col-span-2 ${oe?.type ? 'border-red-500' : ''}`}
                                            value={o.type}
                                            onChange={(e) => updateSetOption(s.name, qk, idx, { type: e.target.value as QType })}
                                            title={oe?.type?.message}
                                          >
                                            <option value="percent">percent</option>
                                            <option value="fixed">fixed</option>
                                          </select>
                                          <input
                                            className={`border rounded px-2 py-1 col-span-2 ${oe?.value ? 'border-red-500' : ''}`}
                                            type="number"
                                            step={o.type === 'percent' ? 0.01 : 1}
                                            value={o.value}
                                            onChange={(e) => updateSetOption(s.name, qk, idx, { value: Number(e.target.value) })}
                                            placeholder={o.type === 'percent' ? '1.00' : '100'}
                                            title={oe?.value?.message}
                                          />
                                          <input
                                            className="border rounded px-2 py-1 col-span-2"
                                            value={o.tip ?? ''}
                                            onChange={(e) => updateSetOption(s.name, qk, idx, { tip: e.target.value })}
                                            placeholder="tip"
                                          />
                                          <div className="col-span-2 flex gap-2">
                                            <button className="bb-btn" onClick={() => moveSetOption(s.name, qk, idx, -1)} title="Omhoog">↑</button>
                                            <button className="bb-btn" onClick={() => moveSetOption(s.name, qk, idx, 1)} title="Omlaag">↓</button>
                                            <button className="bb-btn" onClick={() => removeSetOption(s.name, qk, idx)}>Verwijder</button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <div className="mt-2">
                                    <button className="bb-btn" onClick={() => addSetOption(s.name, qk)}>+ Optie</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* === Modellen in deze categorie (daarna) === */}
          <div className="bb-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Modellen in deze categorie</h3>
              <div className="text-sm text-gray-500">{loading ? 'Laden…' : `${models.length} modellen`}</div>
            </div>

            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600">
                  <tr>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3">Gebruik categorie-set</th>
                    <th className="py-2 pr-3">Custom set</th>
                    <th className="py-2 pr-3">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => {
                    const assigned = (m as any).assigned_set as string | null | undefined;

                    // Slider: groen (rechts) = categorie of geen set; blauw (links) = custom set
                    const sliderIsGreen = m.uses_category || !assigned;
                    const trackColor = sliderIsGreen ? '#22c55e' : '#3b82f6';
                    const knobTranslate = sliderIsGreen ? '22px 0' : '2px 0';
                    const titleText = sliderIsGreen ? 'Categorie-set actief' : 'Custom set actief';

                    return (
                      <tr key={m.model} className="border-t">
                        <td className="py-2 pr-3">{m.model}</td>

                        {/* Toggle */}
                        <td className="py-2 pr-3">
                          <label className="inline-flex items-center gap-2 select-none">
                            <span className="text-xs text-gray-600">Custom</span>
                          <button
                            type="button"
                            aria-pressed={m.uses_category}
                            onClick={() => toggleModel(m, !m.uses_category)}
                            className="relative inline-flex h-6 w-11 items-center rounded-full transition"
                            style={{
                              // Groen wanneer categorie-set actief, anders blauw
                              background: m.uses_category ? '#22c55e' /* green-500 */ : '#3b82f6' /* blue-500 */,
                            }}
                            title={m.uses_category ? 'Categorie-set actief' : 'Custom (set/adhoc) actief'}
                          >
                            <span
                              className="inline-block h-5 w-5 transform rounded-full bg-white transition"
                              style={{
                                translate: m.uses_category ? '22px 0' : '2px 0', // rechts bij categorie, links bij custom
                                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                              }}
                            />
                          </button>

                              <span
                                className="inline-block h-5 w-5 transform rounded-full bg-white transition"
                                style={{ translate: knobTranslate, boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
                              />
                            </button>
                            <span className="text-xs text-gray-600">Categorie</span>
                          </label>
                        </td>

                        {/* Dropdown altijd zichtbaar */}
                        <td className="py-2 pr-3">
                          <select
                            className="border rounded px-2 py-1 bg-white"
                            value={assigned || ''}
                            onChange={async (e) => {
                              const next = e.target.value || '';
                              await assignModelSet(m, next);
                            }}
                          >
                            <option value="">— kies set —</option>
                            {sets.map((s) => (
                              <option key={s.name} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                        </td>

                        <td className="py-2 pr-3">
                          <div className="flex gap-2">
                            {!m.uses_category && (
                              <button className="bb-btn" onClick={() => startEditCustom(m)}>
                                Bewerk ad hoc (los van set)
                              </button>
                            )}
                            {!m.uses_category && (
                              <button
                                className="bb-btn"
                                onClick={() => assignModelSet(m, '')}
                                title="Verwijder custom en gebruik categorie-set"
                              >
                                Reset → categorie
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {models.length === 0 && (
                    <tr>
                      <td className="py-3 text-gray-500" colSpan={4}>
                        Geen modellen geladen.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inline ad-hoc editor */}
          {editModel && (
            <div className="bb-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Ad hoc custom (los van set) — {editModel}</h3>
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
                {orderedEntries(editQs, editOrder).map(([qk, block]) => {
                  const qErr = editErrors[qk];
                  return (
                    <div key={qk} className="border rounded p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          className={`border rounded px-2 py-1 w-64 ${qErr?._questionKey ? 'border-red-500' : ''}`}
                          defaultValue={qk}
                          readOnly
                          title={qErr?._questionKey?.message}
                        />
                        <button className="bb-btn" onClick={() => renameEditQuestion(qk)}>
                          Hernoem sleutel
                        </button>

                        <input
                          className={`border rounded px-2 py-1 flex-1 ${qErr?.title ? 'border-red-500' : ''}`}
                          value={block?.title ?? ''}
                          onChange={(e) => updateEditQuestionTitle(qk, e.target.value)}
                          placeholder={`Titel voor ${qk}`}
                          title={qErr?.title?.message}
                        />
                        <div className="flex gap-1">
                          <button className="bb-btn" title="Vraag omhoog" onClick={() => moveEditQuestion(qk, -1)}>↑</button>
                          <button className="bb-btn" title="Vraag omlaag" onClick={() => moveEditQuestion(qk, 1)}>↓</button>
                        </div>
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
                                title={oe?.label?.message}
                              />
                              <input
                                className={`border rounded px-2 py-1 col-span-2 ${oe?.key ? 'border-red-500' : ''}`}
                                value={o.key}
                                onChange={(e) => updateEditOption(qk, idx, { key: e.target.value })}
                                placeholder="Key"
                                title={oe?.key?.message}
                              />
                              <select
                                className={`border rounded px-2 py-1 col-span-2 ${oe?.type ? 'border-red-500' : ''}`}
                                value={o.type}
                                onChange={(e) => updateEditOption(qk, idx, { type: e.target.value as QType })}
                                title={oe?.type?.message}
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
                                title={oe?.value?.message}
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
        </>
      )}
    </div>
  );
}
