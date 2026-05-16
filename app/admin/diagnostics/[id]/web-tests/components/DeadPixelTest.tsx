"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

const slides = [
  {
    label: "Zwart",
    className: "bg-black text-white",
  },
  {
    label: "Wit",
    className: "bg-white text-black",
  },
  {
    label: "Rood",
    className: "bg-red-600 text-white",
  },
  {
    label: "Groen",
    className: "bg-green-600 text-white",
  },
  {
    label: "Blauw",
    className: "bg-blue-600 text-white",
  },
];

export default function DeadPixelTest({
  onNext,
  onPrev,
}: Props) {
  const [index, setIndex] = useState(0);

  const [status, setStatus] =
    useState<Status>("pending");

  const current = slides[index];

  function nextSlide() {
    setIndex((currentIndex) =>
      Math.min(
        currentIndex + 1,
        slides.length - 1
      )
    );
  }

  function previousSlide() {
    setIndex((currentIndex) =>
      Math.max(currentIndex - 1, 0)
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col ${current.className}`}
    >
      <main className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <div className="absolute left-3 top-3 rounded bg-black/70 px-3 py-2 text-sm text-white">
          Dead pixel test — {current.label} (
          {index + 1}/{slides.length})
        </div>

        <h1 className="mb-4 text-2xl font-bold">
          Controleer schermpixels
        </h1>

        <p className="max-w-sm text-sm opacity-90">
          Controleer op:
          <br />
          • dode pixels
          <br />
          • stuck pixels
          <br />
          • lichte vlekken
          <br />
          • burn-in
          <br />
          • verticale lijnen
        </p>

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

      <footer className="flex justify-between gap-2 border-t bg-white p-4 text-black">
        <button
          type="button"
          onClick={onPrev}
          className="rounded border px-4 py-2"
        >
          Vorige test
        </button>

        <button
          type="button"
          onClick={previousSlide}
          className="rounded border px-4 py-2"
        >
          Vorige kleur
        </button>

        <button
          type="button"
          onClick={
            index === slides.length - 1
              ? onNext
              : nextSlide
          }
          className="rounded bg-black px-4 py-2 text-white"
        >
          {index === slides.length - 1
            ? "Volgende test"
            : "Volgende kleur"}
        </button>
      </footer>
    </div>
  );
}
