import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { saveDiagnosticTestAction } from "./actions";

const TESTS = [
  { key: "face_id", label: "Face ID" },
  { key: "touchscreen", label: "Touchscreen" },
  { key: "front_camera", label: "Front camera" },
  { key: "rear_camera", label: "Rear camera" },
  { key: "speaker", label: "Speaker" },
  { key: "microphone", label: "Microfoon" },
  { key: "buttons", label: "Knoppen" },
  { key: "charging_port", label: "Laadpoort" },
  { key: "wifi", label: "Wifi" },
  { key: "bluetooth", label: "Bluetooth" },
  { key: "cosmetic_screen", label: "Scherm cosmetisch" },
  { key: "cosmetic_frame", label: "Frame cosmetisch" },
  { key: "cosmetic_back", label: "Achterkant cosmetisch" },
];

export default async function DiagnosticSessionPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await prisma.diagnosticSession.findUnique({
    where: { id: params.id },
    include: {
      deviceUnit: true,
      tests: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!session) notFound();

  const latestByKey = new Map<string, string>();

  for (const test of session.tests) {
    if (!latestByKey.has(test.testKey)) {
      latestByKey.set(test.testKey, test.status);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Diagnostic sessie</h1>

      <div className="rounded border p-4 mb-6">
        <div className="font-semibold">
          {session.deviceUnit.brand} {session.deviceUnit.model || ""}
        </div>
        <div className="text-sm text-gray-500">
          IMEI: {session.deviceUnit.imei || "—"}
        </div>
        <div className="text-sm text-gray-500">
          Serienummer: {session.deviceUnit.serialNumber || "—"}
        </div>
        <div className="text-sm text-gray-500">
          Opslag: {session.deviceUnit.storage || "—"}
        </div>
        <div className="text-sm text-gray-500">
          Kleur: {session.deviceUnit.color || "—"}
        </div>
        <div className="text-sm text-gray-500">
          Batterij: {session.deviceUnit.batteryHealth ?? "—"}%
        </div>
      </div>

      <div className="rounded border p-4">
        <h2 className="font-semibold mb-4">Tests</h2>

        <div className="space-y-3">
          {TESTS.map((test) => {
            const currentStatus = latestByKey.get(test.key);

            return (
              <div
                key={test.key}
                className="flex flex-col gap-2 rounded border p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium">{test.label}</div>
                  <div className="text-sm text-gray-500">
                    Status: {currentStatus || "Nog niet getest"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {["pass", "warning", "fail"].map((status) => (
                    <form key={status} action={saveDiagnosticTestAction}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="testKey" value={test.key} />
                      <input type="hidden" name="status" value={status} />
                      <button
                        type="submit"
                        className="rounded border px-3 py-1 text-sm"
                      >
                        {status.toUpperCase()}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

