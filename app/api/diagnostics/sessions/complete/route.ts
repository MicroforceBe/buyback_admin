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

    const payload = {
      status: body.status || "completed",

      result: body.result || {},

      completed_at: new Date().toISOString(),

      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("diagnostics_sessions")
      .update(payload)
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
