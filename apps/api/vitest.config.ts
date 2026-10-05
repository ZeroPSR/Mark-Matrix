import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    env: {
      // Cycle 8b: rate limit middleware is bypassed in tests unless
      // the test file calls vi.stubEnv("DISABLE_RATE_LIMIT", "0").
      DISABLE_RATE_LIMIT: "1",
    },
  },
});
