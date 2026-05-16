"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function FaceIdChecklistTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] = useState<Status>("pending");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Face ID test</div>
        <h1 className="text-lg font-bold">Face ID / TrueDepth</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Safari kan Face ID niet rechtstreeks testen. Controleer dit manueel op
          het toestel via Instellingen of via ontgrendeling.
        </p>

        <div className="rounded border bg-gray-50 p-4 text-sm">
          Controleer:
          <ul className="mt-2 list-disc pl-5">
            <li>Face ID instelbaar</li>
            <li>Geen melding “Face ID is niet beschikbaar”</li>
            <li>TrueDepth camera werkt</li>
            <li>Ontgrendelen met Face ID lukt</li>
          </ul>
        </div>

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={() => setStatus("pass")}
            className="rounded border border-green-500 bg-green-50 px-4 py-3"
          >
            PASS
          </button>

          <button
            type="button"
            onClick={() => setStatus("warning")}
            className="rounded border border-yellow-500 bg-yellow-50 px-4 py-3"
          >
            WARNING
          </button>

          <button
            type="button"
            onClick={() => setStatus("fail")}
            className="rounded border border-red-500 bg-red-50 px-4 py-3"
          >
            FAIL
          </button>
        </div>

        <div className="mt-4 text-sm">Status: {statusLabel(status)}</div>
      </main>

      <footer className="flex justify-between border-t p-4">
        <button type="button" onClick={onPrev} className="rounded border px-4 py-2">
          Vorige
        </button>

        <button type="button" onClick={onNext} className="rounded bg-black px-4 py-2 text-white">
          Volgende
        </button>
      </footer>
    </div>
  );
}
