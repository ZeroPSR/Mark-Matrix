import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const configDir = dirname(fileURLToPath(import.meta.url));

/**
 * Read a `KEY=value` env file, if it is there.
 *
 * Vitest bundles this config before running it, so the module's own directory
 * and the process cwd can differ. Both are tried, and the first file that
 * exists wins — otherwise a path that no longer matches the layout silently
 * yields no credentials, the live-database suites skip, and "skipped" looks
 * exactly like "passed" in the summary line.
 */
function readEnvFile(relativePath: string): Record<string, string> {
  const candidates = [
    resolve(configDir, relativePath),
    resolve(process.cwd(), relativePath),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const out: Record<string, string> = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) continue;
      let value = match[2] ?? "";
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[match[1] as string] = value;
    }
    return out;
  }
  return {};
}

/**
 * The live-database suites read `SUPABASE_TEST_URL` / `SUPABASE_TEST_SERVICE_ROLE_KEY`.
 * CI supplies both from secrets; locally the same credentials live under
 * `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in the root `.env` and in
 * `apps/api/.dev.vars`. Without a fallback, `pnpm test:rls` skips every RLS
 * file unless both TEST_-prefixed names are exported by hand.
 */
const localEnv: Record<string, string> = {
  ...readEnvFile("../../.env"),
  ...readEnvFile(".dev.vars"),
};

// The fallback applies ONLY under an explicit opt-in, so a plain `pnpm test`
// keeps skipping the live-database files exactly as it does today.
const liveDbEnabled = process.env["SUPABASE_TEST_RLS"] === "1";
const testUrl =
  process.env["SUPABASE_TEST_URL"] ?? localEnv["SUPABASE_URL"] ?? "";
const testServiceKey =
  process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"] ??
  localEnv["SUPABASE_SERVICE_ROLE_KEY"] ??
  "";

if (liveDbEnabled && (!testUrl || !testServiceKey)) {
  console.warn(
    "[api] SUPABASE_TEST_RLS=1 but no Supabase URL / service key was found.\n" +
      "Checked $SUPABASE_TEST_URL, $SUPABASE_TEST_SERVICE_ROLE_KEY, the root .env and apps/api/.dev.vars.\n" +
      "The live-database suites would SKIP — which reads as a pass but proves nothing.",
  );
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    env: {
      // Cycle 8b: rate limit middleware is bypassed in tests unless
      // the test file calls vi.stubEnv("DISABLE_RATE_LIMIT", "0").
      DISABLE_RATE_LIMIT: "1",
      ...(liveDbEnabled
        ? {
            SUPABASE_TEST_URL: testUrl,
            SUPABASE_TEST_SERVICE_ROLE_KEY: testServiceKey,
          }
        : {}),
    },
  },
});
