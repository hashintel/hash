import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";
import svgr from "vite-plugin-svgr";
import vinext from "vinext";

const hashWorkspaceAliases = (): Plugin => ({
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
