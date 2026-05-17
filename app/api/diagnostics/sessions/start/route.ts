import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function makeSessionId() {
  return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const stationId = String(body.stationId || "").trim();
    const stationName = String(body.stationName || "").trim();
    const storeName = String(body.storeName || "").trim();

    const sessionId = String(body.sessionId || makeSessionId()).trim();

    if (!stationId || !stationName || !storeName) {
      return NextResponse.json(
        {
          ok: false,
          error: "stationId, stationName en storeName zijn verplicht",
        },
        {
          status: 400,
        }
      );
    }

    const payload = {
      session_id: sessionId,
      station_id: stationId,
      station_name: stationName,
      store_name: storeName,

      lead_id: body.leadId || null,
      imei: body.imei || null,
      serial_number: body.serialNumber || null,
      model: body.model || null,

      status: "started",
      result: body.result || {},

      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("diagnostics_sessions")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      session: data,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: "Server error",
      },
      {
        status: 500,
      }
    );
  }
}
