import type { Context } from "hono";

export const healthHandler = (context: Context): Response =>
  context.json({ status: "pass" }, 200, {
    "cache-control": "no-store",
    "content-type": "application/health+json",
  });
