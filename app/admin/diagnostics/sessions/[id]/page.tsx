import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    id: string;
  };
};

export default async function DiagnosticsSessionDetailPage({ params }: Props) {
  const { data: session } = await supabaseAdmin
    .from("diagnostics_sessions")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!session) {
    notFound();
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/admin/diagnostics/sessions"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Terug naar sessies
        </Link>

        <h1 className="mt-3 text-3xl font-bold">Diagnostics sessie</h1>

        <p className="mt-2 text-sm text-neutral-500">
          {session.session_id}
        </p>
      </div>

      <div className="grid gap-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Overzicht</h2>

          <div className="grid gap-2 text-sm">
            <div>
              <strong>Status:</strong> {session.status || "-"}
            </div>

            <div>
              <strong>Model:</strong> {session.model || "-"}
            </div>

            <div>
              <strong>IMEI:</strong> {session.imei || "-"}
            </div>

            <div>
              <strong>Serienummer:</strong> {session.serial_number || "-"}
            </div>

            <div>
              <strong>Station:</strong> {session.station_name || "-"}
            </div>

            <div>
              <strong>Winkel:</strong> {session.store_name || "-"}
            </div>

            <div>
              <strong>Gestart:</strong>{" "}
              {session.started_at
                ? new Date(session.started_at).toLocaleString("nl-BE")
                : "-"}
            </div>

            <div>
              <strong>Voltooid:</strong>{" "}
              {session.completed_at
                ? new Date(session.completed_at).toLocaleString("nl-BE")
                : "-"}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Resultaat</h2>

          <pre className="overflow-auto rounded-xl bg-neutral-950 p-4 text-sm text-green-200">
            {JSON.stringify(session.result || {}, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
