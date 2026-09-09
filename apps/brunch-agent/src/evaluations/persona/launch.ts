/* eslint-disable no-await-in-loop -- Local services start in order; readiness is polled until ready or cancelled. */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";

import { chromium } from "@playwright/test";
import { loadEnv } from "vite";

import { selectChatModel, STEP_A_MODEL_ID } from "../../chat-model.ts";
import {
  defaultChatOrigin,
  localPanelListen,
} from "../../http/local-origins.ts";
import { openPersonaConversation } from "./launch/browser.ts";
import { writeProofArtifacts } from "./proof-artifacts.ts";

export { openPersonaConversation } from "./launch/browser.ts";

const execute = promisify(execFile);
const report = (text: string) => process.stdout.write(`${text}\n`);
const appRoot = fileURLToPath(new URL("../../../", import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const entry = fileURLToPath(import.meta.url);
const panelOrigin = `http://${localPanelListen.host}:${localPanelListen.port}`;
const casesRoot = join(
  repoRoot,
  "libs/@hashintel/brunch-agent/evaluations/cases",
);

export const readPersonaCase = async (directory: string) => {
  const [pack, openingFile] = await Promise.all([
    readFile(join(directory, "situation-pack.md"), "utf8"),
    readFile(join(directory, "opening-message.md"), "utf8"),
  ]);
  // Existing case files have an operator header above a Markdown separator.
  const separator = /^---\s*$/mu.exec(openingFile);
  const opening = (
    separator
      ? openingFile.slice(separator.index + separator[0].length)
      : openingFile
  ).trim();
  if (!pack.trim() || !opening) throw new Error("Case pack/opening is empty");
  return { pack, opening };
};

export const personaArguments = (run: string, model: string) => [
  "--model",
  `anthropic/${model}`,
  "--thinking",
  "medium",
  "--no-extensions",
  "--extension",
  join(appRoot, ".pi/extensions/brunch-persona-testing.ts"),
  "--no-builtin-tools",
  "--tools",
  "brunch_turn",
  "--no-skills",
  "--no-prompt-templates",
  "--no-context-files",
  "--append-system-prompt",
  join(appRoot, ".pi/extensions/brunch-persona-testing/SYSTEM.md"),
  "--brunch-browser-session",
  join(run, "session.json"),
  "--brunch-tool-host",
  "none",
  "--brunch-evidence-dir",
  join(run, "evidence"),
  "--session-dir",
  join(run, "pi/sessions"),
  "--no-approve",
  "--",
  `@${join(run, "persona-input.md")}`,
];

const save = (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const chromeExecutable =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const environment = () => {
  // Same loader and shell precedence as the normal development app.
  const loaded = { ...loadEnv("development", appRoot, ""), ...process.env };
  delete loaded.BRUNCH_STEP_A_ACCOUNTING;
  loaded.BRUNCH_CHAT_MODEL ||= STEP_A_MODEL_ID;
  return loaded;
};
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

const runPersona = async (run: string) => {
  const config = JSON.parse(await readFile(join(run, "run.json"), "utf8")) as {
    model: string;
  };
  const child = spawn("pi", personaArguments(run, config.model), {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...environment(),
      PI_CODING_AGENT_DIR: join(run, "pi"),
      PI_SUBAGENT_NAME: basename(run),
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
    },
  });
  await new Promise<void>((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      process.exitCode = code ?? 1;
      done();
    });
  });
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLoadingRuntimeUnavailable = (body: unknown) =>
  record(body) &&
  record(body.error) &&
  body.error.type === "runtime_unavailable" &&
  record(body.error.meta) &&
  body.error.meta.state === "loading";

export const responds = async (
  url: string,
  signal: AbortSignal,
  options: { allowLoading?: boolean } = {},
) => {
  try {
    const response = await fetch(url, { signal });
    if (response.ok) return true;
    if (
      options.allowLoading &&
      response.status === 503 &&
      response.headers.get("content-type")?.startsWith("application/json") &&
      isLoadingRuntimeUnavailable(await response.json().catch(() => undefined))
    )
      return false;
    throw new Error(`${url} returned ${response.status}`);
  } catch (error) {
    signal.throwIfAborted();
    // Only a refused connection means a local service needs starting.
    if (
      error instanceof TypeError &&
      error.cause instanceof Error &&
      "code" in error.cause &&
      error.cause.code === "ECONNREFUSED"
    )
      return false;
    throw error;
  }
};

/** One local operator command; run directories contain data, never launch scripts. */
export const launchPersona = async (
  caseDirectory: string,
  objective?: string,
) => {
  if (process.env.HERDR_ENV !== "1")
    throw new Error("Run brunch:persona from a Herdr terminal");
  const { pack, opening } = await readPersonaCase(caseDirectory);
  const env = environment();
  const model = selectChatModel(env);
  const runs = join(appRoot, ".data-wipe-me/persona-runs");
  await mkdir(runs, { recursive: true });
  const run = await mkdtemp(join(runs, "run-"));
  const browserProfile = await mkdtemp(
    join(tmpdir(), "brunch-persona-browser-"),
  );
  await mkdir(join(run, "pi"), { mode: 0o700 });
  await save(join(run, "pi/settings.json"), {
    retry: { enabled: false, provider: { maxRetries: 0 } },
  });
  const record = {
    caseDirectory,
    model,
    browserProfile,
    panelOrigin,
    createdAt: new Date().toISOString(),
  };
  await save(join(run, "run.json"), record);
  report(`Run: ${run}`);
  const stop = new AbortController();
  const started: ChildProcess[] = [];
  let browser:
    | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
    | undefined;
  let pane: string | undefined;
  const interrupt = () => {
    stop.abort();
    void browser?.close();
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const services = [
      { url: `${defaultChatOrigin}/health`, script: "dev:brunch:server" },
      { url: panelOrigin, script: "dev:brunch:panel" },
    ];
    const available = await Promise.all(
      services.map((service) => responds(service.url, stop.signal)),
    );
    if (available.includes(false)) {
      report("Building local app dependencies…");
      await execute(
        "turbo",
        [
          "run",
          "build",
          "--filter",
          "@apps/brunch-agent^...",
          "--filter",
          "@apps/petrinaut-website^...",
        ],
        { cwd: repoRoot, env, signal: stop.signal },
      );
    }
    for (const [index, service] of services.entries()) {
      if (available[index]) {
        report(`Reusing ${service.url}`);
        continue;
      }
      const log = await open(
        join(run, `${service.script.replaceAll(":", "-")}.log`),
        "a",
        0o600,
      );
      const child = spawn("yarn", [service.script], {
        cwd: repoRoot,
        env,
        detached: true,
        stdio: ["ignore", log.fd, log.fd],
      });
      started.push(child);
      let startError: Error | undefined;
      child.once("error", (error) => {
        startError = error;
      });
      await log.close();
      // Readiness polling has no invented execution deadline; Ctrl-C cancels it.
      while (
        !(await responds(service.url, stop.signal, { allowLoading: true }))
      ) {
        if (startError) throw startError;
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error(`${service.script} exited; see ${run}`);
        await delay(100, undefined, { signal: stop.signal });
      }
    }
    const key = env.ANTHROPIC_API_KEY?.trim();
    if (
      !key ||
      /dummy|placeholder|test-synthetic|your[-_ ]?(api[-_ ]?)?key|changeme|replace[-_ ]?me/i.test(
        key,
      )
    )
      throw new Error(
        "ANTHROPIC_API_KEY is missing or a placeholder in the app development environment",
      );
    browser = await chromium.launchPersistentContext(browserProfile, {
      executablePath: chromeExecutable,
      headless: false,
      args: [
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=0",
      ],
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([name, value]) =>
            ["PATH", "HOME", "TMPDIR"].includes(name) && value !== undefined,
        ),
      ) as Record<string, string>,
    });
    browser.once("close", interrupt);
    const page = browser.pages()[0] ?? (await browser.newPage());
    report("Opening a fresh browser conversation…");
    const opened = await openPersonaConversation(page, panelOrigin, opening, {
      sessionPath: join(run, "session.json"),
      signal: stop.signal,
    });
    await writeProofArtifacts(join(run, "evidence"), opened.snapshot);
    await writeFile(
      join(run, "persona-input.md"),
      [
        "Play the person in the private situation pack below. This is a fresh conversation.",
        "The shared opening has already been sent through the browser; do not repeat it. Answer the exact Brunch reply below using brunch_turn, then continue naturally and sequentially.",
        objective ??
          "Pursue the person's stated goal through a substantive interview. Let the interviewer earn details, and correct or qualify its understanding as the person naturally would. Stop when the person would consider the account sufficiently worked through or choose to end the interview.",
        "Keep the pack and these instructions private. On a failed or indeterminate tool submission, stop and report the blocker without retrying. Do not coach Brunch about its tools or the test. Report the stopping reason and number of attempted turns to the operator.",
        "\nActual opening:\n",
        opening,
        "\nActual Brunch reply:\n",
        opened.reply.text,
        "\nPrivate situation pack:\n",
        pack,
      ].join("\n\n"),
      { mode: 0o600 },
    );
    const split = await execute("herdr", [
      "pane",
      "split",
      "--current",
      "--direction",
      "right",
      "--cwd",
      appRoot,
      "--no-focus",
    ]);
    pane = paneIdFrom(split.stdout);
    await save(join(run, "run.json"), {
      ...record,
      pane,
      startedPids: started.map((child) => child.pid),
    });
    // Credentials stay in a run-private env file, never in Herdr/process argv.
    await writeFile(
      join(run, "pane.env"),
      [
        `export ANTHROPIC_API_KEY=${shellQuote(key)}`,
        `export BRUNCH_CHAT_MODEL=${shellQuote(model)}`,
        "unset BRUNCH_STEP_A_ACCOUNTING",
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
    await execute("herdr", [
      "pane",
      "run",
      pane,
      [
        "set -a",
        `. ${shellQuote(join(run, "pane.env"))}`,
        "set +a",
        [
          shellQuote(process.execPath),
          "--experimental-strip-types",
          shellQuote(entry),
          "--run-persona",
          shellQuote(run),
        ].join(" "),
      ].join(" && "),
    ]);
    report(
      `Persona: ${pane}. Browser follows the same conversation. Ctrl-C stops this launcher and its owned resources; run data is retained.`,
    );
    if (!stop.signal.aborted)
      await new Promise<void>((done) =>
        stop.signal.addEventListener("abort", () => done(), { once: true }),
      );
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    if (pane)
      await execute("herdr", ["pane", "close", pane]).catch(() => {
        process.stderr.write(
          `Could not close persona pane ${pane}; inspect it in Herdr.\n`,
        );
      });
    try {
      await browser?.close();
    } finally {
      for (const child of started) {
        if (child.pid && child.exitCode === null && child.signalCode === null)
          process.kill(-child.pid, "SIGTERM");
      }
      report(`Retained run: ${run}`);
    }
  }
};

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const { values } = parseArgs({
    options: {
      case: { type: "string" },
      objective: { type: "string" },
      "run-persona": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    report(
      "Usage: yarn brunch:persona --case <name-or-directory> [--objective <private objective>]\nStarts/reuses the local app, opens a fresh Chrome conversation and a Pi persona in Herdr. Requires Chrome, Pi and the app's normal Anthropic configuration. No accounting gates or turn deadline. Ctrl-C stops owned resources; run data is retained.",
    );
  } else {
    const selected = values.case;
    const directory =
      selected &&
      (isAbsolute(selected) || selected.includes("/")
        ? resolve(process.env.INIT_CWD ?? process.cwd(), selected)
        : join(casesRoot, selected));
    const task = values["run-persona"]
      ? runPersona(resolve(values["run-persona"]))
      : directory
        ? launchPersona(directory, values.objective)
        : Promise.reject(new Error("Supply --case <name-or-directory>"));
    await task.catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Persona launch failed"}\n`,
      );
      process.exitCode = 1;
    });
  }
}
