import { NextResponse } from "next/server";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";

// Werkt met zowel een factory-functie als een kant-en-klare client:
function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === "function" ? anySb() : anySb;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/leads/:id/events
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "missing lead id" }, { status: 400 });
  }

  const sb = sbClient();
  const { data, error } = await sb
    .from("buyback_lead_events")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 }
    );
  }

  return NextResponse.json({ data }, { status: 200 });
}
