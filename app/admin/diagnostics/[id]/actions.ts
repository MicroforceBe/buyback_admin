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
