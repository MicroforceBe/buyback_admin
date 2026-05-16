// app/admin/diagnostics/[id]/web-tests/components/SummaryTest.tsx

"use client";

type Props = {
  onRestart?: () => void;
};

export default function SummaryTest({
  onRestart,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          Diagnostics afgerond
        </div>

        <h1 className="text-lg font-bold">
          Samenvatting
        </h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl">
          ✅
        </div>

        <h2 className="mt-6 text-2xl font-bold">
          Alle tests voltooid
        </h2>

        <p className="mt-3 max-w-md text-sm text-gray-600">
          De web diagnostics flow werd
          succesvol doorlopen.
        </p>

        <div className="mt-8 rounded border bg-gray-50 p-4 text-left text-sm">
          <div>
            ✔ Touchscreen
          </div>

          <div>
            ✔ Camera
          </div>

          <div>
            ✔ Audio
          </div>

          <div>
            ✔ Motion sensors
          </div>

          <div>
            ✔ Connectiviteit
          </div>

          <div>
            ✔ Cosmetische controle
          </div>
        </div>

        {onRestart ? (
          <button
            type="button"
            onClick={onRestart}
            className="mt-8 rounded bg-black px-4 py-2 text-white"
          >
            Opnieuw starten
          </button>
        ) : null}
      </main>
    </div>
  );
}

