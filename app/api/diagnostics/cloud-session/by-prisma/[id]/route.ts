import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  {
    params,
  }: {
    params: {
      id: string;
    };
  }
) {
  try {
    const prismaSessionId =
      params.id;

    if (!prismaSessionId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "prisma session id ontbreekt",
        },
        {
          status: 400,
        }
      );
    }

    const { data, error } =
      await supabaseAdmin
        .from("diagnostics_sessions")
        .select("*")
        .eq(
          "prisma_session_id",
          prismaSessionId
        )
        .order("started_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

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
      session: data || null,
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
