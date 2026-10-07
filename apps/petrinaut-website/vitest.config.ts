import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // The shared chat's tests pin memoization, so its components compile as
  // they do in the app. Test files stay uncompiled: the compiler would hoist
  // helpers out of `vi.mock` factories, away from the factory's imports.
  plugins: [
    react({
      include: /[\\/]plugins[\\/]_shared[\\/]chat[\\/].*\.tsx?$/,
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
