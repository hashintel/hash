import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // The shared chat, Brunch and Voice compile as in the app, so their tests
  // see its memoization. Test files stay uncompiled: the compiler would hoist
  // helpers out of `vi.mock` factories, away from the factory's imports.
  plugins: [
    react({
      include: /[\\/]plugins[\\/](_shared[\\/]chat|brunch|voice)[\\/].*\.tsx?$/,
      exclude: [/\.test\.tsx?$/],
      compiler: {
        target: "19",
        compilationMode: "infer",
        panicThreshold: "critical_errors",
      },
    }),
  ],
  test: {
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
