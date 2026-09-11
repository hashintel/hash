import { Hono } from "hono";
import { expect, test, vi } from "vitest";

import { healthHandler } from "../src/health.ts";

test("health reports liveness without consulting dependencies", async () => {
  const dependency = vi.fn<() => void>();
  const app = new Hono();
  app.get("/health", (context) => {
    const response = healthHandler(context);
    expect(dependency).not.toHaveBeenCalled();
    return response;
  });

  const response = await app.request("/health");

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toContain(
    "application/health+json",
  );
  await expect(response.json()).resolves.toEqual({ status: "pass" });
  expect(dependency).not.toHaveBeenCalled();
});
