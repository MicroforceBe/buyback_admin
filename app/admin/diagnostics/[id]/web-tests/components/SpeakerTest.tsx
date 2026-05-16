"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

const frequencies = [250, 500, 1000, 2000, 4000];

export default function SpeakerTest({ onNext, onPrev }: Props) {
  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState("");

  function playTone(frequency: number) {
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.value = 0.25;

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start();

      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 1200);

      setMessage(`${frequency} Hz afgespeeld.`);
    } catch {
      setStatus("fail");
      setMessage("Speaker test kon niet gestart worden.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Speaker test</div>
        <h1 className="text-lg font-bold">Speaker</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Speel meerdere frequenties af. Luister of de speaker helder, luid
          genoeg en zonder gekraak speelt.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {frequencies.map((frequency) => (
            <button
              key={frequency}
              type="button"
              onClick={() => playTone(frequency)}
              className="rounded border px-4 py-3"
            >
              {frequency} Hz
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={() => {
              setStatus("pass");
              setMessage("Geluid helder.");
            }}
            className="rounded border border-green-500 bg-green-50 px-4 py-3"
          >
            Helder / PASS
          </button>

          <button
            type="button"
            onClick={() => {
              setStatus("warning");
              setMessage("Geluid vervormd of kraakt.");
            }}
            className="rounded border border-yellow-500 bg-yellow-50 px-4 py-3"
          >
            Vervormd / WARNING
          </button>

          <button
            type="button"
            onClick={() => {
              setStatus("fail");
              setMessage("Geen geluid.");
            }}
            className="rounded border border-red-500 bg-red-50 px-4 py-3"
          >
            Geen geluid / FAIL
          </button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div>Status: {statusLabel(status)}</div>

          {message ? (
            <div className="rounded border bg-gray-50 p-3">{message}</div>
          ) : null}
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
