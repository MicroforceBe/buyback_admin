import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function isOnline(lastSeenAt: string | null) {
  if (!lastSeenAt) {
    return false;
  }

  const diff =
    Date.now() -
    new Date(lastSeenAt).getTime();

  return diff < 1000 * 60 * 2;
}

export default async function StationsPage() {
  const { data } = await supabaseAdmin
    .from("diagnostics_stations")
    .select("*")
    .order("updated_at", {
      ascending: false,
    });

  const stations = data || [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          Diagnostics Stations
        </h1>

        <p className="text-sm text-neutral-500 mt-2">
          Live bridge stations
        </p>
      </div>

      <div className="grid gap-4">
        {stations.map((station) => {
          const online = isOnline(
            station.last_seen_at
          );

          return (
            <div
              key={station.id}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {station.station_name}
                  </h2>

                  <p className="text-sm text-neutral-500">
                    {station.store_name}
                  </p>
                </div>

                <div
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    online
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {online
                    ? "Online"
                    : "Offline"}
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm">
                <div>
                  <span className="font-medium">
                    Hostname:
                  </span>{" "}
                  {station.hostname ||
                    "-"}
                </div>

                <div>
                  <span className="font-medium">
                    IP:
                  </span>{" "}
                  {station.local_ip ||
                    "-"}
                </div>

                <div>
                  <span className="font-medium">
                    Platform:
                  </span>{" "}
                  {station.platform ||
                    "-"}
                </div>

                <div>
                  <span className="font-medium">
                    Bridge:
                  </span>{" "}
                  {station.bridge_version ||
                    "-"}
                </div>

                <div>
                  <span className="font-medium">
                    Laatste seen:
                  </span>{" "}
                  {station.last_seen_at
                    ? new Date(
                        station.last_seen_at
                      ).toLocaleString(
                        "nl-BE"
                      )
                    : "-"}
                </div>
              </div>
            </div>
          );
        })}

        {stations.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center text-neutral-500">
            Geen stations gevonden
          </div>
        )}
      </div>
    </div>
  );
}
