/** Which coding agent plays the persona, and where and how it starts. */
import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { personaSocketVariable } from "../persona-cli.ts";

const execute = promisify(execFile);
const personaCli = fileURLToPath(new URL("../persona-cli.ts", import.meta.url));

export const personaAgentPresets = [
  "claude",
  "codex",
  "cursor-agent",
  "pi",
] as const;
export type PersonaAgentPreset = (typeof personaAgentPresets)[number];

export type PersonaAgentSettings = {
  readonly agent?: PersonaAgentPreset;
  /** Shell command template; every `{prompt}` becomes the quoted launch prompt. */
  readonly agentCommand?: string;
  readonly personaModel?: string;
  readonly personaThinking?: string;
};

const isPersonaAgentPreset = (value: string): value is PersonaAgentPreset =>
  personaAgentPresets.some((preset) => preset === value);

export const resolvePersonaAgentSettings = (
  input: {
    agent?: string;
    agentCommand?: string;
    personaModel?: string;
    personaThinking?: string;
  } = {},
): PersonaAgentSettings => {
  const { agent, agentCommand, personaModel, personaThinking } = input;
  if (agent !== undefined && !isPersonaAgentPreset(agent))
    throw new Error(
      `Unsupported --agent ${agent}; expected ${personaAgentPresets.join("|")}, or use --agent-command`,
    );
  if (agent !== undefined && agentCommand !== undefined)
    throw new Error("Use either --agent or --agent-command, not both");
  if (agentCommand !== undefined && !agentCommand.includes("{prompt}"))
    throw new Error("--agent-command must contain {prompt}");
  if (personaModel !== undefined && agent === undefined)
    throw new Error("--persona-model requires --agent");
  if (personaThinking !== undefined && agent !== "pi")
    throw new Error("--persona-thinking is supported only with --agent pi");
  return {
    ...(agent === undefined ? {} : { agent }),
    ...(agentCommand === undefined ? {} : { agentCommand }),
    ...(personaModel === undefined ? {} : { personaModel }),
    ...(personaThinking === undefined ? {} : { personaThinking }),
  };
};

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

/** Resume reuses the original agent unless the operator names another. */
export const agentSettingsFromRun = (config: unknown): PersonaAgentSettings => {
  const retained =
    typeof config === "object" &&
    config !== null &&
    "personaAgent" in config &&
    typeof config.personaAgent === "object" &&
    config.personaAgent !== null
      ? (config.personaAgent as Record<string, unknown>)
      : {};
  return resolvePersonaAgentSettings({
    agent: optionalString(retained.agent),
    agentCommand: optionalString(retained.agentCommand),
    personaModel: optionalString(retained.personaModel),
    personaThinking: optionalString(retained.personaThinking),
  });
};

export const personaAgentLabel = (settings: PersonaAgentSettings) => {
  if (settings.agentCommand !== undefined) return "custom --agent-command";
  if (settings.agent === undefined) return "none; start one yourself";
  return [settings.agent, settings.personaModel, settings.personaThinking]
    .filter(Boolean)
    .join(" ");
};

export const shellQuote = (value: string) =>
  `'${value.replaceAll("'", "'\\''")}'`;

const presetArguments = (
  agent: PersonaAgentPreset,
  model: string | undefined,
  thinking: string | undefined,
): readonly string[] => {
  switch (agent) {
    case "claude":
      return ["claude", ...(model ? ["--model", model] : [])];
    case "codex":
      return ["codex", ...(model ? ["-m", model] : [])];
    case "cursor-agent":
      return ["cursor-agent", ...(model ? ["--model", model] : [])];
    case "pi":
      return [
        "pi",
        ...(model ? ["--model", model] : []),
        ...(thinking ? ["--thinking", thinking] : []),
      ];
    default: {
      const unhandled: never = agent;
      throw new Error(`Unhandled persona agent ${String(unhandled)}`);
    }
  }
};

/** Undefined when no agent was selected; the operator starts one instead. */
export const personaAgentShellCommand = (
  settings: PersonaAgentSettings,
  prompt: string,
): string | undefined => {
  if (settings.agentCommand !== undefined)
    return settings.agentCommand.replaceAll("{prompt}", shellQuote(prompt));
  if (settings.agent === undefined) return undefined;
  return [
    ...presetArguments(
      settings.agent,
      settings.personaModel,
      settings.personaThinking,
    ),
    prompt,
  ]
    .map(shellQuote)
    .join(" ");
};

export const personaLaunchPrompt = (briefPath: string) =>
  `Read the persona brief at ${briefPath} and follow it. It tells you who to play and how to talk to Brunch.`;

export const personaHelperScript = (socketPath: string) =>
  [
    "#!/bin/sh",
    [
      "exec",
      shellQuote(process.execPath),
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      shellQuote(personaCli),
      "--socket",
      shellQuote(socketPath),
      '"$@"',
    ].join(" "),
    "",
  ].join("\n");

/** `<run>/bin/persona`, bound to this launch's bridge socket. */
export const writePersonaHelper = async (run: string, socketPath: string) => {
  const directory = join(run, "bin");
  await mkdir(directory, { recursive: true });
  const path = join(directory, "persona");
  await writeFile(path, personaHelperScript(socketPath));
  await chmod(path, 0o700);
  return path;
};

export const personaAgentEnvironment = (
  run: string,
  socketPath: string,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => ({
  ...base,
  [personaSocketVariable]: socketPath,
  PATH: [join(run, "bin"), base.PATH].filter(Boolean).join(":"),
});

export const paneIdFrom = (stdout: string) => {
  const parsed: unknown = JSON.parse(stdout);
  if (
    parsed &&
    typeof parsed === "object" &&
    "result" in parsed &&
    parsed.result &&
    typeof parsed.result === "object" &&
    "pane" in parsed.result &&
    parsed.result.pane &&
    typeof parsed.result.pane === "object" &&
    "pane_id" in parsed.result.pane &&
    typeof parsed.result.pane.pane_id === "string"
  )
    return parsed.result.pane.pane_id;
  throw new Error("herdr pane split did not return a pane id");
};

export type PersonaAgentProcess =
  | { readonly kind: "herdr"; readonly pane: string }
  | { readonly kind: "foreground"; readonly exited: Promise<void> };

/**
 * In Herdr the agent gets a sibling pane that outlives it; otherwise it takes
 * over this terminal and the returned promise settles when it exits.
 */
export const startPersonaAgent = async (input: {
  readonly run: string;
  readonly socketPath: string;
  readonly command: string;
}): Promise<PersonaAgentProcess> => {
  if (process.env.HERDR_ENV === "1") {
    const split = await execute("herdr", [
      "pane",
      "split",
      "--current",
      "--direction",
      "right",
      "--cwd",
      input.run,
      "--no-focus",
    ]);
    const pane = paneIdFrom(split.stdout);
    await execute("herdr", [
      "pane",
      "run",
      pane,
      [
        `export ${personaSocketVariable}=${shellQuote(input.socketPath)}`,
        `export PATH=${shellQuote(join(input.run, "bin"))}:"$PATH"`,
        input.command,
      ].join(" && "),
    ]);
    return { kind: "herdr", pane };
  }
  if (!process.stdin.isTTY)
    throw new Error(
      "Without Herdr the persona agent needs this interactive terminal; run from a terminal, from Herdr, or omit --agent and start the agent yourself",
    );
  const child = spawn("sh", ["-c", input.command], {
    cwd: input.run,
    stdio: "inherit",
    env: personaAgentEnvironment(input.run, input.socketPath),
  });
  return {
    kind: "foreground",
    exited: new Promise((done, reject) => {
      child.once("error", reject);
      child.once("exit", () => done());
    }),
  };
};
