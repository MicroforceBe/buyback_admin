import { requirePageAccess } from '@/lib/security/access';
// app/admin/diagnostics/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WebDiagnosticsQr from "./WebDiagnosticsQr";
import { diagnosticReport, WEB_TESTS, RESULT_LABELS } from "@/lib/diagnostics";
export const dynamic = "force-dynamic";

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

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string"
      )
    : [];
}

export default async function DiagnosticSessionPage({
  params: incomingParams,
  searchParams: incomingSearch,
}: {
  searchParams?: Promise<{diagnostic_error?: string; diagnostic_saved?: string}>;
  params: Promise<{
    id: string;
  }>;
}) {
  await requirePageAccess('refurb', false);
  const params = await incomingParams;

  const session =
    await prisma.diagnosticSession.findUnique({
      where: {
        id: params.id,
      },
        include: {
          deviceUnit: {
            include: {
              sessions: {
                orderBy: {
                  createdAt: "desc",
                },
              },
            },
          },
          tests: {
            orderBy: {
              createdAt: "desc",
            },
          },
          appTests: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
    });

  if (!session) {
    notFound();
  }

  const query = incomingSearch ? await incomingSearch : {};
  const report = diagnosticReport(session.tests, session.deviceUnit.batteryHealth, session.appTests);
  const currentCertificate = session.status === "completed" && report.canFinalize && report.score === session.finalScore && report.grade === session.finalGrade && session.deviceUnit.securityGrade !== "FAIL";

  const previousSessions =
    session.deviceUnit.sessions.filter(
      (item) => item.id !== session.id
    );

  const latestPreviousSession =
    previousSessions[0];

  const latestByKey =
    new Map<string, string>();

  for (const test of session.tests) {
    if (!latestByKey.has(test.testKey)) {
      latestByKey.set(
        test.testKey,
        test.status
      );
    }
  }

  const device = session.deviceUnit;
  const webDiagnosticsUrl =
    `${process.env.NEXT_PUBLIC_APP_URL}/admin/diagnostics/${session.id}/web-tests`;

  const securityWarnings =
    asStringArray(
      device.securityWarnings
    );

  const securityFailures =
    asStringArray(
      device.securityFailures
    );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Diagnostic sessie
      </h1>

      {query.diagnostic_error ? <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-4">{query.diagnostic_error}</div> : null}
      {query.diagnostic_saved ? <div role="status" className="mb-4 rounded border border-green-300 bg-green-50 p-4">Beoordeling afgerond met de bewaarde resultaten.</div> : null}
      {previousSessions.length > 0 ? (
        <div className="mb-6 rounded border border-yellow-300 bg-yellow-50 p-4">
          <h2 className="font-semibold text-yellow-900">
            Let op: dit toestel is eerder getest
          </h2>

          <div className="mt-2 space-y-1 text-sm text-yellow-900">
            <div>
              Vorige sessies:{" "}
              {previousSessions.length}
            </div>

            <div>
              Laatste vorige grade:{" "}
              {latestPreviousSession?.finalGrade ||
                "—"}
            </div>

            <div>
              Laatste vorige score:{" "}
              {latestPreviousSession?.finalScore ??
                "—"}
            </div>

            <div>
              Laatste vorige status:{" "}
              {latestPreviousSession?.status ||
                "—"}
            </div>

            <div>
              Laatste vorige testdatum:{" "}
              {latestPreviousSession
                ? latestPreviousSession.createdAt.toLocaleString(
                    "nl-BE"
                  )
                : "—"}
            </div>
          </div>
        </div>
      ) : null}

      {device.securityGrade ===
      "FAIL" ? (
        <div className="mb-6 rounded border border-red-300 bg-red-50 p-4 text-red-900">
          <h2 className="font-semibold">
            Security FAIL
          </h2>

          <p className="mt-1 text-sm">
            Dit toestel mag niet
            verkoopbaar worden zonder
            oplossing of manuele
            vrijgave.
          </p>
        </div>
      ) : null}

      {device.securityGrade ===
      "WARNING" ? (
        <div className="mb-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-yellow-900">
          <h2 className="font-semibold">
            Security warning
          </h2>

          <p className="mt-1 text-sm">
            Er zijn controles die nog
            manueel of extern bevestigd
            moeten worden.
          </p>
        </div>
      ) : null}

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
              {device.activationState ||
                "—"}
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
              {device.batteryHealth ??
                "—"}
              %
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Batterijcycli:
              </span>{" "}
              {device.batteryCycles ??
                "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Huidige lading:
              </span>{" "}
              {device.batteryCurrentCharge ??
                "—"}
              %
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Design capacity:
              </span>{" "}
              {device.batteryDesignCapacity ??
                "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Nominal capacity:
              </span>{" "}
              {device.batteryNominalChargeCapacity ??
                "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Voltage:
              </span>{" "}
              {device.batteryVoltage ||
                "—"}{" "}
              mV
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Temperatuur:
              </span>{" "}
              {device.batteryTemperatureCelsius ||
                "—"}
              °C
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
                Security grade:
              </span>{" "}
              {device.securityGrade ||
                "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Activation lock:
              </span>{" "}
              {device.activationLockStatus ||
                "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Find My:
              </span>{" "}
              {device.findMyStatus ||
                "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                MDM:
              </span>{" "}
              {device.mdmStatus || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Carrier:
              </span>{" "}
              {device.carrierName || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                SIM status:
              </span>{" "}
              {device.simStatus || "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                SIM lock:
              </span>{" "}
              {device.simLockStatus ||
                "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Carrier lock:
              </span>{" "}
              {device.carrierLockStatus ||
                "—"}
            </div>

            <div>
              <span className="font-medium text-gray-900">
                Blacklist:
              </span>{" "}
              {device.blacklistStatus ||
                "—"}
            </div>
          </div>

          {securityFailures.length >
          0 ? (
            <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
              <div className="font-medium text-red-900">
                Failures
              </div>

              <ul className="mt-2 list-disc pl-5 text-sm text-red-900">
                {securityFailures.map(
                  (item) => (
                    <li key={item}>
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}

          {securityWarnings.length >
          0 ? (
            <div className="mt-4 rounded border border-yellow-200 bg-yellow-50 p-3">
              <div className="font-medium text-yellow-900">
                Warnings
              </div>

              <ul className="mt-2 list-disc pl-5 text-sm text-yellow-900">
                {securityWarnings.map(
                  (item) => (
                    <li key={item}>
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <WebDiagnosticsQr
        url={webDiagnosticsUrl}
      />

      <div className="mt-6 rounded border p-4">
        <h2 className="mb-4 font-semibold">
          Diagnostic resultaat
        </h2>

        <div className="space-y-1 text-sm text-gray-600">
          <div>
            <span className="font-medium text-gray-900">
              Score:
            </span>{" "}
            {currentCertificate ? session.finalScore : "Nog geen definitieve score"}
          </div>

          <div>
            <span className="font-medium text-gray-900">
              Grade:
            </span>{" "}
            {currentCertificate ? session.finalGrade : "Nog geen definitieve grade"}
          </div>

          <div>
            <span className="font-medium text-gray-900">
              Status:
            </span>{" "}
            {session.status}
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Bewaarde webdiagnose — protocol v1</h2>
        <p className="my-3 text-sm">{WEB_TESTS.length-report.incomplete.length} van {WEB_TESTS.length} controles beoordeeld. Niet getest of niet ondersteund blokkeert afronden. Aanvullende handmatige en appresultaten blijven behouden en tellen mee bij afkeuringen of aandachtspunten.</p>
        {!report.batteryKnown ? <p className="my-2 text-sm text-amber-800">Batterijconditie ontbreekt of is ongeldig; er wordt geen grade berekend.</p> : null}
        <a className="underline" href={`/admin/diagnostics/${session.id}/web-tests`}>Webcontrole openen / hervatten</a>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Controle</th><th className="p-2">Uitslag</th><th className="p-2">Toelichting</th></tr></thead><tbody>{WEB_TESTS.map(t=>{const r=report.results[t.key];return <tr className="border-t" key={t.key}><td className="p-2">{t.label}</td><td className="p-2">{RESULT_LABELS[r?.status || 'pending']}</td><td className="p-2">{r?.notes || '—'}</td></tr>;})}</tbody></table></div>
      </section>

      <div className="mt-6 rounded border p-4">
        <h2 className="mb-4 font-semibold">
          Aanvullende appresultaten
        </h2>
      
        {session.appTests.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nog geen testresultaten ontvangen van de iPhone app.
          </p>
        ) : (
          <div className="space-y-3">
            {session.appTests.map((test) => (
              <div
                key={test.id}
                className="rounded border p-3 text-sm"
              >
                <div className="font-medium">
                  {test.testKey}
                </div>
      
                <div className="text-gray-600">
                  Status: {test.status}
                </div>
      
                <div className="text-gray-600">
                  Tijdstip: {test.createdAt.toLocaleString("nl-BE")}
                </div>
      
                {test.notes ? (
                  <div className="text-gray-600">
                    Notes: {test.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      
      <div className="mt-6 rounded border p-4">
        <h2 className="font-semibold mb-4">
          Aanvullende handmatige controles
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
              disabled={!report.canFinalize || session.deviceUnit.securityGrade === "FAIL"}
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
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
          <a
            href={`/admin/diagnostics/${session.id}/web-tests`}
            className="inline-block rounded border px-4 py-2"
          >
            Web diagnostics
          </a>

        </div>
      </div>
    </div>
  );
}





