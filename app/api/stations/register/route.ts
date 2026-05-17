import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const stationId = String(body.stationId || "").trim();
    const stationName = String(body.stationName || "").trim();
    const storeName = String(body.storeName || "").trim();
    const localIp = String(body.localIp || "").trim();

    if (!stationId || !stationName || !storeName) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "stationId, stationName en storeName zijn verplicht",
        },
        {
          status: 400,
        }
      );
    }

    const payload = {
      station_id: stationId,
      station_name: stationName,
      store_name: storeName,
      local_ip: localIp || null,
      bridge_version: body.bridgeVersion || null,
      platform: body.platform || null,
      hostname: body.hostname || null,
      last_seen_at:
        body.lastSeenAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("diagnostics_stations")
      .upsert(payload, {
        onConflict: "station_id",
      });

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

