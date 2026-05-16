// app/admin/diagnostics/[id]/web-tests/components/EdgeTouchTest.tsx

"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

type EdgeKey = "top" | "right" | "bottom" | "left";

export default function EdgeTouchTest({ onNext, onPrev }: Props) {
  const [edges, setEdges] = useState<Record<EdgeKey, boolean>>({
    top: false,
    right: false,
    bottom: false,
    left: false,
  });

  const completed = Object.values(edges).filter(Boolean).length;

  const status: Status =
    completed === 4
      ? "pass"
      : completed >= 2
      ? "warning"
      : "pending";

  function markEdge(edge: EdgeKey) {
    setEdges((current) => ({
      ...current,
      [edge]: true,
    }));
  }

  function reset() {
    setEdges({
      top: false,
      right: false,
      bottom: false,
      left: false,
    });
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-900 text-white">
      <div
        onTouchStart={() => markEdge("top")}
        onTouchMove={() => markEdge("top")}
        className={`absolute left-0 right-0 top-0 h-16 ${
          edges.top ? "bg-green-500" : "bg-red-500"
        }`}
      />

      <div
        onTouchStart={() => markEdge("bottom")}
        onTouchMove={() => markEdge("bottom")}
        className={`absolute bottom-0 left-0 right-0 h-16 ${
          edges.bottom ? "bg-green-500" : "bg-red-500"
        }`}
      />

      <div
        onTouchStart={() => markEdge("left")}
        onTouchMove={() => markEdge("left")}
        className={`absolute bottom-0 left-0 top-0 w-16 ${
          edges.left ? "bg-green-500" : "bg-red-500"
        }`}
      />

      <div
        onTouchStart={() => markEdge("right")}
        onTouchMove={() => markEdge("right")}
        className={`absolute bottom-0 right-0 top-0 w-16 ${
          edges.right ? "bg-green-500" : "bg-red-500"
        }`}
      />

      <div className="absolute inset-20 flex flex-col items-center justify-center text-center">
        <h1 className="mb-3 text-2xl font-bold">
          Edge touch test
        </h1>

        <p className="text-sm text-gray-300">
          Sleep met je vinger langs alle schermranden.
        </p>

        <div className="mt-6 rounded bg-black/60 px-4 py-3 text-sm">
          Status: {statusLabel(status)} — {completed}/4 randen
        </div>
      </div>

      <div className="absolute bottom-20 left-3 right-3 flex justify-between gap-3">
        <button
          type="button"
          onClick={onPrev}
          className="rounded bg-white px-4 py-3 font-medium text-black shadow"
        >
          Vorige
        </button>

        <button
          type="button"
          onClick={reset}
          className="rounded bg-white px-4 py-3 font-medium text-black shadow"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={onNext}
          className="rounded bg-white px-4 py-3 font-medium text-black shadow"
        >
          Volgende
        </button>
      </div>
    </div>
  );
}
