// app/api/debug/sendStatusMail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendStatusMail } from "@/lib/email/sendStatusMail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function j(data: any, status = 200, headers?: HeadersInit) {
  return new NextResponse(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...(headers || {}) },
  });
}

function isAuthorized(req: NextRequest) {
  const required = process.env.ADMIN_DEBUG_SECRET;
  if (!required) return true;
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;
  return querySecret === required || bearer === required;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return j({ error: "Unauthorized. Provide ?secret=... or Authorization: Bearer ..." }, 401);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const orderCode = url.searchParams.get("order_code");
  const dry = url.searchParams.get("dry") === "1";

  if (!id && !orderCode) {
    return j({ error: "Specify ?id=<lead-id> or ?order_code=<BB########>" }, 400);
  }

  // fetch lead
  let query = supabaseAdmin.from("buyback_leads").select("*").limit(1);
  if (id) query = query.eq("id", id);
  if (orderCode) query = query.eq("order_code", orderCode);

  const { data, error } = await query.single();
  if (error) return j({ error: error.message }, 500);
  if (!data) return j({ error: "Lead not found" }, 404);
  if (!data.email) return j({ error: "Lead has no email; nothing to send" }, 400);

  if (dry) {
    return j({
      dry_run: true,
      to: data.email,
      subject_preview: `...`,
      lead_id: data.id,
      order_code: data.order_code ?? null,
      status: data.status ?? null,
    });
  }

  try {
    const res = await sendStatusMail(data);
    return j({
      ok: true,
      sent_to: data.email,
      id: res.id ?? undefined,
      order_code: data.order_code ?? null,
      status: data.status ?? null,
    });
  } catch (e: any) {
    return j({ error: "sendStatusMail failed", details: String(e?.message || e) }, 500);
  }
}
