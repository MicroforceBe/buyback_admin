"use client";

import { useRef, useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function FlashlightChecklistTest({
  onNext,
  onPrev,
}: Props) {
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>("pending");
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [message, setMessage] = useState("");

  async function startCameraForTorch() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
        audio: false,
      });

      streamRef.current = stream;
      setMessage("Camera gestart. Probeer nu de flitser aan te zetten.");
    } catch {
      setStatus("fail");
      setMessage("Achtercamera kon niet gestart worden.");
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];

    if (!track) {
      setMessage("Start eerst de achtercamera.");
      return;
    }

    try {
      await track.applyConstraints({
        advanced: [
          {
            torch: !torchEnabled,
          } as MediaTrackConstraintSet,
        ],
      });

      setTorchEnabled((current) => !current);
      setMessage(!torchEnabled ? "Flitser aan." : "Flitser uit.");
    } catch {
      setStatus("warning");
      setMessage("Flitser/torch wordt niet ondersteund in deze browser.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTorchEnabled(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Flash test</div>
        <h1 className="text-lg font-bold">Flitser / torch</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Test of de achterflitser werkt. Safari ondersteunt torch niet altijd;
          bevestig daarom ook manueel.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startCameraForTorch}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Start achtercamera
          </button>

          <button
            type="button"
            onClick={toggleTorch}
            className="rounded border px-4 py-2"
          >
            {torchEnabled ? "Flitser uit" : "Flitser aan"}
          </button>

          <button
            type="button"
            onClick={stopCamera}
            className="rounded border px-4 py-2"
          >
            Stop camera
          </button>
        </div>

        {message ? (
          <div className="mt-4 rounded border bg-gray-50 p-3 text-sm">
            {message}
          </div>
        ) : null}

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={() => setStatus("pass")}
            className="rounded border border-green-500 bg-green-50 px-4 py-3"
          >
            Flitser werkt / PASS
          </button>

          <button
            type="button"
            onClick={() => setStatus("warning")}
            className="rounded border border-yellow-500 bg-yellow-50 px-4 py-3"
          >
            Onzeker / WARNING
          </button>

          <button
            type="button"
            onClick={() => setStatus("fail")}
            className="rounded border border-red-500 bg-red-50 px-4 py-3"
          >
            Geen flitser / FAIL
          </button>
        </div>

        <div className="mt-4 text-sm">Status: {statusLabel(status)}</div>
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
