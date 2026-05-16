"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

type MotionValues = {
  x: number;
  y: number;
  z: number;
  alpha: number;
  beta: number;
  gamma: number;
};

export default function MotionTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] =
    useState<Status>("pending");

  const [message, setMessage] =
    useState("");

  const [permissionState, setPermissionState] =
    useState<
      "unknown" | "granted" | "denied"
    >("unknown");

  const [values, setValues] =
    useState<MotionValues>({
      x: 0,
      y: 0,
      z: 0,
      alpha: 0,
      beta: 0,
      gamma: 0,
    });

  async function requestMotionPermission() {
    try {
      const motionEvent =
        DeviceMotionEvent as unknown as {
          requestPermission?: () => Promise<
            "granted" | "denied"
          >;
        };

      if (
        typeof motionEvent.requestPermission ===
        "function"
      ) {
        const result =
          await motionEvent.requestPermission();

        if (result !== "granted") {
          setPermissionState("denied");

          setStatus("fail");

          setMessage(
            "Motion permissie geweigerd."
          );

          return false;
        }
      }

      setPermissionState("granted");

      return true;
    } catch {
      setPermissionState("denied");

      setStatus("fail");

      setMessage(
        "Motion permissie mislukt."
      );

      return false;
    }
  }

  async function startMotionTest() {
    const granted =
      await requestMotionPermission();

    if (!granted) {
      return;
    }

    setStatus("pending");

    setMessage(
      "Beweeg en kantel de iPhone."
    );

    let movementDetected = false;

    const motionHandler = (
      event: DeviceMotionEvent
    ) => {
      const x =
        Math.round(
          ((event
            .accelerationIncludingGravity
            ?.x || 0) *
            100)
        ) / 100;

      const y =
        Math.round(
          ((event
            .accelerationIncludingGravity
            ?.y || 0) *
            100)
        ) / 100;

      const z =
        Math.round(
          ((event
            .accelerationIncludingGravity
            ?.z || 0) *
            100)
        ) / 100;

      setValues((prev) => ({
        ...prev,
        x,
        y,
        z,
      }));

      if (
        Math.abs(x) > 0.5 ||
        Math.abs(y) > 0.5 ||
        Math.abs(z) > 0.5
      ) {
        movementDetected = true;

        setStatus("pass");

        setMessage(
          "Accelerometer actief."
        );
      }
    };

    const orientationHandler = (
      event: DeviceOrientationEvent
    ) => {
      const alpha =
        Math.round(
          ((event.alpha || 0) * 100)
        ) / 100;

      const beta =
        Math.round(
          ((event.beta || 0) * 100)
        ) / 100;

      const gamma =
        Math.round(
          ((event.gamma || 0) * 100)
        ) / 100;

      setValues((prev) => ({
        ...prev,
        alpha,
        beta,
        gamma,
      }));

      if (
        Math.abs(beta) > 5 ||
        Math.abs(gamma) > 5
      ) {
        movementDetected = true;

        setStatus("pass");

        setMessage(
          "Gyroscope/orientation actief."
        );
      }
    };

    window.addEventListener(
      "devicemotion",
      motionHandler
    );

    window.addEventListener(
      "deviceorientation",
      orientationHandler
    );

    setTimeout(() => {
      window.removeEventListener(
        "devicemotion",
        motionHandler
      );

      window.removeEventListener(
        "deviceorientation",
        orientationHandler
      );

      if (!movementDetected) {
        setStatus("fail");

        setMessage(
          "Geen beweging gedetecteerd."
        );
      }
    }, 7000);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          Motion test
        </div>

        <h1 className="text-lg font-bold">
          Motion / gyro
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Geef toestemming wanneer iOS
          dit vraagt. Beweeg en kantel
          daarna de iPhone.
        </p>

        <button
          type="button"
          onClick={startMotionTest}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Start motion test
        </button>

        <div className="mt-6 space-y-2 text-sm">
          <div>
            Status:{" "}
            {statusLabel(status)}
          </div>

          <div>
            Permission:{" "}
            {permissionState}
          </div>

          <div>
            Accelerometer X:{" "}
            {values.x}
          </div>

          <div>
            Accelerometer Y:{" "}
            {values.y}
          </div>

          <div>
            Accelerometer Z:{" "}
            {values.z}
          </div>

          <div>
            Alpha: {values.alpha}
          </div>

          <div>
            Beta: {values.beta}
          </div>

          <div>
            Gamma: {values.gamma}
          </div>

          {message ? (
            <div className="rounded border bg-gray-50 p-3">
              {message}
            </div>
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
