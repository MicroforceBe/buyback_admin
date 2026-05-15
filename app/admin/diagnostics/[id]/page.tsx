// app/admin/diagnostics/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

import {
  finalizeDiagnosticSessionAction,
  saveDiagnosticTestAction,
} from "./actions";

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

  const device = session.deviceUnit;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Diagnostic sessie
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded border p-4">
          <h2 className="mb-4 font-semibold">
            Toestelgegevens
          </h2>

          <div className="space-y-1 text-sm text-gray-600">
            <div>
              <span className="font-medium text-gray-900">
                Merk:
              </span>{" "}
              {device.brand || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Model:
              </span>{" "}
              {device.model || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Opslag:
              </span>{" "}
              {device.storage || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Kleur:
              </span>{" "}
              {device.color || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                IMEI:
              </span>{" "}
              {device.imei || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                IMEI 2:
              </span>{" "}
              {device.imei2 || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Serienummer:
              </span>{" "}
              {device.serialNumber || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                UDID:
              </span>{" "}
              {device.udid || "—"}
            </div>
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-4 font-semibold">
            Systeem & herkomst
          </h2>

          <div className="space-y-1 text-sm text-gray-600">
            <div>
              <span className="font-medium text-gray-900">
                iOS versie:
              </span>{" "}
              {device.iosVersion || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Product type:
              </span>{" "}
              {device.productType || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Modelnummer:
              </span>{" "}
              {device.modelNumber || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Partnummer:
              </span>{" "}
              {device.partNumber || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Regio:
              </span>{" "}
              {device.regionInfo || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Oorsprong:
              </span>{" "}
              {device.originCountry || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Activation state:
              </span>{" "}
              {device.activationState || "—"}
            </div>
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-4 font-semibold">
            Batterij
          </h2>

          <div className="space-y-1 text-sm text-gray-600">
            <div>
              <span className="font-medium text-gray-900">
                Batterijconditie:
              </span>{" "}
              {device.batteryHealth ?? "—"}%
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Batterijcycli:
              </span>{" "}
              {device.batteryCycles ?? "—"}
            </div>
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-4 font-semibold">
            Security & lock status
          </h2>

          <div className="space-y-1 text-sm text-gray-600">
            <div>
              <span className="font-medium text-gray-900">
                MDM:
              </span>{" "}
              {device.mdmStatus || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Carrier lock:
              </span>{" "}
              {device.carrierLockStatus || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                SIM lock:
              </span>{" "}
              {device.simLockStatus || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Blacklist:
              </span>{" "}
              {device.blacklistStatus || "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded border p-4">
        <h2 className="mb-4 font-semibold">
          Diagnostic resultaat
        </h2>

        <div className="space-y-1 text-sm text-gray-600">
          <div>
            <span className="font-medium text-gray-900">
              Score:
            </span>{" "}
            {session.finalScore ?? "—"}
          </div>

          <div>
            <span className="font-medium text-gray-900">
              Grade:
            </span>{" "}
            {session.finalGrade || "—"}
          </div>

          <div>
            <span className="font-medium text-gray-900">
              Status:
            </span>{" "}
            {session.status}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded border p-4">
        <h2 className="font-semibold mb-4">
          Tests
        </h2>

        <div className="space-y-3">
          {TESTS.map((test) => {
            const currentStatus =
              latestByKey.get(test.key);

            return (
              <div
                key={test.key}
                className="flex flex-col gap-2 rounded border p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium">
                    {test.label}
                  </div>

                  <div className="text-sm text-gray-500">
                    Status:{" "}
                    {currentStatus ||
                      "Nog niet getest"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    "pass",
                    "warning",
                    "fail",
                  ].map((status) => (
                    <form
                      key={status}
                      action={
                        saveDiagnosticTestAction
                      }
                    >
                      <input
                        type="hidden"
                        name="sessionId"
                        value={session.id}
                      />

                      <input
                        type="hidden"
                        name="testKey"
                        value={test.key}
                      />

                      <input
                        type="hidden"
                        name="status"
                        value={status}
                      />

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

        <div className="mt-6 flex flex-wrap gap-3">
          <form
            action={
              finalizeDiagnosticSessionAction
            }
          >
            <input
              type="hidden"
              name="sessionId"
              value={session.id}
            />

            <button
              type="submit"
              className="rounded bg-black px-4 py-2 text-white"
            >
              Sessie afronden en grade berekenen
            </button>
          </form>

          <a
            href={`/admin/diagnostics/${session.id}/certificate`}
            className="inline-block rounded border px-4 py-2"
          >
            Certificaat bekijken
          </a>
        </div>
      </div>
    </div>
  );
}

