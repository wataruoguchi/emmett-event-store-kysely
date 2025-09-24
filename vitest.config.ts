import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      exclude: [
        "database/**/*",
        "src/dev-tools/**/*",
        ".config/**/*",
        "*.config.ts",
        "src/index.ts",
        "src/global.d.ts",
      ],
    },
  },
});
