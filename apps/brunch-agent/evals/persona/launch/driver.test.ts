import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { openPersonaBrowserBridge } from "../browser-bridge.ts";
import {
  driverFromRun,
  paneIdFrom,
  personaAgentShellCommand,
  personaDriverEnvironment,
  personaDriverLabel,
  resolvePersonaDriver,
  startPersonaScriptDriver,
} from "./driver.ts";
import { readPersonaScript } from "./script.ts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

const prompt =
  "Read the persona brief at /tmp/run/persona-brief.md and it's yours.";

const sampleScript = {
  scriptPath: "/tmp/demo/smoke.json",
  scriptSha256: "abcdef0123456789deadbeef",
  script: { steps: [{ type: "say" as const, message: "Hello." }] },
};

test.each([
  [{ agent: "claude" }, "'claude' "],
  [{ agent: "codex", personaModel: "gpt-5.5" }, "'codex' '-m' 'gpt-5.5' "],
  [
    { agent: "cursor-agent", personaModel: "sonnet-4.6" },
    "'cursor-agent' '--model' 'sonnet-4.6' ",
  ],
  [
    {
      agent: "pi",
      personaModel: "anthropic/claude-sonnet-4-6",
      personaThinking: "low",
    },
    "'pi' '--model' 'anthropic/claude-sonnet-4-6' '--thinking' 'low' ",
  ],
])(
  "preset %o passes the launch prompt as one quoted argument",
  (input, head) => {
    expect(personaAgentShellCommand(resolvePersonaDriver(input), prompt)).toBe(
      `${head}'Read the persona brief at /tmp/run/persona-brief.md and it'\\''s yours.'`,
    );
  },
);

test("a custom command template receives the quoted prompt at every placeholder", () => {
  expect(
    personaAgentShellCommand(
      resolvePersonaDriver({
        agentCommand: "opencode run --agent persona {prompt}",
      }),
      "Go.",
    ),
  ).toBe("opencode run --agent persona 'Go.'");
});

test("external and scripted drivers have no interactive shell command", () => {
  expect(resolvePersonaDriver()).toEqual({ kind: "external" });
  expect(personaAgentShellCommand(resolvePersonaDriver(), prompt)).toBe(
    undefined,
  );
  const scripted = resolvePersonaDriver({ script: sampleScript });
  expect(scripted).toEqual({
    kind: "scripted",
    scriptPath: sampleScript.scriptPath,
    scriptSha256: sampleScript.scriptSha256,
  });
  expect(personaAgentShellCommand(scripted, prompt)).toBe(undefined);
});

test.each([
  [{ agent: "gemini" }, /Unsupported --agent gemini/],
  [
    { agent: "claude", agentCommand: "x {prompt}" },
    /at most one of --agent, --agent-command, or --script/,
  ],
  [
    { agent: "claude", script: sampleScript },
    /at most one of --agent, --agent-command, or --script/,
  ],
  [
    { agentCommand: "x {prompt}", script: sampleScript },
    /at most one of --agent, --agent-command, or --script/,
  ],
  [{ agentCommand: "opencode run" }, /must contain \{prompt\}/],
  [{ personaModel: "sonnet" }, /--persona-model requires --agent/],
  [
    { script: sampleScript, personaModel: "sonnet" },
    /--persona-model requires --agent/,
  ],
  [
    { agent: "claude", personaThinking: "low" },
    /--persona-thinking is supported only with --agent pi/,
  ],
])("rejects inconsistent driver options %o", (input, message) => {
  expect(() => resolvePersonaDriver(input)).toThrow(message);
});

test("driverFromRun reads tagged personaDriver and falls back to legacy personaAgent", () => {
  expect(
    driverFromRun({
      personaDriver: {
        kind: "scripted",
        scriptPath: "/tmp/a.json",
        scriptSha256: "abc123",
      },
    }),
  ).toEqual({
    kind: "scripted",
    scriptPath: "/tmp/a.json",
    scriptSha256: "abc123",
  });
  expect(
    driverFromRun({
      personaAgent: {
        agent: "pi",
        personaModel: "anthropic/claude-sonnet-4-6",
        personaThinking: "low",
      },
    }),
  ).toEqual({
    kind: "agent",
    agent: "pi",
    personaModel: "anthropic/claude-sonnet-4-6",
    personaThinking: "low",
  });
  expect(
    driverFromRun({ personaAgent: { agentCommand: "my-agent {prompt}" } }),
  ).toEqual({
    kind: "command",
    agentCommand: "my-agent {prompt}",
  });
  expect(driverFromRun({ personaAgent: {} })).toEqual({ kind: "external" });
  expect(driverFromRun({})).toEqual({ kind: "external" });
});

test("personaDriverLabel formats every driver kind", () => {
  expect(
    personaDriverLabel({
      kind: "agent",
      agent: "claude",
      personaModel: "sonnet",
    }),
  ).toBe("claude sonnet");
  expect(
    personaDriverLabel({ kind: "command", agentCommand: "run {prompt}" }),
  ).toBe("custom --agent-command");
  expect(
    personaDriverLabel({
      kind: "scripted",
      scriptPath: "/tmp/demo/smoke.json",
      scriptSha256: "abcdef0123456789deadbeef",
    }),
  ).toBe("scripted (smoke.json, abcdef012345)");
  expect(personaDriverLabel({ kind: "external" })).toBe(
    "external (start one yourself)",
  );
});

test("the driver inherits the operator environment plus the bridge and helper", () => {
  const environment = personaDriverEnvironment("/tmp/run", "/tmp/bp-1/s", {
    PATH: "/usr/bin",
    HOME: "/Users/TEST",
  });
  expect(environment).toEqual({
    PATH: "/tmp/run/bin:/usr/bin",
    HOME: "/Users/TEST",
    BRUNCH_PERSONA_SOCKET: "/tmp/bp-1/s",
  });
});

test("reads the pane id from herdr's split result", () => {
  expect(
    paneIdFrom(
      '{"id":"cli:pane:split","result":{"pane":{"pane_id":"w0:p23"}},"type":"pane_split"}',
    ),
  ).toBe("w0:p23");
});

test("startPersonaScriptDriver runs non-interactively and streams step events", async () => {
  const run = await mkdtemp(join(tmpdir(), "TEST-persona-script-driver-"));
  cleanup.push(() => rm(run, { recursive: true }));
  const scriptPath = join(run, "steps.json");
  await writeFile(
    scriptPath,
    JSON.stringify({
      steps: [
        { type: "say", message: "Hi." },
        { type: "end", reason: "Done" },
      ],
    }),
  );
  await readPersonaScript(scriptPath);
  const bridge = await openPersonaBrowserBridge({
    opening: undefined,
    prompt: async (_message, turn) => {
      turn.admitted();
      return { text: "Reply.", submissionIds: ["sub_1"] };
    },
    getState: () => ({}),
    getTranscript: async () => [],
    end: () => undefined,
  });
  cleanup.push(() => bridge.close());

  const types: string[] = [];
  const child = startPersonaScriptDriver({
    run,
    socketPath: bridge.socketPath,
    scriptPath,
    onEvent: (event) => types.push(`${event.type}:${event.stepIndex}`),
  });
  await expect(child.exited).resolves.toEqual({ ok: true });
  expect(types).toEqual([
    "step_start:0",
    "step_ok:0",
    "step_start:1",
    "step_ok:1",
  ]);
}, 15_000);
