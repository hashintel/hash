import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Node must load the built Brunch server so faux-provider module hooks apply.
    server: { deps: { external: [/\/apps\/brunch-agent\/dist\//] } },
  },
});
