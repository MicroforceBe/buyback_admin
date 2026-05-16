"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function WifiChecklistTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState("");

  async function testOnline() {
    try {
      setMessage("Online status wordt getest...");

      const response = await fetch("/api/health", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        setStatus("warning");
        setMessage("Netwerk bereikbaar, maar server response is niet OK.");
        return;
      }

      setStatus("pass");
      setMessage("Wifi/internet verbinding werkt.");
    } catch {
      setStatus("fail");
      setMessage("Geen internetverbinding gedetecteerd.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Wifi test</div>
        <h1 className="text-lg font-bold">Wifi / internet</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Controleer of het toestel via wifi of mobiele data online is.
        </p>

        <button
          type="button"
          onClick={testOnline}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Test verbinding
        </button>

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={() => setStatus("pass")}
            className="rounded border border-green-500 bg-green-50 px-4 py-3"
          >
            Wifi werkt / PASS
          </button>

          <button
            type="button"
            onClick={() => setStatus("warning")}
            className="rounded border border-yellow-500 bg-yellow-50 px-4 py-3"
          >
            Traag/onzeker / WARNING
          </button>

          <button
            type="button"
            onClick={() => setStatus("fail")}
            className="rounded border border-red-500 bg-red-50 px-4 py-3"
          >
            Geen verbinding / FAIL
          </button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div>Status: {statusLabel(status)}</div>

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
