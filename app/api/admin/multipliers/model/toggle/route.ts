// app/api/admin/multipliers/model/toggle/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as sbExport } from "@/lib/supabaseAdmin";

function sb() {
  const any: any = sbExport as any;
  return typeof any === "function" ? any() : any;
}

type Body = {
  model: string;
  category: string;
  use_category: boolean; // true => terug naar categorie (assigned_set = null)
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const p = (await req.json()) as Body;
    const model = (p.model || "").trim();
    const category = (p.category || "").trim();
    const useCategory = !!p.use_category;

    if (!model || !category) {
      return NextResponse.json({ error: "model en category zijn verplicht" }, { status: 400 });
    }

    const patch: any = {
      model,
      category,
      uses_category: useCategory,
      updated_at: new Date().toISOString(),
    };
    if (useCategory) {
      patch.assigned_set = null; // reset naar categorie
    }

    const { data, error } = await sb()
      .from("buyback_model_multiplier_assignments")
      .upsert(patch, { onConflict: "model", ignoreDuplicates: false })
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
