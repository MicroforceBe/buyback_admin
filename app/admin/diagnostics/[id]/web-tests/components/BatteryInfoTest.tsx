"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

type BatteryManagerLike = {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
};

export default function BatteryInfoTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] =
    useState<Status>("pending");

  const [supported, setSupported] =
    useState<boolean | null>(null);

  const [batteryLevel, setBatteryLevel] =
    useState<number | null>(null);

  const [charging, setCharging] =
    useState<boolean | null>(null);

  const [chargingTime, setChargingTime] =
    useState<number | null>(null);

  const [dischargingTime, setDischargingTime] =
    useState<number | null>(null);

  const [message, setMessage] =
    useState("");

  async function readBatteryInfo() {
    try {
      if (
        typeof navigator === "undefined" ||
        !("getBattery" in navigator)
      ) {
        setSupported(false);

        setStatus("warning");

        setMessage(
          "Battery API wordt niet ondersteund in deze browser."
        );

        return;
      }

      setSupported(true);

      const battery = await (
        navigator as Navigator & {
          getBattery: () => Promise<BatteryManagerLike>;
        }
      ).getBattery();

      const level =
        Math.round(
          battery.level * 100
        );

      setBatteryLevel(level);

      setCharging(
        battery.charging
      );

      setChargingTime(
        battery.chargingTime
      );

      setDischargingTime(
        battery.dischargingTime
      );

      if (level <= 5) {
        setStatus("warning");

        setMessage(
          "Batterij bijna leeg."
        );

        return;
      }

      setStatus("pass");

      setMessage(
        "Batterij-informatie succesvol gelezen."
      );
    } catch {
      setStatus("warning");

      setMessage(
        "Battery API kon niet gelezen worden."
      );
    }
  }

  function formatSeconds(
    seconds: number | null
  ) {
    if (
      seconds === null ||
      !Number.isFinite(seconds)
    ) {
      return "—";
    }

    const hours =
      Math.floor(seconds / 3600);

    const minutes =
      Math.floor(
        (seconds % 3600) / 60
      );

    return `${hours}u ${minutes}m`;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          Battery info
        </div>

        <h1 className="text-lg font-bold">
          Batterij info
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Lees basis batterij-informatie
          uit indien ondersteund door de
          browser.
        </p>

        <button
          type="button"
          onClick={readBatteryInfo}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Lees batterij info
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

          <div>
            Batterij niveau:{" "}
            {batteryLevel === null
              ? "—"
              : `${batteryLevel}%`}
          </div>

          <div>
            Laden:{" "}
            {charging === null
              ? "—"
              : charging
              ? "ja"
              : "nee"}
          </div>

          <div>
            Charging time:{" "}
            {formatSeconds(
              chargingTime
            )}
          </div>

          <div>
            Discharging time:{" "}
            {formatSeconds(
              dischargingTime
            )}
          </div>

          {message ? (
            <div className="rounded border bg-gray-50 p-3">
              {message}
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          iPhone Safari ondersteunt
          batterij APIs beperkt. Voor
          batterijgezondheid/cycles is
          later een native app nodig.
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
