import { defaultServerConditions } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

import { websiteReactPlugin } from "./react-plugin.ts";

// Brunch's client lives in `@hashintel/brunch-agent`; tests load its source,
// as the dev server does, so a test's `vi.mock` of one of its modules by
// path replaces the module the package itself loads.
// The conditions are Vitest's own defaults (Vite's server ones without
// `module`) plus the source condition.
const conditions = [
  "@dev/source",
  ...defaultServerConditions.filter((condition) => condition !== "module"),
];

export default defineConfig({
  plugins: [websiteReactPlugin()],
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
