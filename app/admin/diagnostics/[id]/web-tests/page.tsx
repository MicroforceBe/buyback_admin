// app/admin/diagnostics/[id]/web-tests/page.tsx

"use client";

import { useEffect, useRef, useState } from "react";

export default function WebDiagnosticsPage() {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const [touchPoints, setTouchPoints] =
    useState<string[]>([]);

  const [micStatus, setMicStatus] =
    useState("Niet getest");

  const [cameraStatus, setCameraStatus] =
    useState("Niet getest");

  const [gyroStatus, setGyroStatus] =
    useState("Niet getest");

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) return;

    ctx.fillStyle = "black";
    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

      function handleTouch(event: TouchEvent) {
        event.preventDefault();
      
        if (!canvas || !ctx) {
          return;
        }
      
        const rect = canvas.getBoundingClientRect();
      

      for (const touch of Array.from(
        event.touches
      )) {
        const x =
          touch.clientX - rect.left;

        const y =
          touch.clientY - rect.top;

        ctx.beginPath();

        ctx.arc(x, y, 20, 0, Math.PI * 2);

        ctx.fillStyle = "lime";
        ctx.fill();

        setTouchPoints((prev) => [
          ...prev,
          `${Math.round(x)}-${Math.round(y)}`,
        ]);
      }
    }

    canvas.addEventListener(
      "touchmove",
      handleTouch,
      {
        passive: false,
      }
    );

    return () => {
      canvas.removeEventListener(
        "touchmove",
        handleTouch
      );
    };
  }, []);

  async function testMicrophone() {
    try {
      await navigator.mediaDevices.getUserMedia(
        {
          audio: true,
        }
      );

      setMicStatus("Werkend");
    } catch {
      setMicStatus("Mislukt");
    }
  }

  async function testCamera() {
    try {
      await navigator.mediaDevices.getUserMedia(
        {
          video: true,
        }
      );

      setCameraStatus("Werkend");
    } catch {
      setCameraStatus("Mislukt");
    }
  }

  async function testGyroscope() {
    try {
      if (
        typeof DeviceMotionEvent !==
        "undefined"
      ) {
        setGyroStatus("Beschikbaar");
      } else {
        setGyroStatus("Niet beschikbaar");
      }
    } catch {
      setGyroStatus("Mislukt");
    }
  }

  return (
    <div className="min-h-screen bg-white p-4">
      <h1 className="mb-6 text-2xl font-bold">
        Web Diagnostics
      </h1>

      <div className="space-y-6">
        <div className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Touchscreen test
          </h2>

          <p className="mb-3 text-sm text-gray-600">
            Beweeg je vingers over het
            volledige scherm.
          </p>

          <canvas
            ref={canvasRef}
            width={350}
            height={500}
            className="w-full rounded border"
          />

          <div className="mt-2 text-sm">
            Touch punten:
            {" "}
            {touchPoints.length}
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Microfoon test
          </h2>

          <button
            onClick={testMicrophone}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Start microfoon test
          </button>

          <div className="mt-2 text-sm">
            Status: {micStatus}
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Camera test
          </h2>

          <button
            onClick={testCamera}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Start camera test
          </button>

          <div className="mt-2 text-sm">
            Status: {cameraStatus}
          </div>
        </div>

        <div className="rounded border p-4">
          <h2 className="mb-2 font-semibold">
            Gyroscope test
          </h2>

          <button
            onClick={testGyroscope}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Test gyroscope
          </button>

          <div className="mt-2 text-sm">
            Status: {gyroStatus}
          </div>
        </div>
      </div>
    </div>
  );
}
