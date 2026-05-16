"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

type CheckKey =
  | "screen_glass"
  | "frame"
  | "back_glass"
  | "camera_lenses"
  | "buttons_condition"
  | "ports_condition";

const checks: {
  key: CheckKey;
  label: string;
  description: string;
}[] = [
  {
    key: "screen_glass",
    label: "Schermglas",
    description: "Controleer op krassen, barsten, diepe putten of loskomend glas.",
  },
  {
    key: "frame",
    label: "Frame / behuizing",
    description: "Controleer deuken, kromming, diepe schade of openstaande randen.",
  },
  {
    key: "back_glass",
    label: "Achterkant",
    description: "Controleer barsten, krassen, glasbreuk of losse achterkant.",
  },
  {
    key: "camera_lenses",
    label: "Cameralenzen",
    description: "Controleer krassen, stof, condens of gebroken lensglas.",
  },
  {
    key: "buttons_condition",
    label: "Knoppen cosmetisch",
    description: "Controleer slijtage, schade of vastzittende knoppen.",
  },
  {
    key: "ports_condition",
    label: "Poorten / speakergrills",
    description: "Controleer vuil, oxidatie, stof of zichtbare schade.",
  },
];

export default function CosmeticChecklistTest({ onNext, onPrev }: Props) {
  const [results, setResults] = useState<Record<CheckKey, Status>>({
    screen_glass: "pending",
    frame: "pending",
    back_glass: "pending",
    camera_lenses: "pending",
    buttons_condition: "pending",
    ports_condition: "pending",
  });

  const values = Object.values(results);

  const status: Status = values.some((item) => item === "fail")
    ? "fail"
    : values.some((item) => item === "warning")
    ? "warning"
    : values.every((item) => item === "pass")
    ? "pass"
    : "pending";

  function setCheckStatus(key: CheckKey, value: Status) {
    setResults((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Cosmetische controle</div>
        <h1 className="text-lg font-bold">Cosmetische staat</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Controleer de uiterlijke staat van het toestel. Deze test is manueel.
        </p>

        <div className="mb-4 rounded border bg-gray-50 p-3 text-sm">
          Algemene status: <strong>{statusLabel(status)}</strong>
        </div>

        <div className="space-y-3">
          {checks.map((check) => (
            <div key={check.key} className="rounded border p-3">
              <div className="font-medium">{check.label}</div>

              <div className="mt-1 text-sm text-gray-600">
                {check.description}
              </div>

              <div className="mt-3 text-sm">
                Status: {statusLabel(results[check.key])}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCheckStatus(check.key, "pass")}
                  className="rounded border border-green-500 bg-green-50 px-3 py-2 text-sm"
                >
                  PASS
                </button>

                <button
                  type="button"
                  onClick={() => setCheckStatus(check.key, "warning")}
                  className="rounded border border-yellow-500 bg-yellow-50 px-3 py-2 text-sm"
                >
                  WARNING
                </button>

                <button
                  type="button"
                  onClick={() => setCheckStatus(check.key, "fail")}
                  className="rounded border border-red-500 bg-red-50 px-3 py-2 text-sm"
                >
                  FAIL
                </button>
              </div>
            </div>
          ))}
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
