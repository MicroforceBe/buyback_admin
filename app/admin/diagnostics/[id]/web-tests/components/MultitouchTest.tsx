//app/admin/diagnostics/[id]/web-tests/components/MultitouchTest.tsx

"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

const requiredTouchCounts = [1, 2, 3, 4, 5];

export default function MultitouchTest({ onNext, onPrev }: Props) {
  const [maxTouches, setMaxTouches] = useState(0);
  const [status, setStatus] = useState<Status>("pending");

  function handleTouch(event: React.TouchEvent<HTMLDivElement>) {
    const count = event.touches.length;

    setMaxTouches((current) => {
      const next = Math.max(current, count);

      if (next >= 5) {
        setStatus("pass");
      } else if (next >= 3) {
        setStatus("warning");
      }

      return next;
    });
  }

  function reset() {
    setMaxTouches(0);
    setStatus("pending");
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Multitouch test</div>
        <h1 className="text-lg font-bold">Multitouch</h1>
      </header>

      <main
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        className="flex flex-1 touch-none flex-col items-center justify-center bg-gray-900 p-4 text-white"
      >
        <div className="mb-6 text-center">
          <div className="text-5xl font-bold">{maxTouches}</div>
          <div className="mt-2 text-sm text-gray-300">
            maximum gelijktijdige aanrakingen
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {requiredTouchCounts.map((count) => (
            <div
              key={count}
              className={`flex h-14 w-14 items-center justify-center rounded border ${
                maxTouches >= count
                  ? "border-green-400 bg-green-600"
                  : "border-gray-500 bg-gray-800"
              }`}
            >
              {count}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded bg-black/50 px-4 py-3 text-center text-sm">
          Plaats 1 tot 5 vingers tegelijk op het scherm.
        </div>

        <div className="mt-4 text-sm">Status: {statusLabel(status)}</div>
      </main>

      <footer className="flex justify-between gap-3 border-t p-4">
        <button type="button" onClick={onPrev} className="rounded border px-4 py-2">
          Vorige
        </button>

        <button type="button" onClick={reset} className="rounded border px-4 py-2">
          Reset
        </button>

        <button type="button" onClick={onNext} className="rounded bg-black px-4 py-2 text-white">
          Volgende
        </button>
      </footer>
    </div>
  );
}
