import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Vite + Cloudflare Pages/Workers integration.
// See https://developers.cloudflare.com/workers/vite-plugin/
export default defineConfig({
  plugins: [react(), cloudflare()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "happy-dom",
  },
});
