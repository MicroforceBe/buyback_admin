import { diagnosticAccess } from '@/lib/security/access';
// app/api/diagnostics/app-test-results/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toStringOrNull(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  const accessDenied = await diagnosticAccess(request, 'write');
  if (accessDenied) return accessDenied;

  try {
    const body = await request.json();

    const sessionId = toStringOrNull(body.sessionId);
    const testKey = toStringOrNull(body.testKey);
    const status = toStringOrNull(body.status);
    const notes = toStringOrNull(body.notes);

    if (!sessionId || sessionId.length > 100 || !testKey || testKey.length > 100 || testKey.startsWith("web:") || !status || !["pending", "pass", "warning", "fail", "unsupported", "na"].includes(status) || (notes && notes.length > 2000)) {
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

    const result = await prisma.$transaction(async tx => {
    const created = await tx.diagnosticAppTestResult.create({
      data: {
        sessionId,
        testKey,
        status,
        notes,
        value: body.value || null,
      },
    });

    await tx.diagnosticSession.update({where:{id:sessionId},data:{status:"in_progress",finalScore:null,finalGrade:null}});
    return created;
    },{isolationLevel:"Serializable"});

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


