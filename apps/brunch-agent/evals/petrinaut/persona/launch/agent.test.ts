import { expect, test } from "vitest";

import {
  paneIdFrom,
  personaAgentEnvironment,
  personaAgentShellCommand,
  resolvePersonaAgentSettings,
} from "./agent.ts";

const prompt =
  "Read the persona brief at /tmp/run/persona-brief.md and it's yours.";

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
    expect(
      personaAgentShellCommand(resolvePersonaAgentSettings(input), prompt),
    ).toBe(
      `${head}'Read the persona brief at /tmp/run/persona-brief.md and it'\\''s yours.'`,
    );
  },
);

test("a custom command template receives the quoted prompt at every placeholder", () => {
  expect(
    personaAgentShellCommand(
      resolvePersonaAgentSettings({
        agentCommand: "opencode run --agent persona {prompt}",
      }),
      "Go.",
    ),
  ).toBe("opencode run --agent persona 'Go.'");
});

test("no agent option means the operator starts the agent", () => {
  expect(personaAgentShellCommand(resolvePersonaAgentSettings(), prompt)).toBe(
    undefined,
  );
});

test.each([
  [{ agent: "gemini" }, /Unsupported --agent gemini/],
  [
    { agent: "claude", agentCommand: "x {prompt}" },
    /either --agent or --agent-command/,
  ],
  [{ agentCommand: "opencode run" }, /must contain \{prompt\}/],
  [{ personaModel: "sonnet" }, /--persona-model requires --agent/],
  [
    { agent: "claude", personaThinking: "low" },
    /--persona-thinking is supported only with --agent pi/,
  ],
])("rejects inconsistent agent options %o", (input, message) => {
  expect(() => resolvePersonaAgentSettings(input)).toThrow(message);
});

test("the agent inherits the operator environment plus the bridge and helper", () => {
  const environment = personaAgentEnvironment("/tmp/run", "/tmp/bp-1/s", {
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
