// app/api/buyback/route.ts  (ADMIN)

// --- types die we intern gebruiken ---
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
  // kies één van deze twee volgens je schema
  questions_json?: Record<string, any> | null;
  questions?: Record<string, any> | null;
};

// ---- IMPLEMENTATIES ----
// Zet je echte data-access hier. Voorbeeld met Prisma staat gecommentarieerd.
// import { prisma } from '@/lib/prisma';

async function getModelByName(name: string): Promise<ModelRow | null> {
  // // Prisma-voorbeeld (pas naam van tabel/velden aan):
  // const row = await prisma.model.findFirst({
  //   where: { model: name },
  //   select: { id: true, model: true, brand: true, category: true, image_url: true },
  // });
  // return row ?? null;

  // TEMP fallback zodat TypeScript compileert (vervang door echte query):
  return null;
}

async function getCapacitiesForModel(modelId: string): Promise<CapacityRow[]> {
  // // Prisma-voorbeeld:
  // const rows = await prisma.capacity.findMany({
  //   where: { modelId },
  //   select: { capacity_gb: true, price_cents: true, image_url: true, variant: true },
  // });
  // return rows;

  // TEMP fallback:
  return [];
}

async function getCategoryMultipliers(category: string | null | undefined): Promise<MultipliersRaw | null> {
  // // Prisma-voorbeeld (stel je set-tabel heeft key = category):
  // if (!category) return null;
  // const row = await prisma.multipliersSet.findFirst({
  //   where: { key: category },
  //   select: { questions_json: true, questions: true },
  // });
  // return row ?? null;

  // TEMP fallback:
  return null;
}

async function getModelCustomMultipliers(modelId: string): Promise<MultipliersRaw | null> {
  // // Prisma-voorbeeld:
  // const row = await prisma.multipliersCustom.findFirst({
  //   where: { modelId },
  //   select: { questions_json: true, questions: true },
  // });
  // return row ?? null;

  // TEMP fallback:
  return null;
}

