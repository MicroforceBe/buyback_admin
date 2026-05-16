// app/admin/diagnostics/[id]/web-tests/page.tsx
"use client";

import { useMemo, useRef, useState } from "react";

type Status = "pending" | "pass" | "warning" | "fail";

const steps = [
  "Intro",
  "Touchscreen",
  "Camera",
  "Microfoon",
  "Speaker",
  "Motion",
  "Overzicht",
];

function statusLabel(status: Status) {
  if (status === "pass") return "PASS";
  if (status === "warning") return "WARNING";
  if (status === "fail") return "FAIL";
  return "Niet getest";
}

export default function WebDiagnosticsPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const sessionId = params.id;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const [step, setStep] = useState(0);

  const cells = useMemo(
    () => Array.from({ length: 40 }, (_, index) => index),
    []
  );

  const [touched, setTouched] = useState<number[]>([]);
  const [cameraStatus, setCameraStatus] = useState<Status>("pending");
  const [microphoneStatus, setMicrophoneStatus] = useState<Status>("pending");
  const [speakerStatus, setSpeakerStatus] = useState<Status>("pending");
  const [motionStatus, setMotionStatus] = useState<Status>("pending");

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [motionData, setMotionData] = useState({
    x: 0,
    y: 0,
    z: 0,
  });

  const progress = Math.round((touched.length / cells.length) * 100);

  const touchStatus: Status =
    progress === 100 ? "pass" : progress >= 70 ? "warning" : "pending";

  function goNext() {
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function goPrev() {
    setStep((current) => Math.max(current - 1, 0));
  }

  function markTouched(index: number) {
    setTouched((prev) => {
      if (prev.includes(index)) return prev;
      return [...prev, index];
    });
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setCameraStatus("pass");
    } catch {
      setCameraStatus("fail");
    }
  }

  async function startMicrophoneRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, {
          type: "audio/webm",
        });

        setAudioUrl(URL.createObjectURL(blob));
        setMicrophoneStatus("pass");
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setMicrophoneStatus("pending");
    } catch {
      setMicrophoneStatus("fail");
    }
  }

  function stopMicrophoneRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  function playSpeakerTone() {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.frequency.value = 880;
    gain.gain.value = 0.25;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();

    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 1000);
  }

  function startMotionTest() {
    if (typeof DeviceMotionEvent === "undefined") {
      setMotionStatus("fail");
      return;
    }

    setMotionStatus("pending");

    window.addEventListener("devicemotion", (event) => {
      const x =
        Math.round((event.accelerationIncludingGravity?.x || 0) * 100) / 100;
      const y =
        Math.round((event.accelerationIncludingGravity?.y || 0) * 100) / 100;
      const z =
        Math.round((event.accelerationIncludingGravity?.z || 0) * 100) / 100;

      setMotionData({ x, y, z });

      if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5 || Math.abs(z) > 0.5) {
        setMotionStatus("pass");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-gray-500">
              Sessie {sessionId}
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
        {step === 0 ? (
          <section className="flex min-h-full flex-col justify-center">
            <h2 className="mb-4 text-2xl font-bold">
              Start web diagnostics
            </h2>

            <p className="text-gray-600">
              Deze test draait op de iPhone zelf via Safari. Er wordt voorlopig
              niets opgeslagen. We gebruiken deze flow eerst om de tests te
              valideren.
            </p>

            <div className="mt-6 rounded border bg-gray-50 p-4 text-sm">
              Zorg dat het toestel ontgrendeld is, volume aan staat en camera-
              en microfoontoegang toegestaan worden.
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section>
            <h2 className="mb-2 text-xl font-bold">
              Touchscreen grid
            </h2>

            <p className="mb-4 text-sm text-gray-600">
              Tik alle vakken aan. De test geeft automatisch PASS bij 100%.
            </p>

            <div className="mb-3 text-sm">
              Progress: {progress}% — {statusLabel(touchStatus)}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {cells.map((cell) => {
                const isTouched = touched.includes(cell);

                return (
                  <button
                    key={cell}
                    type="button"
                    onTouchStart={() => markTouched(cell)}
                    onClick={() => markTouched(cell)}
                    className={`h-14 rounded border text-sm ${
                      isTouched
                        ? "border-green-500 bg-green-200"
                        : "border-gray-300 bg-gray-50"
                    }`}
                  >
                    {cell + 1}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <h2 className="mb-2 text-xl font-bold">
              Camera
            </h2>

            <p className="mb-4 text-sm text-gray-600">
              Start de camera. Als de preview opent, krijgt de test automatisch
              PASS. Beeldkwaliteit/focus blijft voorlopig visueel te controleren.
            </p>

            <button
              type="button"
              onClick={startCamera}
              className="rounded bg-black px-4 py-2 text-white"
            >
              Start camera preview
            </button>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="mt-4 w-full rounded border bg-black"
            />

            <div className="mt-3 text-sm">
              Status: {statusLabel(cameraStatus)}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <h2 className="mb-2 text-xl font-bold">
              Microfoon
            </h2>

            <p className="mb-4 text-sm text-gray-600">
              Neem enkele seconden stemgeluid op en speel daarna terug af.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startMicrophoneRecording}
                className="rounded bg-black px-4 py-2 text-white"
              >
                Start opname
              </button>

              <button
                type="button"
                onClick={stopMicrophoneRecording}
                className="rounded border px-4 py-2"
              >
                Stop opname
              </button>
            </div>

            {audioUrl ? (
              <audio controls src={audioUrl} className="mt-4 w-full" />
            ) : null}

            <div className="mt-3 text-sm">
              Status: {statusLabel(microphoneStatus)}
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section>
            <h2 className="mb-2 text-xl font-bold">
              Speaker
            </h2>

            <p className="mb-4 text-sm text-gray-600">
              Speel een testtoon af en bevestig manueel of het geluid helder is.
            </p>

            <button
              type="button"
              onClick={playSpeakerTone}
              className="rounded bg-black px-4 py-2 text-white"
            >
              Speel testtoon
            </button>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setSpeakerStatus("pass")}
                className="rounded border px-4 py-2"
              >
                PASS
              </button>

              <button
                type="button"
                onClick={() => setSpeakerStatus("warning")}
                className="rounded border px-4 py-2"
              >
                WARNING
              </button>

              <button
                type="button"
                onClick={() => setSpeakerStatus("fail")}
                className="rounded border px-4 py-2"
              >
                FAIL
              </button>
            </div>

            <div className="mt-3 text-sm">
              Status: {statusLabel(speakerStatus)}
            </div>
          </section>
        ) : null}

        {step === 5 ? (
          <section>
            <h2 className="mb-2 text-xl font-bold">
              Motion / gyro
            </h2>

            <p className="mb-4 text-sm text-gray-600">
              Start de test en beweeg de iPhone. De waarden moeten veranderen.
            </p>

            <button
              type="button"
              onClick={startMotionTest}
              className="rounded bg-black px-4 py-2 text-white"
            >
              Start motion test
            </button>

            <div className="mt-4 space-y-1 text-sm">
              <div>Status: {statusLabel(motionStatus)}</div>
              <div>X: {motionData.x}</div>
              <div>Y: {motionData.y}</div>
              <div>Z: {motionData.z}</div>
            </div>
          </section>
        ) : null}

        {step === 6 ? (
          <section>
            <h2 className="mb-4 text-xl font-bold">
              Overzicht
            </h2>

            <div className="space-y-3 text-sm">
              <div className="rounded border p-3">
                Touchscreen: {statusLabel(touchStatus)}
              </div>
              <div className="rounded border p-3">
                Camera: {statusLabel(cameraStatus)}
              </div>
              <div className="rounded border p-3">
                Microfoon: {statusLabel(microphoneStatus)}
              </div>
              <div className="rounded border p-3">
                Speaker: {statusLabel(speakerStatus)}
              </div>
              <div className="rounded border p-3">
                Motion: {statusLabel(motionStatus)}
              </div>
            </div>

            <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
              Resultaten worden nog niet opgeslagen. Eerst valideren we de
              volledige testervaring op iPhone Safari.
            </div>
          </section>
        ) : null}
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
          disabled={step === steps.length - 1}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
        >
          Volgende
        </button>
      </footer>
    </div>
  );
}
