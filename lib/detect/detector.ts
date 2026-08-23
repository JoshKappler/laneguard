/*
 * Behavioral detector — a parameterized port of the legacy AC analyzer. Pure
 * over its own accumulator state: no DOM, no clock except the timestamps its
 * callers pass in. Every threshold comes from DetectorConfig so a reader can
 * drive the whole thing from the UI and so calibrated constants can replace
 * the first-principles priors in one place.
 *
 * Signals:
 *   1 reaction   — dodge RT distribution (floor, variance, lapse-tail shape)
 *   2 kinematics — swipe micro-motion (motor noise, velocity-profile diversity)
 *   3 noise      — spectral whiteness of the micro-motion (injected vs motor)
 *   4 replay     — near-duplicate swipes in shape AND timing
 *   5 perfection — dodge margins + survival humans don't produce
 *   6 texture    — aborts, contested-space entries, cashout patterns
 *   7 integrity  — synthetic event provenance (isTrusted), coordinate granularity
 */
import type { DetectorConfig } from "@/lib/core/config";
import {
  featurize,
  shapeDist,
  profileDist,
  stats,
  skewness,
  type SwipeFeatures,
  type SwipeInput,
} from "./features";

export interface Signal {
  name: string;
  sus: number;
  ready: boolean;
  detail: string;
}

export interface Verdict {
  signals: Signal[];
  flags: string[];
  overall: number;
  ready: boolean;
  label: "WARMING UP" | "HUMAN" | "SUSPECT" | "BOT";
}

export const SIGNAL_NAMES = [
  "reaction time",
  "swipe kinematics",
  "noise character",
  "replay similarity",
  "perfection",
  "behavior texture",
  "event integrity",
] as const;

export class Detector {
  cfg: DetectorConfig;
  swipes: SwipeFeatures[] = [];
  rts: number[] = [];
  margins: number[] = [];
  deaths = 0;
  dodges = 0;
  moves = 0;
  rowsPassed = 0;
  aborts = 0;
  risks: boolean[] = [];
  private pendingRisks: { at: number }[] = [];
  runEnds: string[] = [];
  untrustedSeen = false;
  keyboardOnly = true;

  constructor(cfg: DetectorConfig) {
    this.cfg = cfg;
  }

  reset() {
    this.swipes = [];
    this.rts = [];
    this.margins = [];
    this.deaths = 0;
    this.dodges = 0;
    this.moves = 0;
    this.rowsPassed = 0;
    this.aborts = 0;
    this.risks = [];
    this.pendingRisks = [];
    this.runEnds = [];
    this.untrustedSeen = false;
    this.keyboardOnly = true;
  }

  /** returns the featurized swipe if it was accepted, else null */
  recordSwipe(s: SwipeInput): SwipeFeatures | null {
    this.keyboardOnly = false;
    if (!s.trusted) this.untrustedSeen = true;
    if (s.points.length >= this.cfg.swipeMinPoints && s.dur > this.cfg.swipeMinDurMs) {
      const f = featurize(s);
      // nearest-neighbor shape/timing distance for the inspector + replay tag
      let nn: { sd: number; pd: number; seq: number } | null = null;
      for (let i = 0; i < this.swipes.length; i++) {
        const o = this.swipes[i];
        const sd = shapeDist(f.res, o.res);
        if (!nn || sd < nn.sd)
          nn = { sd, pd: profileDist(f.profile, o.profile), seq: i };
      }
      (f as SwipeFeatures & { nn?: unknown; replayMatch?: boolean }).nn = nn;
      (f as SwipeFeatures & { replayMatch?: boolean }).replayMatch = !!(
        nn &&
        nn.sd < this.cfg.replay.shapeDupe &&
        nn.pd < this.cfg.replay.profileDupe
      );
      this.swipes.push(f);
      if (this.swipes.length > this.cfg.maxSwipes) this.swipes.shift();
      return f;
    }
    return null;
  }

  recordKey(trusted: boolean) {
    if (!trusted) this.untrustedSeen = true;
  }

  recordDodge(rt: number, margin: number) {
    this.dodges++;
    if (rt > 40 && rt < 2000) this.rts.push(rt);
    if (margin > 0) this.margins.push(margin);
    if (this.rts.length > this.cfg.maxRts) this.rts.shift();
    if (this.margins.length > this.cfg.maxMargins) this.margins.shift();
  }

  recordAbort() {
    this.aborts++;
  }

  recordRisk(atMs: number) {
    this.pendingRisks.push({ at: atMs });
  }

  recordMove() {
    this.moves++;
  }

  recordPass() {
    this.rowsPassed++;
  }

  recordRunEnd(kind: string) {
    this.runEnds.push(kind);
  }

  recordDeath(nowMs: number) {
    this.deaths++;
    for (const r of this.pendingRisks) {
      const fatal = nowMs - r.at <= this.cfg.texture.fatalWindowMs;
      this.risks.push(!fatal);
    }
    this.pendingRisks = [];
  }

  tickRisks(nowMs: number) {
    while (
      this.pendingRisks.length &&
      nowMs - this.pendingRisks[0].at > this.cfg.texture.fatalWindowMs
    ) {
      this.pendingRisks.shift();
      this.risks.push(true);
    }
  }

  analyze(): Verdict {
    const cfg = this.cfg;
    const signals: Signal[] = [];
    const flags: string[] = [];

    // 1. reaction time — floor, variance, and distribution SHAPE. Human RT is
    // ex-Gaussian: a heavy right tail of attentional lapses. Sampling a clean
    // Gaussian produces a symmetric distribution no human produces.
    {
      const R = cfg.reaction;
      const ready = this.rts.length >= R.minDodges;
      let sus = 0,
        detail = "need " + Math.max(0, R.minDodges - this.rts.length) + " more dodges";
      if (ready) {
        const st = stats(this.rts);
        if (st.min < R.floorMs) {
          sus += R.floorSus;
          flags.push("superhuman reaction floor: " + st.min.toFixed(0) + "ms");
        }
        if (st.cv < R.cvTight) {
          sus += R.cvTightSus;
          flags.push("reaction variance impossibly tight (cv " + st.cv.toFixed(2) + ")");
        } else if (st.cv < R.cvLow) sus += R.cvLowSus;
        if (st.mean < R.meanLowMs) sus += R.meanLowSus;
        let skewTxt = "";
        if (this.rts.length >= R.skewMinN) {
          const sk = skewness(this.rts);
          skewTxt = " · skew " + sk.toFixed(2);
          if (sk < R.skewFlat) {
            sus += R.skewFlatSus;
            flags.push(
              "no attentional lapses: RT distribution symmetric (skew " + sk.toFixed(2) + ")"
            );
          }
        }
        sus = Math.min(1, sus);
        detail =
          "mean " + st.mean.toFixed(0) + "ms · min " + st.min.toFixed(0) +
          " · cv " + st.cv.toFixed(2) + skewTxt;
      }
      signals.push({ name: "reaction time", sus, ready, detail });
    }

    // 2. swipe kinematics — motor-noise magnitude + velocity-profile diversity
    {
      const K = cfg.kinematics;
      const sw = this.swipes;
      const ready = sw.length >= K.minSwipes && !this.keyboardOnly;
      let sus = 0,
        detail = this.keyboardOnly
          ? "keyboard play — n/a"
          : "need " + Math.max(0, K.minSwipes - sw.length) + " more swipes";
      if (sw.length >= K.minSwipes) {
        const jit = stats(sw.map((s) => s.jitter));
        const peaks = stats(sw.map((s) => s.peakT));
        if (jit.mean < K.jitterNone) {
          sus += K.jitterNoneSus;
          flags.push("swipes have no motor noise (jitter " + jit.mean.toFixed(2) + "px)");
        } else if (jit.mean < K.jitterLow) sus += K.jitterLowSus;
        if (peaks.sd < K.peakSdUniform) {
          sus += K.peakSdSus;
          flags.push("velocity profiles machine-uniform");
        }
        sus = Math.min(1, sus);
        detail = "jitter " + jit.mean.toFixed(2) + "px · peak-pos sd " + peaks.sd.toFixed(3);
      }
      signals.push({ name: "swipe kinematics", sus, ready, detail });
    }

    // 3. noise character — injected iid noise is spectrally white; human motor
    // noise is band-limited. Catches bots that add randomness to defeat the
    // jitter check.
    {
      const N = cfg.noise;
      const ws = this.swipes.filter((s) => !Number.isNaN(s.white));
      const ready = ws.length >= N.minSwipes && !this.keyboardOnly;
      let sus = 0,
        detail = this.keyboardOnly
          ? "keyboard play — n/a"
          : "need " + Math.max(0, N.minSwipes - ws.length) + " more swipes";
      if (ready) {
        const ratio = ws.reduce((a, s) => a + s.white, 0) / ws.length;
        const amp = ws.reduce((a, s) => a + s.wamp, 0) / ws.length;
        if (ratio >= N.whiteFlag && amp >= N.ampMin) {
          sus = N.flagSus;
          flags.push(
            "high-frequency noise energy is white-noise-shaped (ratio " +
              ratio.toFixed(2) + ") — injected, not motor" +
              (cfg.calibration.basis === "prior" ? " [uncalibrated prior]" : "")
          );
        } else if (ratio >= N.whiteWarn && amp >= N.ampMin) sus = N.warnSus;
        detail =
          "Δ⁴/Δ² energy " + ratio.toFixed(2) + " · implied noise σ " +
          amp.toFixed(2) + "px (white ≥ ~" + N.whiteFlag.toFixed(1) + ")";
      }
      signals.push({ name: "noise character", sus, ready, detail });
    }

    // 4. replay similarity — near-duplicates must match in SHAPE and TIMING.
    {
      const RP = cfg.replay;
      const sw = this.swipes.slice(-RP.window);
      const ready = sw.length >= RP.minSwipes && !this.keyboardOnly;
      let sus = 0,
        detail = this.keyboardOnly
          ? "keyboard play — n/a"
          : "need " + Math.max(0, RP.minSwipes - sw.length) + " more swipes";
      if (sw.length >= RP.minSwipes) {
        let close = 0,
          pairs = 0;
        for (let i = 0; i < sw.length; i++)
          for (let j = i + 1; j < sw.length; j++) {
            pairs++;
            if (
              shapeDist(sw[i].res, sw[j].res) < RP.shapeDupe &&
              profileDist(sw[i].profile, sw[j].profile) < RP.profileDupe
            )
              close++;
          }
        const frac = pairs ? close / pairs : 0;
        sus = Math.min(1, Math.max(0, (frac - RP.fracLo) / RP.fracSpan));
        if (frac > RP.flagFrac)
          flags.push(
            "swipes repeat in shape AND timing: " + (frac * 100).toFixed(0) +
              "% near-duplicate pairs (trace replay)"
          );
        // Also report how many individual swipes have at least one near-twin.
        // Without it the panel ("4% of pairs") reads as contradicting the log,
        // which marks a swipe the moment its nearest neighbour matches — both
        // are true, they just count different things.
        const withTwin = sw.filter((s) =>
          sw.some(
            (o) =>
              o !== s &&
              shapeDist(s.res, o.res) < RP.shapeDupe &&
              profileDist(s.profile, o.profile) < RP.profileDupe
          )
        ).length;
        detail =
          (frac * 100).toFixed(0) + "% of pairs near-duplicate in shape+timing · " +
          withTwin + "/" + sw.length + " swipes have a near-twin";
      }
      signals.push({ name: "replay similarity", sus, ready, detail });
    }

    // 5. perfection — dodge-margin consistency and survival humans don't produce
    {
      const P = cfg.perfection;
      const ready = this.dodges >= P.minDodges;
      let sus = 0,
        detail = "need " + Math.max(0, P.minDodges - this.dodges) + " more dodges";
      if (ready) {
        if (this.margins.length >= P.minMargins) {
          const m = stats(this.margins);
          if (m.cv < P.marginCvTight) {
            sus += P.marginCvSus;
            flags.push("dodge margins metronome-consistent (cv " + m.cv.toFixed(2) + ")");
          }
          detail = "margin cv " + m.cv.toFixed(2) + " · ";
        } else detail = "";
        const dodgesPerDeath = this.dodges / Math.max(1, this.deaths);
        if (this.deaths === 0 && this.dodges >= P.zeroDeathDodges) {
          sus += P.zeroDeathSus;
          flags.push("zero deaths across " + this.dodges + " dodges");
        } else if (dodgesPerDeath > P.dodgesPerDeathHigh) sus += P.dodgesPerDeathSus;
        sus = Math.min(1, sus);
        detail += this.dodges + " dodges · " + this.deaths + " deaths";
      }
      signals.push({ name: "perfection", sus, ready, detail });
    }

    // 6. behavior texture — session-level habits automation doesn't reproduce
    {
      const T = cfg.texture;
      const ready = this.moves >= T.minMoves;
      let sus = 0,
        detail = "need " + Math.max(0, T.minMoves - this.moves) + " more moves";
      if (ready) {
        const parts: string[] = [];
        if (this.aborts === 0) {
          sus += T.zeroAbortSus;
          parts.push("0 aborted gestures");
        } else parts.push(this.aborts + " aborted gestures");
        if (this.risks.length === 0) {
          sus += T.noContestSus;
          flags.push(
            "never enters contested space across " + this.moves +
              " moves (lookahead-verified play)"
          );
          parts.push("0 contested moves");
        } else if (this.risks.length >= T.contestMinN) {
          const survived = this.risks.filter(Boolean).length;
          if (survived === this.risks.length) {
            sus += this.risks.length >= T.allSurvivedHiN ? T.allSurvivedSusHi : T.allSurvivedSus;
            flags.push(
              "risky moves never cost anything: " + survived + "/" +
                this.risks.length + " contested moves survived"
            );
          }
          parts.push(survived + "/" + this.risks.length + " contested survived");
        } else parts.push(this.risks.length + " contested moves");
        if (this.runEnds.length >= T.minRunEnds && !this.runEnds.includes("cashout")) {
          sus += T.neverBanksSus;
          flags.push(
            "never banks a run: " + this.runEnds.length + " runs, 0 cash-outs (farm pattern)"
          );
        }
        sus = Math.min(1, sus);
        detail = parts.join(" · ") + " · " + this.runEnds.length + " runs ended";
      }
      signals.push({ name: "behavior texture", sus, ready, detail });
    }

    // 7. event integrity — provenance. Cheap to spoof at the OS level, so it is
    // corroborating evidence, never the case.
    {
      const I = cfg.integrity;
      const sw = this.swipes;
      const ready = sw.length >= I.minSwipes || this.untrustedSeen;
      let sus = 0,
        detail = "collecting";
      if (ready) {
        if (this.untrustedSeen) {
          sus += I.untrustedSus;
          flags.push("synthetic input events (isTrusted=false)");
        }
        if (sw.length >= 5) {
          const intFrac = sw.reduce((a, s) => a + s.intFrac, 0) / sw.length;
          detail = this.untrustedSeen
            ? "synthetic events observed"
            : "events trusted · int-coord " + (intFrac * 100).toFixed(0) + "%";
        } else detail = this.untrustedSeen ? "synthetic events observed" : "events trusted";
        sus = Math.min(1, sus);
      }
      signals.push({ name: "event integrity", sus, ready, detail });
    }

    // ---- aggregation: weighted blend with escalation ----
    const W = cfg.weights;
    const weightOf: Record<string, number> = {
      "reaction time": W.reaction,
      "swipe kinematics": W.kinematics,
      "noise character": W.noise,
      "replay similarity": W.replay,
      perfection: W.perfection,
      "behavior texture": W.texture,
      "event integrity": W.integrity,
    };
    let wsum = 0,
      acc = 0,
      readyCount = 0;
    for (const s of signals) {
      if (!s.ready) continue;
      readyCount++;
      wsum += weightOf[s.name];
      acc += weightOf[s.name] * s.sus;
    }
    let overall = wsum ? acc / wsum : 0;
    // Escalation: an ensemble average must not wash out convergent evidence.
    const E = cfg.escalation;
    let maxSus = 0,
      hot = 0;
    for (const s of signals) {
      if (!s.ready) continue;
      if (s.sus > maxSus) maxSus = s.sus;
      if (s.sus >= E.hotAt) hot++;
    }
    if (maxSus >= E.gunAt) overall = Math.max(overall, E.gunFloor);
    if (maxSus >= E.gunHardAt) overall = Math.max(overall, maxSus * E.gunHardMult);
    if (hot >= 2) overall = Math.max(overall, E.hot2Floor);
    if (hot >= 3) overall = Math.max(overall, E.hot3Floor);

    const ready = readyCount >= 2;
    const label: Verdict["label"] = !ready
      ? "WARMING UP"
      : overall < cfg.cuts.human
        ? "HUMAN"
        : overall < cfg.cuts.bot
          ? "SUSPECT"
          : "BOT";
    return { signals, flags, overall, ready, label };
  }
}
