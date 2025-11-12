// app/api/admin/multipliers/category/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';

function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === 'function' ? anySb() : anySb;
}

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

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category')?.trim();
    if (!category) {
      return NextResponse.json({ error: 'category query param is required' }, { status: 400 });
    }

    const sb = sbClient();

    // 1) Categorie basis-set (uit buyback_multipliers_per_category_json)
    const { data: baseRows, error: baseErr } = await sb
      .from('buyback_multipliers_per_category_json')
      .select('questions_json, updated_at')
      .eq('category', category)
      .limit(1);

    if (baseErr) {
      return NextResponse.json({ error: baseErr.message }, { status: 500 });
    }

    const raw = (baseRows?.[0]?.questions_json as any) ?? {};

    // raw kan twee vormen hebben:
    //  A) Genest: { questions: {...}, tips: {...}, order|q_order|questions_order: [...] }
    //  B) Plat:   { "Scherm": {...}, "Batterij": {...}, tips?: {...}, order?: [...] }
    const nestedQuestions = raw?.questions && typeof raw.questions === 'object' ? raw.questions : null;

    // keys die NIET tot vragen behoren wanneer het toplevel plat is
    const META_KEYS = new Set(['questions', 'tips', 'order', 'q_order', 'questions_order']);

    // Questions extraheren robuust
    let questions: Questions;
    if (nestedQuestions) {
      questions = nestedQuestions as Questions;
    } else {
      const q: Questions = {};
      Object.keys(raw || {}).forEach((k) => {
        if (!META_KEYS.has(k) && raw[k] && typeof raw[k] === 'object') {
          q[k] = raw[k];
        }
      });
      questions = q;
    }

    // Tips ophalen (mag ontbreken)
    const tips: Record<string, string> =
      (raw?.tips && typeof raw.tips === 'object' ? raw.tips : {}) as Record<string, string>;

    // Volgorde bepalen
    const order: string[] =
      (Array.isArray(raw?.order) && raw.order) ||
      (Array.isArray(raw?.q_order) && raw.q_order) ||
      (Array.isArray(raw?.questions_order) && raw.questions_order) ||
      Object.keys(questions);

    // 2) Modellen voor deze categorie (uit buyback_catalog)
    //    We halen distinct model-namen op en dedupliceren/filtreren nog eens in JS.
    const { data: modelRows, error: modelErr } = await sb
      .from('buyback_catalog')
      .select('model')
      .eq('category', category);

    if (modelErr) {
      return NextResponse.json({ error: modelErr.message }, { status: 500 });
    }

    const seen = new Set<string>();
    const models = (modelRows || [])
      .map((r: any) => String(r?.model || '').trim())
      .filter((m: string) => {
        if (!m) return false;
        if (seen.has(m)) return false;
        seen.add(m);
        return true;
      })
      .sort((a: string, b: string) => a.localeCompare(b))
      // UI verwacht objecten met flags; default naar 'categorie gebruiken'
      .map((m: string) => ({
        model: m,
        uses_category: true,
        has_custom: false,
        assigned_set: null as string | null,
      }));

    // Response-structuur die AdminMultipliersClient verwacht:
    // { base: { questions, tips, order }, models: [...] }
    return NextResponse.json({
      base: { questions, tips, order },
      models,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
