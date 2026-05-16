"use client";

import { useRef, useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function AutofocusChecklistTest({
  onNext,
  onPrev,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState("");

  async function startCamera() {
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setMessage("Richt op dichtbij en veraf object. Controleer of focus scherpstelt.");
    } catch {
      setStatus("fail");
      setMessage("Camera kon niet gestart worden.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Autofocus test</div>
        <h1 className="text-lg font-bold">Camera focus</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Test of de achtercamera scherpstelt op dichtbij en veraf.
        </p>

        <button
          type="button"
          onClick={startCamera}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Start camera
        </button>

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="mt-4 w-full rounded border bg-black"
        />

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={() => setStatus("pass")}
            className="rounded border border-green-500 bg-green-50 px-4 py-3"
          >
            Focus OK / PASS
          </button>

          <button
            type="button"
            onClick={() => setStatus("warning")}
            className="rounded border border-yellow-500 bg-yellow-50 px-4 py-3"
          >
            Traag/onzeker / WARNING
          </button>

          <button
            type="button"
            onClick={() => setStatus("fail")}
            className="rounded border border-red-500 bg-red-50 px-4 py-3"
          >
            Geen focus / FAIL
          </button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div>Status: {statusLabel(status)}</div>

          {message ? (
            <div className="rounded border bg-gray-50 p-3">
              {message}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="flex justify-between border-t p-4">
        <button type="button" onClick={onPrev} className="rounded border px-4 py-2">
          Vorige
        </button>

        <button type="button" onClick={onNext} className="rounded bg-black px-4 py-2 text-white">
          Volgende
        </button>
      </footer>
    </div>
  );
}
