"use client";

import { useCallback, useEffect, useState } from "react";
import type { BenchConfig, DeepPartial } from "@/lib/core/config";
import type { TracePoint } from "@/lib/attack/bot";
import type { BenchSnapshot } from "./bench-controller";
import { benchStore } from "./bench-store";

/** Thin React binding over the module-singleton bench store. */
export function useBench() {
  const [, force] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    benchStore.ensure();
    setHydrated(true);
    return benchStore.subscribe(() => force((n) => n + 1));
  }, []);

  const applyConfig = useCallback((cfg: BenchConfig) => benchStore.applyConfig(cfg), []);
  const patchConfig = useCallback((p: DeepPartial<BenchConfig>) => benchStore.patchConfig(p), []);
  const setLive = useCallback(
    (p: { mode?: BenchConfig["mode"]; hwInject?: boolean; showHitbox?: boolean }) => benchStore.setLive(p),
    []
  );
  const resetTelemetry = useCallback(() => benchStore.resetTelemetry(), []);
  const addTrace = useCallback((t: TracePoint[]) => benchStore.addTrace(t), []);
  const clearCorpus = useCallback(() => benchStore.clearCorpus(), []);

  return {
    controller: hydrated ? benchStore.controller : null,
    config: benchStore.config,
    snapshot: benchStore.snapshot as BenchSnapshot | null,
    corpus: benchStore.corpus,
    hydrated,
    applyConfig,
    patchConfig,
    setLive,
    resetTelemetry,
    addTrace,
    clearCorpus,
  };
}
