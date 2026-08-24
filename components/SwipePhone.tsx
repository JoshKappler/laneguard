"use client";

import { useEffect, useRef } from "react";
import type { BenchController } from "@/lib/ui/bench-controller";

/*
 * The ghost phone beside the real one: the live run at 25% opacity with every
 * swipe traced in red at the speed it actually happened, then fading out.
 * The controller draws into it each frame; this component only mounts it.
 */
export function SwipePhone({ controller }: { controller: BenchController | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!controller || !ref.current) return;
    controller.attachSwipeView(ref.current);
    return () => controller.detachSwipeView();
  }, [controller]);

  return (
    <canvas
      ref={ref}
      width={400}
      height={860}
      style={{
        width: "auto",
        height: "auto",
        maxWidth: "100%",
        maxHeight: "var(--game-max-h, 860px)",
        margin: "auto",
        border: "1px solid var(--line)",
        borderRadius: 20,
        display: "block",
      }}
    />
  );
}
