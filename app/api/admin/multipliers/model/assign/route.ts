// app/api/admin/multipliers/model/assign/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as sbExport } from "@/lib/supabaseAdmin";

function sb() {
  const any: any = sbExport as any;
  return typeof any === "function" ? any() : any;
}

type Body = {
  model: string;
  category: string;
  set: string | null; // naam van custom set of null (= reset naar categorie)
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const p = (await req.json()) as Body;
    const model = (p.model || "").trim();
    const category = (p.category || "").trim();
    const setName = p.set && String(p.set).trim() ? String(p.set).trim() : null;

    if (!model || !category) {
      return NextResponse.json({ error: "model en category zijn verplicht" }, { status: 400 });
    }

    // Als set is gekozen → uses_category = false
    // Als set leeg/null → terug naar categorie-set → uses_category = true
    const usesCategory = setName ? false : true;

    // TABEL: buyback_model_multiplier_assignments
    // Kolommen: model text PK, category text, assigned_set text null, uses_category boolean, updated_at timestamptz
    const { data, error } = await sb()
      .from("buyback_model_multiplier_assignments")
      .upsert(
        { model, category, assigned_set: setName, uses_category: usesCategory, updated_at: new Date().toISOString() },
        { onConflict: "model", ignoreDuplicates: false }
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, row: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Onbekende fout" }, { status: 500 });
  }
}
