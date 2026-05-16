"use client";

import { useEffect, useRef, useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function BarcodeScanTest({
  onNext,
  onPrev,
}: Props) {
  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  type BarcodeDetectorLike = {
    detect: (
      source: HTMLVideoElement
    ) => Promise<
      {
        rawValue?: string;
      }[]
    >;
  };
  
  const detectorRef =
    useRef<BarcodeDetectorLike | null>(null);


  const [status, setStatus] =
    useState<Status>("pending");

  const [supported, setSupported] =
    useState(false);

  const [scannedCode, setScannedCode] =
    useState("");

  const [message, setMessage] =
    useState(
      "Richt de camera op een QR-code of barcode."
    );

  async function startScanner() {
    try {
      if (
        typeof window === "undefined" ||
        !("BarcodeDetector" in window)
      ) {
        setSupported(false);

        setStatus("warning");

        setMessage(
          "BarcodeDetector API niet ondersteund in deze browser."
        );

        return;
      }

      setSupported(true);

  const BarcodeDetectorConstructor = (
    window as Window & {
      BarcodeDetector?: new (options: {
        formats: string[];
      }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  
  if (!BarcodeDetectorConstructor) {
    setSupported(false);
    setStatus("warning");
    setMessage(
      "BarcodeDetector API niet ondersteund in deze browser."
    );
    return;
  }
  
  detectorRef.current =
    new BarcodeDetectorConstructor({
      formats: [
        "qr_code",
        "ean_13",
        "ean_8",
        "code_128",
      ],
    });


      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode:
                "environment",
            },
          }
        );

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject =
          stream;
      }

      scanLoop();
    } catch {
      setStatus("fail");

      setMessage(
        "Scanner kon niet gestart worden."
      );
    }
  }

  async function scanLoop() {
    if (
      !videoRef.current ||
      !detectorRef.current
    ) {
      return;
    }

    try {
      const barcodes =
        await detectorRef.current.detect(
          videoRef.current
        );

      if (barcodes.length > 0) {
        const value =
          barcodes[0].rawValue || "";

        setScannedCode(value);

        setStatus("pass");

        setMessage(
          "Barcode/QR succesvol gelezen."
        );

        stopScanner();

        return;
      }
    } catch {}

    requestAnimationFrame(scanLoop);
  }

  function stopScanner() {
    streamRef.current
      ?.getTracks()
      .forEach((track) =>
        track.stop()
      );

    streamRef.current = null;
  }

  useEffect(() => {
    startScanner();

    return () => {
      stopScanner();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">
          Barcode scanner
        </div>

        <h1 className="text-lg font-bold">
          QR / barcode
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Test camera focus en barcode scanning.
        </p>

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full rounded border bg-black"
        />

        <div className="mt-4 space-y-2 text-sm">
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

          {scannedCode ? (
            <div className="rounded border bg-green-50 p-3 break-all">
              <div className="font-medium">
                Gedetecteerde code
              </div>

              <div className="mt-1 text-xs">
                {scannedCode}
              </div>
            </div>
          ) : null}

          <div className="rounded border bg-gray-50 p-3">
            {message}
          </div>
        </div>

        {!supported ? (
          <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
            Sommige Safari versies ondersteunen
            BarcodeDetector nog niet volledig.
          </div>
        ) : null}
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
