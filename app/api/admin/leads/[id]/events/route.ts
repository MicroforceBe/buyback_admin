import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("buyback_lead_events")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
