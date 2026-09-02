/**
 * Runs against the server `start:test` brought up beforehand; nothing here
 * boots the app.
 */

import { expect, test } from "vitest";

const origin = "http://localhost:3002";

test("started server reports liveness on /health", async () => {
  const response = await fetch(`${origin}/health`);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/health+json");
  await expect(response.json()).resolves.toEqual({ status: "pass" });
});
