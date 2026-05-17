// app/api/diagnostics/sessions/update/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const sessionId =
      body.sessionId;

    if (!sessionId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "sessionId ontbreekt",
        },
        {
          status: 400,
        }
      );
    }

    const { data: existingSession, error: fetchError } =
      await supabaseAdmin
        .from("diagnostics_sessions")
        .select("*")
        .eq(
          "session_id",
          sessionId
        )
        .single();

    if (fetchError || !existingSession) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "sessie niet gevonden",
        },
        {
          status: 404,
        }
      );
    }

    const existingResult =
      typeof existingSession.result ===
        "object" &&
      existingSession.result !== null
        ? existingSession.result
        : {};

    const mergedResult = {
      ...existingResult,
      ...(body.result || {}),
      ...(body.resultPatch || {}),
    };

    const { data, error } =
      await supabaseAdmin
        .from("diagnostics_sessions")
        .update({
          status:
            body.status ||
            existingSession.status,

          result: mergedResult,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "session_id",
          sessionId
        )
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
        error: "server error",
      },
      {
        status: 500,
      }
    );
  }
}
