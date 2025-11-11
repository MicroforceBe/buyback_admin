// app/api/admin/multipliers/category/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as sbExport } from "@/lib/supabaseAdmin";

function sb() {
  const any: any = sbExport as any;
  return typeof any === "function" ? any() : any;
}

/**
 * Verwacht query: ?category=Phones (bv.)
 * Response:
 * {
 *   base: { questions, order|q_order|questions_order, tips },
 *   models: Array<{ model, uses_category, has_custom, assigned_set }>
 * }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = (searchParams.get("category") || "").trim();
    if (!category) {
      return NextResponse.json({ error: "category is verplicht" }, { status: 400 });
    }

    // 1) Basis (categorie) set ophalen
    const baseRes = await sb()
      .from("buyback_category_multipliers_json")
      .select("category, questions, order, q_order, questions_order, tips")
      .eq("category", category)
      .maybeSingle();

    const base =
      baseRes.data
        ? {
            questions: baseRes.data.questions || {},
            order: baseRes.data.order || baseRes.data.q_order || baseRes.data.questions_order || [],
            q_order: baseRes.data.q_order || baseRes.data.order || baseRes.data.questions_order || [],
            questions_order: baseRes.data.questions_order || baseRes.data.order || baseRes.data.q_order || [],
            tips: baseRes.data.tips || {},
          }
        : {
            questions: {},
            order: [],
            q_order: [],
            questions_order: [],
            tips: {},
          };

    // 2) Modellen voor deze categorie
    // PAS DIT AAN naar je eigen bron indien anders (view of tabel).
    const modelsRes = await sb()
      .from("buyback_models_by_category") // <- jouw bron met kolommen: model, category
      .select("model")
      .eq("category", category)
      .order("model", { ascending: true });

    if (modelsRes.error) {
      return NextResponse.json({ error: modelsRes.error.message }, { status: 500 });
    }
    const modelNames: string[] = (modelsRes.data || []).map((r: any) => r.model);

    // 3) Assignments ophalen voor deze categorie
    const assignsRes = await sb()
      .from("buyback_model_multiplier_assignments")
      .select("model, uses_category, assigned_set")
      .eq("category", category);

    if (assignsRes.error) {
      return NextResponse.json({ error: assignsRes.error.message }, { status: 500 });
    }

    const assignsMap = new Map<string, { uses_category: boolean; assigned_set: string | null }>();
    (assignsRes.data || []).forEach((r: any) =>
      assignsMap.set(r.model, { uses_category: !!r.uses_category, assigned_set: r.assigned_set ?? null })
    );

    // 4) Samenstellen models payload
    const models = modelNames.map((name) => {
      const a = assignsMap.get(name);
      const uses_category = a ? a.uses_category : true; // default: categorie
      const assigned_set = a ? a.assigned_set : null;
      return {
        model: name,
        uses_category,
        has_custom: !!assigned_set,
        assigned_set,
      };
    });

    return NextResponse.json({ base, models });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Onbekende fout" }, { status: 500 });
  }
}
