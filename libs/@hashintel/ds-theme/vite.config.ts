import { defineConfig } from "vite";

export default defineConfig({
  css: {
    postcss: "./postcss.config.cjs",
  },
  test: {
    include: ["**/*.test.?(c|m)[jt]s?(x)"],
  },
});
