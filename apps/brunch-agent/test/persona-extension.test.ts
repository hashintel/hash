import { afterEach, expect, test, vi } from "vitest";

import entry from "../.pi/extensions/brunch-persona-testing";

import type { BrunchTurnTool } from "../src/evaluations/persona/brunch-turn";
import type { PersonaAccountingContext } from "../src/evaluations/persona/request-accounting";

const { disposeHost } = vi.hoisted(() => ({
  disposeHost: vi.fn<() => Promise<void>>(),
}));
vi.mock("../src/evaluations/persona/request-accounting.ts", () => ({
  registerPersonaAccounting: () => {},
}));
vi.mock(
  "../src/evaluations/persona/client-tool-hosts.ts",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../src/evaluations/persona/client-tool-hosts")
    >()),
    createRealHeadlessClientToolHost: () => ({
      kind: "real-headless",
      dispose: disposeHost,
      execute: async () => {
        throw new Error("Unexpected synthetic host execution");
      },
    }),
  }),
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

const fixture = async () => {
  vi.stubEnv("PI_SUBAGENT_NAME", "TEST-default");
  const flags = new Map<string, string>();
  const tools: BrunchTurnTool[] = [];
  const handlers = new Map<
    string,
    (event: unknown, context: PersonaAccountingContext) => void | Promise<void>
  >();
  await entry({
    registerProvider: () => {},
    registerFlag: () => {},
    getFlag: (name) => flags.get(name),
    registerTool: (tool) => {
      tools.push(tool);
    },
    on: (event, handler) => {
      handlers.set(event, handler);
    },
  });
  const emit = async (event: string) =>
    handlers.get(event)?.(
      {},
      {
        model: undefined,
        sessionManager: { getSessionId: () => "TEST" },
        modelRegistry: { getProviderAuth: async () => undefined },
      },
    );
  return { flags, tools, emit };
};

test("registers only after startup; replaces and invalidates default tools on repeated start and shutdown", async () => {
  const { flags, tools, emit } = await fixture();
  expect(tools).toEqual([]);
  flags.set("brunch-tool-host", "real-headless");
  await emit("session_start");
  const first = tools[0]!;
  expect(disposeHost).not.toHaveBeenCalled();
  await emit("session_start");
  expect(tools).toHaveLength(2);
  expect(disposeHost).toHaveBeenCalledTimes(1);
  await expect(
    first.execute("TEST", { message: "never send" }),
  ).rejects.toThrow("session is not initialized");
  await emit("session_shutdown");
  await emit("session_shutdown");
  expect(disposeHost).toHaveBeenCalledTimes(2);
  await expect(
    tools[1]!.execute("TEST", { message: "never send" }),
  ).rejects.toThrow("session is not initialized");
});

test("invalid requested attachment cannot leave a formerly default tool usable", async () => {
  const { flags, tools, emit } = await fixture();
  await emit("session_start");
  flags.set("brunch-browser-session", " ");
  await expect(emit("session_start")).rejects.toThrow("non-empty path");
  expect(tools).toHaveLength(1);
  await expect(
    tools[0]!.execute("TEST", { message: "never send" }),
  ).rejects.toThrow("session is not initialized");
});

test("disposal failure invalidates tool before throwing and never retries a disposed host", async () => {
  const { flags, tools, emit } = await fixture();
  flags.set("brunch-tool-host", "real-headless");
  await emit("session_start");
  disposeHost.mockRejectedValueOnce(new Error("TEST disposal failure"));
  await expect(emit("session_start")).rejects.toThrow("TEST disposal failure");
  await expect(
    tools[0]!.execute("TEST", { message: "never send" }),
  ).rejects.toThrow("session is not initialized");
  await emit("session_shutdown");
  expect(disposeHost).toHaveBeenCalledTimes(1);
});
