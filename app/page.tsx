"use client";

import { useBench } from "@/lib/ui/useBench";
import { NavBar } from "@/components/NavBar";
import { SetupPanel } from "@/components/SetupPanel";
import { RecorderPhone } from "@/components/RecorderPhone";

export default function SetupPage() {
  const { controller, config, corpus, hydrated, applyConfig, patchConfig, resetTelemetry, addTrace, clearCorpus } =
    useBench();

  return (
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: "0 16px 16px" }}>
      <NavBar page="setup" />
      {!hydrated && <div className="muted mono">booting bench…</div>}
      {hydrated && (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 560 }}>
            <SetupPanel
              config={config}
              controller={controller}
              onApply={applyConfig}
              onPatch={patchConfig}
              onAnnotate={(m) => controller?.annotate(m)}
              onReset={resetTelemetry}
            />
          </div>
          <RecorderPhone corpus={corpus} config={config} onTrace={addTrace} onClear={clearCorpus} onPatch={patchConfig} />
        </div>
      )}
      <footer className="muted tiny" style={{ marginTop: 20, textAlign: "center", lineHeight: 1.7, maxWidth: 820, marginInline: "auto" }}>
        The game is an original simulation built from public screenshots — no third-party code or
        assets, and nothing here reverse-engineers, inspects, or runs against Triumph&apos;s real app.
        The detector runs client-side for visibility; the design is server-side. Thresholds are
        first-principles priors until calibrated on a real human corpus.
      </footer>
    </main>
  );
}
