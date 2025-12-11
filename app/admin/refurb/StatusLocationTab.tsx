// app/admin/refurb/StatusLocationTab.tsx
import {
  RefurbStatusOption,
  RefurbLocationOption,
  saveRefurbStatusRow,
  deleteRefurbStatusRow,
  setDefaultRefurbStatus,
  saveRefurbLocationRow,
  deleteRefurbLocationRow,
  setDefaultRefurbLocation,
} from "./settings/settingsActions";

type Props = {
  initialStatuses: RefurbStatusOption[];
  initialLocations: RefurbLocationOption[];
  showStatusesOnly?: boolean;
  showLocationsOnly?: boolean;
};

export default function StatusLocationTab({
  initialStatuses,
  initialLocations,
  showStatusesOnly,
  showLocationsOnly,
}: Props) {
  const showStatuses = showLocationsOnly ? false : true;
  const showLocations = showStatusesOnly ? false : true;

  return (
    <div className="space-y-8 text-xs">
      {/* STATUSSEN */}
      {showStatuses && (
        <section className="border rounded-md p-4">
          <h2 className="font-semibold text-sm mb-2">Refurb statussen</h2>
          <p className="text-[11px] text-slate-500 mb-3">
            Beheer de mogelijke statussen in de refurb receptie. Duid één status
            als <strong>default</strong> aan; bij import of plakken wordt die
            gebruikt als er geen status meegegeven is.
          </p>

          {/* ... rest van je status-tabel ongewijzigd ... */}
        </section>
      )}

      {/* LOCATIONS */}
      {showLocations && (
        <section className="border rounded-md p-4">
          <h2 className="font-semibold text-sm mb-2">Refurb locations</h2>
          <p className="text-[11px] text-slate-500 mb-3">
            Beheer de mogelijke locations. De <strong>default</strong> wordt
            gebruikt bij import/paste wanneer er geen locatie meegegeven is.
          </p>

          {/* ... rest van je locations-tabel ongewijzigd ... */}
        </section>
      )}
    </div>
  );
}

