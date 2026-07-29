"use client";

import { useEffect, useRef } from "react";

import {
  appendPatternPoint,
  PATTERN_POINT_COUNT,
} from "@/lib/pattern-lock";

const POINT_POSITIONS = Array.from(
  { length: PATTERN_POINT_COUNT },
  (_, point) => ({
    x: ((point % 3) + 0.5) * (100 / 3),
    y: (Math.floor(point / 3) + 0.5) * (100 / 3),
  }),
);

type PatternLockGridProps = {
  value: number[];
  onChange: (points: number[]) => void;
  onComplete: (points: number[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
};

export function PatternLockGrid({
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  label = "رسم الگوی قفل",
}: PatternLockGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pointsRef = useRef(value);
  const drawingRef = useRef(false);

  useEffect(() => {
    pointsRef.current = value;
  }, [value]);

  function getPoint(clientX: number, clientY: number) {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const relativeX = Math.min(
      rect.width - 0.001,
      Math.max(0, clientX - rect.left),
    );
    const relativeY = Math.min(
      rect.height - 0.001,
      Math.max(0, clientY - rect.top),
    );
    const column = Math.floor((relativeX / rect.width) * 3);
    const row = Math.floor((relativeY / rect.height) * 3);
    return row * 3 + column;
  }

  function updatePoint(point: number, reset = false) {
    const nextPoints = reset
      ? [point]
      : appendPatternPoint(pointsRef.current, point);
    pointsRef.current = nextPoints;
    onChange(nextPoints);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    const point = getPoint(event.clientX, event.clientY);
    if (point === null) return;

    event.preventDefault();
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePoint(point, true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || !drawingRef.current) return;
    const point = getPoint(event.clientX, event.clientY);
    if (point !== null) {
      updatePoint(point);
    }
  }

  function finishPattern(event: React.PointerEvent<HTMLDivElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onComplete(pointsRef.current);
  }

  const linePoints = value
    .map((point) => POINT_POSITIONS[point])
    .filter(Boolean)
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");

  return (
    <div
      ref={gridRef}
      role="application"
      aria-label={label}
      aria-disabled={disabled}
      dir="ltr"
      data-testid="pattern-lock-grid"
      className={`relative mx-auto aspect-square w-full max-w-[280px] touch-none select-none rounded-[32px] border p-4 transition ${
        invalid
          ? "border-rose-300 bg-rose-50/80"
          : "border-[#d8ddff] bg-white/72"
      } ${disabled ? "opacity-60" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPattern}
      onPointerCancel={finishPattern}
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="pointer-events-none absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] overflow-visible"
      >
        {linePoints ? (
          <polyline
            points={linePoints}
            fill="none"
            stroke={invalid ? "#e11d48" : "#7c83ff"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.8"
          />
        ) : null}
      </svg>

      <div className="pointer-events-none grid h-full grid-cols-3 grid-rows-3 place-items-center">
        {POINT_POSITIONS.map((_, point) => {
          const order = value.indexOf(point);
          const selected = order >= 0;
          return (
            <span
              key={point}
              data-pattern-point={point}
              className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full border-2 transition ${
                selected
                  ? invalid
                    ? "border-rose-500 bg-rose-100 shadow-[0_0_0_8px_rgba(244,63,94,0.08)]"
                    : "border-[#747cff] bg-[#e9eaff] shadow-[0_0_0_8px_rgba(116,124,255,0.1)]"
                  : "border-[#cfd5e7] bg-white shadow-[0_8px_22px_rgba(70,80,130,0.08)]"
              }`}
            >
              <span
                className={`h-3.5 w-3.5 rounded-full ${
                  selected
                    ? invalid
                      ? "bg-rose-500"
                      : "bg-[#747cff]"
                    : "bg-[#9ba7c0]"
                }`}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
