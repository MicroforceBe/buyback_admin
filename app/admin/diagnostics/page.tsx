import { prisma } from "@/lib/prisma";

export default async function DiagnosticsPage() {
  const sessions = await prisma.diagnosticSession.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      deviceUnit: true,
    },
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Diagnostics
      </h1>
<a
  href="/admin/diagnostics/new"
  className="inline-block rounded bg-black px-4 py-2 text-white mb-6"
>
  Nieuwe sessie
</a>

      <div className="space-y-4">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="border rounded-lg p-4"
          >
            <div className="font-semibold">
              {session.deviceUnit.brand}{" "}
              {session.deviceUnit.model}
            </div>

            <div className="text-sm text-gray-500">
              IMEI: {session.deviceUnit.imei || "—"}
            </div>

            <div className="text-sm">
              Grade: {session.finalGrade || "—"}
            </div>

            <div className="text-sm">
              Battery:{" "}
              {session.deviceUnit.batteryHealth || "—"}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
