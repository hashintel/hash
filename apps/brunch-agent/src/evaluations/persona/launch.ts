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

import { brunchEnv } from "@hashintel/brunch-agent";
import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import { DEFAULT_CHAT_MODEL, DEFAULT_CHAT_THINKING } from "../../chat-model.ts";
import { agentOwnershipHeaders } from "../../conversation/identity.ts";
import {
  defaultChatOrigin,
  localPanelListen,
} from "../../http/local-origins.ts";
import { openPersonaBrowserBridge } from "./browser-bridge.ts";
import { submitPersonaBrowserTurn } from "./browser-turn.ts";
import {
  agentSettingsFromRun,
  personaAgentLabel,
  personaAgentPresets,
  personaAgentShellCommand,
  personaLaunchPrompt,
  resolvePersonaAgentSettings,
  startPersonaAgent,
  writePersonaHelper,
  type PersonaAgentProcess,
  type PersonaAgentSettings,
} from "./launch/agent.ts";
import {
  axisSettingsFromRun,
  resolvePersonaAxisSettings,
  type PersonaAxisSettings,
} from "./launch/axis-settings.ts";
import { appendAdmittedUtterance } from "./launch/bridge-log.ts";
import { writePersonaBrief, writePersonaResumeBrief } from "./launch/brief.ts";
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
import { personaTranscriptFrom } from "./launch/transcript.ts";
import {
  refreshProofManifest,
  writeProofArtifacts,
} from "./proof-artifacts.ts";

import type { AgentSendResult, FlueClient } from "@flue/sdk";

const execute = promisify(execFile);
const report = (text: string) => process.stdout.write(`${text}\n`);
const appRoot = fileURLToPath(new URL("../../../", import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const panelOrigin = `http://${localPanelListen.host}:${localPanelListen.port}`;
const casesRoot = join(
  repoRoot,
  "libs/@hashintel/brunch-agent/evaluations/cases",
);

const listPersonaCases = async () => {
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

const save = (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
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
  loaded[brunchEnv.chatModel] = roles.brunchModel;
  loaded[brunchEnv.chatThinking] = roles.brunchThinking;
  // An explicit empty value also overrides Vite env files on backend startup.
  // Historical campaign ledgers must not gate persona requests or resumed runs.
  loaded[brunchEnv.stepAAccounting] = "";
  return loaded;
};

export const recordingReadySummary = ({
  title,
  url,
  browserProfile,
  roles,
  axes,
  agent,
  resume,
}: {
  title: string;
  url: string;
  browserProfile: string;
  roles: PersonaRoleSettings;
  axes: PersonaAxisSettings;
  agent: PersonaAgentSettings;
  resume: boolean;
}) =>
  `Chrome window: ${title}\nURL: ${url}\nProfile: ${browserProfile}\nBrunch: ${roles.brunchModel} (${roles.brunchThinking})\nPersona agent: ${personaAgentLabel(agent)}\nPersona axes: verbosity ${axes.personaVerbosity}; disclosure ${axes.personaDisclosure}\nUsage is retained in native records; no automatic budget cutoff.\n${resume ? "Original document retained. Backend recovery and the persona agent have not started." : "No message has been sent."} Start your screen recording, then press Enter here.`;

export const personaSettingsRecord = (
  roles: PersonaRoleSettings,
  axes: PersonaAxisSettings,
  agent: PersonaAgentSettings,
) => ({
  brunchModel: roles.brunchModel,
  brunchThinking: roles.brunchThinking,
  personaVerbosity: axes.personaVerbosity,
  personaDisclosure: axes.personaDisclosure,
  personaAgent: agent,
});

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

type PersonaLaunchOptions = {
  readonly caseDirectory: string;
  readonly objective?: string;
  readonly route?: string;
  readonly initialNetPath?: string;
  readonly resume?: Awaited<ReturnType<typeof readPersonaResume>>;
  readonly roles?: PersonaRoleSettings;
  readonly axes?: PersonaAxisSettings;
  /** Undefined on resume reuses the original run's agent. */
  readonly agent?: PersonaAgentSettings;
  /** Wait for Enter before the first message; only possible on a TTY. */
  readonly recordingPause?: boolean;
};

/**
 * One local command: services, Chrome, the browser bridge and, optionally,
 * the persona agent. The run directory holds data plus the bridge helper.
 */
const launchPersona = async ({
  caseDirectory,
  objective,
  route = "/",
  initialNetPath,
  resume,
  roles = resolvePersonaRoleSettings(),
  axes = resolvePersonaAxisSettings(),
  agent,
  recordingPause: pauseForRecording = true,
}: PersonaLaunchOptions) => {
  const { pack, opening } = resume
    ? { pack: "", opening: "" }
    : await readPersonaCase(caseDirectory);
  const settings = resume ? roleSettingsFromRun(resume.config) : roles;
  const axisSettings = resume ? axisSettingsFromRun(resume.config) : axes;
  const agentSettings =
    agent ?? (resume ? agentSettingsFromRun(resume.config) : {});
  if (
    (agentSettings.agent !== undefined ||
      agentSettings.agentCommand !== undefined) &&
    process.env.HERDR_ENV !== "1" &&
    !process.stdin.isTTY
  )
    throw new Error(
      "Without Herdr the persona agent needs an interactive terminal; run from a terminal or Herdr, or omit --agent and start the agent yourself",
    );
  if (resume && panelOrigin !== resume.config.panelOrigin)
    throw new Error(
      `Resume requires the original panel origin ${resume.config.panelOrigin}; set ${brunchEnv.panelPort} accordingly`,
    );
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
  env[brunchEnv.devDbPath] = join(run, "conversation.db");
  env[brunchEnv.dbKind] = "sqlite";
  delete env[brunchEnv.chatDbPath];
  const browserProfile =
    resume?.config.browserProfile ??
    (await mkdtemp(join(tmpdir(), "brunch-persona-browser-")));
  const record = {
    caseDirectory,
    ...personaSettingsRecord(settings, axisSettings, agentSettings),
    databasePath: env[brunchEnv.devDbPath],
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
    ...(resume ? { personaAgent: agentSettings } : {}),
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
  let agentProcess: PersonaAgentProcess | undefined;
  // Set from bridge and child-process callbacks.
  const lifecycle = { endedByPersona: false, agentExited: false };
  let activeAdmission:
    | { client: FlueClient; receipt: AgentSendResult }
    | undefined;
  const interrupt = () => {
    if (stop.signal.aborted) return;
    stop.abort();
  };
  // A foreground agent shares this terminal; its own Ctrl-C must not end the run.
  const onInterruptKey = () => {
    if (agentProcess?.kind !== "foreground") interrupt();
  };
  process.on("SIGINT", onInterruptKey);
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
      `Brunch ${settings.brunchModel} (${settings.brunchThinking}) configuration verified; credential validity untested.`,
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
        `Persona needs its own services. Leave existing services running and choose unused ${brunchEnv.chatPort} and ${brunchEnv.panelPort} values.`,
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
      if (!pauseForRecording || !process.stdin.isTTY) return;
      report(
        recordingReadySummary({
          title,
          url: personaPage.url(),
          browserProfile,
          roles: settings,
          axes: axisSettings,
          agent: agentSettings,
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
      return reconcilePersonaResume(
        personaPage,
        retained.session,
        retained.lastUtterance,
        stop.signal,
      );
    };
    report(
      resume
        ? "Reopening the original browser document…"
        : "Opening a fresh browser conversation…",
    );
    const opened = resume
      ? { kind: "resumed" as const, ...(await reopen(resume)) }
      : {
          kind: "fresh" as const,
          ...(await openPersonaConversation(personaPage, panelOrigin, opening, {
            route,
            sessionPath: join(run, "session.json"),
            signal: stop.signal,
            beforeOpening: recordingPause,
          })),
        };
    if (opened.kind === "fresh")
      await appendAdmittedUtterance(run, "opening", opening);
    documentId = documentIdFromInitialData(opened.session.initialData);
    await writeProofArtifacts(join(run, "evidence"), opened.snapshot);
    const flue = createFlueClient({
      url: opened.session.url,
      headers: agentOwnershipHeaders(opened.session),
    });
    bridge = await openPersonaBrowserBridge({
      prompt: async (message, turn) => {
        let logged = false;
        try {
          const result = await submitPersonaBrowserTurn(personaPage, message, {
            session: opened.session,
            signal: AbortSignal.any([turn.signal, stop.signal]),
            onAdmission: async (session, receipt) => {
              activeAdmission = {
                client: createFlueClient({
                  url: session.url,
                  headers: agentOwnershipHeaders(session),
                }),
                receipt,
              };
              // Later admissions in the same turn are browser-tool continuations.
              if (logged) return;
              logged = true;
              await appendAdmittedUtterance(
                run,
                "persona",
                message,
                receipt.submissionId,
              );
              turn.admitted();
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
            text: result.reply.text,
            submissionIds: result.submissionIds,
          };
        } finally {
          if (!stop.signal.aborted) activeAdmission = undefined;
        }
      },
      getState: () => ({
        run,
        conversationId: opened.session.conversationId,
        url: personaPage.url(),
      }),
      getTranscript: async () => personaTranscriptFrom(await flue.history()),
      end: (reason) => {
        lifecycle.endedByPersona = true;
        report(`Persona ended the conversation${reason ? `: ${reason}` : "."}`);
        interrupt();
      },
    });
    const helper = await writePersonaHelper(run, bridge.socketPath);
    const brief =
      opened.kind === "resumed"
        ? await writePersonaResumeBrief({
            run,
            helper,
            settlement: opened.settlement,
            reply: opened.reply,
          })
        : await writePersonaBrief({
            run,
            helper,
            axes: axisSettings,
            objective,
            opening,
            reply: opened.reply.text,
            pack,
          });
    await save(join(run, "run.json"), {
      ...record,
      socketPath: bridge.socketPath,
      startedPids: started.map((child) => child.pid),
    });
    const launchPrompt = personaLaunchPrompt(brief);
    const agentCommand = personaAgentShellCommand(agentSettings, launchPrompt);
    if (agentCommand === undefined) {
      report(
        `Browser bridge ready. Start any coding agent in ${run} with this prompt:\n\n  ${launchPrompt}\n\nPersona command: ${helper}\nCtrl-C stops this launcher and its owned resources; run data is retained.`,
      );
    } else {
      agentProcess = await startPersonaAgent({
        run,
        socketPath: bridge.socketPath,
        command: agentCommand,
      });
      if (agentProcess.kind === "herdr") {
        await save(join(run, "run.json"), {
          ...record,
          socketPath: bridge.socketPath,
          startedPids: started.map((child) => child.pid),
          pane: agentProcess.pane,
        });
        report(
          `Persona agent: Herdr pane ${agentProcess.pane}. The browser follows the same conversation. Ctrl-C here stops this launcher and its owned resources; run data is retained.`,
        );
      } else {
        const onAgentExit = () => {
          lifecycle.agentExited = true;
          interrupt();
        };
        void agentProcess.exited.then(onAgentExit, onAgentExit);
      }
    }
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
      if (agentProcess?.kind === "herdr") {
        const { pane } = agentProcess;
        // After `end` the agent still owes the operator its report.
        if (lifecycle.endedByPersona) report(`Persona pane ${pane} left open.`);
        else
          await execute("herdr", ["pane", "close", pane]).catch(() => {
            process.stderr.write(
              `Could not close persona pane ${pane}; inspect it in Herdr.\n`,
            );
          });
      }
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
      if (agentProcess?.kind === "foreground" && !lifecycle.agentExited) {
        report("The run is closed; exit the persona agent when you are done.");
        await agentProcess.exited.catch(() => undefined);
      }
    } finally {
      process.removeListener("SIGINT", onInterruptKey);
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
      "persona-verbosity": { type: "string" },
      "persona-disclosure": { type: "string" },
      agent: { type: "string" },
      "agent-command": { type: "string" },
      "persona-model": { type: "string" },
      "persona-thinking": { type: "string" },
      "skip-recording-pause": { type: "boolean" },
      resume: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    report(
      `Usage: yarn brunch:persona --case <name-or-directory> [--objective <private objective>] [--route </path?search>] [--initial-net <sdcpn.json>] [--brunch-model <provider/id>] [--brunch-thinking <level>] [--persona-verbosity terse|default|expansive] [--persona-disclosure reticent|default|forthcoming] [agent options]\nDiscover cases: yarn brunch:persona --list-cases\nDefault: empty net on /; optional --initial-net stages a model and is not a from-scratch run. --objective is fresh-run-only and is neither retained nor reapplied on resume. Starts owned services, a fresh headed Chrome window and a browser bridge; on an interactive terminal, pauses for Enter before sending anything (--skip-recording-pause skips it). Defaults: Brunch ${DEFAULT_CHAT_MODEL} ${DEFAULT_CHAT_THINKING}, persona verbosity default, persona disclosure default. Native usage is retained; there is no automatic budget cutoff. Requires macOS Chrome, unused ${brunchEnv.chatPort}/${brunchEnv.panelPort}, and Brunch's provider API key. Ctrl-C stops owned resources; run data is retained.`,
    );
    report(
      `Agent options:\n  --agent ${personaAgentPresets.join("|")}   Start that agent with the persona brief.\n  --agent-command '<shell command with {prompt}>'   Start any other agent; {prompt} becomes the quoted launch prompt.\n  --persona-model <model>   Passed to the --agent preset's own model flag.\n  --persona-thinking <level>   Passed to pi's --thinking (only with --agent pi).\nThe agent runs in a Herdr pane when HERDR_ENV=1, otherwise in this terminal. Without an agent option the launcher prints the launch prompt for you to give any agent. The agent talks to Brunch through <run>/bin/persona (say, transcript, state, end, rpc).`,
    );
    report(
      `Resume: yarn brunch:persona --resume <run-directory> [agent options] [--skip-recording-pause]\nReuses the original profile, database and retained effective persona axes, and starts a fresh persona agent with a resume notice (the original agent unless agent options are given). Fresh axis flags and all other fresh-run options are rejected. --objective is neither retained nor reapplied. Set the original ${brunchEnv.panelPort}; choose an unused ${brunchEnv.chatPort}. Pauses before backend recovery. Old accounting ledgers are preserved but not consulted.\nOperator guide: apps/brunch-agent/src/evaluations/persona/README.md`,
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
    const agentOptions = [
      values.agent,
      values["agent-command"],
      values["persona-model"],
      values["persona-thinking"],
    ];
    const agent = () =>
      agentOptions.some((value) => value !== undefined)
        ? resolvePersonaAgentSettings({
            agent: values.agent,
            agentCommand: values["agent-command"],
            personaModel: values["persona-model"],
            personaThinking: values["persona-thinking"],
          })
        : undefined;
    const recordingPause = !values["skip-recording-pause"];
    const resumeRun = async (resumeDirectory: string) => {
      if (
        values.case ||
        values.objective ||
        values.route ||
        values["initial-net"] ||
        values["brunch-model"] ||
        values["brunch-thinking"] ||
        values["persona-verbosity"] ||
        values["persona-disclosure"]
      )
        throw new Error("--resume cannot be combined with fresh-run options");
      const selectedAgent = agent();
      const retained = await readPersonaResume(
        resolve(process.env.INIT_CWD ?? process.cwd(), resumeDirectory),
      );
      await launchPersona({
        caseDirectory: retained.config.caseDirectory,
        route: retained.config.route,
        resume: retained,
        agent: selectedAgent,
        recordingPause,
      });
    };
    const freshRun = async (caseDirectory: string) =>
      launchPersona({
        caseDirectory,
        objective: values.objective,
        route: values.route,
        initialNetPath: values["initial-net"]
          ? resolve(
              process.env.INIT_CWD ?? process.cwd(),
              values["initial-net"],
            )
          : undefined,
        roles: resolvePersonaRoleSettings({
          brunchModel: values["brunch-model"],
          brunchThinking: values["brunch-thinking"],
        }),
        axes: resolvePersonaAxisSettings({
          personaVerbosity: values["persona-verbosity"],
          personaDisclosure: values["persona-disclosure"],
        }),
        agent: agent() ?? {},
        recordingPause,
      });
    const task = values.resume
      ? resumeRun(values.resume)
      : directory
        ? freshRun(directory)
        : Promise.reject(new Error("Supply --case <name-or-directory>"));
    await task.catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Persona launch failed"}\n`,
      );
      process.exitCode = 1;
    });
  }
}
