// app/api/buyback/multipliers/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Vereist in Vercel Project (admin):
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE (NIET de anon key!)
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // Sta zowel ?category= als ?categorie= toe (handig)
    const category =
      (url.searchParams.get('category') ??
       url.searchParams.get('categorie') ??
       '').trim();

    if (!category) {
      return NextResponse.json({ error: 'missing category' }, { status: 400 });
    }

    // Haal rij op uit je tabel met categorie-sets
    // Pas TABEL- en KOLOMNAMEN zo nodig aan!
    const { data, error } = await supabase
      .from('buyback_multipliers_per_category_json')
      .select('*')
      .eq('category', category)
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: 'not_found', detail: `no set for category "${category}"` },
        { status: 404 }
      );
    }

    // Probeer payload te vinden, ongeacht kolomnaam (flexibele extractor)
    const payload =
      (data as any).payload ??
      (data as any).data ??
      (data as any).json ??
      (data as any).multipliers ??
      data;

    // Normaliseer naar frontend-verwacht formaat:
    // { voucher_help?: string, question_order?: string[], questions: { [key]: { title?, options: [...] } } }
    const norm = normalizeCategorySet(payload);

    return NextResponse.json(norm, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

/** Probeert verschillende vormen te begrijpen en herleidt naar { voucher_help?, question_order?, questions } */
function normalizeCategorySet(raw: any) {
  if (!raw || typeof raw !== 'object') return { questions: {} };

  // Sommige schemas hebben al precies: { voucher_help, question_order, questions }
  if (raw.questions) {
    return {
      voucher_help: raw.voucher_help ?? '',
      question_order: Array.isArray(raw.question_order) ? raw.question_order : undefined,
      questions: raw.questions || {},
    };
  }

  // Soms zit alles onder raw.blocks of raw.set
  const blocks = raw.blocks ?? raw.set ?? raw.config ?? null;
  if (blocks && typeof blocks === 'object') {
    const q: Record<string, any> = {};
    for (const [k, v] of Object.entries(blocks)) {
      // verwacht { title?, options: [{ key, label, tip?, type: 'percent'|'fixed', value, priority?, active? }] }
      q[String(k)] = {
        title: (v as any).title ?? k,
        options: Array.isArray((v as any).options) ? (v as any).options : [],
      };
    }
    return {
      voucher_help: raw.voucher_help ?? '',
      question_order: Array.isArray(raw.question_order) ? raw.question_order : undefined,
      questions: q,
    };
  }

  // Als laatste redmiddel: geef raw terug onder questions als het al key->block lijkt
  const looksLikeQuestions =
    Object.values(raw).every(
      (v: any) => v && typeof v === 'object' && Array.isArray(v.options)
    );
  if (looksLikeQuestions) {
    return { voucher_help: '', questions: raw };
  }

  return { voucher_help: '', questions: {} };
}
