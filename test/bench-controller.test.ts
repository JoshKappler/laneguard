import { describe, expect, it } from "vitest";
import { BenchController, type BenchSnapshot } from "@/lib/ui/bench-controller";
import { DEFAULT_CONFIG, PRESETS, mergeConfig } from "@/lib/core/config";

describe("BenchController.fastForward", () => {
  it("populates a full session headlessly (the first-visit demo boot)", () => {
    const naive = PRESETS.find((p) => p.id === "naive-scripted")!;
    const cfg = mergeConfig(DEFAULT_CONFIG, naive.config);
    let snap: BenchSnapshot | null = null;
    const c = new BenchController(cfg, { onSnapshot: (s) => (snap = s) });
    c.fastForward(180_000);
    expect(snap).not.toBeNull();
    expect(snap!.ready).toBe(true);
    expect(snap!.verdict).toBe("BOT");
    expect(c.runs.length).toBeGreaterThan(0);
    expect(c.swipes.length).toBeGreaterThan(5);
    expect(c.confHistory.length).toBeGreaterThan(100);
    expect(c.log.length).toBeGreaterThan(10);
    expect(Math.round(c.engine.now / 1000)).toBe(180);
  });

  it("does nothing in human mode (nobody is driving)", () => {
    const c = new BenchController(DEFAULT_CONFIG, { onSnapshot: () => {} });
    c.fastForward(10_000);
    expect(c.engine.now).toBe(0);
    expect(c.runs.length).toBe(0);
  });
});
