import { expect, test } from "vitest";

import { freePort, resolvePersonaPorts } from "./ports.ts";

const ports = (...values: number[]) => {
  const queue = [...values];
  return async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("No port left");
    return next;
  };
};

test("a fresh run takes free ports when none are set", async () => {
  await expect(
    resolvePersonaPorts({ environment: {}, choosePort: ports(51000, 51001) }),
  ).resolves.toEqual({ panel: 51000, chat: 51001 });
});

test("ports set in the environment win, even over a resume's origin", async () => {
  await expect(
    resolvePersonaPorts({
      environment: { BRUNCH_CHAT_PORT: "4332", BRUNCH_PANEL_PORT: "4926" },
      resumePanelOrigin: "http://127.0.0.1:51716",
      choosePort: ports(),
    }),
  ).resolves.toEqual({ chat: 4332, panel: 4926 });
});

test("a resume returns to its recorded panel port and takes a free chat port", async () => {
  await expect(
    resolvePersonaPorts({
      environment: {},
      resumePanelOrigin: "http://127.0.0.1:51716",
      choosePort: ports(52000),
    }),
  ).resolves.toEqual({ chat: 52000, panel: 51716 });
});

test("a free chat port is chosen again when it repeats the panel's", async () => {
  await expect(
    resolvePersonaPorts({
      environment: {},
      choosePort: ports(51000, 51000, 51002),
    }),
  ).resolves.toEqual({ panel: 51000, chat: 51002 });
});

test("one port set for both is refused", async () => {
  await expect(
    resolvePersonaPorts({
      environment: { BRUNCH_CHAT_PORT: "4926", BRUNCH_PANEL_PORT: "4926" },
    }),
  ).rejects.toThrow("must differ");
});

test("the OS hands out a port that can be bound", async () => {
  const port = await freePort();
  expect(port).toBeGreaterThan(0);
});
