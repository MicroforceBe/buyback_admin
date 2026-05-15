import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function DiagnosticSessionPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await prisma.diagnosticSession.findUnique({
    where: { id: params.id },
    include: {
      deviceUnit: true,
      tests: true,
    },
  });

  if (!session) notFound();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Diagnostic sessie</h1>

      <div className="rounded border p-4 mb-6">
        <div className="font-semibold">
          {session.deviceUnit.brand} {session.deviceUnit.model || ""}
        </div>
        <div className="text-sm text-gray-500">IMEI: {session.deviceUnit.imei || "—"}</div>
        <div className="text-sm text-gray-500">Serienummer: {session.deviceUnit.serialNumber || "—"}</div>
        <div className="text-sm text-gray-500">Opslag: {session.deviceUnit.storage || "—"}</div>
        <div className="text-sm text-gray-500">Kleur: {session.deviceUnit.color || "—"}</div>
        <div className="text-sm text-gray-500">
          Batterij: {session.deviceUnit.batteryHealth ?? "—"}%
        </div>
      </div>

      <div className="rounded border p-4">
        <h2 className="font-semibold mb-2">Tests</h2>
        <p className="text-sm text-gray-500">
          Volgende stap: PASS / FAIL / WARNING knoppen toevoegen.
        </p>
      </div>
    </div>
  );
}
