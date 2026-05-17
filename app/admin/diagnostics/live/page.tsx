// app/admin/diagnostics/live/page.tsx
"use client";

import { useMemo, useState } from "react";

type TestState = "pending" | "passed" | "failed";

const TESTS = [
  {
    key: "screen",
    label: "Scherm",
  },
  {
    key: "camera",
    label: "Camera",
  },
  {
    key: "microphone",
    label: "Microfoon",
  },
  {
    key: "speaker",
    label: "Speaker",
  },
  {
    key: "buttons",
    label: "Knoppen",
  },
  {
    key: "battery",
    label: "Batterij",
  },
  {
    key: "faceId",
    label: "Face ID",
  },
  {
    key: "wifi",
    label: "Wifi",
  },
];

export default function LiveDiagnosticsPage() {
  const [imei, setImei] = useState("");
  const [model, setModel] = useState("");

  const [sessionId, setSessionId] = useState("");

  const [loading, setLoading] = useState(false);

  const [tests, setTests] = useState<
    Record<string, TestState>
  >({
    screen: "pending",
    camera: "pending",
    microphone: "pending",
    speaker: "pending",
    buttons: "pending",
    battery: "pending",
    faceId: "pending",
    wifi: "pending",
  });

  const completedCount = useMemo(() => {
    return Object.values(tests).filter(
      (value) => value !== "pending"
    ).length;
  }, [tests]);

  const passCount = useMemo(() => {
    return Object.values(tests).filter(
      (value) => value === "passed"
    ).length;
  }, [tests]);

  async function startSession() {
    try {
      setLoading(true);

      const response = await fetch(
        "http://localhost:3010/diagnostics/session/start",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            imei,
            model,
          }),
        }
      );

      const result = await response.json();

      if (!result?.session?.session_id) {
        alert(
          result?.error ||
            "Sessie starten mislukt"
        );

        return;
      }

      setSessionId(
        result.session.session_id
      );

      alert(
        "Diagnostics sessie gestart"
      );
    } catch (error) {
      console.error(error);

      alert(
        "Kan geen verbinding maken met diagnostics bridge"
      );
    } finally {
      setLoading(false);
    }
  }

  async function setTestResult(
    key: string,
    value: TestState
  ) {
    const updatedTests = {
      ...tests,
      [key]: value,
    };

    setTests(updatedTests);

    if (!sessionId) {
      return;
    }

    try {
      await fetch(
        "http://localhost:3010/diagnostics/session/update",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            sessionId,
            status: "running",
            result: updatedTests,
          }),
        }
      );
    } catch (error) {
      console.error(error);
    }
  }

  async function completeSession() {
    try {
      if (!sessionId) {
        alert(
          "Start eerst een sessie"
        );

        return;
      }

      setLoading(true);

      const response = await fetch(
        "http://localhost:3010/diagnostics/session/complete",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            sessionId,
            status: "completed",
            result: tests,
          }),
        }
      );

      const result = await response.json();

      if (!result?.ok) {
        alert(
          result?.error ||
            "Opslaan mislukt"
        );

        return;
      }

      alert(
        "Diagnostics opgeslagen"
      );
    } catch (error) {
      console.error(error);

      alert(
        "Diagnostics opslaan mislukt"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          Live diagnose
        </h1>

        <p className="mt-2 text-sm text-neutral-500">
          Realtime toesteltesten via lokale diagnostics bridge.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Sessie
          </h2>

          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                IMEI
              </label>

              <input
                value={imei}
                onChange={(e) =>
                  setImei(e.target.value)
                }
                className="w-full rounded-xl border px-3 py-2"
                placeholder="IMEI"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Model
              </label>

              <input
                value={model}
                onChange={(e) =>
                  setModel(e.target.value)
                }
                className="w-full rounded-xl border px-3 py-2"
                placeholder="iPhone 15 Pro"
              />
            </div>

            <button
              onClick={startSession}
              disabled={loading}
              className="rounded-xl bg-black px-4 py-3 text-white"
            >
              Start diagnostics
            </button>

            {sessionId && (
              <div className="rounded-xl bg-neutral-100 p-3 text-sm">
                <div className="font-medium">
                  Session ID
                </div>

                <div className="mt-1 break-all font-mono text-xs">
                  {sessionId}
                </div>
              </div>
            )}

            <div className="rounded-xl border p-4">
              <div className="text-sm">
                Voltooid:{" "}
                <strong>
                  {completedCount}/
                  {TESTS.length}
                </strong>
              </div>

              <div className="mt-1 text-sm">
                Geslaagd:{" "}
                <strong>
                  {passCount}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Checklist
            </h2>

            <button
              onClick={completeSession}
              disabled={
                loading || !sessionId
              }
              className="rounded-xl bg-green-600 px-4 py-2 text-white"
            >
              Diagnostics voltooien
            </button>
          </div>

          <div className="grid gap-3">
            {TESTS.map((test) => (
              <div
                key={test.key}
                className="flex items-center justify-between rounded-xl border p-4"
              >
                <div className="font-medium">
                  {test.label}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setTestResult(
                        test.key,
                        "passed"
                      )
                    }
                    className={`rounded-lg px-3 py-1 text-sm ${
                      tests[
                        test.key
                      ] === "passed"
                        ? "bg-green-600 text-white"
                        : "bg-neutral-200"
                    }`}
                  >
                    Pass
                  </button>

                  <button
                    onClick={() =>
                      setTestResult(
                        test.key,
                        "failed"
                      )
                    }
                    className={`rounded-lg px-3 py-1 text-sm ${
                      tests[
                        test.key
                      ] === "failed"
                        ? "bg-red-600 text-white"
                        : "bg-neutral-200"
                    }`}
                  >
                    Fail
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
