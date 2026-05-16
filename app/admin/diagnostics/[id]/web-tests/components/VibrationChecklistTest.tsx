"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function VibrationChecklistTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState("");

  function testVibration() {
    if (!("vibrate" in navigator)) {
      setStatus("warning");
      setMessage("Vibration API wordt niet ondersteund op deze browser.");
      return;
    }

    navigator.vibrate([300, 150, 300]);
    setMessage("Vibratiecommando verzonden. Bevestig manueel of toestel trilde.");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Vibration test</div>
        <h1 className="text-lg font-bold">Vibratie / haptics</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Test of de trilfunctie/haptic engine voelbaar werkt.
        </p>

        <button
          type="button"
          onClick={testVibration}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Start vibratie test
        </button>

        {message ? (
          <div className="mt-4 rounded border bg-gray-50 p-3 text-sm">
            {message}
          </div>
        ) : null}

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={() => setStatus("pass")}
            className="rounded border border-green-500 bg-green-50 px-4 py-3"
          >
            Voelbaar / PASS
          </button>

          <button
            type="button"
            onClick={() => setStatus("warning")}
            className="rounded border border-yellow-500 bg-yellow-50 px-4 py-3"
          >
            Zwak / WARNING
          </button>

          <button
            type="button"
            onClick={() => setStatus("fail")}
            className="rounded border border-red-500 bg-red-50 px-4 py-3"
          >
            Geen vibratie / FAIL
          </button>
        </div>

        <div className="mt-4 text-sm">
          Status: {statusLabel(status)}
        </div>

        <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          iPhone Safari ondersteunt vibratie mogelijk niet betrouwbaar. Native
          app geeft later betere haptic diagnostics.
        </div>
      </main>

      <footer className="flex justify-between border-t p-4">
        <button
          type="button"
          onClick={onPrev}
          className="rounded border px-4 py-2"
        >
          Vorige
        </button>

        <button
          type="button"
          onClick={onNext}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Volgende
        </button>
      </footer>
    </div>
  );
}
