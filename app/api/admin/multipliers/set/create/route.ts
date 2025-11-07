// app/api/admin/multipliers/set/create/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as sbExport } from "@/lib/supabaseAdmin";

// Sommige projecten exporteren een client of een factory; vang beide gevallen af
function sb() {
  const anySb: any = sbExport as any;
  return typeof anySb === "function" ? anySb() : anySb;
}

type Questions = Record<
  string,
  {
    title?: string | null;
    options: Array<{
      key: string;
      label?: string | null;
      tip?: string | null;
      type: "percent" | "fixed";
      value: number;
      priority?: number | null;
      active?: boolean | null;
    }>;
  }
>;

type Body = {
  category: string;
  name: string;           // unieke set-naam binnen de categorie
  questions: Questions;   // inhoud (mag leeg {})
  order?: string[];       // optioneel – volgorde
  q_order?: string[];     // alias
  questions_order?: string[]; // alias
};

// Preflight vermijden (zeker met fetch + JSON-headers)
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as Body;

    const category = String(payload?.category || "").trim();
    const name = String(payload?.name || "").trim();
    if (!category || !name) {
      return NextResponse.json(
        { error: "category en name zijn verplicht" },
        { status: 400 }
      );
    }

    // volgorde normaliseren – jouw client zet alle drie mee
    const order =
      (Array.isArray(payload.order) && payload.order) ||
      (Array.isArray(payload.q_order) && payload.q_order) ||
      (Array.isArray(payload.questions_order) && payload.questions_order) ||
      Object.keys(payload.questions || {});

    const client = sb();

    // === Voorbeeldschema ===
    // Tabel: buyback_multiplier_sets_json
    // Kolommen:
    //   category text
    //   name text
    //   questions jsonb
    //   order jsonb
    //   created_at timestamptz default now()
    //
    // Unieke sleutel (category, name) zodat we niet dubbel kunnen maken.
    //
    // ↳ Pas evt. naam/kolommen aan jouw schema aan.

    const { data: upserted, error: upErr } = await client
      .from("buyback_multiplier_sets_json")
      .upsert(
        {
          category,
          name,
          questions: payload.questions ?? {},
          order,
        },
        {
          onConflict: "category,name",
          ignoreDuplicates: false,
        }
      )
      .select("*")
      .single();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, set: upserted }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Onbekende fout" },
      { status: 500 }
    );
  }
}
