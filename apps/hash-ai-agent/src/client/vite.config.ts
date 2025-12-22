import path from "node:path";

import { defineConfig } from "vite";

/**
 * Vite configuration for the client-side React app.
 *
 * This runs separately from the Mastra server and connects via HTTP.
 * The root is set to the client/ directory so Vite finds index.html there.
 */
export default defineConfig({
  root: path.resolve(__dirname),
  server: {
    port: 5173,
    // Proxy API requests to Mastra server during development
    // This avoids CORS issues by making requests same-origin
    proxy: {
      "/api": {
        target: "http://localhost:4111",
        changeOrigin: true,
      },
      "/chat": {
        target: "http://localhost:4111",
        changeOrigin: true,
      },
    },
  },
  // Enable JSX transform
  esbuild: {
    jsx: "automatic",
  },
});
