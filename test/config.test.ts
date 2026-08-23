import { describe, expect, test } from "vitest";
import {
  DEFAULT_CONFIG,
  mergeConfig,
  diffConfig,
  encodeConfig,
  decodeConfig,
  PRESETS,
} from "@/lib/core/config";

describe("config merge/diff", () => {
  test("merge applies a deep partial without mutating defaults", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      game: { baseSpeed: 20 },
      bot: { rt: { mean: 300 } },
    });
    expect(merged.game.baseSpeed).toBe(20);
    expect(merged.game.maxSpeed).toBe(DEFAULT_CONFIG.game.maxSpeed);
    expect(merged.bot.rt.mean).toBe(300);
    expect(merged.bot.rt.sd).toBe(DEFAULT_CONFIG.bot.rt.sd);
    expect(DEFAULT_CONFIG.game.baseSpeed).not.toBe(20);
  });

  test("arrays are replaced wholesale", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      game: { laneMult: [3, 1, 0] },
    });
    expect(merged.game.laneMult).toEqual([3, 1, 0]);
  });

  test("diff produces the minimal partial that reproduces the config", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { game: { baseSpeed: 21 } });
    const d = diffConfig(DEFAULT_CONFIG, merged);
    expect(d).toEqual({ game: { baseSpeed: 21 } });
    expect(diffConfig(DEFAULT_CONFIG, DEFAULT_CONFIG)).toEqual({});
  });
});

describe("config URL codec", () => {
  test("encode/decode roundtrips a modified config", () => {
    const cfg = mergeConfig(DEFAULT_CONFIG, {
      seed: 999,
      mode: "generative",
      hwInject: true,
      bot: { noise: { model: "organic" } },
    });
    const s = encodeConfig(cfg);
    expect(typeof s).toBe("string");
    expect(s).not.toMatch(/[+/=]/); // url-safe
    const back = decodeConfig(s);
    expect(back).toEqual(cfg);
  });

  test("default config encodes to an empty string and decodes back", () => {
    expect(encodeConfig(DEFAULT_CONFIG)).toBe("");
    expect(decodeConfig("")).toEqual(DEFAULT_CONFIG);
    expect(decodeConfig("garbage!!!")).toEqual(DEFAULT_CONFIG); // never throws
  });
});

describe("presets", () => {
  test("all documented presets exist and produce valid configs", () => {
    const names = PRESETS.map((p) => p.id);
    for (const want of [
      "human-baseline",
      "naive-scripted",
      "replay-farm",
      "evasive-generative",
      "stealth-camouflage",
    ])
      expect(names).toContain(want);
    for (const p of PRESETS) {
      const cfg = mergeConfig(DEFAULT_CONFIG, p.config);
      expect(cfg.game.laneMult.length).toBeGreaterThanOrEqual(3);
      expect(p.description.length).toBeGreaterThan(10);
    }
  });

  test("stealth preset enables the full camouflage kit", () => {
    const p = PRESETS.find((p) => p.id === "stealth-camouflage")!;
    const cfg = mergeConfig(DEFAULT_CONFIG, p.config);
    expect(cfg.mode).toBe("generative");
    expect(cfg.hwInject).toBe(true);
    expect(cfg.bot.noise.model).toBe("organic");
    expect(cfg.bot.gateRtToThreat).toBe(true);
    expect(cfg.bot.rt.family).toBe("exgaussian");
    expect(cfg.bot.riskPerMin).toBeGreaterThan(0);
    expect(cfg.bot.abortsPerMin).toBeGreaterThan(0);
  });
});
