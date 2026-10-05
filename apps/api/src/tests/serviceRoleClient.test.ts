import { describe, it, expect } from "vitest";
import { getServiceRoleClient } from "../lib/serviceRoleClient.js";

describe("getServiceRoleClient", () => {
  it("constructs a client from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", () => {
    const env = {
      ENVIRONMENT: "test",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon-key-not-used-here",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-xyz",
    };
    const client = getServiceRoleClient(env);
    expect(client).toBeDefined();
  });
});
