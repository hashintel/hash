import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Petrinaut website dev server and production build config. */
export default defineConfig(() => {
  const environment = process.env.VITE_VERCEL_ENV ?? "development";
  const sentryDsn: string | undefined = process.env.SENTRY_DSN;

  return {
    define: {
      __ENVIRONMENT__: JSON.stringify(environment),
      __SENTRY_DSN__: JSON.stringify(sentryDsn),
    },
    build: {
      // Vite 8 defaults to LightningCSS which is still unstable.
      // e.g. https://github.com/parcel-bundler/lightningcss/issues/695
      cssMinify: "esbuild" as const,
    },

    plugins: [
      react(),
      babel({
        presets: [
          reactCompilerPreset({
            target: "19",
            compilationMode: "infer",
            // @hashintel/ds-components ships prebuilt jsx() calls; the compiler
            // can't recognize ref forwarding in that form and bails with
            // "Cannot access refs during render". Opt that package out.
            sources: (filename: string) =>
              !filename.includes("@hashintel/ds-components"),
            // @ts-expect-error - panicThreshold is accepted at runtime
            panicThreshold: "critical_errors",
          }),
        ],
      }),
    ],
  };
});
