import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
  ],
  // css: {
  //   postcss: "./postcss.config.cjs",
  // },
  define: {
    "process.versions": JSON.stringify({ pnp: undefined }),
  },
  optimizeDeps: {
    include: ["@testing-library/dom"],
  },
  test: {
    include: ["src/**/*.browser.test.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: playwright(),
      // headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
