/* eslint-disable no-await-in-loop -- Local services start in order; readiness is polled until ready or cancelled. */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";

import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { chromium, type Page } from "@playwright/test";
import { loadEnv } from "vite";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import { STEP_A_MODEL_ID } from "../../chat-model.ts";
import {
  defaultChatOrigin,
  localPanelListen,
} from "../../http/local-origins.ts";
import { initializeRequestLedger } from "../../provider-accounting/request-ledger.ts";
import { openPersonaBrowserBridge } from "./browser-bridge.ts";
import { submitPersonaBrowserTurn } from "./browser-turn.ts";
import { openPersonaConversation } from "./launch/browser.ts";
import {
  refreshProofManifest,
  writeProofArtifacts,
} from "./proof-artifacts.ts";
import { checkPersonaConfiguration } from "./request-accounting.ts";

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

export const personaArguments = (
  run: string,
  model: string,
  socketPath: string,
) => [
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
  "--brunch-browser-bridge",
  socketPath,
  "--brunch-tool-host",
  "none",
  "--brunch-evidence-dir",
  join(run, "evidence"),
  "--session-dir",
  join(run, "pi/sessions"),
  "--approve",
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
  if (process.env.DEBUG)
    throw new Error(
      "Unset DEBUG before persona launch; environment values must not be logged",
    );
  const loaded = { ...loadEnv("development", appRoot, ""), ...process.env };
  loaded.BRUNCH_CHAT_MODEL = STEP_A_MODEL_ID;
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
    socketPath: string;
    accounting?: ReturnType<typeof initializeRequestLedger>;
  };
  if (!config.accounting || config.model !== STEP_A_MODEL_ID)
    throw new Error("Persona run is missing its shared Sonnet allocation");
  const child = spawn(
    "pi",
    personaArguments(run, config.model, config.socketPath),
    {
      cwd: appRoot,
      stdio: "inherit",
      env: {
        ...environment(),
        BRUNCH_STEP_A_ACCOUNTING: JSON.stringify(config.accounting),
        PI_CODING_AGENT_DIR: join(run, "pi"),
        PI_SUBAGENT_NAME: basename(run),
        PI_OFFLINE: "1",
        PI_TELEMETRY: "0",
      },
    },
  );
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

export const documentIdFromInitialData = (
  initialData: unknown,
): string | undefined => {
  if (!record(initialData)) return undefined;
  const browser = record(initialData.construction)
    ? initialData.construction
    : record(initialData.browser)
      ? initialData.browser
      : undefined;
  const binding =
    browser && record(browser.binding) ? browser.binding : undefined;
  return typeof binding?.documentId === "string"
    ? binding.documentId
    : undefined;
};

const retainPersonaDocument = async (
  page: Page,
  documentId: string,
  evidenceDirectory: string,
): Promise<void> => {
  const document = await page.evaluate(
    ({ id, storageKey }) => {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return undefined;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return undefined;
      return (parsed as Record<string, unknown>)[id];
    },
    { id: documentId, storageKey: "petrinaut-sdcpn" },
  );
  if (!record(document) || !record(document.sdcpn))
    throw new Error(
      `The persona browser has no retained Petrinaut document ${documentId}.`,
    );
  await writeFile(
    join(evidenceDirectory, "net.json"),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  await refreshProofManifest(evidenceDirectory);
};

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
  budgetUsd: number,
  objective?: string,
  route = "/",
  initialNetPath?: string,
) => {
  if (process.env.HERDR_ENV !== "1")
    throw new Error("Run brunch:persona from a Herdr terminal");
  if (!process.stdin.isTTY)
    throw new Error(
      "Use an interactive terminal for the recording-ready prompt",
    );
  const { pack, opening } = await readPersonaCase(caseDirectory);
  const env = environment();
  const model = STEP_A_MODEL_ID;
  const nativeModel = anthropicProvider()
    .getModels()
    .find((entry) => entry.id === model);
  if (!nativeModel)
    throw new Error("Sonnet is absent from the native provider catalogue");
  const initialNet =
    initialNetPath === undefined
      ? undefined
      : await readFile(initialNetPath).then((bytes) => {
          const parsed = parseSDCPNFile(JSON.parse(bytes.toString("utf8")));
          if (!parsed.ok) throw new Error(parsed.error);
          const { title, ...sdcpn } = parsed.sdcpn;
          const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
          return {
            id: `persona-source-${sourceSha256.slice(0, 12)}`,
            incarnationId: randomUUID(),
            lastUpdated: new Date().toISOString(),
            sdcpn,
            sourceSha256,
            title,
          };
        });
  const runs = join(appRoot, ".data-wipe-me/persona-runs");
  await mkdir(runs, { recursive: true });
  const run = await mkdtemp(join(runs, "run-"));
  const accounting = initializeRequestLedger(
    join(run, "usage-ledger.json"),
    basename(run),
    budgetUsd,
    nativeModel,
  );
  env.BRUNCH_STEP_A_ACCOUNTING = JSON.stringify(accounting);
  env.BRUNCH_DEV_DB_PATH = join(run, "conversation.db");
  env.BRUNCH_DB_KIND = "sqlite";
  delete env.BRUNCH_CHAT_DB_PATH;
  const browserProfile = await mkdtemp(
    join(tmpdir(), "brunch-persona-browser-"),
  );
  await mkdir(join(run, "pi"), { mode: 0o700 });
  await save(join(run, "pi/settings.json"), {
    retry: { enabled: false, provider: { maxRetries: 0 } },
  });
  const key = checkPersonaConfiguration({
    ...env,
    PI_CODING_AGENT_DIR: join(run, "pi"),
    PI_OFFLINE: "1",
  });
  const record = {
    caseDirectory,
    model,
    budgetUsd,
    accounting,
    databasePath: env.BRUNCH_DEV_DB_PATH,
    browserProfile,
    panelOrigin,
    route,
    ...(initialNetPath === undefined
      ? {}
      : {
          initialNetPath,
          initialNetSha256: initialNet?.sourceSha256,
        }),
    createdAt: new Date().toISOString(),
  };
  await save(join(run, "run.json"), record);
  report(`Run: ${run}`);
  const stop = new AbortController();
  const started: ChildProcess[] = [];
  let browser:
    | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
    | undefined;
  let page: Page | undefined;
  let bridge: Awaited<ReturnType<typeof openPersonaBrowserBridge>> | undefined;
  let documentId: string | undefined;
  let pane: string | undefined;
  let interrupted = false;
  const interrupt = () => {
    if (interrupted) return;
    interrupted = true;
    stop.abort();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    const preflight = await execute(
      process.execPath,
      [
        "--experimental-strip-types",
        join(appRoot, "src/dev-configuration-preflight.ts"),
      ],
      { cwd: repoRoot, env, signal: stop.signal },
    );
    await writeFile(
      join(run, "configuration-preflight.json"),
      preflight.stdout,
      { mode: 0o600 },
    );
    report(
      "Sonnet configuration verified; credential validity untested. Pi verifies its native selection again on startup.",
    );
    const services = [
      { url: `${defaultChatOrigin}/health`, script: "dev:brunch:server" },
      { url: panelOrigin, script: "dev:brunch:panel" },
    ];
    const available = await Promise.all(
      services.map((service) => responds(service.url, stop.signal)),
    );
    if (available.includes(true))
      throw new Error(
        "Persona needs its own metered services. Leave existing services running and choose unused BRUNCH_CHAT_PORT and BRUNCH_PANEL_PORT values.",
      );
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
    for (const service of services) {
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
    browser = await chromium.launchPersistentContext(browserProfile, {
      executablePath: chromeExecutable,
      headless: false,
      viewport: null,
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
    page = browser.pages()[0] ?? (await browser.newPage());
    if (initialNet !== undefined) {
      const serializedInitialNet = JSON.stringify({
        [initialNet.id]: {
          id: initialNet.id,
          incarnationId: initialNet.incarnationId,
          lastUpdated: initialNet.lastUpdated,
          sdcpn: initialNet.sdcpn,
          title: initialNet.title,
        },
      });
      await page.addInitScript(
        ({ serialized, storageKey }) =>
          localStorage.setItem(storageKey, serialized),
        {
          serialized: serializedInitialNet,
          storageKey: "petrinaut-sdcpn",
        },
      );
    }
    report("Opening a fresh browser conversation…");
    const personaPage = page;
    const opened = await openPersonaConversation(
      personaPage,
      panelOrigin,
      opening,
      {
        route,
        sessionPath: join(run, "session.json"),
        signal: stop.signal,
        beforeOpening: async () => {
          const title = `Brunch persona · ${basename(run)} · ready to record`;
          await personaPage.evaluate((value) => {
            document.title = value;
          }, title);
          await personaPage.bringToFront();
          report(
            `Chrome window: ${title}\nURL: ${personaPage.url()}\nProfile: ${browserProfile}\nModels: Brunch + Pi ${model}\nCombined catalogue budget: USD ${budgetUsd}\nNo message has been sent. Start your screen recording, then press Enter here.`,
          );
          const terminal = createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          try {
            await terminal.question(
              "Recording ready — Enter to begin (Ctrl-C cancels): ",
              { signal: stop.signal },
            );
            stop.signal.throwIfAborted();
          } finally {
            terminal.close();
          }
        },
      },
    );
    documentId = documentIdFromInitialData(opened.session.initialData);
    await writeProofArtifacts(join(run, "evidence"), opened.snapshot);
    bridge = await openPersonaBrowserBridge(async (message, signal) => {
      const result = await submitPersonaBrowserTurn(personaPage, message, {
        session: opened.session,
        signal: AbortSignal.any([signal, stop.signal]),
      });
      await writeProofArtifacts(join(run, "evidence"), result.snapshot);
      if (documentId !== undefined)
        await retainPersonaDocument(
          personaPage,
          documentId,
          join(run, "evidence"),
        );
      return {
        conversationId: result.session.conversationId,
        text: result.reply.text,
        submissionIds: result.submissionIds,
      };
    });
    await writeFile(
      join(run, "persona-input.md"),
      [
        "Play the person in the private situation pack below. This is a fresh conversation.",
        "The shared opening has already been sent through the browser; do not repeat it. Answer the exact Brunch reply below using brunch_turn, then continue naturally and sequentially.",
        objective ??
          "Pursue the person's stated goal through a substantive interview and a worked model. Let the interviewer earn details, and correct or qualify its understanding as the person naturally would. Continue through reviewing the model, asking why and correcting a consequential detail; do not stop merely because the initial account has been elicited. Stop when the person considers the goal achieved or chooses to end the conversation.",
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
      socketPath: bridge.socketPath,
      startedPids: started.map((child) => child.pid),
    });
    // Credentials stay in a run-private env file, never in Herdr/process argv.
    await writeFile(
      join(run, "pane.env"),
      [
        `export ANTHROPIC_API_KEY=${shellQuote(key)}`,
        `export BRUNCH_CHAT_MODEL=${shellQuote(model)}`,
        `export BRUNCH_STEP_A_ACCOUNTING=${shellQuote(JSON.stringify(accounting))}`,
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
    try {
      await bridge?.close();
      if (pane)
        await execute("herdr", ["pane", "close", pane]).catch(() => {
          process.stderr.write(
            `Could not close persona pane ${pane}; inspect it in Herdr.\n`,
          );
        });
      try {
        try {
          if (page && !page.isClosed() && documentId !== undefined)
            await retainPersonaDocument(
              page,
              documentId,
              join(run, "evidence"),
            );
        } finally {
          await browser?.close();
        }
      } finally {
        for (const child of started) {
          if (child.pid && child.exitCode === null && child.signalCode === null)
            process.kill(-child.pid, "SIGTERM");
        }
        report(`Retained run: ${run}`);
      }
    } finally {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
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
      "budget-usd": { type: "string" },
      objective: { type: "string" },
      "initial-net": { type: "string" },
      route: { type: "string" },
      "run-persona": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    report(
      "Usage: yarn brunch:persona --case <name-or-directory> --budget-usd <allocation> [--objective <private objective>] [--route </path?search>] [--initial-net <sdcpn.json>]\nStarts owned metered services and a fresh headed Chrome window; pauses for Enter before sending anything. Both models use claude-sonnet-4-6 and share the supplied budget (at most USD 100). Requires Chrome, Pi, Herdr, unused BRUNCH_CHAT_PORT/BRUNCH_PANEL_PORT and the app's normal Anthropic configuration. Ctrl-C stops owned resources; run data is retained.",
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
        ? launchPersona(
            directory,
            Number(values["budget-usd"]),
            values.objective,
            values.route ?? (values["initial-net"] ? "/" : undefined),
            values["initial-net"]
              ? resolve(
                  process.env.INIT_CWD ?? process.cwd(),
                  values["initial-net"],
                )
              : undefined,
          )
        : Promise.reject(new Error("Supply --case <name-or-directory>"));
    await task.catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Persona launch failed"}\n`,
      );
      process.exitCode = 1;
    });
  }
}
