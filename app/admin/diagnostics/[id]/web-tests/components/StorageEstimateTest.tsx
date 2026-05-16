"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

type StorageEstimate = {
  quota?: number;
  usage?: number;
};

export default function StorageEstimateTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] =
    useState<Status>("pending");

  const [supported, setSupported] =
    useState<boolean | null>(null);

  const [quotaGb, setQuotaGb] =
    useState<number | null>(null);

  const [usageGb, setUsageGb] =
    useState<number | null>(null);

  const [freeGb, setFreeGb] =
    useState<number | null>(null);

  const [message, setMessage] =
    useState("");

  async function readStorageEstimate() {
    try {
      if (
        !navigator.storage ||
        !navigator.storage.estimate
      ) {
        setSupported(false);

        setStatus("warning");

        setMessage(
          "Storage API niet ondersteund."
        );

        return;
      }

      setSupported(true);

      const estimate =
        (await navigator.storage.estimate()) as StorageEstimate;

      const quota =
        estimate.quota || 0;

      const usage =
        estimate.usage || 0;

      const free =
        quota - usage;

      const quotaRounded =
        Math.round(
          (quota /
            1024 /
            1024 /
            1024) *
            10
        ) / 10;

      const usageRounded =
        Math.round(
          (usage /
            1024 /
            1024 /
            1024) *
            10
        ) / 10;

      const freeRounded =
        Math.round(
          (free /
            1024 /
            1024 /
            1024) *
            10
        ) / 10;

      setQuotaGb(quotaRounded);

      setUsageGb(usageRounded);

      setFreeGb(freeRounded);

      if (freeRounded < 1) {
        setStatus("warning");

        setMessage(
          "Zeer weinig vrije opslag."
        );

        return;
      }

      setStatus("pass");

      setMessage(
        "Opslaginformatie succesvol gelezen."
      );
    } catch {
      setStatus("warning");

      setMessage(
        "Opslaginformatie kon niet gelezen worden."
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          Storage estimate
        </div>

        <h1 className="text-lg font-bold">
          Opslagruimte
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Lees geschatte opslaginformatie
          uit via browser APIs.
        </p>

        <button
          type="button"
          onClick={readStorageEstimate}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Lees opslag info
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
            Totale quota:{" "}
            {quotaGb === null
              ? "—"
              : `${quotaGb} GB`}
          </div>

          <div>
            Gebruikt:{" "}
            {usageGb === null
              ? "—"
              : `${usageGb} GB`}
          </div>

          <div>
            Vrij:{" "}
            {freeGb === null
              ? "—"
              : `${freeGb} GB`}
          </div>

          {message ? (
            <div className="rounded border bg-gray-50 p-3">
              {message}
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Safari geeft slechts een
          schatting via browserstorage.
          Exacte toestelopslag vereist
          later een native app.
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
