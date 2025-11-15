import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "./src/petrinaut-sdcpn/",
  build: {
    outDir: "../../dist/petrinaut-sdcpn",
  },
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
});
