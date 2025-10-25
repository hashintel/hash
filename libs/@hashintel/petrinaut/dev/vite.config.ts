import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  mode: "development",
  plugins: [react()],
  root: "dev",
  server: {
    open: true,
  },
  define: {
    "process.env.NODE_ENV": '"development"',
  },
});
