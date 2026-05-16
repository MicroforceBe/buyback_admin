"use client";

import { useEffect, useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function ProximitySensorTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] =
    useState<Status>("pending");

  const [supported, setSupported] =
    useState(false);

  const [near, setNear] =
    useState<boolean | null>(null);

  const [message, setMessage] =
    useState(
      "Bedek de bovenkant van het scherm met je hand."
    );

  useEffect(() => {
    type DeviceProximityEvent =
      Event & {
        value?: number;
        near?: boolean;
      };

    function handleDeviceProximity(
      event: DeviceProximityEvent
    ) {
      setSupported(true);

      const isNear =
        Boolean(event.near) ||
        (event.value ?? 999) < 5;

      setNear(isNear);

      if (isNear) {
        setStatus("pass");

        setMessage(
          "Nabijheid gedetecteerd."
        );
      }
    }

    if (
      "ondeviceproximity" in window
    ) {
      window.addEventListener(
        "deviceproximity",
        handleDeviceProximity as EventListener
      );
    } else {
      setSupported(false);

      setStatus("warning");

      setMessage(
        "Proximity API niet ondersteund in Safari/iPhone browser."
      );
    }

    return () => {
      window.removeEventListener(
        "deviceproximity",
        handleDeviceProximity as EventListener
      );
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          Proximity sensor
        </div>

        <h1 className="text-lg font-bold">
          Nabijheidssensor
        </h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <div
          className={`mb-8 flex h-40 w-40 items-center justify-center rounded-full border-8 ${
            near
              ? "border-green-500 bg-green-100"
              : "border-gray-300 bg-gray-100"
          }`}
        >
          <div className="text-sm font-medium">
            {near
              ? "GEDETECTEERD"
              : "WACHTEN"}
          </div>
        </div>

        <p className="max-w-sm text-sm text-gray-600">
          {message}
        </p>

        <div className="mt-6 space-y-2 text-sm">
          <div>
            API ondersteuning:{" "}
            {supported
              ? "ja"
              : "nee"}
          </div>

          <div>
            Status:{" "}
            {statusLabel(status)}
          </div>
        </div>

        {!supported ? (
          <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
            iPhone Safari ondersteunt proximity
            sensoren momenteel niet betrouwbaar.
            Hiervoor is later een native app nodig.
          </div>
        ) : null}

        <div className="mt-8 grid w-full max-w-sm gap-2">
          <button
            type="button"
            onClick={() =>
              setStatus("pass")
            }
            className="rounded bg-green-600 px-4 py-3 font-medium text-white shadow"
          >
            PASS
          </button>

          <button
            type="button"
            onClick={() =>
              setStatus("warning")
            }
            className="rounded bg-yellow-400 px-4 py-3 font-medium text-black shadow"
          >
            WARNING
          </button>

          <button
            type="button"
            onClick={() =>
              setStatus("fail")
            }
            className="rounded bg-red-600 px-4 py-3 font-medium text-white shadow"
          >
            FAIL
          </button>
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
