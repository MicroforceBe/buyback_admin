"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function ChargingPortTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] =
    useState<Status>("pending");

  const [chargingDetected, setChargingDetected] =
    useState<boolean | null>(null);

  const [batteryLevel, setBatteryLevel] =
    useState<number | null>(null);

  const [message, setMessage] =
    useState("");

  async function testCharging() {
    try {
      if (
        typeof navigator === "undefined" ||
        !("getBattery" in navigator)
      ) {
        setMessage(
          "Battery API niet ondersteund in deze browser."
        );

        setStatus("warning");

        return;
      }

      const battery = await (
        navigator as Navigator & {
          getBattery: () => Promise<{
            charging: boolean;
            level: number;
          }>;
        }
      ).getBattery();

      setChargingDetected(
        battery.charging
      );

      setBatteryLevel(
        Math.round(
          battery.level * 100
        )
      );

      if (battery.charging) {
        setStatus("pass");

        setMessage(
          "Laden gedetecteerd."
        );
      } else {
        setStatus("warning");

        setMessage(
          "Geen actieve laadstatus gedetecteerd."
        );
      }
    } catch {
      setStatus("warning");

      setMessage(
        "Charging status kon niet automatisch uitgelezen worden."
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          Charging test
        </div>

        <h1 className="text-lg font-bold">
          Charging port
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Sluit een Lightning- of USB-C-kabel aan
          en controleer of het toestel begint te
          laden.
        </p>

        <button
          type="button"
          onClick={testCharging}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Controleer laadstatus
        </button>

        <div className="mt-6 space-y-2 text-sm">
          <div>
            Status:{" "}
            {statusLabel(status)}
          </div>

          <div>
            Laden:{" "}
            {chargingDetected === null
              ? "onbekend"
              : chargingDetected
              ? "ja"
              : "nee"}
          </div>

          <div>
            Batterij:{" "}
            {batteryLevel === null
              ? "—"
              : `${batteryLevel}%`}
          </div>

          {message ? (
            <div className="rounded border bg-gray-50 p-3">
              {message}
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          iPhone Safari ondersteunt batterij- en
          charging APIs beperkt. Volledige USB/port
          diagnostiek vereist later een native app.
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
