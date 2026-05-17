// app/api/diagnostics/sessions/start/route.ts
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const sessionId = `diag_${Date.now()}_${randomUUID().slice(
      0,
      8
    )}`;

    const payload = {
      session_id: sessionId,

      prisma_session_id:
        body.prismaSessionId || null,

      status: "started",

      lead_id: body.leadId || null,

      imei: body.imei || null,

      serial_number:
        body.serialNumber || null,

      model: body.model || null,

      station_id:
        body.stationId || null,

      station_name:
        body.stationName || null,

      store_name:
        body.storeName || null,

      result: body.result || {},

      started_at: new Date().toISOString(),

      updated_at: new Date().toISOString(),
    };

    const { data, error } =
      await supabaseAdmin
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

