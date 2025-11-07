// app/api/admin/multipliers/sets/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as sbExport } from "@/lib/supabaseAdmin";
function sb(){const any:any = sbExport as any; return typeof any==="function"? any(): any;}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = String(url.searchParams.get("category") || "").trim();
  if (!category) return NextResponse.json({ sets: [] });

  const { data, error } = await sb()
    .from("buyback_multiplier_sets_json")
    .select("name, questions, order")
    .eq("category", category)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // UI verwacht keys: name, questions, (order|q_order|questions_order)
  const sets = (data || []).map((r: any) => ({
    name: r.name,
    questions: r.questions || {},
    order: r.order || Object.keys(r.questions || {}),
  }));

  return NextResponse.json({ sets });
}
