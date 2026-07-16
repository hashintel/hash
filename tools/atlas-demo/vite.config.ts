import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const defaultAtlasOrigin = "http://127.0.0.1:4010";

const atlasProxy = (target: string): Record<string, string | ProxyOptions> => ({
  "/v1/atlas": {
    changeOrigin: true,
    target,
  },
});

/** Vite development and preview configuration for the standalone Atlas demo. */
export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, appRoot, "");
  const atlasOrigin = environment.ATLAS_API_ORIGIN || defaultAtlasOrigin;

  return {
    build: {
      cssMinify: "esbuild",
    },
    plugins: [react()],
    preview: {
      proxy: atlasProxy(atlasOrigin),
    },
    server: {
      proxy: atlasProxy(atlasOrigin),
    },
  };
});
