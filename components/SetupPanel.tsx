"use client";

import { useRouter } from "next/navigation";
import { PRESETS, mergeConfig, DEFAULT_CONFIG, type BenchConfig, type DeepPartial } from "@/lib/core/config";
import type { BenchController } from "@/lib/ui/bench-controller";

function makePatch(path: string, value: unknown): DeepPartial<BenchConfig> {
  const keys = path.split(".");
  const root: Record<string, unknown> = {};
  let cur = root;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else cur = (cur[k] = {}) as Record<string, unknown>;
  });
  return root as DeepPartial<BenchConfig>;
}

function Num({
  value,
  onChange,
  step = 1,
  min,
  max,
  w = 62,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  w?: number;
}) {
  return (
    <input
      type="number"
      value={+(+value).toFixed(3)}
      step={step}
      min={min}
      max={max}
      style={{ width: w }}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
    />
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span className="note">{label}</span>
      {children}
    </span>
  );
}

function Chip({ on, children, onClick, title }: { on: boolean; children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button className={on ? "active" : ""} onClick={onClick} title={title} style={{ padding: "4px 9px" }}>
      {children}
    </button>
  );
}

const DRIVERS = PRESETS.filter((p) => p.id !== "phone-farm-scale");

function driverIdOf(cfg: BenchConfig): string {
  if (cfg.mode === "human") return "human-baseline";
  if (cfg.mode === "perfect") return "naive-scripted";
  if (cfg.mode === "mirror") return "replay-farm";
  if (cfg.bot.plan) return "route-planner";
  return cfg.bot.gateRtToThreat ? "stealth-camouflage" : "evasive-generative";
}

export function SetupPanel({
  config,
  controller,
  onApply,
  onPatch,
  onAnnotate,
  onReset,
}: {
  config: BenchConfig;
  controller: BenchController | null;
  onApply: (cfg: BenchConfig) => void;
  onPatch: (p: DeepPartial<BenchConfig>) => void;
  onAnnotate: (msg: string) => void;
  onReset: () => void;
}) {
  const router = useRouter();
  const driverId = driverIdOf(config);
  const bot = config.bot;
  const det = config.detector;
  const game = config.game;

  const pickDriver = (id: string) => {
    const p = DRIVERS.find((d) => d.id === id);
    if (!p) return;
    onApply(
      mergeConfig(DEFAULT_CONFIG, {
        ...p.config,
        seed: config.seed,
        runsTarget: config.runsTarget,
        bot: { ...(p.config.bot ?? {}), mirror: { useRecorded: bot.mirror.useRecorded } },
      })
    );
    setTimeout(() => onAnnotate(p.logLine), 0);
  };

  const start = () => {
    onReset();
    router.push("/run");
  };

  const slider = (label: string, path: string, value: number, min: number, max: number, step: number, note?: string) => (
    <div className="rowline">
      <span className="lbl">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onPatch(makePatch(path, +e.target.value))} />
      <span className="mono" style={{ flex: "0 0 52px", textAlign: "right", fontSize: 11 }}>{+value.toFixed(3)}</span>
      {note && <span className="note">{note}</span>}
    </div>
  );

  return (
    <section className="panel">
      <div className="hline">
        run setup <span className="dim">pick a driver, point the anti-cheat at it, set the session, start</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(470px, 1fr))", gap: "0 30px", padding: 14 }}>
        <div className="col" style={{ gap: 2 }}>
          <div className="rowline" style={{ minHeight: 30 }}>
            <span className="lbl">driver</span>
            <span className="row" style={{ gap: 5 }}>
              {DRIVERS.map((p) => (
                <Chip key={p.id} on={driverId === p.id} onClick={() => pickDriver(p.id)} title={p.description}>
                  {p.label.replace(" bot", "")}
                </Chip>
              ))}
            </span>
          </div>
          <div className="rowline">
            <span className="lbl">event delivery</span>
            <Chip on={!config.hwInject} onClick={() => onPatch({ hwInject: false })} title="bot events arrive isTrusted=false, like browser injection">
              browser-injected
            </Chip>
            <Chip on={config.hwInject} onClick={() => onPatch({ hwInject: true })} title="bot events arrive trusted, like a phone-farm rig or OS driver">
              hardware-injected
            </Chip>
          </div>
          <div className="rowline">
            <span className="lbl">reaction time ms</span>
            <select value={bot.rt.family} onChange={(e) => onPatch(makePatch("bot.rt.family", e.target.value))}>
              <option value="gaussian">gaussian</option>
              <option value="exgaussian">ex-gaussian</option>
            </select>
            <Pair label="mean">
              <Num value={bot.rt.mean} step={5} onChange={(v) => onPatch(makePatch("bot.rt.mean", v))} w={54} />
            </Pair>
            <Pair label="sd">
              <Num value={bot.rt.sd} step={5} onChange={(v) => onPatch(makePatch("bot.rt.sd", v))} w={48} />
            </Pair>
            <Pair label="tau">
              <Num value={bot.rt.tau} step={5} onChange={(v) => onPatch(makePatch("bot.rt.tau", v))} w={48} />
            </Pair>
            <Pair label="floor">
              <Num value={bot.rt.floor} step={5} onChange={(v) => onPatch(makePatch("bot.rt.floor", v))} w={54} />
            </Pair>
          </div>
          <div className="rowline">
            <span className="lbl">rt gate</span>
            <label className="toggle">
              <input type="checkbox" checked={bot.gateRtToThreat} onChange={(e) => onPatch(makePatch("bot.gateRtToThreat", e.target.checked))} />
              never react faster than a sampled human RT after threat onset
            </label>
          </div>
          <div className="rowline">
            <span className="lbl">routing</span>
            <label className="toggle">
              <input type="checkbox" checked={bot.plan} onChange={(e) => onPatch(makePatch("bot.plan", e.target.checked))} />
              plan a surviving route ~6 s ahead instead of dodging one step
            </label>
          </div>
          {slider(
            "throw rate",
            "bot.throwRate",
            bot.throwRate,
            0,
            0.6,
            0.05,
            "share of runs lost on purpose: it picks a score and stops dodging there"
          )}
          <div className="rowline">
            <span className="lbl">motor noise</span>
            <select
              value={bot.noise.model}
              title="organic = pink 1/f + tremor + drift; iid = white noise"
              onChange={(e) => onPatch(makePatch("bot.noise.model", e.target.value))}
            >
              <option value="iid">iid</option>
              <option value="organic">organic</option>
            </select>
            <span className="note">pink</span>
            <Num value={bot.noise.pinkAmp} step={0.1} onChange={(v) => onPatch(makePatch("bot.noise.pinkAmp", v))} w={48} />
            <span className="note">tremor</span>
            <Num value={bot.noise.tremorAmpMin} step={0.05} onChange={(v) => onPatch(makePatch("bot.noise.tremorAmpMin", v))} w={48} />
          </div>
          <div className="rowline">
            <span className="lbl">human texture</span>
            <span className="note">risks/min</span>
            <Num value={bot.riskPerMin} step={0.1} onChange={(v) => onPatch(makePatch("bot.riskPerMin", v))} w={52} />
            <span className="note">aborts/min</span>
            <Num value={bot.abortsPerMin} step={0.1} onChange={(v) => onPatch(makePatch("bot.abortsPerMin", v))} w={52} />
          </div>
          <div className="rowline">
            <span className="lbl">win aggression</span>
            <span className="note">bank at score</span>
            <input
              type="number"
              value={bot.cashout.target ?? ""}
              placeholder="never"
              style={{ width: 72 }}
              onChange={(e) => {
                const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
                onPatch(makePatch("bot.cashout.target", Number.isNaN(v as number) ? null : v));
              }}
            />
            <span className="note">higher = greedier; blank = never cash out</span>
          </div>
          <div className="rowline">
            <span className="lbl">session</span>
            <span className="note">runs</span>
            <Num value={config.runsTarget} step={1} min={0} onChange={(v) => onPatch({ runsTarget: Math.max(0, Math.round(v)) })} w={54} />
            <span className="note">0 = endless</span>
            <span className="note" style={{ marginLeft: 8 }}>seed</span>
            <Num value={config.seed} step={1} onChange={(v) => onApply({ ...config, seed: Math.round(v) })} w={72} />
            <span className="note">same seed = identical run</span>
          </div>
        </div>

        <div className="col" style={{ gap: 2 }}>
          <div className="rowline" style={{ minHeight: 30 }}>
            <span className="lbl">anti-cheat</span>
            <span className="note">{det.calibration.note}</span>
          </div>
          {slider("rt floor flag ms", "detector.reaction.floorMs", det.reaction.floorMs, 80, 200, 5, "faster = superhuman")}
          {slider("jitter floor px", "detector.kinematics.jitterNone", det.kinematics.jitterNone, 0.05, 1, 0.05, "cleaner = machine")}
          {slider("whiteness flag", "detector.noise.whiteFlag", det.noise.whiteFlag, 1.4, 3, 0.05, "Δ⁴/Δ² of iid noise ≈ 2")}
          {slider("replay dupe cut", "detector.replay.shapeDupe", det.replay.shapeDupe, 0.005, 0.05, 0.001, "shape distance = same gesture")}
          <div className="rowline">
            <span className="lbl">verdict cuts</span>
            <span className="note">HUMAN below</span>
            <Num value={det.cuts.human} step={0.01} onChange={(v) => onPatch(makePatch("detector.cuts.human", v))} w={56} />
            <span className="note">BOT at</span>
            <Num value={det.cuts.bot} step={0.01} onChange={(v) => onPatch(makePatch("detector.cuts.bot", v))} w={56} />
            <span className="note">between = SUSPECT</span>
          </div>
          <div className="rowline" style={{ minHeight: 30, marginTop: 6 }}>
            <span className="lbl">game</span>
            <span className="note">speed</span>
            <Num value={game.baseSpeed} onChange={(v) => onPatch(makePatch("game.baseSpeed", v))} w={48} />
            <span className="note">→</span>
            <Num value={game.maxSpeed} onChange={(v) => onPatch(makePatch("game.maxSpeed", v))} w={48} />
            <span className="note">ramp</span>
            <Num value={game.speedRamp} step={0.02} onChange={(v) => onPatch(makePatch("game.speedRamp", v))} w={54} />
          </div>
          <div className="rowline">
            <span className="lbl"></span>
            <span className="note">density</span>
            <Num value={game.densityStart} step={0.01} onChange={(v) => onPatch(makePatch("game.densityStart", v))} w={54} />
            <span className="note">→</span>
            <Num value={game.densityMax} step={0.01} onChange={(v) => onPatch(makePatch("game.densityMax", v))} w={54} />
            <span className="note">barriers</span>
            <Num value={game.barrierFreq} step={0.02} onChange={(v) => onPatch(makePatch("game.barrierFreq", v))} w={54} />
          </div>
          <div className="rowline">
            <span className="lbl"></span>
            <span className="note">cash hold s</span>
            <Num value={game.cashHold} step={0.1} onChange={(v) => onPatch(makePatch("game.cashHold", v))} w={48} />
            <span className="note">steer rad</span>
            <Num value={game.maxSteer} step={0.02} onChange={(v) => onPatch(makePatch("game.maxSteer", v))} w={48} />
            <span className="note">hitbox</span>
            <Num value={game.hitHalfWidth} onChange={(v) => onPatch(makePatch("game.hitHalfWidth", v))} w={44} />
            <span className="note">×</span>
            <Num value={game.hitHalfLength} onChange={(v) => onPatch(makePatch("game.hitHalfLength", v))} w={44} />
          </div>
        </div>
      </div>
      <div className="rowline" style={{ borderTop: "1px solid var(--line)", padding: "10px 14px", gap: 14 }}>
        <button
          onClick={start}
          style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "rgba(61,220,255,0.06)", padding: "7px 16px", fontSize: 13 }}
        >
          start run →
        </button>
        <span className="mono note">
          {DRIVERS.find((d) => d.id === driverId)?.label.toLowerCase()} vs the 7-signal detector ·{" "}
          {config.runsTarget > 0 ? config.runsTarget + " runs" : "endless"} · seed {config.seed}
        </span>
        <span style={{ marginLeft: "auto" }} />
        <button onClick={onReset} disabled={!controller}>reset telemetry</button>
      </div>
    </section>
  );
}
