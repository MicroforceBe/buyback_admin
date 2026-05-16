"use client";

import { useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function NetworkSpeedTest({
  onNext,
  onPrev,
}: Props) {
  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState("");
  const [downloadMs, setDownloadMs] = useState<number | null>(null);
  const [uploadMs, setUploadMs] = useState<number | null>(null);

  async function runSpeedTest() {
    try {
      setStatus("pending");
      setMessage("Netwerksnelheid wordt getest...");
      setDownloadMs(null);
      setUploadMs(null);

      const downloadStart = performance.now();

      await fetch(`/favicon.ico?cacheBust=${Date.now()}`, {
        cache: "no-store",
      });

      const downloadEnd = performance.now();
      const downloadDuration = Math.round(downloadEnd - downloadStart);

      setDownloadMs(downloadDuration);

      const uploadPayload = JSON.stringify({
        test: "network-upload",
        payload: "x".repeat(50_000),
      });

      const uploadStart = performance.now();

      await fetch("/api/health", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: uploadPayload,
        cache: "no-store",
      });

      const uploadEnd = performance.now();
      const uploadDuration = Math.round(uploadEnd - uploadStart);

      setUploadMs(uploadDuration);

      if (downloadDuration > 2000 || uploadDuration > 2500) {
        setStatus("warning");
        setMessage("Netwerk werkt, maar verbinding lijkt traag.");
        return;
      }

      setStatus("pass");
      setMessage("Netwerk snelheid OK.");
    } catch {
      setStatus("fail");
      setMessage("Netwerk speed test mislukt.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Network speed test</div>
        <h1 className="text-lg font-bold">Netwerksnelheid</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Deze test meet eenvoudige download- en upload latency naar jullie
          platform. Dit is geen exacte speedtest, maar goed genoeg voor intake.
        </p>

        <button
          type="button"
          onClick={runSpeedTest}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Start speed test
        </button>

        <div className="mt-6 space-y-2 text-sm">
          <div>Status: {statusLabel(status)}</div>
          <div>Download response: {downloadMs ?? "—"} ms</div>
          <div>Upload response: {uploadMs ?? "—"} ms</div>

          {message ? (
            <div className="rounded border bg-gray-50 p-3">
              {message}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="flex justify-between border-t p-4">
        <button type="button" onClick={onPrev} className="rounded border px-4 py-2">
          Vorige
        </button>

        <button type="button" onClick={onNext} className="rounded bg-black px-4 py-2 text-white">
          Volgende
        </button>
      </footer>
    </div>
  );
}
