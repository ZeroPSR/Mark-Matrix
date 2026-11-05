import { describe, it, expect } from "vitest";

// The live-database suites are opt-in: they run only under SUPABASE_TEST_RLS=1.
//
// This pins that the opt-in actually resolves credentials. Without it, a path
// that no longer matches the layout in `vitest.config.ts` makes every RLS
// file skip — and "skipped" reads exactly like "passed" in the summary line,
// which is the one way the pre-ship RLS check could silently prove nothing.
//
// The assertions never print the values: a failing `toBeTruthy()` on a
// service-role key would put the secret into the test output.

const enabled = process.env["SUPABASE_TEST_RLS"] === "1";
const itIf = enabled ? it : it.skip;

describe("live-db test credentials", () => {
  itIf("resolves the Supabase URL and the service-role key", () => {
    const url = process.env["SUPABASE_TEST_URL"];
    const key = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
    expect(typeof url).toBe("string");
    expect(typeof key).toBe("string");
    expect((url ?? "").length > 0).toBe(true);
    expect((key ?? "").length > 0).toBe(true);
  });
});
