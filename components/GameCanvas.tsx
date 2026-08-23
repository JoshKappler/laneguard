"use client";

import { useEffect, useRef } from "react";
import type { BenchController } from "@/lib/ui/bench-controller";

export function GameCanvas({ controller }: { controller: BenchController | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!controller || !ref.current) return;
    const canvas = ref.current;
    controller.attach(canvas);

    const toCanvas = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * canvas.width,
        y: ((e.clientY - r.top) / r.height) * canvas.height,
      };
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = toCanvas(e);
      controller.pointerDown(p.x, p.y, e.isTrusted);
    };
    const move = (e: PointerEvent) => {
      const p = toCanvas(e);
      controller.pointerMove(p.x, p.y);
    };
    const up = () => controller.pointerUp();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      controller.key(e.key === "ArrowRight" ? 1 : -1, e.isTrusted);
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    };
  }, [controller]);

  return (
    <canvas
      ref={ref}
      width={400}
      height={860}
      style={{
        width: "100%",
        maxWidth: 400,
        border: "1px solid var(--line)",
        borderRadius: 20,
        touchAction: "none",
        display: "block",
      }}
    />
  );
}
