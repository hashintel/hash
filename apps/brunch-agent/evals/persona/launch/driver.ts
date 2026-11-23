/** Which driver plays the persona (coding agent, shell command, script, or external), and how it starts. */
import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import * as v from "valibot";

import { personaSocketVariable } from "../persona-cli.ts";
import {
  personaScriptEventSchema,
  type PersonaScriptEvent,
} from "./script-runner.ts";

import type { LoadedPersonaScript, PersonaScriptStep } from "./script.ts";

const execute = promisify(execFile);
const personaCli = fileURLToPath(new URL("../persona-cli.ts", import.meta.url));
const scriptRunner = fileURLToPath(
  new URL("./script-runner.ts", import.meta.url),
);

export const personaAgentPresets = [
  "claude",
  "codex",
  "cursor-agent",
  "pi",
] as const;
export type PersonaAgentPreset = (typeof personaAgentPresets)[number];

const nonblank = v.pipe(
  v.string(),
  v.check((value) => value.trim().length > 0, "Expected nonblank text"),
);

export const personaDriverSchema = v.variant("kind", [
  v.object({
    kind: v.literal("agent"),
    agent: v.picklist(personaAgentPresets),
    personaModel: v.optional(nonblank),
    personaThinking: v.optional(nonblank),
  }),
  v.object({
    kind: v.literal("command"),
    /** Shell command template; every `{prompt}` becomes the quoted launch prompt. */
    agentCommand: nonblank,
  }),
  v.object({
    kind: v.literal("scripted"),
    scriptPath: nonblank,
    scriptSha256: nonblank,
  }),
  v.object({
    kind: v.literal("external"),
  }),
]);
export type PersonaDriver = v.InferOutput<typeof personaDriverSchema>;

const isPersonaAgentPreset = (value: string): value is PersonaAgentPreset =>
  personaAgentPresets.some((preset) => preset === value);

export const resolvePersonaDriver = (
  input: {
    agent?: string;
    agentCommand?: string;
    script?: LoadedPersonaScript;
    personaModel?: string;
    personaThinking?: string;
  } = {},
): PersonaDriver => {
  const { agent, agentCommand, script, personaModel, personaThinking } = input;
  const selectedModes = [agent, agentCommand, script].filter(
    (value) => value !== undefined,
  ).length;
  if (selectedModes > 1)
    throw new Error("Use at most one of --agent, --agent-command, or --script");
  if (agent !== undefined && !isPersonaAgentPreset(agent))
    throw new Error(
      `Unsupported --agent ${agent}; expected ${personaAgentPresets.join(
        "|",
      )}, or use --agent-command`,
    );
  if (agentCommand !== undefined && !agentCommand.includes("{prompt}"))
    throw new Error("--agent-command must contain {prompt}");
  if (personaModel !== undefined && agent === undefined)
    throw new Error("--persona-model requires --agent");
  if (personaThinking !== undefined && agent !== "pi")
    throw new Error("--persona-thinking is supported only with --agent pi");
  if (script !== undefined) {
    return {
      kind: "scripted",
      scriptPath: script.scriptPath,
      scriptSha256: script.scriptSha256,
    };
  }
  if (agentCommand !== undefined) {
    return { kind: "command", agentCommand };
  }
  if (agent !== undefined) {
    return {
      kind: "agent",
      agent,
      ...(personaModel === undefined ? {} : { personaModel }),
      ...(personaThinking === undefined ? {} : { personaThinking }),
    };
  }
  return { kind: "external" };
};

const optionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

/**
 * Resume reuses the original driver unless the operator names another. Reads
 * `personaDriver` first and falls back to legacy `personaAgent` from older runs.
 */
export const driverFromRun = (config: unknown): PersonaDriver => {
  if (
    typeof config === "object" &&
    config !== null &&
    "personaDriver" in config &&
    config.personaDriver !== undefined
  ) {
    const parsed = v.parse(personaDriverSchema, config.personaDriver);
    if (parsed.kind === "agent") {
      return resolvePersonaDriver({
        agent: parsed.agent,
        personaModel: parsed.personaModel,
        personaThinking: parsed.personaThinking,
      });
    }
    if (parsed.kind === "command") {
      return resolvePersonaDriver({ agentCommand: parsed.agentCommand });
    }
    return parsed;
  }
  const retained =
    typeof config === "object" &&
    config !== null &&
    "personaAgent" in config &&
    typeof config.personaAgent === "object" &&
    config.personaAgent !== null
      ? (config.personaAgent as Record<string, unknown>)
      : {};
  return resolvePersonaDriver({
    agent: optionalString(retained.agent),
    agentCommand: optionalString(retained.agentCommand),
    personaModel: optionalString(retained.personaModel),
    personaThinking: optionalString(retained.personaThinking),
  });
};

export const personaDriverLabel = (driver: PersonaDriver): string => {
  switch (driver.kind) {
    case "agent":
      return [driver.agent, driver.personaModel, driver.personaThinking]
        .filter(Boolean)
        .join(" ");
    case "command":
      return "custom --agent-command";
    case "scripted":
      return `scripted (${basename(driver.scriptPath)}, ${driver.scriptSha256.slice(0, 12)})`;
    case "external":
      return "external (start one yourself)";
    default: {
      const unhandled: never = driver;
      throw new Error(`Unhandled persona driver ${JSON.stringify(unhandled)}`);
    }
  }
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

/**
 * Shell command for an interactive coding-agent driver (`agent` or `command`).
 * Undefined for `external` (operator starts one) and `scripted` (run directly).
 */
export const personaAgentShellCommand = (
  driver: PersonaDriver,
  prompt: string,
): string | undefined => {
  switch (driver.kind) {
    case "command":
      return driver.agentCommand.replaceAll("{prompt}", shellQuote(prompt));
    case "agent":
      return [
        ...presetArguments(
          driver.agent,
          driver.personaModel,
          driver.personaThinking,
        ),
        prompt,
      ]
        .map(shellQuote)
        .join(" ");
    case "scripted":
    case "external":
      return undefined;
    default: {
      const unhandled: never = driver;
      throw new Error(`Unhandled persona driver ${JSON.stringify(unhandled)}`);
    }
  }
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

export const personaDriverEnvironment = (
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

export type PersonaScriptExit =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly failure?: {
        readonly stepIndex: number;
        readonly step: PersonaScriptStep;
        readonly error: string;
      };
      readonly error: string;
    };

export type PersonaDriverProcess =
  | { readonly kind: "herdr"; readonly pane: string }
  | { readonly kind: "foreground"; readonly exited: Promise<void> }
  | {
      readonly kind: "scripted";
      readonly exited: Promise<PersonaScriptExit>;
      readonly stop: () => Promise<void>;
    };

export const startPersonaScriptDriver = (input: {
  readonly run: string;
  readonly socketPath: string;
  readonly scriptPath: string;
  readonly onEvent?: (event: PersonaScriptEvent) => void;
}): Extract<PersonaDriverProcess, { kind: "scripted" }> => {
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      scriptRunner,
      "--script",
      input.scriptPath,
      "--socket",
      input.socketPath,
    ],
    {
      cwd: input.run,
      stdio: ["ignore", "pipe", "pipe"],
      env: personaDriverEnvironment(input.run, input.socketPath),
    },
  );
  let lastFailure:
    | {
        readonly stepIndex: number;
        readonly step: PersonaScriptStep;
        readonly error: string;
      }
    | undefined;
  const stderrChunks: string[] = [];
  const stdoutDone = (async () => {
    const lines = createInterface({ input: child.stdout });
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = v.parse(personaScriptEventSchema, JSON.parse(line));
        if (event.type === "step_failed") {
          lastFailure = {
            stepIndex: event.stepIndex,
            step: event.step,
            error: event.error,
          };
        }
        input.onEvent?.(event);
      } catch {
        // Ignore non-JSONL output; non-zero exit still reports failure.
      }
    }
  })();
  const stderrDone = (async () => {
    child.stderr.setEncoding("utf8");
    for await (const chunk of child.stderr) {
      stderrChunks.push(String(chunk));
    }
  })();
  const closeResult = new Promise<
    | { readonly kind: "error"; readonly error: Error }
    | {
        readonly kind: "close";
        readonly code: number | null;
        readonly signal: NodeJS.Signals | null;
      }
  >((done) => {
    child.once("error", (error) => done({ kind: "error", error }));
    child.once("close", (code, signal) =>
      done({ kind: "close", code, signal }),
    );
  });
  const exited: Promise<PersonaScriptExit> = (async () => {
    const [closed] = await Promise.all([closeResult, stdoutDone, stderrDone]);
    if (closed.kind === "error") {
      return { ok: false, error: closed.error.message };
    }
    if (closed.code === 0) return { ok: true };
    const stderrText = stderrChunks.join("").trim();
    const error =
      lastFailure?.error ??
      (stderrText !== ""
        ? stderrText
        : closed.signal !== null
          ? `Persona script runner terminated by ${closed.signal}`
          : `Persona script runner exited with code ${String(closed.code)}`);
    return {
      ok: false,
      ...(lastFailure === undefined ? {} : { failure: lastFailure }),
      error,
    };
  })();
  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopping ??= (async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        const timeout = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
        }, 2_000);
        timeout.unref();
        await exited.finally(() => clearTimeout(timeout));
      } else {
        await exited;
      }
    })();
    return stopping;
  };
  return { kind: "scripted", exited, stop };
};

/**
 * In Herdr an agent gets a sibling pane that outlives it; otherwise it takes
 * over this terminal and the returned promise settles when it exits.
 */
export const startPersonaAgent = async (input: {
  readonly run: string;
  /** Where the agent starts: outside the repository, unlike `run`. */
  readonly cwd: string;
  readonly socketPath: string;
  readonly command: string;
}): Promise<
  Extract<PersonaDriverProcess, { kind: "herdr" | "foreground" }>
> => {
  if (process.env.HERDR_ENV === "1") {
    const split = await execute("herdr", [
      "pane",
      "split",
      "--current",
      "--direction",
      "right",
      "--cwd",
      input.cwd,
      "--no-focus",
    ]);
    const pane = paneIdFrom(split.stdout);
    try {
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
    } catch (error) {
      // The caller only learns the pane on success, so close it here.
      await execute("herdr", ["pane", "close", pane]).catch(() => {
        process.stderr.write(
          `Could not close persona pane ${pane}; inspect it in Herdr.\n`,
        );
      });
      throw error;
    }
    return { kind: "herdr", pane };
  }
  if (!process.stdin.isTTY)
    throw new Error(
      "Without Herdr the persona agent needs this interactive terminal; run from a terminal, from Herdr, or omit --agent and start the agent yourself",
    );
  const child = spawn("sh", ["-c", input.command], {
    cwd: input.cwd,
    stdio: "inherit",
    env: personaDriverEnvironment(input.run, input.socketPath),
  });
  return {
    kind: "foreground",
    exited: new Promise((done, reject) => {
      child.once("error", reject);
      child.once("exit", () => done());
    }),
  };
};
