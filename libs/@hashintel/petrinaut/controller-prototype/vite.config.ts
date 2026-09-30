import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import packageConfig from "../vite.config.ts";

/**
 * Serves the controller prototype as a plain page, with the package's own
 * plugins (React Compiler) and Panda setup, and no Storybook.
 */
export default defineConfig((env) => {
  const base = packageConfig(env);
  return {
    ...base,
    root: fileURLToPath(new URL(".", import.meta.url)),
    publicDir: fileURLToPath(new URL("../public", import.meta.url)),
    build: undefined,
    server: { port: Number(process.env.PORT ?? 6010), strictPort: true },
  };
});
