import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only
  { auth: { persistSession: false } }
);

function j(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET() {
  const { data, error } = await supabase
    .from("buyback_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) return j({ error: error.message }, 500);
  return j(data || {});
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const patch: any = {};
  ["brand_name", "brand_color", "logo_url", "email_disclaimer"].forEach((k) => {
    if (k in body) patch[k] = body[k];
  });

  const { data, error } = await supabase
    .from("buyback_settings")
    .upsert({ id: 1, ...patch }, { onConflict: "id" })
    .select("*")
    .single();

  if (error) return j({ error: error.message }, 500);
  return j(data, 200);
}
