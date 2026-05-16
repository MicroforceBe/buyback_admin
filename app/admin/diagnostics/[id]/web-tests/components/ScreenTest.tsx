"use client";

import { useState } from "react";
import type { Status } from "../types";
import { statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

const colors = [
  { label: "Zwart", className: "bg-black", text: "text-white" },
  { label: "Wit", className: "bg-white", text: "text-black" },
  { label: "Rood", className: "bg-red-600", text: "text-white" },
  { label: "Groen", className: "bg-green-600", text: "text-white" },
  { label: "Blauw", className: "bg-blue-600", text: "text-white" },
  { label: "Geel", className: "bg-yellow-300", text: "text-black" },
];

export default function ScreenTest({ onNext, onPrev }: Props) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>("pending");

  const color = colors[index];

  return (
    <div className={`fixed inset-0 z-[9999] ${color.className} ${color.text}`}>
      <div className="absolute left-3 top-3 rounded bg-black/70 px-3 py-2 text-sm text-white">
        Schermtest: {color.label} — {index + 1}/{colors.length} —{" "}
        {statusLabel(status)}
      </div>

      <div className="absolute inset-x-3 bottom-24 rounded bg-black/70 px-4 py-3 text-center text-sm text-white">
        Controleer op dode pixels, vlekken, strepen, burn-in en kleurafwijking.
      </div>

      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap justify-between gap-2">
        <button
          type="button"
          onClick={() => setIndex((current) => Math.max(current - 1, 0))}
          className="rounded bg-white px-4 py-3 font-medium text-black shadow"
        >
          Vorige kleur
        </button>

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

        <button
          type="button"
          onClick={
            index === colors.length - 1
              ? onNext
              : () => setIndex((current) => Math.min(current + 1, colors.length - 1))
          }
          className="rounded bg-white px-4 py-3 font-medium text-black shadow"
        >
          {index === colors.length - 1 ? "Volgende" : "Volgende kleur"}
        </button>

        <button
          type="button"
          onClick={onPrev}
          className="rounded bg-white px-4 py-3 font-medium text-black shadow"
        >
          Terug
        </button>
      </div>
    </div>
  );
}
