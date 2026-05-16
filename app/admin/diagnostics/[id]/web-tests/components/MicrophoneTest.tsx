"use client";

import { useRef, useState } from "react";
import { Status, statusLabel } from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

function getSupportedAudioMimeType() {
  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/mp4")
  ) {
    return "audio/mp4";
  }

  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/webm")
  ) {
    return "audio/webm";
  }

  return "";
}

export default function MicrophoneTest({ onNext, onPrev }: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  async function startRecording() {
    try {
      setMessage("");
      setAudioUrl(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const mimeType = getSupportedAudioMimeType();

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setStatus("fail");
        setMessage("Fout tijdens opname.");
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/mp4",
        });

        stream.getTracks().forEach((track) => track.stop());

        if (chunksRef.current.length === 0) {
          setStatus("fail");
          setMessage("Geen audio opgenomen.");
          return;
        }

        setAudioUrl(URL.createObjectURL(blob));
        setStatus("pass");
        setMessage("Opname klaar voor playback.");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();

      setStatus("pending");
      setMessage("Aan het opnemen...");
    } catch (error) {
      setStatus("fail");
      setMessage(
        error instanceof Error
          ? error.message
          : "Microfoon kon niet gestart worden."
      );
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    mediaRecorderRef.current = null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="text-xs text-gray-500">Microfoon test</div>
        <h1 className="text-lg font-bold">Microfoon</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Neem enkele seconden stemgeluid op en speel daarna terug af.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startRecording}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Start opname
          </button>

          <button
            type="button"
            onClick={stopRecording}
            className="rounded border px-4 py-2"
          >
            Stop opname
          </button>
        </div>

        {audioUrl ? (
          <audio controls src={audioUrl} className="mb-4 w-full" />
        ) : null}

        <div className="space-y-2 text-sm">
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
