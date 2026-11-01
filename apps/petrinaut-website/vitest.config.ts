import { configDefaults, defineConfig } from "vitest/config";

import { websiteReactPlugin } from "./react-plugin.ts";

export default defineConfig({
  plugins: [websiteReactPlugin()],
  test: {
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
