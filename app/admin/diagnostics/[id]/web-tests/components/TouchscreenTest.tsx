"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Status,
  statusLabel,
} from "../types";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function TouchscreenTest({
  onNext,
  onPrev,
}: Props) {
  const touchCanvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const touchCtxRef =
    useRef<CanvasRenderingContext2D | null>(
      null
    );

  const touchGridRef =
    useRef<boolean[]>([]);

  const touchCols = 8;
  const touchRows = 16;

  const touchTotalCells =
    touchCols * touchRows;

  const [touchedCount, setTouchedCount] =
    useState(0);

  const touchProgress = Math.round(
    (touchedCount / touchTotalCells) *
      100
  );

  const touchStatus: Status =
    touchProgress === 100
      ? "pass"
      : touchProgress >= 70
      ? "warning"
      : "pending";

  useEffect(() => {
    const canvas =
      touchCanvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    touchCtxRef.current = ctx;

    touchGridRef.current =
      Array.from(
        {
          length: touchTotalCells,
        },
        () => false
      );

    function drawGrid() {
      if (!canvas || !ctx) {
        return;
      }

      const width =
        window.innerWidth;

      const height =
        window.innerHeight;

      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = "#111827";

      ctx.fillRect(
        0,
        0,
        width,
        height
      );

      const cellWidth =
        width / touchCols;

      const cellHeight =
        height / touchRows;

      touchGridRef.current.forEach(
        (isTouched, index) => {
          if (!isTouched) {
            return;
          }

          const col =
            index % touchCols;

          const row =
            Math.floor(
              index / touchCols
            );

          ctx.fillStyle =
            "#86efac";

          ctx.fillRect(
            col * cellWidth,
            row * cellHeight,
            cellWidth,
            cellHeight
          );
        }
      );

      ctx.strokeStyle =
        "rgba(255,255,255,0.18)";

      ctx.lineWidth = 1;

      for (
        let col = 1;
        col < touchCols;
        col += 1
      ) {
        ctx.beginPath();

        ctx.moveTo(
          col * cellWidth,
          0
        );

        ctx.lineTo(
          col * cellWidth,
          height
        );

        ctx.stroke();
      }

      for (
        let row = 1;
        row < touchRows;
        row += 1
      ) {
        ctx.beginPath();

        ctx.moveTo(
          0,
          row * cellHeight
        );

        ctx.lineTo(
          width,
          row * cellHeight
        );

        ctx.stroke();
      }
    }

    function markPoint(
      clientX: number,
      clientY: number
    ) {
      if (!canvas || !ctx) {
        return;
      }

      const rect =
        canvas.getBoundingClientRect();

      const x =
        clientX - rect.left;

      const y =
        clientY - rect.top;

      const col = Math.min(
        touchCols - 1,
        Math.max(
          0,
          Math.floor(
            (x / rect.width) *
              touchCols
          )
        )
      );

      const row = Math.min(
        touchRows - 1,
        Math.max(
          0,
          Math.floor(
            (y / rect.height) *
              touchRows
          )
        )
      );

      const index =
        row * touchCols + col;

      if (
        touchGridRef.current[index]
      ) {
        return;
      }

      touchGridRef.current[index] =
        true;

      const touched =
        touchGridRef.current.filter(
          Boolean
        ).length;

      setTouchedCount(touched);

      const cellWidth =
        canvas.width / touchCols;

      const cellHeight =
        canvas.height /
        touchRows;

      ctx.fillStyle =
        "#86efac";

      ctx.fillRect(
        col * cellWidth,
        row * cellHeight,
        cellWidth,
        cellHeight
      );
    }

    function handleTouch(
      event: TouchEvent
    ) {
      event.preventDefault();

      for (const touch of Array.from(
        event.touches
      )) {
        markPoint(
          touch.clientX,
          touch.clientY
        );
      }
    }

    drawGrid();

    canvas.addEventListener(
      "touchstart",
      handleTouch,
      {
        passive: false,
      }
    );

    canvas.addEventListener(
      "touchmove",
      handleTouch,
      {
        passive: false,
      }
    );

    return () => {
      canvas.removeEventListener(
        "touchstart",
        handleTouch
      );

      canvas.removeEventListener(
        "touchmove",
        handleTouch
      );
    };
  }, []);

  function resetTouchTest() {
    setTouchedCount(0);

    touchGridRef.current =
      Array.from(
        {
          length: touchTotalCells,
        },
        () => false
      );

    const canvas =
      touchCanvasRef.current;

    const ctx =
      touchCtxRef.current;

    if (!canvas || !ctx) {
      return;
    }

    ctx.fillStyle = "#111827";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-900">
      <canvas
        ref={touchCanvasRef}
        className="block h-screen w-screen touch-none bg-gray-900"
      />

      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/70 px-3 py-2 text-sm text-white">
        Touchscreen:{" "}
        {touchProgress}% —{" "}
        {statusLabel(
          touchStatus
        )}
      </div>

      <button
        type="button"
        onClick={
          resetTouchTest
        }
        className="absolute right-3 top-3 rounded bg-white px-3 py-2 text-sm font-medium shadow"
      >
        Reset
      </button>

      <div className="absolute bottom-3 left-3 right-3 flex justify-between gap-3">
        <button
          type="button"
          onClick={onPrev}
          className="rounded bg-white px-4 py-3 font-medium shadow"
        >
          Vorige
        </button>

        <button
          type="button"
          onClick={onNext}
          className="rounded bg-white px-4 py-3 font-medium shadow"
        >
          Volgende
        </button>
      </div>
    </div>
  );
}
