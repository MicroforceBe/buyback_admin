"use client";

import { useState } from "react";

import IntroTest from "./components/IntroTest";
import TouchscreenTest from "./components/TouchscreenTest";
import ScreenTest from "./components/ScreenTest";
import CameraTest from "./components/CameraTest";
import MicrophoneTest from "./components/MicrophoneTest";
import SpeakerTest from "./components/SpeakerTest";
import MotionTest from "./components/MotionTest";
import SummaryTest from "./components/SummaryTest";

import type { Status } from "./types";

const steps = [
  "Intro",
  "Touchscreen",
  "Scherm",
  "Camera",
  "Microfoon",
  "Speaker",
  "Motion",
  "Overzicht",
];

export default function WebDiagnosticsPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const [step, setStep] = useState(0);

  const [results, setResults] = useState({
    touchscreen: "pending" as Status,
    screen: "pending" as Status,
    camera: "pending" as Status,
    microphone: "pending" as Status,
    speaker: "pending" as Status,
    motion: "pending" as Status,
  });

  function goNext() {
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function goPrev() {
    setStep((current) => Math.max(current - 1, 0));
  }

  if (step === 1) {
    return (
      <TouchscreenTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );
  }

  if (step === 2) {
    return (
      <ScreenTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );
  }

  if (step === 3) {
    return (
      <CameraTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );
  }

  if (step === 4) {
    return (
      <MicrophoneTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );
  }

  if (step === 5) {
    return (
      <SpeakerTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );
  }

  if (step === 6) {
    return (
      <MotionTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );
  }

  if (step === 7) {
    return (
      <SummaryTest
        results={results}
        onPrev={goPrev}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-gray-500">
              Sessie {params.id}
            </div>

            <h1 className="text-lg font-bold">
              {steps[step]}
            </h1>
          </div>

          <div className="text-sm text-gray-500">
            {step + 1}/{steps.length}
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded bg-gray-100">
          <div
            className="h-full bg-black"
            style={{
              width: `${((step + 1) / steps.length) * 100}%`,
            }}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <IntroTest sessionId={params.id} />
      </main>

      <footer className="flex items-center justify-between gap-3 border-t p-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={step === 0}
          className="rounded border px-4 py-2 disabled:opacity-40"
        >
          Vorige
        </button>

        <button
          type="button"
          onClick={goNext}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Volgende
        </button>
      </footer>
    </div>
  );
}
