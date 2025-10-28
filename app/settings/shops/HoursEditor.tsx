'use client';

import { useCallback, useMemo } from 'react';

type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun';
const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Maandag' },
  { key: 'tue', label: 'Dinsdag' },
  { key: 'wed', label: 'Woensdag' },
  { key: 'thu', label: 'Donderdag' },
  { key: 'fri', label: 'Vrijdag' },
  { key: 'sat', label: 'Zaterdag' },
  { key: 'sun', label: 'Zondag' },
];

export type OpeningHours = Partial<Record<DayKey, string>>;
// formaat per dag: "HH:MM-HH:MM[,HH:MM-HH:MM]" of "" (gesloten)

type Props = {
  value: OpeningHours | null | undefined;
  onChange: (next: OpeningHours) => void;
  className?: string;
};

function isValidTime(t: string) {
  // HH:MM 00-23 : 00-59
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(t);
}

function joinSegments(aStart?: string, aEnd?: string, bStart?: string, bEnd?: string) {
  const segs: string[] = [];
  if (aStart && aEnd) segs.push(`${aStart}-${aEnd}`);
  if (bStart && bEnd) segs.push(`${bStart}-${bEnd}`);
  return segs.join(',');
}

function splitValue(v?: string) {
  // "09:00-12:30,13:30-18:00" → {aStart,aEnd,bStart,bEnd}
  const res: { aStart?: string; aEnd?: string; bStart?: string; bEnd?: string } = {};
  if (!v) return res;
  const parts = String(v).split(',').map(s => s.trim()).filter(Boolean);
  if (parts[0]) {
    const [s,e] = parts[0].split('-').map(x => x?.trim());
    res.aStart = s || '';
    res.aEnd = e || '';
  }
  if (parts[1]) {
    const [s,e] = parts[1].split('-').map(x => x?.trim());
    res.bStart = s || '';
    res.bEnd = e || '';
  }
  return res;
}

export default function HoursEditor({ value, onChange, className }: Props) {
  const hours = useMemo<OpeningHours>(() => ({ ...(value || {}) }), [value]);

  const setDay = useCallback((day: DayKey, next: string) => {
    const copy: OpeningHours = { ...(hours || {}) };
    copy[day] = next;
    onChange(copy);
  }, [hours, onChange]);

  const markClosed = useCallback((day: DayKey) => setDay(day, ''), [setDay]);

  const setDaySegments = useCallback((
    day: DayKey,
    aStart?: string, aEnd?: string,
    bStart?: string, bEnd?: string
  ) => {
    const joined = joinSegments(aStart, aEnd, bStart, bEnd);
    setDay(day, joined);
  }, [setDay]);

  // bulk acties
  const copyMonToWeekdays = useCallback(() => {
    const mon = hours.mon || '';
    const next: OpeningHours = { ...(hours || {}) };
    (['tue','wed','thu','fri'] as DayKey[]).forEach(d => next[d] = mon);
    onChange(next);
  }, [hours, onChange]);

  const setAll = useCallback((template: string) => {
    const next: OpeningHours = {};
    (DAYS.map(d => d.key) as DayKey[]).forEach(k => next[k] = template);
    onChange(next);
  }, [onChange]);

  const closeAll = useCallback(() => {
    const next: OpeningHours = {};
    (DAYS.map(d => d.key) as DayKey[]).forEach(k => next[k] = '');
    onChange(next);
  }, [onChange]);

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded border bg-gray-50 hover:bg-gray-100 text-sm"
          onClick={copyMonToWeekdays}
          title="Kopieer maandag naar dinsdag–vrijdag"
        >
          Kopieer ma → di–vr
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border bg-gray-50 hover:bg-gray-100 text-sm"
          onClick={() => setAll('09:00-18:00')}
          title="Zet alle dagen naar 09:00–18:00"
        >
          Zet 09:00–18:00 (alle)
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded border bg-gray-50 hover:bg-gray-100 text-sm"
          onClick={closeAll}
        >
          Alles gesloten
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DAYS.map(({ key, label }) => {
          const seg = splitValue(hours[key]);
          const closed = !hours[key];

          // simpele validatie flags
          const aOk = (!seg.aStart && !seg.aEnd) || (isValidTime(seg.aStart || '') && isValidTime(seg.aEnd || '') && (seg.aStart! < seg.aEnd!));
          const bOk = (!seg.bStart && !seg.bEnd) || (isValidTime(seg.bStart || '') && isValidTime(seg.bEnd || '') && (seg.bStart! < seg.bEnd!));

          return (
            <div key={key} className="rounded border bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{label}</div>
                <label className="text-sm inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={closed}
                    onChange={(e) => {
                      if (e.target.checked) markClosed(key);
                      else setDay(key, '09:00-18:00');
                    }}
                    className="accent-green-600"
                  />
                  Gesloten
                </label>
              </div>

              <fieldset disabled={closed} className={closed ? 'opacity-50 pointer-events-none' : ''}>
                <div className="grid grid-cols-[auto,1fr,auto,1fr] items-center gap-2">
                  <label className="text-xs text-gray-500">Open</label>
                  <input
                    placeholder="09:00"
                    value={seg.aStart || ''}
                    onChange={(e) => setDaySegments(key, e.target.value, seg.aEnd, seg.bStart, seg.bEnd)}
                    className={`border rounded px-2 py-1 text-sm ${aOk || (!seg.aStart && !seg.aEnd) ? '' : 'border-red-400'}`}
                  />
                  <span className="text-xs text-gray-500 text-center">–</span>
                  <input
                    placeholder="12:30"
                    value={seg.aEnd || ''}
                    onChange={(e) => setDaySegments(key, seg.aStart, e.target.value, seg.bStart, seg.bEnd)}
                    className={`border rounded px-2 py-1 text-sm ${aOk || (!seg.aStart && !seg.aEnd) ? '' : 'border-red-400'}`}
                  />

                  <label className="text-xs text-gray-500 mt-1">Open</label>
                  <input
                    placeholder="13:30"
                    value={seg.bStart || ''}
                    onChange={(e) => setDaySegments(key, seg.aStart, seg.aEnd, e.target.value, seg.bEnd)}
                    className={`border rounded px-2 py-1 text-sm mt-1 ${bOk || (!seg.bStart && !seg.bEnd) ? '' : 'border-red-400'}`}
                  />
                  <span className="text-xs text-gray-500 text-center mt-1">–</span>
                  <input
                    placeholder="18:00"
                    value={seg.bEnd || ''}
                    onChange={(e) => setDaySegments(key, seg.aStart, seg.aEnd, seg.bStart, e.target.value)}
                    className={`border rounded px-2 py-1 text-sm mt-1 ${bOk || (!seg.bStart && !seg.bEnd) ? '' : 'border-red-400'}`}
                  />
                </div>

                {/* kleine hint bij fout */}
                {(!(aOk) || !(bOk)) && (
                  <div className="text-[11px] text-red-600 mt-1">
                    Gebruik HH:MM en zorg dat eindtijd na starttijd ligt.
                  </div>
                )}
              </fieldset>
            </div>
          );
        })}
      </div>
    </div>
  );
}
