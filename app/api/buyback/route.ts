// app/api/buyback/route.ts  (ADMIN)
// Doel: /api/buyback?model=... geeft nieuwe samengestelde vragen terug.

import { NextResponse } from 'next/server';
// import { prisma } from '@/lib/prisma'; // <-- pas aan naar jouw prisma import

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Option = {
  key: string;
  label?: string | null;
  tip?: string | null;
  type: 'percent' | 'fixed';
  value: number;
  active?: boolean;
  priority?: number | null;
};
type QuestionBlock = { title?: string | null; options: Option[] };
type Questions = Record<string, QuestionBlock>;

function normKey(k: string): string {
  const t = k.trim().toLowerCase();
  if (t.startsWith('scherm')) return 'screen';
  if (t.startsWith('batterij')) return 'battery';
  if (t.startsWith('behuizing')) return 'housing';
  if (t.startsWith('eu')) return 'eu_model';
  if (t.startsWith('werkt') || t.startsWith('functional')) return 'functional';
  return t.replace(/\s+/g, '_');
}

function normalizeSet(raw: any): { questions: Questions; order: string[] } {
  const src = (raw?.questions_json ?? raw?.questions ?? {}) as Record<string, any>;
  const q: Questions = {};
  const order: string[] = [];
  for (const [origKey, block] of Object.entries(src)) {
    const key = normKey(origKey);
    const title = block?.title ?? origKey;
    const options: Option[] = (block?.options ?? []).map((o: any) => ({
      key: String(o.key),
      label: o.label ?? o.key,
      tip: o.tip ?? '',
      type: o.type === 'fixed' ? 'fixed' : 'percent',
      value: Number(o.value ?? 1),
      active: o.active !== false,
      priority: o.priority ?? null,
    }));
    q[key] = { title, options };
    order.push(key);
  }
  return { questions: q, order };
}

function mergeSets(baseQ: Questions, baseOrder: string[], overQ: Questions, overOrder: string[]) {
  const out: Questions = JSON.parse(JSON.stringify(baseQ));
  for (const [k, block] of Object.entries(overQ)) {
    if (!out[k]) out[k] = { title: block.title, options: [] };
    out[k].title = block.title ?? out[k].title;
    const byKey = new Map(out[k].options.map(o => [o.key, o]));
    for (const o of block.options) byKey.set(o.key, o);
    out[k].options = Array.from(byKey.values());
  }
  const seen = new Set<string>();
  const order = [...overOrder, ...baseOrder, ...Object.keys(out)].filter(k => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { questions: out, order };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const modelName = (url.searchParams.get('model') || '').trim();

  if (!modelName) {
    return NextResponse.json({ error: 'model required' }, { status: 400 });
  }

  // ---- Vervang onderstaande prisma-calls door jouw echte tabellen/velden ----
  // const modelRow = await prisma.model.findFirst({ where: { model: modelName } });
  const modelRow = await getModelByName(modelName); // <-- implementeer
  if (!modelRow) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // const capacities = await prisma.capacity.findMany({ where: { modelId: modelRow.id }, select: { capacity_gb: true, price_cents: true, image_url: true, variant: true }});
  const capacities = await getCapacitiesForModel(modelRow.id);

  // const catSetRaw = await prisma.multipliersSet.findFirst({ where: { key: modelRow.category } });
  // const customRaw = await prisma.multipliersCustom.findFirst({ where: { modelId: modelRow.id } });
  const catSetRaw = await getCategoryMultipliers(modelRow.category);
  const customRaw = await getModelCustomMultipliers(modelRow.id);

  const { questions: baseQ,  order: baseOrder } = normalizeSet(catSetRaw);
  const { questions: overQ,  order: overOrder } = normalizeSet(customRaw);
  const { questions, order } = mergeSets(baseQ, baseOrder, overQ, overOrder);

  return NextResponse.json({
    model: modelRow.model,
    brand: modelRow.brand ?? null,
    category: modelRow.category ?? null,
    image_url: modelRow.image_url ?? null,
    capacities,
    questions,
    question_order: order,
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

// ---- Dummy signatures, vervang door jouw data-access ----
async function getModelByName(name: string) {/* ... */}
async function getCapacitiesForModel(modelId: string) {/* ... */}
async function getCategoryMultipliers(category: string) {/* ... */}
async function getModelCustomMultipliers(modelId: string) {/* ... */}
