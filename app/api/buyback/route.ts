// app/api/buyback/route.ts  (ADMIN)
// Doel: JSON leveren voor de widget met model + capacities + questions
// Prioriteit vragen/multipliers: 1) model custom-set 2) category default-set

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const prisma = new PrismaClient();

/* ====== Types die de widget verwacht ====== */
type Option = {
  key: string;
  label?: string | null;
  tip?: string | null;
  type: "percent" | "fixed";
  value: number;               // 0.95 / 1.05 etc. of centen bij 'fixed'
  priority?: number | null;
  active?: boolean | null;
};

type QuestionsDict = Record<
  string,
  { title?: string | null; options: Option[] }
>;

/* ====== Helpers: Prisma wrappers (pas aan naar jouw schema) ====== */

// Haal model op via unieke naam (of slug)
async function getModelByName(modelName: string) {
  // TODO: pas field-namen aan naar jouw schema
  return prisma.model.findFirst({
    where: { model: modelName },
    select: {
      id: true,
      model: true,
      brand: true,
      category: true,
      image_url: true,
      // Als je model zelf een JSON met vragen heeft, kun je het hier ook meenemen:
      // questions_json: true, question_order: true,
    },
  });
}

// Capaciteiten voor dit model
async function getCapacitiesForModel(modelId: string) {
  // TODO: pas field-namen aan naar jouw schema
  const rows = await prisma.capacity.findMany({
    where: { modelId },
    select: {
      capacity_gb: true,
      price_cents: true,
      image_url: true,
      variant: true,       // of connectivity/submodel — normalisatie gebeurt in de widget
    },
    orderBy: [{ variant: "asc" }, { capacity_gb: "asc" }],
  });
  return rows ?? [];
}

/**
 * Vragen/multipliers bepalen met prioriteit:
 * 1) custom-set op modelniveau (als die bestaat)
 * 2) anders category-set op basis van model.category
 *
 * Return: { questions, order }
 */
async function getQuestionsForModel(modelRow: {
  id: string;
  category: string | null;
}) {
  // === 1) CUSTOM-SET (modelniveau) =======================================
  // Optie A: je bewaart custom vragen in een eigen tabel bv. ModelQuestion/ModelMultiplier
  // TODO: pas tabelnaam + fields aan naar jouw schema, of vervang dit door je bestaande query.
  const customRows = await prisma.modelQuestion?.findMany?.({
    where: { modelId: modelRow.id, active: true },
    select: {
      key: true,
      title: true,
      // Je kan ofwel losse rows per option hebben, of JSON per block.
      // Hieronder ga ik uit van JSON per block:
      options_json: true,        // <-- JSON array met Option[]
      priority: true,            // om eventueel order voor blocks te sturen
    },
    orderBy: [{ priority: "asc" }, { key: "asc" }],
  }).catch(() => null as any);

  if (Array.isArray(customRows) && customRows.length) {
    const questions: QuestionsDict = {};
    const order: string[] = [];

    for (const row of customRows) {
      const opts: Option[] = Array.isArray(row.options_json) ? row.options_json : [];
      if (!opts.length) continue;
      questions[row.key] = { title: row.title, options: opts };
      order.push(row.key);
    }

    if (Object.keys(questions).length) {
      return { questions, order };
    }
  }

  // === 2) CATEGORY-SET (fallback) =========================================
  // Optie B: je bewaart category-defaults in een tabel bv. CategoryQuestion/CategoryMultiplier
  // TODO: pas tabelnaam + fields aan naar jouw schema, of vervang door je bestaande query.
  if (modelRow.category) {
    const catRows = await prisma.categoryQuestion?.findMany?.({
      where: { category: modelRow.category, active: true },
      select: {
        key: true,
        title: true,
        options_json: true, // JSON array met Option[]
        priority: true,
      },
      orderBy: [{ priority: "asc" }, { key: "asc" }],
    }).catch(() => null as any);

    if (Array.isArray(catRows) && catRows.length) {
      const questions: QuestionsDict = {};
      const order: string[] = [];
      for (const row of catRows) {
        const opts: Option[] = Array.isArray(row.options_json) ? row.options_json : [];
        if (!opts.length) continue;
        questions[row.key] = { title: row.title, options: opts };
        order.push(row.key);
      }
      if (Object.keys(questions).length) {
        return { questions, order };
      }
    }
  }

  // === 3) Geen set gevonden -> lege vragen ================================
  return { questions: {} as QuestionsDict, order: [] as string[] };
}

/* ====== GET handler ====== */

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const modelName = (url.searchParams.get("model") || "").trim();

    // 1) Geen model? — lijst van modellen teruggeven (handig voor debug/SEO)
    if (!modelName) {
      // TODO: pas select aan naar jouw schema
      const models = await prisma.model.findMany({
        select: { model: true },
        orderBy: { model: "asc" },
        take: 500,
      });
      return NextResponse.json(
        { data: { models: models.map((m) => m.model) } },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    // 2) Model ophalen
    const modelRow = await getModelByName(modelName);
    if (!modelRow) {
      return NextResponse.json(
        { error: "not found", detail: `Model "${modelName}" bestaat niet` },
        { status: 404 }
      );
    }

    // 3) Capaciteiten ophalen
    const capacities = await getCapacitiesForModel(modelRow.id);

    // 4) Vragen/multipliers opbouwen met prioriteit (custom > category)
    const { questions, order } = await getQuestionsForModel({
      id: modelRow.id,
      category: modelRow.category,
    });

    // 5) Response opbouwen in het FORMaat dat de widget verwacht
    const payload = {
      data: {
        model: modelRow.model,
        brand: modelRow.brand,
        category: modelRow.category,
        image_url: modelRow.image_url,
        capacities: capacities.map((c) => ({
          capacity_gb: c.capacity_gb ?? 0,
          price_cents: c.price_cents ?? 0,
          image_url: c.image_url ?? null,
          variant: c.variant ?? null,
        })),
        questions,                // <= nieuwe logica
        question_order: order,    // <= zodat FlowClient jouw volgorde respecteert
      },
    };

    return NextResponse.json(payload, {
      headers: {
        // Laat frontend/proxy dit zonder stale cache oppikken
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
