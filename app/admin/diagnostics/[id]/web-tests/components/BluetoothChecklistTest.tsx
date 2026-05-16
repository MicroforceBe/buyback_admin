"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function BluetoothChecklistTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] =
    useState<Status>("pending");

  const [supported, setSupported] =
    useState<boolean | null>(null);

  const [message, setMessage] =
    useState("");

  async function startBluetoothTest() {
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.bluetooth
      ) {
        setSupported(false);

        setStatus("warning");

        setMessage(
          "Web Bluetooth wordt niet ondersteund in deze browser."
        );

        return;
      }

      setSupported(true);

      await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
      });

      setStatus("pass");

      setMessage(
        "Bluetooth device detectie werkt."
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "NotFoundError"
      ) {
        setStatus("warning");

        setMessage(
          "Geen bluetooth device geselecteerd."
        );

        return;
      }

      setStatus("fail");

      setMessage(
        "Bluetooth test mislukt."
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          Bluetooth test
        </div>

        <h1 className="text-lg font-bold">
          Bluetooth
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Controleer of bluetooth devices
          zichtbaar zijn en pairing kan
          starten.
        </p>

        <button
          type="button"
          onClick={startBluetoothTest}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Start bluetooth test
        </button>

        <div className="mt-6 space-y-2 text-sm">
          <div>
            API ondersteuning:{" "}
            {supported === null
              ? "onbekend"
              : supported
              ? "ja"
              : "nee"}
          </div>

          <div>
            Status:{" "}
            {statusLabel(status)}
          </div>

          {message ? (
            <div className="rounded border bg-gray-50 p-3">
              {message}
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          iPhone Safari ondersteunt Web
          Bluetooth momenteel zeer beperkt.
          Volledige bluetooth diagnostiek
          vereist later een native app.
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
