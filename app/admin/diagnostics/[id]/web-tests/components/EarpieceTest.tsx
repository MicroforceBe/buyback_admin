"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function EarpieceTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] =
    useState<Status>("pending");

  const [playing, setPlaying] =
    useState(false);

  const [message, setMessage] =
    useState("");

  function playEarpieceTone() {
    try {
      setPlaying(true);

      const audioContext =
        new AudioContext();

      const oscillator =
        audioContext.createOscillator();

      const gain =
        audioContext.createGain();

      oscillator.type = "sine";

      oscillator.frequency.value = 1200;

      gain.gain.value = 0.08;

      oscillator.connect(gain);

      gain.connect(
        audioContext.destination
      );

      oscillator.start();

      setTimeout(() => {
        oscillator.stop();

        audioContext.close();

        setPlaying(false);
      }, 2500);

      setMessage(
        "Houd het toestel aan je oor en luister naar de oorspeaker."
      );
    } catch {
      setStatus("fail");

      setMessage(
        "Oorspeaker test kon niet gestart worden."
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          Earpiece test
        </div>

        <h1 className="text-lg font-bold">
          Oorspeaker
        </h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <p className="max-w-sm text-sm text-gray-600">
          Deze test controleert de bovenste
          oorspeaker die gebruikt wordt tijdens
          telefoongesprekken.
        </p>

        <button
          type="button"
          onClick={playEarpieceTone}
          disabled={playing}
          className="mt-8 rounded bg-black px-6 py-4 font-medium text-white disabled:opacity-50"
        >
          {playing
            ? "Afspelen..."
            : "Speel testtoon"}
        </button>

        {message ? (
          <div className="mt-6 rounded border bg-gray-50 p-4 text-sm">
            {message}
          </div>
        ) : null}

        <div className="mt-8 grid w-full max-w-sm gap-2">
          <button
            type="button"
            onClick={() =>
              setStatus("pass")
            }
            className="rounded bg-green-600 px-4 py-3 font-medium text-white shadow"
          >
            PASS
          </button>

          <button
            type="button"
            onClick={() =>
              setStatus("warning")
            }
            className="rounded bg-yellow-400 px-4 py-3 font-medium text-black shadow"
          >
            WARNING
          </button>

          <button
            type="button"
            onClick={() =>
              setStatus("fail")
            }
            className="rounded bg-red-600 px-4 py-3 font-medium text-white shadow"
          >
            FAIL
          </button>
        </div>

        <div className="mt-4 text-sm">
          Status:{" "}
          {statusLabel(status)}
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
