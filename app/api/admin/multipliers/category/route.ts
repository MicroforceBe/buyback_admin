// app/api/admin/multipliers/category/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';

// In sommige projecten exporteert lib/supabaseAdmin een kant-en-klare client,
// in andere een factory. Deze helper vangt beide gevallen af.
function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === 'function' ? anySb() : anySb;
}

type Questions = Record<
  string,
  {
    title?: string | null;
    options: Array<{
      key: string;
      label?: string | null;
      tip?: string | null;
      type: 'percent' | 'fixed';
      value: number;
      priority?: number | null;
      active?: boolean | null;
    }>;
  }
>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category')?.trim() || null;

    if (!category) {
      return NextResponse.json(
        { error: 'category query param is required' },
        { status: 400 }
      );
    }

    const sb = sbClient();

    // ====== 1) BASIS (categorie-set) uit buyback_multipliers_per_category_json ======
    // Kolommen minimaal: category, questions_json, updated_at
    // In sommige setups zitten tips en order in aparte kolommen tips_json/order_json,
    // in andere zitten ze mee IN questions_json of ontbreken ze.
    const baseSel = sb
      .from('buyback_multipliers_per_category_json')
      .select('questions_json, tips_json, order_json')
      .eq('category', category)
      .maybeSingle(); // gebruik maybeSingle i.p.v. single: bestaat mogelijks (nog) niet

    // ====== 2) MODELLEN uit buyback_catalog (distinct per model voor de gekozen categorie) ======
    const modelsSel = sb
      .from('buyback_catalog')
      .select('model')
      .eq('category', category);

    const [baseRes, modelsRes] = await Promise.all([baseSel, modelsSel]);

    // --- Basis ---
    if (baseRes.error) {
      // Niet fataal: we sturen lege basis terug als de rij nog niet bestaat
      // maar melden de fouttekst in payload voor debug.
      // console.error('baseRes.error', baseRes.error);
    }

    const baseRow = baseRes.data as
      | {
          questions_json?: Questions | null;
          tips_json?: Record<string, string> | null;
          order_json?: string[] | null;
        }
      | null;

    // Vragen (verplicht veld in jouw geval)
    const questions: Questions = (baseRow?.questions_json as Questions) ?? {};

    // Tips (optioneel)
    const tips: Record<string, string> =
      (baseRow?.tips_json as Record<string, string>) ?? {};

    // Volgorde (optioneel → val terug op de sleutelvolgorde van questions)
    const order: string[] =
      (Array.isArray(baseRow?.order_json) && (baseRow?.order_json as string[])) ||
      Object.keys(questions);

    // --- Modellen ---
    const modelsRows = modelsRes.data as Array<{ model: string }> | null;
    let models: string[] =
      (modelsRows || [])
        .map((r: { model: string }) => String(r.model))
        // fix: type geven aan m om TS "implicitly any" te vermijden
        .filter((m: string) => {
          const k = m.trim();
          return k.length > 0;
        }) || [];

    // Deduplicatie en sortering
    const seen = new Set<string>();
    models = models
      .filter((m: string) => {
        const k = m.trim();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a: string, b: string) => a.localeCompare(b, 'nl', { numeric: true }));

    // Vorm in het formaat dat de client verwacht
    const modelRows = models.map((m) => ({
      model: m,
      uses_category: true, // default; echte status komt uit aparte endpoints/tabel als je die gebruikt
      has_custom: false,
      assigned_set: null as string | null,
    }));

    return NextResponse.json({
      base: {
        questions,
        tips,
        order,
      },
      models: modelRows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
