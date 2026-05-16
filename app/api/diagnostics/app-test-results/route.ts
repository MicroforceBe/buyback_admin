// app/api/diagnostics/app-test-results/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toStringOrNull(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const sessionId = toStringOrNull(body.sessionId);
    const testKey = toStringOrNull(body.testKey);
    const status = toStringOrNull(body.status);
    const notes = toStringOrNull(body.notes);

    if (!sessionId || !testKey || !status) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing sessionId, testKey or status",
        },
        {
          status: 400,
        }
      );
    }

    const session = await prisma.diagnosticSession.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: "Diagnostic session not found",
        },
        {
          status: 404,
        }
      );
    }

    const result = await prisma.diagnosticAppTestResult.create({
      data: {
        sessionId,
        testKey,
        status,
        notes,
        value: body.value || null,
      },
    });

    return NextResponse.json({
      ok: true,
      resultId: result.id,
    });
  } catch (error) {
    console.error("app-test-result failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to save app test result",
      },
      {
        status: 500,
      }
    );
  }
}
