import type { Config } from "@tanstack/router-generator";

/** Shared by Vite and the standalone CI route-tree generator. */
export const routerCodegenConfig = {
  autoCodeSplitting: true,
  quoteStyle: "double",
  semicolons: true,
  target: "react",
} satisfies Partial<Config>;
