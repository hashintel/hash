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
  optimizeDeps: {
    include: ["@babel/standalone"],
  },
  root: "demo-site",
  server: {
    open: true,
  },
});
