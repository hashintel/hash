import { Server } from "node:http";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { openBrowserFixture } from "./browser-fixture";

const controls = vi.hoisted(() => ({
  launch: vi.fn<
    () => Promise<{
      newPage: () => Promise<never>;
      close: () => Promise<void>;
    }>
  >(),
  newPage: vi.fn<() => Promise<never>>(),
  close: vi.fn<() => Promise<void>>(),
  stop: vi.fn<() => Promise<void>>(),
}));
vi.mock("@playwright/test", () => ({ chromium: { launch: controls.launch } }));
vi.mock("../src/evaluations/runbook/load-built-application.ts", () => ({
  loadBuiltBrunchApplication: async () => ({
    fetch: () => {
      throw new Error("Unexpected application request");
    },
    stop: controls.stop,
  }),
}));
vi.mock("../src/evaluations/install-faux-provider.ts", () => ({
  installFauxProvider: () => {},
}));

const originalFetch = globalThis.fetch;
let listeningServers: () => Server[] = () => [];
beforeEach(() => {
  const listen = vi.spyOn(Server.prototype, "listen");
  listeningServers = () =>
    listen.mock.contexts.filter(
      (context): context is Server => context instanceof Server,
    );
  controls.launch.mockReset().mockResolvedValue({
    newPage: controls.newPage,
    close: controls.close,
  });
  controls.newPage
    .mockReset()
    .mockRejectedValue(new Error("Synthetic page setup failure"));
  controls.close.mockReset().mockResolvedValue(undefined);
  controls.stop.mockReset().mockResolvedValue(undefined);
  // The actual caller writes these non-secret configuration keys on startup.
  for (const name of [
    "NODE_ENV",
    "BRUNCH_CHAT_MODEL",
    "BRUNCH_DEV_DB_PATH",
    "HASH_OTLP_ENDPOINT",
  ])
    vi.stubEnv(name, undefined);
});
afterEach(async () => {
  const servers = listeningServers();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  // Rescue only listeners acquired by this test if an assertion fails.
  await Promise.all(
    servers
      .filter((server) => server.listening)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

test("helper closes its actual listener even when browser cleanup rejects", async () => {
  const serverClose = vi.spyOn(Server.prototype, "close");
  controls.close.mockRejectedValue(
    new Error("Synthetic browser close failure"),
  );
  await expect(
    openBrowserFixture(
      {
        fetch: () => {
          throw new Error("Unexpected application request");
        },
        stop: controls.stop,
      },
      "/tmp",
    ),
  ).rejects.toMatchObject({
    message: "Browser fixture setup failed; cleanup incomplete",
    errors: [
      expect.objectContaining({ message: "Synthetic page setup failure" }),
      expect.objectContaining({ message: "Synthetic browser close failure" }),
    ],
  });
  expect(controls.close).toHaveBeenCalledOnce();
  expect(serverClose).toHaveBeenCalledOnce();
  expect(listeningServers()).toHaveLength(1);
  expect(listeningServers()[0]?.listening).toBe(false);
});

test.each([false, true])(
  "actual persona driver restores fetch and stops its acquired app on setup failure (close rejects: %s)",
  async (closeRejects) => {
    vi.resetModules();
    const serverClose = vi.spyOn(Server.prototype, "close");
    const originalFetch = globalThis.fetch;
    if (closeRejects)
      controls.close.mockRejectedValue(
        new Error("Synthetic browser close failure"),
      );
    await expect(import("./persona-browser.integration.ts")).rejects.toThrow(
      closeRejects ? /cleanup incomplete/u : /Synthetic page setup failure/u,
    );
    expect(controls.stop).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toBe(originalFetch);
    expect(serverClose).toHaveBeenCalledOnce();
    expect(listeningServers()).toHaveLength(1);
    expect(listeningServers()[0]?.listening).toBe(false);
  },
);
