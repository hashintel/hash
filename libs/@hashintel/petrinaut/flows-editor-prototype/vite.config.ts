import { fileURLToPath } from "node:url";

import pandacss from "@pandacss/dev/postcss";
import { defineConfig, type PluginOption } from "vite";

import packageConfig from "../vite.config.ts";

const fromHere = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

/**
 * Serves the Flows editor prototype as a plain page, with the package's own
 * plugins (React Compiler) and Panda setup. `vite build` with this config
 * makes a static copy of the page.
 *
 * The prototype reads the real flow engine (`@local/hash-isomorphic-utils`)
 * from its sources, so that it runs without the engine's build, which needs
 * the graph's generated code. Those imports stay in this folder: the published
 * package never imports `@local/*`.
 */
export default defineConfig((env) => {
  const base = packageConfig(env);
  // The library build externalizes React's runtime and emits declarations;
  // a page build bundles everything instead.
  const libraryOnly = /esm-external-require|dts/i;
  const basePlugins: unknown[] = [base.plugins ?? []];
  const plugins = (basePlugins.flat(Infinity) as unknown[]).filter(
    (plugin) =>
      !(
        plugin &&
        typeof plugin === "object" &&
        "name" in plugin &&
        libraryOnly.test(String(plugin.name))
      ),
  ) as PluginOption[];
  return {
    ...base,
    plugins,
    root: fromHere("."),
    publicDir: false,
    resolve: {
      alias: [
        {
          find: /^@local\/hash-isomorphic-utils\/(.*)$/,
          replacement: `${fromHere("../../../@local/hash-isomorphic-utils/src")}/$1`,
        },
        {
          find: /^@local\/advanced-types\/(.*)$/,
          replacement: `${fromHere("../../../@local/advanced-types/src")}/$1`,
        },
        {
          find: /^@blockprotocol\/type-system$/,
          replacement: fromHere(
            "../../../@blockprotocol/type-system/typescript/src/main.ts",
          ),
        },
      ],
    },
    css: {
      postcss: {
        plugins: [pandacss({ configPath: fromHere("./panda.config.ts") })],
      },
    },
    // esbuild minifies the CSS: LightningCSS rejects a calc() in the DS styles.
    build: { cssMinify: "esbuild" },
    // The library's relative asset URLs suit consumers' bundlers, not a page.
    experimental: undefined,
    server: { port: Number(process.env.PORT ?? 6011), strictPort: true },
  };
});
