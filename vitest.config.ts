import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Behavior tests run whole simulated sessions — a single 180 s session is
    // seconds of real compute, and several run 3–12 of them. Vitest's 5 s
    // default is far too tight: the CI runner is ~2x slower than local, so
    // tests that pass here time out there. Per-test overrides remain for the
    // few that legitimately need longer.
    testTimeout: 60000,
  },
});
