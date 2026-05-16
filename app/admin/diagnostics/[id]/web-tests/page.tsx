// app/admin/diagnostics/[id]/web-tests/page.tsx

"use client";

import { useState } from "react";

import IntroTest from "./components/IntroTest";
import TouchscreenTest from "./components/TouchscreenTest";

const steps = [
  "Intro",
  "Touchscreen",
];

export default function WebDiagnosticsPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const [step, setStep] =
    useState(0);

  function goNext() {
    setStep((current) =>
      Math.min(
        current + 1,
        steps.length - 1
      )
    );
  }

  function goPrev() {
    setStep((current) =>
      Math.max(current - 1, 0)
    );
  }

  if (step === 1) {
    return (
      <TouchscreenTest
        onNext={goNext}
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
              Sessie{" "}
              {params.id}
            </div>

            <h1 className="text-lg font-bold">
              {steps[step]}
            </h1>
          </div>

          <div className="text-sm text-gray-500">
            {step + 1}/
            {steps.length}
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded bg-gray-100">
          <div
            className="h-full bg-black"
            style={{
              width: `${
                ((step + 1) /
                  steps.length) *
                100
              }%`,
            }}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <IntroTest
          sessionId={
            params.id
          }
        />
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
          disabled={
            step ===
            steps.length - 1
          }
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        >
          Volgende
        </button>
      </footer>
    </div>
  );
}

