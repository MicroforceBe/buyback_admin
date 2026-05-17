import { NextResponse } from "next/server"; 
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const sessionId = String(body.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "sessionId is verplicht",
        },
        {
          status: 400,
        }
      );
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status) {
      updatePayload.status = body.status;
    }

    if (body.result) {
      updatePayload.result = body.result;
    }

    if (body.imei) {
      updatePayload.imei = body.imei;
    }

    if (body.serialNumber) {
      updatePayload.serial_number =
        body.serialNumber;
    }

    if (body.model) {
      updatePayload.model = body.model;
    }

    const { data, error } = await supabaseAdmin
      .from("diagnostics_sessions")
      .update(updatePayload)
      .eq("session_id", sessionId)
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
