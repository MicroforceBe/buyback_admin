// app/api/erp-sync/route.ts

import { NextResponse } from "next/server";
import { runErpSync } from "@/lib/erpSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const result = await runErpSync();

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[ERP AUTO SYNC]", e);

    return NextResponse.json(
      {
        success: false,
        error: e?.message || "Sync mislukt",
      },
      {
        status: 500,
      }
    );
  }
}
