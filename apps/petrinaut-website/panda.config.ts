import { defineConfig } from "@pandacss/dev";
import { scopedThemeConfig } from "@hashintel/ds-components/preset";

/**
 * Extracts utility classes from the website's own source. The petrinaut library
 * ships a prebuilt `@hashintel/petrinaut/styles.css` covering its components;
 * this config emits a supplementary stylesheet for any `css()` calls in this
 * app. Layer order matches the library so utilities cascade together.
 */
export default defineConfig({
  ...scopedThemeConfig(".petrinaut-root"),
  include: ["./src/**/*.{ts,tsx,js,jsx}"],
  exclude: [],
  polyfill: true,
  importMap: "@hashintel/ds-helpers",
});
