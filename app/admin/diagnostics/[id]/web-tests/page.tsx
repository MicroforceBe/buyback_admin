// app/admin/diagnostics/[id]/web-tests/page.tsx

"use client";

import { useMemo, useRef, useState } from "react";

export default function WebDiagnosticsPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const sessionId = params.id;

  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(null);

  const cells = useMemo(
    () =>
      Array.from(
        { length: 32 },
        (_, index) => index
      ),
    []
  );

  const [touched, setTouched] = useState<
    number[]
  >([]);

  const [cameraStatus, setCameraStatus] =
    useState<
      "pending" | "pass" | "fail"
    >("pending");

  const [
    microphoneStatus,
    setMicrophoneStatus,
  ] = useState<
    "pending" | "pass" | "fail"
  >("pending");

  const [audioUrl, setAudioUrl] =
    useState<string | null>(null);

  const [motionStatus, setMotionStatus] =
    useState<
      "pending" | "pass" | "fail"
    >("pending");

  const [motionData, setMotionData] =
    useState({
      x: 0,
      y: 0,
      z: 0,
    });

  const progress = Math.round(
    (touched.length / cells.length) * 100
  );

  function markTouched(index: number) {
    setTouched((prev) => {
      if (prev.includes(index)) {
        return prev;
      }

      return [...prev, index];
    });
  }

  async function startCamera() {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode: "environment",
            },
          }
        );

      if (videoRef.current) {
        videoRef.current.srcObject =
          stream;
      }

      setCameraStatus("pass");
    } catch {
      setCameraStatus("fail");
    }
  }

  async function startMicrophoneRecording() {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: true,
          }
        );

      const chunks: BlobPart[] = [];

      const recorder =
        new MediaRecorder(stream);

      recorder.ondataavailable = (
        event
      ) => {
        chunks.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, {
          type: "audio/webm",
        });

        setAudioUrl(
          URL.createObjectURL(blob)
        );

        setMicrophoneStatus("pass");
      };

      recorder.start();

      mediaRecorderRef.current =
        recorder;

      setMicrophoneStatus("pending");
    } catch {
      setMicrophoneStatus("fail");
    }
  }

  function stopMicrophoneRecording() {
    mediaRecorderRef.current?.stop();

    mediaRecorderRef.current = null;
  }

  function startMotionTest() {
    if (
      typeof DeviceMotionEvent ===
      "undefined"
    ) {
      setMotionStatus("fail");

      return;
    }

    setMotionStatus("pending");

    window.addEventListener(
      "devicemotion",
      (event) => {
        setMotionStatus("pass");

        setMotionData({
          x:
            Math.round(
              (event
                .accelerationIncludingGravity
                ?.x || 0) * 100
            ) / 100,

          y:
            Math.round(
              (event
                .accelerationIncludingGravity
                ?.y || 0) * 100
            ) / 100,

          z:
            Math.round(
              (event
                .accelerationIncludingGravity
                ?.z || 0) * 100
            ) / 100,
        });
      }
    );
  }

  function playSpeakerTone() {
    const audioContext =
      new AudioContext();

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.frequency.value = 880;

    gain.gain.value = 0.2;

    oscillator.connect(gain);

    gain.connect(
      audioContext.destination
    );

    oscillator.start();

    setTimeout(() => {
      oscillator.stop();

      audioContext.close();
    }, 1000);
  }

  return (
    <div className="min-h-screen bg-white p-4">
      <h1 className="mb-2 text-2xl font-bold">
        Web Diagnostics
      </h1>

      <p className="mb-6 text-sm text-gray-500">
        Sessie: {sessionId}
      </p>

      <div className="space-y-6">
        <div className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Touchscreen grid test
          </h2>

          <p className="mb-3 text-sm text-gray-600">
            Tik alle vakken aan.
            Progress: {progress}%
          </p>

          <div className="grid grid-cols-4 gap-2">
            {cells.map((cell) => {
              const isTouched =
                touched.includes(cell);

              return (
                <button
                  key={cell}
                  type="button"
                  onTouchStart={() =>
                    markTouched(cell)
                  }
                  onClick={() =>
                    markTouched(cell)
                  }
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

          <div className="mt-3 text-sm">
            Resultaat:{" "}
            {progress === 100
              ? "PASS"
              : progress >= 60
              ? "WARNING"
              : "FAIL"}
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Camera test
          </h2>

          <p className="mb-3 text-sm text-gray-600">
            Start de camera en
            controleer beeld, focus en
            trillingen.
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

          <div className="mt-2 text-sm">
            Status:{" "}
            {cameraStatus === "pass"
              ? "PASS"
              : cameraStatus === "fail"
              ? "FAIL"
              : "In uitvoering"}
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Microfoon test
          </h2>

          <p className="mb-3 text-sm text-gray-600">
            Neem enkele seconden
            stemgeluid op en speel
            daarna terug af.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={
                startMicrophoneRecording
              }
              className="rounded bg-black px-4 py-2 text-white"
            >
              Start opname
            </button>

            <button
              type="button"
              onClick={
                stopMicrophoneRecording
              }
              className="rounded border px-4 py-2"
            >
              Stop opname
            </button>
          </div>

          {audioUrl ? (
            <audio
              controls
              src={audioUrl}
              className="mt-4 w-full"
            />
          ) : null}

          <div className="mt-2 text-sm">
            Status:{" "}
            {microphoneStatus ===
            "pass"
              ? "PASS"
              : microphoneStatus ===
                "fail"
              ? "FAIL"
              : "In uitvoering"}
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Speaker test
          </h2>

          <p className="mb-3 text-sm text-gray-600">
            Speel een toon af en
            bevestig manueel of het
            geluid helder is.
          </p>

          <button
            type="button"
            onClick={playSpeakerTone}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Speel testtoon
          </button>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Motion / gyro test
          </h2>

          <p className="mb-3 text-sm text-gray-600">
            Start de test en beweeg
            het toestel. Waarden
            moeten veranderen.
          </p>

          <button
            type="button"
            onClick={startMotionTest}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Start motion test
          </button>

          <div className="mt-3 space-y-1 text-sm">
            <div>
              Status:{" "}
              {motionStatus === "pass"
                ? "PASS"
                : motionStatus ===
                  "fail"
                ? "FAIL"
                : "In uitvoering"}
            </div>

            <div>X: {motionData.x}</div>

            <div>Y: {motionData.y}</div>

            <div>Z: {motionData.z}</div>
          </div>
        </div>

        <div className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Deze versie bewaart nog
          niets automatisch. Eerst
          testen we of de flow goed
          werkt op iPhone Safari.
          Daarna voegen we per test
          PASS / WARNING / FAIL opslag
          toe.
        </div>
      </div>
    </div>
  );
}
