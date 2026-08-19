import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// happy-dom keeps the document between tests by default. Reset it so
// getBy* queries don't see duplicate DOM.
afterEach(() => cleanup());

// Provide deterministic env vars for tests that import the supabase client.
vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
