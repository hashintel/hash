import { afterEach, expect, test, vi } from "vitest";

import entry from "../.pi/extensions/brunch-persona-testing";

import type { BrunchTurnTool } from "../src/evaluations/persona/brunch-turn";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

const fixture = () => {
  vi.stubEnv("PI_SUBAGENT_NAME", "TEST-default");
  const flags = new Map<string, string>();
  const tools: BrunchTurnTool[] = [];
  const handlers = new Map<string, () => void | Promise<void>>();
  entry({
    registerFlag: () => {},
    getFlag: (name) => flags.get(name),
    registerTool: (tool) => {
      tools.push(tool);
    },
    on: (event, handler) => {
      handlers.set(event, handler);
    },
  });
  const emit = async (event: string) => handlers.get(event)?.();
  return { flags, tools, emit };
};

test("registers only after flag hydration; invalidates prior browser tools on repeated start and shutdown", async () => {
  const { flags, tools, emit } = fixture();
  expect(tools).toEqual([]);
  flags.set("brunch-browser-bridge", "/tmp/TEST-bridge");
  await emit("session_start");
  const first = tools[0]!;
  await emit("session_start");
  expect(tools).toHaveLength(2);
  await expect(
    first.execute("TEST", { message: "never send" }),
  ).rejects.toThrow("session is not initialized");
  await emit("session_shutdown");
  await emit("session_shutdown");
  await expect(
    tools[1]!.execute("TEST", { message: "never send" }),
  ).rejects.toThrow("session is not initialized");
});

test("missing browser bridge cannot register a fallback SDK tool", async () => {
  const { tools, emit } = fixture();
  await expect(emit("session_start")).rejects.toThrow(
    "Run yarn brunch:persona",
  );
  expect(tools).toEqual([]);
});

test("invalid browser bridge cannot leave a previously registered tool usable", async () => {
  const { flags, tools, emit } = fixture();
  flags.set("brunch-browser-bridge", "/tmp/TEST-bridge");
  await emit("session_start");
  flags.set("brunch-browser-bridge", " ");
  await expect(emit("session_start")).rejects.toThrow(
    "Run yarn brunch:persona",
  );
  expect(tools).toHaveLength(1);
  await expect(
    tools[0]!.execute("TEST", { message: "never send" }),
  ).rejects.toThrow("session is not initialized");
});
