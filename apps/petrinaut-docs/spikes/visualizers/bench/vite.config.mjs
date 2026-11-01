import fs from "node:fs";
import path from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
const root = path.resolve(import.meta.dirname);
const pages = Object.fromEntries(
  fs
    .readdirSync(path.join(root, "pages"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => [f.replace(".html", ""), path.join(root, "pages", f)]),
);
export default defineConfig({
  root,
  base: "./",
  logLevel: "warn",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    target: "es2022",
    rollupOptions: { input: pages },
  },
  worker: { format: "es" },
  plugins: [solid({ include: /src\/solid\/.*\.tsx$/ }), svelte()],
});
