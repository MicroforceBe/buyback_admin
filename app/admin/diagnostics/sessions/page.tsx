import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700";
    case "running":
    case "started":
      return "bg-blue-100 text-blue-700";
    case "failed":
      return "bg-red-100 text-red-700";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

function formatBelgianTime(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("nl-BE", {
    timeZone: "Europe/Brussels",
  });
}

export default async function DiagnosticsSessionsPage() {
  const { data } = await supabaseAdmin
    .from("diagnostics_sessions")
    .select("*")
    .order("started_at", {
      ascending: false,
    })
    .limit(100);

  const sessions = data || [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Diagnostics Sessions</h1>

        <p className="mt-2 text-sm text-neutral-500">
          Live diagnostics activity
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Status
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Model
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                IMEI
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Station
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Winkel
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Gestart
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {sessions.map((session) => (
              <tr key={session.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/diagnostics/sessions/${session.id}`}>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(
                        session.status
                      )}`}
                    >
                      {session.status}
                    </span>
                  </Link>
                </td>

                <td className="px-4 py-3 text-sm">
                  <Link
                    href={`/admin/diagnostics/sessions/${session.id}`}
                    className="hover:underline"
                  >
                    {session.model || "-"}
                  </Link>
                </td>

                <td className="px-4 py-3 text-sm">
                  <Link
                    href={`/admin/diagnostics/sessions/${session.id}`}
                    className="hover:underline"
                  >
                    {session.imei || "-"}
                  </Link>
                </td>

                <td className="px-4 py-3 text-sm">
                  {session.station_name || "-"}
                </td>

                <td className="px-4 py-3 text-sm">
                  {session.store_name || "-"}
                </td>

                <td className="px-4 py-3 text-sm">
                  {formatBelgianTime(session.started_at)}
                </td>
              </tr>
            ))}

            {sessions.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-neutral-500"
                >
                  Geen diagnostics sessies
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
