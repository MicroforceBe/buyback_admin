"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function BrightnessChecklistTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] = useState<Status>("pending");
  const [mode, setMode] = useState<"white" | "gray" | "black">("white");

  const bgClass =
    mode === "white"
      ? "bg-white text-black"
      : mode === "gray"
      ? "bg-gray-400 text-black"
      : "bg-black text-white";

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col ${bgClass}`}>
      <main className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <h1 className="mb-4 text-2xl font-bold">
          Helderheid / dimming
        </h1>

        <p className="max-w-sm text-sm">
          Zet de helderheid manueel laag, midden en hoog. Controleer of het
          scherm egaal blijft zonder flikkering, vlekken of dim-problemen.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setMode("white")}
            className="rounded bg-white px-4 py-3 font-medium text-black shadow"
          >
            Wit
          </button>

          <button
            type="button"
            onClick={() => setMode("gray")}
            className="rounded bg-gray-400 px-4 py-3 font-medium text-black shadow"
          >
            Grijs
          </button>

          <button
            type="button"
            onClick={() => setMode("black")}
            className="rounded bg-black px-4 py-3 font-medium text-white shadow ring-1 ring-white"
          >
            Zwart
          </button>
        </div>

        <div className="mt-8 grid w-full max-w-sm gap-2">
          <button
            type="button"
            onClick={() => setStatus("pass")}
            className="rounded bg-green-600 px-4 py-3 font-medium text-white shadow"
          >
            PASS
          </button>

          <button
            type="button"
            onClick={() => setStatus("warning")}
            className="rounded bg-yellow-400 px-4 py-3 font-medium text-black shadow"
          >
            WARNING
          </button>

          <button
            type="button"
            onClick={() => setStatus("fail")}
            className="rounded bg-red-600 px-4 py-3 font-medium text-white shadow"
          >
            FAIL
          </button>
        </div>

        <div className="mt-4 rounded bg-black/70 px-3 py-2 text-sm text-white">
          Status: {statusLabel(status)}
        </div>
      </main>

      <footer className="flex justify-between gap-3 border-t bg-white p-4 text-black">
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
