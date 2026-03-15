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

    plugins: [
      react(),
      babel({
        presets: [
          reactCompilerPreset({
            target: "19",
            compilationMode: "infer",
            // @ts-expect-error - panicThreshold is accepted at runtime
            panicThreshold: "critical_errors",
          }),
        ],
      }),
    ],
  };
});
