import { fileURLToPath } from "node:url";

import vinext from "vinext";
import { defineConfig, type Plugin as VitePlugin } from "vite";
import svgr from "vite-plugin-svgr";

const hashWorkspaceAliases = (): VitePlugin<unknown> => ({
  name: "hash-workspace-aliases",
  enforce: "post",
  config: () => ({
    resolve: {
      alias: [
        {
          find: /^@blockprotocol\/graph\/(.+)$/,
          replacement: fileURLToPath(
            new URL(
              "../../libs/@blockprotocol/graph/src/$1.ts",
              import.meta.url,
            ),
          ),
        },
        {
          find: /^@hashintel\/ds-helpers\/(.+)$/,
          replacement: fileURLToPath(
            new URL(
              "../../libs/@hashintel/ds-helpers/styled-system/$1/index.mjs",
              import.meta.url,
            ),
          ),
        },
      ],
    },
  }),
});

export default defineConfig({
  server: {
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
  },
  define: {
    __SENTRY_DEBUG__: false,
  },
  plugins: [
    svgr({
      include: "**/*.svg",
    }),
    vinext({ disableAppRouter: true }),
    hashWorkspaceAliases(),
  ],
});
