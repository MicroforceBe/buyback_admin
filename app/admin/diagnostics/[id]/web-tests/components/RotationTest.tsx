"use client";

import { useEffect, useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

type OrientationState = {
  portrait: boolean;
  landscape: boolean;
};

export default function RotationTest({ onNext, onPrev }: Props) {
  const [status, setStatus] = useState<Status>("pending");
  const [orientation, setOrientation] = useState<OrientationState>({
    portrait: false,
    landscape: false,
  });

  const [message, setMessage] = useState("");

  function detectOrientation() {
    const isLandscape = window.innerWidth > window.innerHeight;
    const isPortrait = window.innerHeight >= window.innerWidth;

    setOrientation((current) => {
      const next = {
        portrait: current.portrait || isPortrait,
        landscape: current.landscape || isLandscape,
      };

      if (next.portrait && next.landscape) {
        setStatus("pass");
        setMessage("Rotatie werkt: portrait en landscape gedetecteerd.");
      } else if (next.portrait || next.landscape) {
        setStatus("warning");
        setMessage("Draai het toestel nog naar de andere oriëntatie.");
      }

      return next;
    });
  }

  useEffect(() => {
    detectOrientation();

    window.addEventListener("resize", detectOrientation);
    window.addEventListener("orientationchange", detectOrientation);

    return () => {
      window.removeEventListener("resize", detectOrientation);
      window.removeEventListener("orientationchange", detectOrientation);
    };
  }, []);

  function reset() {
    setOrientation({
      portrait: false,
      landscape: false,
    });

    setStatus("pending");
    setMessage("");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Rotation test</div>
        <h1 className="text-lg font-bold">Schermrotatie</h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <p className="mb-6 text-sm text-gray-600">
          Draai het toestel naar portrait en landscape. Beide moeten
          gedetecteerd worden.
        </p>

        <div className="grid w-full max-w-sm grid-cols-2 gap-3">
          <div
            className={`rounded border p-4 ${
              orientation.portrait
                ? "border-green-500 bg-green-50"
                : "border-gray-300 bg-gray-50"
            }`}
          >
            Portrait
          </div>

          <div
            className={`rounded border p-4 ${
              orientation.landscape
                ? "border-green-500 bg-green-50"
                : "border-gray-300 bg-gray-50"
            }`}
          >
            Landscape
          </div>
        </div>

        <div className="mt-6 text-sm">
          Status: {statusLabel(status)}
        </div>

        {message ? (
          <div className="mt-4 rounded border bg-gray-50 p-3 text-sm">
            {message}
          </div>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded border px-4 py-2"
        >
          Reset
        </button>
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
