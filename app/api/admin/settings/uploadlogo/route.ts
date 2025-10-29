import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function j(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return j({ error: "file required" }, 400);

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `logo_${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { data: up, error: upErr } = await supabase
    .storage
    .from("branding")
    .upload(path, bytes, {
      contentType: file.type || "image/png",
      upsert: true,
    });

  if (upErr) return j({ error: upErr.message }, 500);

  // Public URL
  const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
  const logo_url = pub?.publicUrl || null;

  // optioneel: direct in settings schrijven
  if (logo_url) {
    await supabase.from("buyback_settings").upsert({ id: 1, logo_url }, { onConflict: "id" });
  }

  return j({ ok: true, logo_url });
}
