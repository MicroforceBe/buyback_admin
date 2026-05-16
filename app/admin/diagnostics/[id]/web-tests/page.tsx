// app/admin/diagnostics/[id]/web-tests/page.tsx

"use client";

import { useEffect, useState } from "react";

import IntroTest from "./components/IntroTest";
import TouchscreenTest from "./components/TouchscreenTest";
import MultitouchTest from "./components/MultitouchTest";
import EdgeTouchTest from "./components/EdgeTouchTest";
import ScreenTest from "./components/ScreenTest";
import DeadPixelTest from "./components/DeadPixelTest";
import BrightnessChecklistTest from "./components/BrightnessChecklistTest";
import CameraTest from "./components/CameraTest";
import AutofocusChecklistTest from "./components/AutofocusChecklistTest";
import FlashlightChecklistTest from "./components/FlashlightChecklistTest";
import BarcodeScanTest from "./components/BarcodeScanTest";
import MicrophoneTest from "./components/MicrophoneTest";
import SpeakerTest from "./components/SpeakerTest";
import EarpieceTest from "./components/EarpieceTest";
import MotionTest from "./components/MotionTest";
import RotationTest from "./components/RotationTest";
import FaceIdChecklistTest from "./components/FaceIdChecklistTest";
import ButtonChecklistTest from "./components/ButtonChecklistTest";
import ChargingPortTest from "./components/ChargingPortTest";
import VibrationChecklistTest from "./components/VibrationChecklistTest";
import ProximitySensorTest from "./components/ProximitySensorTest";
import WifiChecklistTest from "./components/WifiChecklistTest";
import ConnectivityTest from "./components/ConnectivityTest";
import NetworkSpeedTest from "./components/NetworkSpeedTest";
import BluetoothChecklistTest from "./components/BluetoothChecklistTest";
import GpsLocationTest from "./components/GpsLocationTest";
import CosmeticChecklistTest from "./components/CosmeticChecklistTest";
import SummaryTest from "./components/SummaryTest";

const steps = [
  "Intro",
  "Touchscreen",
  "Multitouch",
  "Edge touch",
  "Scherm",
  "Dead pixels",
  "Helderheid",
  "Camera",
  "Autofocus",
  "Flitser",
  "Barcode",
  "Microfoon",
  "Speaker",
  "Oorspeaker",
  "Motion",
  "Rotatie",
  "Face ID",
  "Knoppen",
  "Charging port",
  "Vibratie",
  "Proximity",
  "Wifi",
  "Connectiviteit",
  "Netwerksnelheid",
  "Bluetooth",
  "GPS",
  "Cosmetisch",
  "Samenvatting",
];

type DeviceInfo = {
  model?: string | null;
  serialNumber?: string | null;
  imei?: string | null;
  storageCapacity?: string | null;
  batteryHealth?: number | null;
  batteryCycleCount?: number | null;
  activationLockStatus?: string | null;
  iosVersion?: string | null;
};

export default function WebDiagnosticsPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const [step, setStep] = useState(0);

  const [deviceInfo, setDeviceInfo] =
    useState<DeviceInfo | null>(null);

  const [loadingDeviceInfo, setLoadingDeviceInfo] =
    useState(true);

  useEffect(() => {
    async function loadDeviceInfo() {
      try {
        const response = await fetch(
          `/api/diagnostics/device/${params.id}`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        setDeviceInfo(data);
      } catch {
        //
      } finally {
        setLoadingDeviceInfo(false);
      }
    }

    loadDeviceInfo();
  }, [params.id]);

  function goNext() {
    setStep((current) =>
      Math.min(
        current + 1,
        steps.length - 1
      )
    );
  }

  function goPrev() {
    setStep((current) =>
      Math.max(current - 1, 0)
    );
  }

  if (step === 1)
    return (
      <TouchscreenTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 2)
    return (
      <MultitouchTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 3)
    return (
      <EdgeTouchTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 4)
    return (
      <ScreenTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 5)
    return (
      <DeadPixelTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 6)
    return (
      <BrightnessChecklistTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 7)
    return (
      <CameraTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 8)
    return (
      <AutofocusChecklistTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 9)
    return (
      <FlashlightChecklistTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 10)
    return (
      <BarcodeScanTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 11)
    return (
      <MicrophoneTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 12)
    return (
      <SpeakerTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 13)
    return (
      <EarpieceTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 14)
    return (
      <MotionTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 15)
    return (
      <RotationTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 16)
    return (
      <FaceIdChecklistTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 17)
    return (
      <ButtonChecklistTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 18)
    return (
      <ChargingPortTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 19)
    return (
      <VibrationChecklistTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 20)
    return (
      <ProximitySensorTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 21)
    return (
      <WifiChecklistTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 22)
    return (
      <ConnectivityTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 23)
    return (
      <NetworkSpeedTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 24)
    return (
      <BluetoothChecklistTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 25)
    return (
      <GpsLocationTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 26)
    return (
      <CosmeticChecklistTest
        onNext={goNext}
        onPrev={goPrev}
      />
    );

  if (step === 27) {
    return (
      <SummaryTest
        onRestart={() =>
          setStep(0)
        }
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-gray-500">
              Sessie {params.id}
            </div>

            <h1 className="text-lg font-bold">
              {steps[step]}
            </h1>
          </div>

          <div className="text-sm text-gray-500">
            {step + 1}/{steps.length}
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded bg-gray-100">
          <div
            className="h-full bg-black"
            style={{
              width: `${
                ((step + 1) /
                  steps.length) *
                100
              }%`,
            }}
          />
        </div>

        {loadingDeviceInfo ? (
          <div className="mt-3 text-xs text-gray-400">
            Device info laden...
          </div>
        ) : deviceInfo ? (
          <div className="mt-3 rounded border bg-gray-50 p-3 text-xs">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div>
                <span className="font-medium">
                  Model:
                </span>{" "}
                {deviceInfo.model ||
                  "—"}
              </div>

              <div>
                <span className="font-medium">
                  iOS:
                </span>{" "}
                {deviceInfo.iosVersion ||
                  "—"}
              </div>

              <div>
                <span className="font-medium">
                  Battery:
                </span>{" "}
                {deviceInfo.batteryHealth
                  ? `${deviceInfo.batteryHealth}%`
                  : "—"}
              </div>

              <div>
                <span className="font-medium">
                  Cycles:
                </span>{" "}
                {deviceInfo.batteryCycleCount ||
                  "—"}
              </div>

              <div>
                <span className="font-medium">
                  Storage:
                </span>{" "}
                {deviceInfo.storageCapacity ||
                  "—"}
              </div>

              <div>
                <span className="font-medium">
                  Activation:
                </span>{" "}
                {deviceInfo.activationLockStatus ||
                  "—"}
              </div>

              <div className="col-span-2 truncate">
                <span className="font-medium">
                  IMEI:
                </span>{" "}
                {deviceInfo.imei ||
                  "—"}
              </div>

              <div className="col-span-2 truncate">
                <span className="font-medium">
                  Serial:
                </span>{" "}
                {deviceInfo.serialNumber ||
                  "—"}
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <IntroTest
          sessionId={params.id}
        />
      </main>

      <footer className="flex items-center justify-between gap-3 border-t p-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={step === 0}
          className="rounded border px-4 py-2 disabled:opacity-40"
        >
          Vorige
        </button>

        <button
          type="button"
          onClick={goNext}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Volgende
        </button>
      </footer>
    </div>
  );
}
