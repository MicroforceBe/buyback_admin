// app/admin/diagnostics/[id]/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function saveDiagnosticTestAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") || "");
  const testKey = String(formData.get("testKey") || "");
  const status = String(formData.get("status") || "");
  const notes = String(formData.get("notes") || "").trim();

  if (!sessionId || !testKey || !status) {
    throw new Error("Ontbrekende testgegevens.");
  }

  await prisma.diagnosticTestResult.create({
    data: {
      sessionId,
      testKey,
      status,
      notes: notes || null,
    },
  });

  revalidatePath(`/admin/diagnostics/${sessionId}`);
}

export async function finalizeDiagnosticSessionAction(
  formData: FormData
) {
  const sessionId = String(formData.get("sessionId") || "");

  if (!sessionId) {
    throw new Error("Ontbrekende sessie.");
  }

  const session = await prisma.diagnosticSession.findUnique({
    where: { id: sessionId },
    include: {
      deviceUnit: true,
      tests: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!session) {
    throw new Error("Sessie niet gevonden.");
  }

  const latestByKey = new Map<string, string>();

  for (const test of session.tests) {
    if (!latestByKey.has(test.testKey)) {
      latestByKey.set(test.testKey, test.status);
    }
  }

  let score = 100;

  for (const status of latestByKey.values()) {
    if (status === "fail") {
      score -= 15;
    }

    if (status === "warning") {
      score -= 5;
    }
  }

  if ((session.deviceUnit.batteryHealth ?? 100) < 85) {
    score -= 10;
  }

  if ((session.deviceUnit.batteryHealth ?? 100) < 80) {
    score -= 20;
  }

  score = Math.max(score, 0);

  const batteryHealth =
    session.deviceUnit.batteryHealth ?? 0;

  let finalGrade = "C";

  if (score >= 90 && batteryHealth >= 90) {
    finalGrade = "A";
  } else if (
    score >= 75 &&
    batteryHealth >= 85
  ) {
    finalGrade = "B";
  }

  await prisma.diagnosticSession.update({
    where: {
      id: sessionId,
    },
    data: {
      status: "completed",
      finalScore: score,
      finalGrade,
    },
  });

  revalidatePath(`/admin/diagnostics/${sessionId}`);
  revalidatePath("/admin/diagnostics");
}
