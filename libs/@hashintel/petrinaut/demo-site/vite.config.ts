import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
  ],
  define: {
    // Provide minimal process shim for TypeScript language service in browser
    "process.versions": JSON.stringify({ pnp: undefined }),
  },
  optimizeDeps: {
    include: ["@babel/standalone"],
  },
  root: "demo-site",
  server: {
    open: true,
  },
});
