"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function GpsLocationTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] =
    useState<Status>("pending");

  const [latitude, setLatitude] =
    useState<number | null>(null);

  const [longitude, setLongitude] =
    useState<number | null>(null);

  const [accuracy, setAccuracy] =
    useState<number | null>(null);

  const [message, setMessage] =
    useState("");

  function startGpsTest() {
    if (!navigator.geolocation) {
      setStatus("fail");

      setMessage(
        "Geolocation API niet ondersteund."
      );

      return;
    }

    setMessage(
      "Locatie wordt opgevraagd..."
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat =
          Math.round(
            position.coords.latitude *
              1000000
          ) / 1000000;

        const lng =
          Math.round(
            position.coords.longitude *
              1000000
          ) / 1000000;

        const acc =
          Math.round(
            position.coords.accuracy
          );

        setLatitude(lat);

        setLongitude(lng);

        setAccuracy(acc);

        if (acc <= 30) {
          setStatus("pass");

          setMessage(
            "GPS nauwkeurigheid goed."
          );
        } else if (acc <= 100) {
          setStatus("warning");

          setMessage(
            "GPS werkt maar nauwkeurigheid is beperkt."
          );
        } else {
          setStatus("fail");

          setMessage(
            "GPS nauwkeurigheid slecht."
          );
        }
      },
      (error) => {
        setStatus("fail");

        setMessage(
          error.message ||
            "GPS test mislukt."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          GPS test
        </div>

        <h1 className="text-lg font-bold">
          GPS / locatie
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Geef toestemming voor locatie
          toegang en controleer GPS
          nauwkeurigheid.
        </p>

        <button
          type="button"
          onClick={startGpsTest}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Start GPS test
        </button>

        <div className="mt-6 space-y-2 text-sm">
          <div>
            Status:{" "}
            {statusLabel(status)}
          </div>

          <div>
            Latitude:{" "}
            {latitude ?? "—"}
          </div>

          <div>
            Longitude:{" "}
            {longitude ?? "—"}
          </div>

          <div>
            Accuracy:{" "}
            {accuracy === null
              ? "—"
              : `${accuracy} meter`}
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
