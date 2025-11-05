// app/api/buyback/route.ts  (ADMIN)
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------- Types ----------
type ModelRow = {
  id: string;
  model: string;
  brand?: string | null;
  category?: string | null;
  image_url?: string | null;
};
type CapacityRow = {
  capacity_gb: number;
  price_cents: number;
  image_url?: string | null;
  variant?: string | null;
};
type MultipliersRaw = {
  questions_json?: Record<string, any> | null;
  questions?: Record<string, any> | null;
};

// ---------- GET handler ----------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const modelName = (url.searchParams.get('model') || '').trim();

    if (modelName) {
      // 1) Model ophalen
      const modelRow = await getModelByName(modelName); // <- implementeer
      if (!modelRow) {
        return NextResponse.json({ error: 'not found' }, { status: 404 });
      }

      // 2) Capaciteiten
      const capacities = await getCapacitiesForModel(modelRow.id); // <- implementeer

      // 3) Vragen: custom > category-set
      const custom = await getModelCustomMultipliers(modelRow.id); // <- implementeer
      const catSet = await getCategoryMultipliers(modelRow.category); // <- implementeer

      const chosen = custom ?? catSet ?? null;
      const questions =
        (chosen?.questions_json as any) ??
        (chosen?.questions as any) ??
        null;

      // Response payload (zoals storefront verwacht)
      const payload = {
        data: {
          model: modelRow.model,
          brand: modelRow.brand ?? null,
          category: modelRow.category ?? null,
          image_url: modelRow.image_url ?? null,
          capacities: capacities.map(c => ({
            capacity_gb: c.capacity_gb,
            price_cents: c.price_cents,
            image_url: c.image_url ?? null,
            variant: c.variant ?? null,
          })),
          // Alleen vragen meesturen als we een set hebben
          ...(questions ? { questions } : {}),
        },
      };

      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    // Zonder ?model= -> simpele lijst (optioneel)
    const models = await getAllModels();
    return NextResponse.json({ data: { models } }, {
      headers: { 'Cache-Control': 'no-store' },
    });

  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'server error' },
      { status: 500 }
    );
  }
}

// ---------- Data helpers (vervang door echte queries) ----------
// import { prisma } from '@/lib/prisma';

async function getModelByName(name: string): Promise<ModelRow | null> {
  // Voorbeeld Prisma:
  // const row = await prisma.model.findFirst({
  //   where: { model: name },
  //   select: { id: true, model: true, brand: true, category: true, image_url: true },
  // });
  // return row ?? null;

  return null; // TEMP
}

async function getCapacitiesForModel(modelId: string): Promise<CapacityRow[]> {
  // Voorbeeld Prisma:
  // return prisma.capacity.findMany({
  //   where: { modelId },
  //   select: { capacity_gb: true, price_cents: true, image_url: true, variant: true },
  // });

  return []; // TEMP
}

async function getCategoryMultipliers(category: string | null | undefined): Promise<MultipliersRaw | null> {
  // Voorbeeld Prisma:
  // if (!category) return null;
  // return prisma.multipliersSet.findFirst({
  //   where: { key: category },
  //   select: { questions_json: true, questions: true },
  // });

  return null; // TEMP
}

async function getModelCustomMultipliers(modelId: string): Promise<MultipliersRaw | null> {
  // Voorbeeld Prisma:
  // return prisma.multipliersCustom.findFirst({
  //   where: { modelId },
  //   select: { questions_json: true, questions: true },
  // });

  return null; // TEMP
}

async function getAllModels(): Promise<string[]> {
  // Voorbeeld Prisma:
  // const rows = await prisma.model.findMany({ select: { model: true } });
  // return rows.map(r => r.model);

  return []; // TEMP
}
