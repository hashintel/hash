import { fileURLToPath } from "node:url";

import { sentryVitePlugin } from "@sentry/vite-plugin";
import { nitro } from "nitro/vite";
import vinext from "vinext";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

import { buildStamp } from "./buildstamp.js";
import nextConfig from "./next.config.js";

process.env.NEXT_PUBLIC_BUILD_STAMP = buildStamp;

export default defineConfig({
  server: {
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
  },
  build: {
    sourcemap: true,
  },
  define: {
    __SENTRY_DEBUG__: false,
  },
  plugins: [
    svgr({ include: "**/*.svg" }),
    vinext({ disableAppRouter: true }),
    process.env.NITRO_PRESET
      ? nitro({
          rolldownConfig: {
            external: [/^react(?:\/|$)/, /^react-dom(?:\/|$)/],
          },
          traceDeps: ["react*", "react-dom*", "scheduler*"],
          routeRules: {
            "/fonts/**": {
              headers: { "access-control-allow-origin": "*" },
            },
            "/_next/static/**": {
              headers: { "access-control-allow-origin": "*" },
            },
          },
        })
      : undefined,
    sentryVitePlugin({
      release: { name: buildStamp },
      reactComponentAnnotation: { enabled: true },
      silent: true,
    }),
    {
      name: "hash-node-ssr",
      apply: "serve",
      enforce: "post",
      config: () => ({
        resolve: {
          alias: ["system", "utils", "icons-material"].map(
            (muiPackageName) => ({
              find: new RegExp(`^@mui/${muiPackageName}/(?!esm/)(.+)$`),
              replacement: fileURLToPath(
                new URL(
                  "./esm/$1",
                  import.meta.resolve(`@mui/${muiPackageName}/package.json`),
                ),
              ),
            }),
          ),
        },
      }),
      configEnvironment(environmentName, environment) {
        if (environmentName !== "ssr") {
          return;
        }
        Object.assign(environment, {
          resolve: {
            ...environment.resolve,
            external: true,
            noExternal: [
              ...(nextConfig.transpilePackages ?? []),
              /^@mui\//,
              /^@emotion\//,
              "lodash",
              "emoji-mart",
              "papaparse",
            ],
          },
          optimizeDeps: {
            ...environment.optimizeDeps,
            include: [
              "nextjs-progressbar",
              "lodash",
              "lodash/cloneDeep",
              "lodash/get",
              "lodash/set",
              "lodash/clamp",
              "lodash/debounce",
              "lodash/isString",
              "lodash/throttle",
              "emoji-mart",
              "papaparse",
            ],
            exclude: [
              ...(environment.optimizeDeps?.exclude ?? []),
              "react",
              "react-dom",
              "react/jsx-runtime",
              "react/jsx-dev-runtime",
            ],
          },
        });
      },
    },
  ],
});
