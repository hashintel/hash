import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: "@storybook/react-vite",
  staticDirs: ["../public"],
  // Same dev proxy as the demo website, so the "With real optimizer" story
  // can reach a locally running Petrinaut Optimizer without CORS changes to
  // the service. Harmless when nothing serves the target.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    server: {
      ...viteConfig.server,
      proxy: {
        ...viteConfig.server?.proxy,
        "/api/petrinaut-opt": {
          target: process.env.PETRINAUT_OPT_ORIGIN ?? "http://127.0.0.1:4004",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/petrinaut-opt/u, ""),
        },
      },
    },
  }),
};

export default config;
