// app/admin/diagnostics/[id]/web-tests/components/CameraTest.tsx
"use client";

import { useRef, useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

type CameraFacing = "environment" | "user";

export default function CameraTest({ onNext, onPrev }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>("pending");
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [message, setMessage] = useState("");

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startCamera(nextFacing: CameraFacing = facing) {
    try {
      stopCamera();
      setMessage("");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing,
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setFacing(nextFacing);
      setStatus("pass");
    } catch (error) {
      setStatus("fail");
      setMessage(
        error instanceof Error ? error.message : "Camera kon niet starten."
      );
    }
  }

  async function switchCamera() {
    const nextFacing = facing === "environment" ? "user" : "environment";
    await startCamera(nextFacing);
  }

  async function applyZoom(value: number) {
    setZoomLevel(value);

    const track = streamRef.current?.getVideoTracks()[0];

    if (!track) {
      return;
    }

    try {
      await track.applyConstraints({
        advanced: [
          {
            zoom: value,
          } as MediaTrackConstraintSet,
        ],
      });
    } catch {
      setMessage("Zoom wordt niet ondersteund door deze browser/camera.");
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];

    if (!track) {
      setMessage("Start eerst de camera.");
      return;
    }

    try {
      await track.applyConstraints({
        advanced: [
          {
            torch: !torchEnabled,
          } as MediaTrackConstraintSet,
        ],
      });

      setTorchEnabled((current) => !current);
      setMessage(!torchEnabled ? "Flitser aan." : "Flitser uit.");
    } catch {
      setMessage("Flitser/torch wordt niet ondersteund in deze browser.");
    }
  }

  function takePhoto() {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setMessage("Camera preview is nog niet klaar.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      setMessage("Foto kon niet genomen worden.");
      return;
    }

    ctx.drawImage(video, 0, 0);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/jpeg", 0.92);
    link.download = "diagnostic-photo.jpg";
    link.click();

    setMessage("Foto genomen.");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Camera test</div>
        <h1 className="text-lg font-bold">Camera</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Test preview, front/back camera, zoom, flitser indien ondersteund en
          foto-opname.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startCamera()}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Start camera
          </button>

          <button
            type="button"
            onClick={switchCamera}
            className="rounded border px-4 py-2"
          >
            Wissel camera
          </button>

          <button
            type="button"
            onClick={toggleTorch}
            className="rounded border px-4 py-2"
          >
            {torchEnabled ? "Flitser uit" : "Flitser aan"}
          </button>

          <button
            type="button"
            onClick={takePhoto}
            className="rounded border px-4 py-2"
          >
            Neem foto
          </button>
        </div>

        <label className="mb-4 block text-sm">
          Zoom: {zoomLevel.toFixed(1)}x
          <input
            type="range"
            min="1"
            max="5"
            step="0.1"
            value={zoomLevel}
            onChange={(event) => applyZoom(Number(event.target.value))}
            className="mt-2 w-full"
          />
        </label>

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full rounded border bg-black"
        />

        <div className="mt-4 space-y-2 text-sm">
          <div>Status: {statusLabel(status)}</div>
          <div>Camera: {facing === "environment" ? "achtercamera" : "frontcamera"}</div>

          {message ? (
            <div className="rounded border bg-gray-50 p-3">{message}</div>
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
