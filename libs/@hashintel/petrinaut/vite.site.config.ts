import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Demo site dev server and production build config. */
export default defineConfig(() => {
  const environment = process.env.VITE_VERCEL_ENV ?? "development";
  const sentryDsn: string | undefined = process.env.SENTRY_DSN;

  return {
    root: "demo-site",

    define: {
      __ENVIRONMENT__: JSON.stringify(environment),
      __SENTRY_DSN__: JSON.stringify(sentryDsn),

      // This part could be in the library config
      "process.versions": JSON.stringify({ pnp: undefined }),
    },

    plugins: [
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
    ],
  };
});
