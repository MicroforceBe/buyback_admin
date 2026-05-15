// app/admin/diagnostics/[id]/certificate.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function DiagnosticCertificatePage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const session = await prisma.diagnosticSession.findUnique({
    where: {
      id: params.id,
    },
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
    notFound();
  }

  const latestByKey = new Map<string, string>();

  for (const test of session.tests) {
    if (!latestByKey.has(test.testKey)) {
      latestByKey.set(test.testKey, test.status);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <Link
        href={`/admin/diagnostics/${session.id}`}
        className="text-sm underline"
      >
        Terug naar sessie
      </Link>

      <div className="mt-6 rounded border p-6 bg-white">
        <h1 className="text-2xl font-bold">
          Diagnostic Certificate
        </h1>

        <div className="mt-4 text-sm text-gray-500">
          Certificaat-ID: {session.id}
        </div>

        <div className="mt-6 border-t pt-4">
          <h2 className="font-semibold mb-2">Toestel</h2>

          <p>
            {session.deviceUnit.brand}{" "}
            {session.deviceUnit.model || ""}
          </p>
          <p>IMEI: {session.deviceUnit.imei || "—"}</p>
          <p>
            Serienummer:{" "}
            {session.deviceUnit.serialNumber || "—"}
          </p>
          <p>Opslag: {session.deviceUnit.storage || "—"}</p>
          <p>Kleur: {session.deviceUnit.color || "—"}</p>
          <p>
            Batterij:{" "}
            {session.deviceUnit.batteryHealth ?? "—"}%
          </p>
        </div>

        <div className="mt-6 border-t pt-4">
          <h2 className="font-semibold mb-2">Resultaat</h2>

          <p>Score: {session.finalScore ?? "—"}</p>
          <p>Grade: {session.finalGrade || "—"}</p>
          <p>Status: {session.status}</p>
        </div>

        <div className="mt-6 border-t pt-4">
          <h2 className="font-semibold mb-2">
            Testresultaten
          </h2>

          <div className="space-y-2">
            {Array.from(latestByKey.entries()).map(
              ([key, status]) => (
                <div
                  key={key}
                  className="flex justify-between border-b py-1 text-sm"
                >
                  <span>{key}</span>
                  <span className="font-medium">
                    {status.toUpperCase()}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-500">
        Gebruik voorlopig de browserfunctie om dit certificaat te
        printen of op te slaan als PDF.
      </p>
    </div>
  );
}
