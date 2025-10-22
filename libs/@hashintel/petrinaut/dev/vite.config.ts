import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: "dev",
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "../dist",
    target: "es2022",
  },
  esbuild: {
    target: "es2022",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
  define: {
    "process.env.NODE_ENV": '"development"',
  },
});
