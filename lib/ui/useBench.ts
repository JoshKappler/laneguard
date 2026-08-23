"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CONFIG,
  decodeConfig,
  encodeConfig,
  mergeConfig,
  type BenchConfig,
  type DeepPartial,
} from "@/lib/core/config";
import { BenchController, type BenchSnapshot } from "./bench-controller";

const STORAGE_KEY = "laneguard.config.v2";

function readInitialConfig(): BenchConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  const url = new URL(window.location.href);
  const c = url.searchParams.get("c");
  if (c) {
    const cfg = decodeConfig(c);
    return cfg;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return DEFAULT_CONFIG;
}

export function useBench() {
  const controllerRef = useRef<BenchController | null>(null);
  const [config, setConfigState] = useState<BenchConfig>(DEFAULT_CONFIG);
  const [snapshot, setSnapshot] = useState<BenchSnapshot | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // create controller once, after mount (needs window)
  useEffect(() => {
    const initial = readInitialConfig();
    setConfigState(initial);
    const ctrl = new BenchController(initial, { onSnapshot: setSnapshot });
    controllerRef.current = ctrl;
    ctrl.start();
    setHydrated(true);
    return () => ctrl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((cfg: BenchConfig) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      const url = new URL(window.location.href);
      const enc = encodeConfig(cfg);
      if (enc) url.searchParams.set("c", enc);
      else url.searchParams.delete("c");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  /** full config change → rebuild + reset the run */
  const applyConfig = useCallback(
    (cfg: BenchConfig) => {
      setConfigState(cfg);
      controllerRef.current?.setConfig(cfg);
      persist(cfg);
    },
    [persist]
  );

  const patchConfig = useCallback(
    (patch: DeepPartial<BenchConfig>) => {
      setConfigState((prev) => {
        const next = mergeConfig(prev, patch);
        controllerRef.current?.setConfig(next);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  /** live toggle without a full reset (mode, hwInject, showHitbox) */
  const setLive = useCallback(
    (p: { mode?: BenchConfig["mode"]; hwInject?: boolean; showHitbox?: boolean }) => {
      controllerRef.current?.setLive(p);
      setConfigState((prev) => {
        const next = { ...prev };
        if (p.mode !== undefined) next.mode = p.mode;
        if (p.hwInject !== undefined) next.hwInject = p.hwInject;
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const resetTelemetry = useCallback(() => controllerRef.current?.resetAll(), []);

  return {
    controller: controllerRef.current,
    config,
    snapshot,
    hydrated,
    applyConfig,
    patchConfig,
    setLive,
    resetTelemetry,
  };
}
