import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/db",
      "packages/shared",
      "packages/adapter-utils",
      "packages/adapters/codex-local",
      "packages/adapters/opencode-local",
      "packages/adapters/openclaw-gateway",
      "server",
      "ui",
      "cli",
    ],
  },
});
