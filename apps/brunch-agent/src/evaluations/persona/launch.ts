/* eslint-disable no-await-in-loop -- Local services start in order; readiness is polled until ready or cancelled. */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";

import { createFlueClient, FlueExecutionError } from "@flue/sdk";
import { chromium, type Page } from "@playwright/test";
import { loadEnv } from "vite";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import { agentOwnershipHeaders } from "../../conversation/identity.ts";
import {
  defaultChatOrigin,
  localPanelListen,
} from "../../http/local-origins.ts";
import { openPersonaBrowserBridge } from "./browser-bridge.ts";
import { submitPersonaBrowserTurn } from "./browser-turn.ts";
import { checkPersonaConfiguration } from "./configuration.ts";
import {
  axisSettingsFromRun,
  resolvePersonaAxisSettings,
  type PersonaAxisSettings,
} from "./launch/axis-settings.ts";
import { openPersonaConversation } from "./launch/browser.ts";
import {
  openRetainedPersonaBrowser,
  readPersonaResume,
  reconcilePersonaResume,
} from "./launch/resume.ts";
import {
  resolvePersonaRoleSettings,
  roleSettingsFromRun,
  type PersonaRoleSettings,
} from "./launch/role-settings.ts";
import {
  refreshProofManifest,
  writeProofArtifacts,
} from "./proof-artifacts.ts";

import type { AgentSendResult, FlueClient } from "@flue/sdk";

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

export const listPersonaCases = async () => {
  const entries = await readdir(casesRoot, { withFileTypes: true });
  const cases = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const files = await readdir(join(casesRoot, entry.name));
        return files.includes("situation-pack.md") &&
          files.includes("opening-message.md")
          ? entry.name
          : undefined;
      }),
  );
  return cases.filter((name) => name !== undefined).sort();
};

export const readPersonaCase = async (directory: string) => {
  const [pack, openingFile] = await Promise.all([
    readFile(join(directory, "situation-pack.md"), "utf8"),
    readFile(join(directory, "opening-message.md"), "utf8"),
  ]).catch((cause: unknown) => {
    throw new Error(
      `Case ${directory} requires readable situation-pack.md and opening-message.md files. Use --list-cases for available names.`,
      { cause },
    );
  });
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
  roles: PersonaRoleSettings,
  axes: PersonaAxisSettings,
  socketPath: string,
  piSession?: string,
) => {
  const axisDirectory = join(
    appRoot,
    ".pi/extensions/brunch-persona-testing/axes",
  );
  const axisPromptPaths = [
    ...(axes.personaVerbosity === "default"
      ? []
      : [join(axisDirectory, `verbosity-${axes.personaVerbosity}.md`)]),
    ...(axes.personaDisclosure === "default"
      ? []
      : [join(axisDirectory, `disclosure-${axes.personaDisclosure}.md`)]),
  ];
  return [
    "--model",
    roles.personaModel,
    "--thinking",
    roles.personaThinking,
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
    ...axisPromptPaths.flatMap((path) => ["--append-system-prompt", path]),
    "--brunch-browser-bridge",
    socketPath,
    "--session-dir",
    join(run, "pi/sessions"),
    ...(piSession ? ["--session", piSession] : []),
    "--approve",
    "--",
    `@${join(run, piSession ? "resume-input.md" : "persona-input.md")}`,
  ];
};

const save = (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const chromeExecutable =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const personaEnvironment = (
  roles: PersonaRoleSettings = resolvePersonaRoleSettings(),
) => {
  // Same loader and shell precedence as the normal development app.
  if (process.env.DEBUG)
    throw new Error(
      "Unset DEBUG before persona launch; environment values must not be logged",
    );
  const loaded = { ...loadEnv("development", appRoot, ""), ...process.env };
  loaded.BRUNCH_CHAT_MODEL = roles.brunchModel;
  loaded.BRUNCH_CHAT_THINKING = roles.brunchThinking;
  // An explicit empty value also overrides Vite env files on backend startup.
  // Historical campaign ledgers must not gate persona requests or resumed runs.
  loaded.BRUNCH_STEP_A_ACCOUNTING = "";
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

export const recordingReadySummary = ({
  title,
  url,
  browserProfile,
  roles,
  axes,
  resume,
}: {
  title: string;
  url: string;
  browserProfile: string;
  roles: PersonaRoleSettings;
  axes: PersonaAxisSettings;
  resume: boolean;
}) =>
  `Chrome window: ${title}\nURL: ${url}\nProfile: ${browserProfile}\nModels: Brunch ${roles.brunchModel} (${roles.brunchThinking}) + Pi ${roles.personaModel} (${roles.personaThinking})\nPersona axes: verbosity ${axes.personaVerbosity}; disclosure ${axes.personaDisclosure}\nUsage is retained in native records; no automatic budget cutoff.\n${resume ? "Original document retained. Backend recovery and Pi have not started." : "No message has been sent."} Start your screen recording, then press Enter here.`;

export const personaSettingsRecord = (
  roles: PersonaRoleSettings,
  axes: PersonaAxisSettings,
) => ({
  brunchModel: roles.brunchModel,
  brunchThinking: roles.brunchThinking,
  personaModel: roles.personaModel,
  personaThinking: roles.personaThinking,
  personaVerbosity: axes.personaVerbosity,
  personaDisclosure: axes.personaDisclosure,
});

const runPersona = async (run: string) => {
  const config: unknown = JSON.parse(
    await readFile(join(run, "run.json"), "utf8"),
  );
  const roles = roleSettingsFromRun(config);
  const axes = axisSettingsFromRun(config);
  const fields =
    typeof config === "object" && config !== null && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  const socketPath =
    typeof fields.socketPath === "string" ? fields.socketPath : undefined;
  const piSession =
    typeof fields.piSession === "string" ? fields.piSession : undefined;
  if (!socketPath) throw new Error("Persona run is missing its private socket");
  const credentials = checkPersonaConfiguration(
    {
      ...process.env,
      PI_CODING_AGENT_DIR: join(run, "pi"),
      PI_OFFLINE: "1",
    },
    roles.personaModel,
  );
  const child = spawn(
    "pi",
    personaArguments(run, roles, axes, socketPath, piSession),
    {
      cwd: appRoot,
      stdio: "inherit",
      env: {
        // The pane supplies the selected credential; do not reload app env files
        // or inherit server credentials and executable configuration into Pi.
        ...Object.fromEntries(
          [
            "PATH",
            "HOME",
            "USER",
            "LOGNAME",
            "SHELL",
            "TERM",
            "COLORTERM",
            "LANG",
            "LC_ALL",
            "LC_CTYPE",
            "TMPDIR",
          ].map((name) => [name, process.env[name]]),
        ),
        ...credentials,
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

export const settlePersonaLauncherStop = async (
  client: Pick<FlueClient, "abort" | "wait">,
  receipt: AgentSendResult,
  graceMs: number,
): Promise<{
  readonly settlement: "aborted" | "completed" | "failed" | "not-observed";
  readonly submissionId: string;
}> => {
  const signal = AbortSignal.timeout(graceMs);
  try {
    await client.abort({ signal });
    await client.wait(receipt, { signal });
    return { settlement: "completed", submissionId: receipt.submissionId };
  } catch (error) {
    if (error instanceof FlueExecutionError) {
      return {
        settlement:
          error.failure === "aborted"
            ? "aborted"
            : error.failure === "failed"
              ? "failed"
              : "not-observed",
        submissionId: receipt.submissionId,
      };
    }
    return {
      settlement: "not-observed",
      submissionId: receipt.submissionId,
    };
  }
};

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
  route = "/",
  initialNetPath?: string,
  resume?: Awaited<ReturnType<typeof readPersonaResume>>,
  roles: PersonaRoleSettings = resolvePersonaRoleSettings(),
  axes: PersonaAxisSettings = resolvePersonaAxisSettings(),
) => {
  const { pack, opening } = resume
    ? { pack: "", opening: "" }
    : await readPersonaCase(caseDirectory);
  if (process.env.HERDR_ENV !== "1")
    throw new Error("Run brunch:persona from a Herdr terminal");
  if (!process.stdin.isTTY)
    throw new Error(
      "Use an interactive terminal for the recording-ready prompt",
    );
  if (resume && panelOrigin !== resume.config.panelOrigin)
    throw new Error(
      `Resume requires the original panel origin ${resume.config.panelOrigin}; set BRUNCH_PANEL_PORT accordingly`,
    );
  const settings = resume ? roleSettingsFromRun(resume.config) : roles;
  const axisSettings = resume ? axisSettingsFromRun(resume.config) : axes;
  const env = personaEnvironment(settings);
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
  const run = resume?.run ?? (await mkdtemp(join(runs, "run-")));
  env.BRUNCH_DEV_DB_PATH = join(run, "conversation.db");
  env.BRUNCH_DB_KIND = "sqlite";
  delete env.BRUNCH_CHAT_DB_PATH;
  const browserProfile =
    resume?.config.browserProfile ??
    (await mkdtemp(join(tmpdir(), "brunch-persona-browser-")));
  if (!resume) {
    await mkdir(join(run, "pi"), { mode: 0o700 });
    await save(join(run, "pi/settings.json"), {
      retry: { enabled: false, provider: { maxRetries: 0 } },
    });
  }
  const credentials = checkPersonaConfiguration(
    {
      ...env,
      PI_CODING_AGENT_DIR: join(run, "pi"),
      PI_OFFLINE: "1",
    },
    settings.personaModel,
  );
  const record = {
    caseDirectory,
    ...personaSettingsRecord(settings, axisSettings),
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
    ...resume?.config,
  };
  if (!resume) await save(join(run, "run.json"), record);
  report(`Run: ${run}`);
  const stop = new AbortController();
  const started: ChildProcess[] = [];
  let servicesStopRequested = false;
  const stopStartedServices = () => {
    if (servicesStopRequested) return;
    servicesStopRequested = true;
    for (const child of started) {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null)
        continue;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ESRCH"
        ) {
          throw error;
        }
      }
    }
  };
  let browser:
    | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
    | undefined;
  let page: Page | undefined;
  let bridge: Awaited<ReturnType<typeof openPersonaBrowserBridge>> | undefined;
  let documentId: string | undefined;
  let pane: string | undefined;
  let activeAdmission:
    | { client: FlueClient; receipt: AgentSendResult }
    | undefined;
  const interrupt = () => {
    if (stop.signal.aborted) return;
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
      `Brunch ${settings.brunchModel} (${settings.brunchThinking}) configuration verified; credential validity untested. Pi verifies ${settings.personaModel} (${settings.personaThinking}) on startup.`,
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
        "Persona needs its own services. Leave existing services running and choose unused BRUNCH_CHAT_PORT and BRUNCH_PANEL_PORT values.",
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
    const startService = async (service: (typeof services)[number]) => {
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
    };
    for (const service of services) {
      // Flue startup may resume inference. On resume only the panel starts before recording.
      if (!resume || service.script === "dev:brunch:panel")
        await startService(service);
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
    const personaPage = page;
    const recordingPause = async () => {
      const title = `Brunch persona · ${basename(run)} · ready to record`;
      await personaPage.evaluate((value) => {
        document.title = value;
      }, title);
      await personaPage.bringToFront();
      report(
        recordingReadySummary({
          title,
          url: personaPage.url(),
          browserProfile,
          roles: settings,
          axes: axisSettings,
          resume: resume !== undefined,
        }),
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
    };
    const reopen = async (retained: NonNullable<typeof resume>) => {
      await openRetainedPersonaBrowser(
        personaPage,
        panelOrigin,
        retained.config.route,
        retained.session,
      );
      await recordingPause();
      for (const service of services)
        if (service.script === "dev:brunch:server") await startService(service);
      const reconciled = await reconcilePersonaResume(
        personaPage,
        retained.session,
        retained.lastUtterance,
        stop.signal,
      );
      await writeFile(join(run, "resume-input.md"), reconciled.prompt, {
        mode: 0o600,
      });
      return { ...reconciled, reply: { text: "" } };
    };
    report(
      resume
        ? "Reopening the original browser document…"
        : "Opening a fresh browser conversation…",
    );
    const opened = resume
      ? await reopen(resume)
      : await openPersonaConversation(personaPage, panelOrigin, opening, {
          route,
          sessionPath: join(run, "session.json"),
          signal: stop.signal,
          beforeOpening: recordingPause,
        });
    documentId = documentIdFromInitialData(opened.session.initialData);
    await writeProofArtifacts(join(run, "evidence"), opened.snapshot);
    bridge = await openPersonaBrowserBridge(async (message, signal) => {
      try {
        const result = await submitPersonaBrowserTurn(personaPage, message, {
          session: opened.session,
          signal: AbortSignal.any([signal, stop.signal]),
          onAdmission: async (session, receipt) => {
            activeAdmission = {
              client: createFlueClient({
                url: session.url,
                headers: agentOwnershipHeaders(session),
              }),
              receipt,
            };
          },
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
      } finally {
        if (!stop.signal.aborted) activeAdmission = undefined;
      }
    });
    if (!resume)
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
      ...(resume ? { piSession: resume.piSession } : {}),
      pane,
      socketPath: bridge.socketPath,
      startedPids: started.map((child) => child.pid),
    });
    // Credentials stay in a run-private env file, never in Herdr/process argv.
    await writeFile(
      join(run, "pane.env"),
      Object.entries(credentials)
        .map(([variable, value]) => `export ${variable}=${shellQuote(value)}`)
        .join("\n") + "\n",
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
      if (stop.signal.aborted) {
        const stopDisposition = activeAdmission
          ? await settlePersonaLauncherStop(
              activeAdmission.client,
              activeAdmission.receipt,
              5_000,
            )
          : {
              settlement: "no-active-submission" as const,
              submissionId: undefined,
            };
        await save(join(run, "launcher-stop.json"), {
          ...stopDisposition,
          recordedAt: new Date().toISOString(),
        });
        report(`Launcher Stop: ${stopDisposition.settlement}.`);
        // Settlement is durable now; stop services before slower browser cleanup
        // so terminal Ctrl-C cannot orphan the launcher's process groups.
        stopStartedServices();
      }
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
        stopStartedServices();
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
      "list-cases": { type: "boolean" },
      objective: { type: "string" },
      "initial-net": { type: "string" },
      route: { type: "string" },
      "brunch-model": { type: "string" },
      "brunch-thinking": { type: "string" },
      "persona-model": { type: "string" },
      "persona-thinking": { type: "string" },
      "persona-verbosity": { type: "string" },
      "persona-disclosure": { type: "string" },
      resume: { type: "string" },
      "run-persona": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    report(
      "Usage: yarn brunch:persona --case <name-or-directory> [--objective <private objective>] [--route </path?search>] [--initial-net <sdcpn.json>] [--brunch-model <provider/id>] [--brunch-thinking <level>] [--persona-model <provider/id>] [--persona-thinking <level>] [--persona-verbosity terse|default|expansive] [--persona-disclosure reticent|default|forthcoming]\nDiscover cases: yarn brunch:persona --list-cases\nDefault: empty net on /; optional --initial-net stages a model and is not a from-scratch run. --objective is fresh-run-only and is neither retained nor reapplied on resume. Starts owned services and a fresh headed Chrome window; pauses for Enter before sending anything. Defaults: Brunch openai/gpt-5.6-sol low, persona anthropic/claude-sonnet-4-6 low, persona verbosity default, persona disclosure default. Native usage is retained; there is no automatic budget cutoff. Requires macOS Chrome, Pi, Herdr, unused BRUNCH_CHAT_PORT/BRUNCH_PANEL_PORT, and each selected provider's API key (OPENAI_API_KEY or ANTHROPIC_API_KEY). Ctrl-C stops owned resources; run data is retained.",
    );
    report(
      "Resume: yarn brunch:persona --resume <run-directory>\nReuses the original profile, database, exact Pi session, and retained effective persona axes. Fresh axis flags and all other fresh-run options are rejected. --objective is neither retained nor reapplied. Set the original BRUNCH_PANEL_PORT; choose an unused BRUNCH_CHAT_PORT. Pauses before backend recovery. Old accounting ledgers are preserved but not consulted.\nOperator guide: apps/brunch-agent/.pi/extensions/brunch-persona-testing/README.md",
    );
  } else if (values["list-cases"]) {
    const cases = await listPersonaCases();
    report(
      `${cases.length} persona cases in ${casesRoot}:\n${cases.join("\n")}`,
    );
  } else {
    const selected = values.case;
    const directory =
      selected &&
      (isAbsolute(selected) || selected.includes("/")
        ? resolve(process.env.INIT_CWD ?? process.cwd(), selected)
        : join(casesRoot, selected));
    const resumeRun = async () => {
      if (
        !values.resume ||
        values.case ||
        values.objective ||
        values.route ||
        values["initial-net"] ||
        values["brunch-model"] ||
        values["brunch-thinking"] ||
        values["persona-model"] ||
        values["persona-thinking"] ||
        values["persona-verbosity"] ||
        values["persona-disclosure"] ||
        values["run-persona"]
      )
        throw new Error(
          "--resume cannot be combined with fresh-run options or --run-persona",
        );
      const retained = await readPersonaResume(
        resolve(process.env.INIT_CWD ?? process.cwd(), values.resume),
      );
      await launchPersona(
        retained.config.caseDirectory,
        undefined,
        retained.config.route,
        undefined,
        retained,
      );
    };
    const task = values.resume
      ? resumeRun()
      : values["run-persona"]
        ? runPersona(resolve(values["run-persona"]))
        : directory
          ? launchPersona(
              directory,
              values.objective,
              values.route,
              values["initial-net"]
                ? resolve(
                    process.env.INIT_CWD ?? process.cwd(),
                    values["initial-net"],
                  )
                : undefined,
              undefined,
              resolvePersonaRoleSettings({
                brunchModel: values["brunch-model"],
                brunchThinking: values["brunch-thinking"],
                personaModel: values["persona-model"],
                personaThinking: values["persona-thinking"],
              }),
              resolvePersonaAxisSettings({
                personaVerbosity: values["persona-verbosity"],
                personaDisclosure: values["persona-disclosure"],
              }),
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
