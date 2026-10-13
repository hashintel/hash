import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.{ts,tsx}"],
    // Node must load the built Brunch app so faux-provider module hooks apply.
    server: { deps: { external: [/\/apps\/brunch-agent\/dist\//] } },
  },
});
