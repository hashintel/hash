import { Server } from "node:http";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { openBrowserFixture } from "./browser-fixture";

const controls = vi.hoisted(() => ({
  launch: vi.fn<() => Promise<{ close: () => Promise<void> }>>(),
  close: vi.fn<() => Promise<void>>(),
}));
vi.mock("@playwright/test", () => ({ chromium: { launch: controls.launch } }));

const application = {
  fetch: () => {
    throw new Error("Unexpected application request");
  },
  stop: async () => {},
};
let listeningServers: () => Server[] = () => [];
beforeEach(() => {
  const listen = vi.spyOn(Server.prototype, "listen");
  listeningServers = () =>
    listen.mock.contexts.filter(
      (context): context is Server => context instanceof Server,
    );
  controls.launch.mockReset().mockResolvedValue({ close: controls.close });
  controls.close.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  const servers = listeningServers();
  vi.restoreAllMocks();
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

test("closes its listener when Chrome fails to launch", async () => {
  controls.launch.mockRejectedValue(new Error("Synthetic launch failure"));
  await expect(openBrowserFixture(application)).rejects.toThrow(
    "Synthetic launch failure",
  );
  expect(listeningServers()).toHaveLength(1);
  expect(listeningServers()[0]?.listening).toBe(false);
});

test("closes its listener even when browser cleanup rejects", async () => {
  controls.close.mockRejectedValue(
    new Error("Synthetic browser close failure"),
  );
  const fixture = await openBrowserFixture(application);
  await expect(fixture.close()).rejects.toThrow(
    "Synthetic browser close failure",
  );
  expect(controls.close).toHaveBeenCalledOnce();
  expect(listeningServers()).toHaveLength(1);
  expect(listeningServers()[0]?.listening).toBe(false);
});
