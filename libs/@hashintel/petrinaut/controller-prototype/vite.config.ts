import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import packageConfig from "../vite.config.ts";

/**
 * Serves the controller prototype as a plain page, with the package's own
 * plugins (React Compiler) and Panda setup, and no Storybook. `vite build`
 * with this config makes a static copy of the page.
 */
export default defineConfig((env) => {
  const base = packageConfig(env);
  // The library build externalizes React's runtime and emits declarations;
  // a page build bundles everything instead.
  const libraryOnly = /esm-external-require|dts/i;
  const plugins = [base.plugins ?? []]
    .flat(Infinity)
    .filter(
      (plugin) =>
        !(
          plugin &&
          typeof plugin === "object" &&
          "name" in plugin &&
          libraryOnly.test(String(plugin.name))
        ),
    );
  return {
    ...base,
    plugins,
    root: fileURLToPath(new URL(".", import.meta.url)),
    publicDir: fileURLToPath(new URL("../public", import.meta.url)),
    // esbuild minifies the CSS: LightningCSS rejects a calc() in the DS styles.
    build: { cssMinify: "esbuild" },
    // The library's relative asset URLs suit consumers' bundlers, not a page.
    experimental: undefined,
    server: { port: Number(process.env.PORT ?? 6010), strictPort: true },
  };
});
