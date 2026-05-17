// app/admin/diagnostics/sessions/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    id: string;
  };
};

const TEST_LABELS: Record<string, string> = {
  screen: "Scherm",
  camera: "Camera",
  microphone: "Microfoon",
  speaker: "Speaker",
  buttons: "Knoppen",
  battery: "Batterij",
  faceId: "Face ID",
  wifi: "Wifi",
};

function getBadgeClass(value: string) {
  switch (value) {
    case "passed":
    case "completed":
      return "bg-green-100 text-green-700";

    case "failed":
      return "bg-red-100 text-red-700";

    case "pending":
    case "running":
      return "bg-yellow-100 text-yellow-700";

    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

export default async function DiagnosticsSessionDetailPage({
  params,
}: Props) {
  const { data: session } = await supabaseAdmin
    .from("diagnostics_sessions")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!session) {
    notFound();
  }

  const result =
    typeof session.result === "object" &&
    session.result !== null
      ? session.result
      : {};

  const overall =
    typeof result.overall === "string"
      ? result.overall
      : "pending";

  const testEntries = Object.entries(result).filter(
    ([key]) => key !== "overall"
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/admin/diagnostics/sessions"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Terug naar sessies
        </Link>

        <h1 className="mt-3 text-3xl font-bold">
          Cloud diagnostics sessie
        </h1>

        <p className="mt-2 text-sm text-neutral-500">
          {session.session_id}
        </p>
      </div>

      <div className="grid gap-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Overzicht
            </h2>

            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${getBadgeClass(
                overall
              )}`}
            >
              Overall: {overall}
            </span>
          </div>

          <div className="grid gap-2 text-sm">
            <div>
              <strong>Status:</strong>{" "}
              {session.status || "-"}
            </div>

            <div>
              <strong>Model:</strong>{" "}
              {session.model || "-"}
            </div>

            <div>
              <strong>IMEI:</strong>{" "}
              {session.imei || "-"}
            </div>

            <div>
              <strong>Serienummer:</strong>{" "}
              {session.serial_number || "-"}
            </div>

            <div>
              <strong>Station:</strong>{" "}
              {session.station_name || "-"}
            </div>

            <div>
              <strong>Winkel:</strong>{" "}
              {session.store_name || "-"}
            </div>

            <div>
              <strong>Gestart:</strong>{" "}
              {session.started_at
                ? new Date(
                    session.started_at
                  ).toLocaleString("nl-BE")
                : "-"}
            </div>

            <div>
              <strong>Voltooid:</strong>{" "}
              {session.completed_at
                ? new Date(
                    session.completed_at
                  ).toLocaleString("nl-BE")
                : "-"}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Testresultaten
          </h2>

          <div className="grid gap-3">
            {testEntries.map(
              ([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl border p-4"
                >
                  <div className="font-medium">
                    {TEST_LABELS[key] || key}
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${getBadgeClass(
                      String(value)
                    )}`}
                  >
                    {String(value)}
                  </span>
                </div>
              )
            )}

            {testEntries.length === 0 && (
              <div className="rounded-xl border p-4 text-sm text-neutral-500">
                Geen testresultaten beschikbaar
              </div>
            )}
          </div>
        </div>

      {session.prisma_session_id && (
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Web diagnostics
          </h2>
      
          <Link
            href={`/admin/diagnostics/${session.prisma_session_id}/web-tests`}
            className="inline-flex rounded-xl bg-black px-4 py-2 text-white"
          >
            Open web diagnostics
          </Link>
        </div>
      )}
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">
          Ruwe JSON
        </h2>
      
        <pre className="overflow-auto rounded-xl bg-neutral-950 p-4 text-sm text-green-200">
          {JSON.stringify(
            session.result || {},
            null,
            2
          )}
        </pre>
      </div>

      </div>
    </div>
  );
}

