import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/server-only.mock.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/utils/provider-group-state.test.ts",
      "tests/unit/proxy/provider-group-state.test.ts",
      "tests/unit/repository/provider-group-state.test.ts",
      "tests/unit/components/provider-group-status.test.tsx",
    ],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/utils/provider-group-state.ts",
        "src/app/[[]locale]/settings/providers/_components/provider-group-status.tsx",
      ],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});
