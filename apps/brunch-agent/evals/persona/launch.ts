/* eslint-disable no-await-in-loop -- Local services start in order; readiness is polled until ready or cancelled. */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
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

import { FlueExecutionError } from "@flue/sdk";
import { chromium, type Page } from "@playwright/test";
import { loadEnv } from "vite";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import { brunchEnv } from "../../src/env.ts";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_THINKING,
} from "../../src/shared/chat-model.ts";
import { writeRunPacket } from "../petrinaut/run-packet.ts";
import { openPersonaBrowserBridge } from "./browser-bridge.ts";
import {
  PersonaBrowserTurnError,
  offeredQuestionsOf,
  personaConversationClient,
  submitPersonaBrowserTurn,
} from "./browser-turn.ts";
import { guidanceManifest, verifyGuidanceResume } from "./guidance-manifest.ts";
import { hashHost, hashOrigins } from "./hosts/hash.ts";
import { websiteHost } from "./hosts/website.ts";
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
  appendAdmittedUtterance,
  appendAllowedDestructiveEdit,
} from "./launch/bridge-log.ts";
import { writePersonaBrief, writePersonaResumeBrief } from "./launch/brief.ts";
import { initialNetFileData } from "./launch/initial-net.ts";
import {
  personaSessionFileText,
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

import type { PersonaBrowserSession } from "./browser-turn.ts";
import type { PersonaHost, PersonaHostName, PersonaHostRun } from "./host.ts";
import type { AgentSendResult, FlueClient } from "@flue/sdk";

const execute = promisify(execFile);
const report = (text: string) => process.stdout.write(`${text}\n`);
const reportEvidenceFailure = (error: unknown) => {
  process.stderr.write(
    `Could not refresh the run's evidence: ${error instanceof Error ? error.message : String(error)}\n`,
  );
};
const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const casesRoot = join(repoRoot, "apps/brunch-agent/evals/petrinaut/cases");

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
  const [pack, openingText] = await Promise.all([
    readFile(join(directory, "situation-pack.md"), "utf8"),
    readFile(join(directory, "opening-message.md"), "utf8"),
  ]).catch((cause: unknown) => {
    throw new Error(
      `Case ${directory} requires readable situation-pack.md and opening-message.md files. Use --list-cases for available names.`,
      { cause },
    );
  });
  const opening = openingText.trim();
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
  agent,
  resume,
}: {
  title: string;
  url: string;
  browserProfile: string;
  roles: PersonaRoleSettings;
  agent: PersonaAgentSettings;
  resume: boolean;
}) =>
  `Chrome window: ${title}\nURL: ${url}\nProfile: ${browserProfile}\nBrunch: ${roles.brunchModel} (${roles.brunchThinking})\nPersona agent: ${personaAgentLabel(agent)}\nUsage is retained in native records; no automatic budget cutoff.\n${resume ? "Original document retained. Backend recovery and the persona agent have not started." : "No message has been sent."} Start your screen recording, then press Enter here.`;

export const personaSettingsRecord = (
  roles: PersonaRoleSettings,
  agent: PersonaAgentSettings,
) => ({
  brunchModel: roles.brunchModel,
  brunchThinking: roles.brunchThinking,
  personaAgent: agent,
});

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  /** The app whose page the persona's messages are typed into. */
  readonly host: PersonaHost;
  readonly caseDirectory: string;
  readonly objective?: string;
  readonly initialNetPath?: string;
  readonly resume?: Awaited<ReturnType<typeof readPersonaResume>>;
  readonly roles?: PersonaRoleSettings;
  /** Undefined on resume reuses the original run's agent. */
  readonly agent?: PersonaAgentSettings;
  /** Wait for Enter before the first message; only possible on a TTY. */
  readonly recordingPause?: boolean;
  /** Stop the run once Brunch has replied to this many persona messages. */
  readonly maxMessages?: number;
  /** When the persona stops, keep Chrome and services open for the operator. */
  readonly hold?: boolean;
};

/**
 * One local command: services, Chrome, the browser bridge and, optionally,
 * the persona agent. The run directory holds data plus the bridge helper.
 */
const launchPersona = async ({
  host,
  caseDirectory,
  objective,
  initialNetPath,
  resume,
  roles = resolvePersonaRoleSettings(),
  agent,
  recordingPause: pauseForRecording = true,
  maxMessages,
  hold = false,
}: PersonaLaunchOptions) => {
  const manifest = resume
    ? await verifyGuidanceResume(resume.config.guidance, host.guidance)
    : await guidanceManifest(host.guidance);
  const { pack, opening } = resume
    ? { pack: "", opening: "" }
    : await readPersonaCase(caseDirectory);
  const settings = resume ? roleSettingsFromRun(resume.config) : roles;
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
  const initialNet =
    initialNetPath === undefined
      ? undefined
      : await readFile(initialNetPath).then((bytes) => {
          const parsed = parseSDCPNFile(
            initialNetFileData(JSON.parse(bytes.toString("utf8"))),
          );
          if (!parsed.ok) throw new Error(parsed.error);
          const { title, ...sdcpn } = parsed.sdcpn;
          return {
            title,
            sdcpn,
            sourceSha256: createHash("sha256").update(bytes).digest("hex"),
          };
        });
  const runs = join(appRoot, ".data-wipe-me/persona-runs");
  await mkdir(runs, { recursive: true });
  const run = resume?.run ?? (await mkdtemp(join(runs, "run-")));
  const stop = new AbortController();
  const baseEnvironment = personaEnvironment(settings);
  baseEnvironment[brunchEnv.devDbPath] = join(run, "conversation.db");
  baseEnvironment[brunchEnv.dbKind] = "sqlite";
  delete baseEnvironment[brunchEnv.chatDbPath];
  const hostRun: PersonaHostRun = await host.prepare({
    environment: baseEnvironment,
    run,
    retained: resume?.config,
    signal: stop.signal,
    report,
  });
  const env = hostRun.environment;
  const browserProfile =
    resume?.config.browserProfile ??
    (await mkdtemp(join(tmpdir(), "brunch-persona-browser-")));
  let record: Record<string, unknown> = {
    host: host.name,
    caseDirectory,
    guidance: manifest,
    ...(!resume
      ? {
          caseSha256: createHash("sha256")
            .update(JSON.stringify({ pack, opening, objective }))
            .digest("hex"),
        }
      : {}),
    ...personaSettingsRecord(settings, agentSettings),
    databasePath: env[brunchEnv.devDbPath],
    browserProfile,
    ...hostRun.record,
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
  const started: ChildProcess[] = [];
  /** Whether the signal reached the process group; false once it has gone. */
  const signalGroup = (pid: number, signal: NodeJS.Signals | 0) => {
    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ESRCH"
      ) {
        throw error;
      }
      return false;
    }
  };
  let servicesStopped: Promise<void> | undefined;
  /** Ends the owned process groups and settles once every one has exited. */
  const stopStartedServices = () => {
    servicesStopped ??= (async () => {
      const groups = started.flatMap((child) =>
        child.pid !== undefined &&
        child.exitCode === null &&
        child.signalCode === null &&
        signalGroup(child.pid, "SIGTERM")
          ? [child.pid]
          : [],
      );
      // Services flush their logs and the conversation store on SIGTERM;
      // one that has not exited by then is killed so the launcher can finish.
      const deadline = Date.now() + 10_000;
      while (groups.some((pid) => signalGroup(pid, 0))) {
        if (Date.now() > deadline) {
          for (const pid of groups) signalGroup(pid, "SIGKILL");
          return;
        }
        await delay(100);
      }
    })();
    return servicesStopped;
  };
  let browser:
    | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
    | undefined;
  let page: Page | undefined;
  let bridge: Awaited<ReturnType<typeof openPersonaBrowserBridge>> | undefined;
  // Retained on resume; on a fresh run, admitted by the persona's opening.
  let session: PersonaBrowserSession | undefined;
  let agentProcess: PersonaAgentProcess | undefined;
  // Set from bridge and child-process callbacks. Once `held`, the operator owns
  // the browser: the persona can send nothing, and its exit ends nothing.
  const lifecycle = { endedByPersona: false, agentExited: false, held: false };
  let activeAdmission:
    | { client: FlueClient; receipt: AgentSendResult }
    | undefined;
  const interrupt = () => {
    if (stop.signal.aborted) return;
    stop.abort();
  };
  /** Where the persona stops: holds the run for the operator, or ends it. */
  const personaStopped = () => {
    if (!hold) {
      interrupt();
      return;
    }
    if (lifecycle.held || stop.signal.aborted) return;
    lifecycle.held = true;
    report(
      "Holding Chrome and services for you; the persona can send nothing more. Ctrl-C here, or closing Chrome, ends the run.",
    );
  };
  // A foreground agent shares this terminal; its own Ctrl-C must not end the run.
  const onInterruptKey = () => {
    if (agentProcess?.kind !== "foreground" || lifecycle.agentExited)
      interrupt();
  };
  process.on("SIGINT", onInterruptKey);
  process.on("SIGTERM", interrupt);
  process.on("SIGHUP", interrupt);
  try {
    const preflight = await execute(
      process.execPath,
      [
        "--experimental-strip-types",
        join(appRoot, "src/server/dev-configuration-preflight.ts"),
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
    const { services } = hostRun;
    const available = await Promise.all(
      services.map((service) => responds(service.readyUrl, stop.signal)),
    );
    if (available.includes(true))
      throw new Error(
        host.name === "website"
          ? `Persona needs its own services. Leave existing services running and choose unused ${brunchEnv.chatPort} and ${brunchEnv.panelPort} values.`
          : `Persona needs its own Brunch at ${services.map((service) => service.readyUrl).join(", ")}; another one is answering there. One HASH persona run uses the machine at a time.`,
      );
    report("Building local app dependencies…");
    await execute(
      "turbo",
      [
        "run",
        "build",
        ...hostRun.buildFilters.flatMap((filter) => ["--filter", filter]),
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
        !(await responds(service.readyUrl, stop.signal, { allowLoading: true }))
      ) {
        if (startError) throw startError;
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error(`${service.script} exited; see ${run}`);
        await delay(100, undefined, { signal: stop.signal });
      }
    };
    for (const service of services) {
      // Flue startup may resume inference. On resume only the panel starts before recording.
      if (!resume || !service.recovers) await startService(service);
    }
    browser = await chromium.launchPersistentContext(browserProfile, {
      executablePath: chromeExecutable,
      headless: false,
      viewport: null,
      // The launcher's own handlers stop the run and close the browser; Playwright's
      // would kill it and exit before cleanup retains the run.
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
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
    const personaPage = page;
    const recordingPause = async () => {
      const title = `Brunch persona · ${basename(run)} · ready to record`;
      await personaPage.evaluate((value) => {
        document.title = value;
      }, title);
      if (!pauseForRecording || !process.stdin.isTTY) return;
      // Only here: a window that takes focus later would catch keystrokes
      // meant for another, and the bridge refuses to overwrite a draft.
      await personaPage.bringToFront();
      report(
        recordingReadySummary({
          title,
          url: personaPage.url(),
          browserProfile,
          roles: settings,
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
      await hostRun.reopen(personaPage, retained.session);
      // A host that names the actor from its session cookie needs it here too.
      const cookie = (await personaPage.context().cookies(retained.session.url))
        .map(({ name, value }) => `${name}=${value}`)
        .join("; ");
      const reattached = {
        ...retained.session,
        ...(cookie === "" ? {} : { cookie }),
      };
      await recordingPause();
      for (const service of services)
        if (service.recovers) await startService(service);
      return reconcilePersonaResume(
        personaPage,
        reattached,
        retained.lastUtterance,
        hostRun.reload,
        stop.signal,
      );
    };
    report(
      resume
        ? "Reopening the original browser document…"
        : "Opening a fresh browser panel; the persona sends the opening…",
    );
    const resumed = resume ? await reopen(resume) : undefined;
    if (!resume) {
      record = {
        ...record,
        ...(await hostRun.open(personaPage, {
          initialNet,
          name: `${basename(caseDirectory)} · persona ${basename(run)}`,
        })),
      };
      await save(join(run, "run.json"), record);
      await recordingPause();
    }
    const sessionClient = personaConversationClient;
    if (resumed) {
      ({ session } = resumed);
      await writeProofArtifacts(join(run, "evidence"), resumed.snapshot);
    }
    let repliedMessages = 0;
    bridge = await openPersonaBrowserBridge({
      opening: resume ? undefined : opening,
      prompt: async (utterance, turn) => {
        if (lifecycle.held)
          throw new Error(
            "The operator has taken over this conversation. Send nothing more; run `persona end` and report.",
          );
        await verifyGuidanceResume(manifest, host.guidance);
        let logged = false;
        try {
          const result = await submitPersonaBrowserTurn(personaPage, utterance, {
            session,
            signal: AbortSignal.any([turn.signal, stop.signal]),
            onAllowedEdit: (edit) => appendAllowedDestructiveEdit(run, edit),
            onAdmission: async (admitted, receipt, sent) => {
              activeAdmission = { client: sessionClient(admitted), receipt };
              // Each submission carries the browser's current cookies.
              if (session !== undefined) session = admitted;
              // Later admissions in the same turn are browser-tool continuations.
              if (logged) return;
              logged = true;
              // Brunch has the utterance; a failed log write must not read as unadmitted.
              turn.admitted(sent);
              if (turn.opening) {
                session = admitted;
                // Retained even if the reply fails; resume needs the identity.
                await writeFile(
                  join(run, "session.json"),
                  personaSessionFileText(admitted),
                  { mode: 0o600 },
                );
              }
              await appendAdmittedUtterance(run, {
                source: turn.opening ? "opening" : "persona",
                message: sent,
                submissionId: receipt.submissionId,
                personaAgent: agentSettings,
              });
            },
          });
          // Brunch has replied: the persona gets the reply even when the
          // evidence could not be refreshed, which is reported here instead.
          await writeProofArtifacts(join(run, "evidence"), result.snapshot)
            .then(() =>
              hostRun.capture(
                personaPage,
                result.session,
                join(run, "evidence"),
              ),
            )
            .catch(reportEvidenceFailure);
          if (!turn.opening) repliedMessages += 1;
          if (maxMessages !== undefined && repliedMessages >= maxMessages)
            // After the bridge has delivered this reply.
            setImmediate(() => {
              report(`Message limit reached: ${maxMessages} persona messages.`);
              personaStopped();
            });
          return {
            text: result.reply.text,
            submissionIds: result.submissionIds,
            questions: offeredQuestionsOf(
              result.snapshot,
              result.submissionIds,
            ),
          };
        } catch (error) {
          if (error instanceof PersonaBrowserTurnError)
            await writeProofArtifacts(join(run, "evidence"), error.snapshot);
          throw error;
        } finally {
          if (!stop.signal.aborted) activeAdmission = undefined;
        }
      },
      getState: () => ({
        run,
        conversationId: session?.conversationId,
        url: personaPage.url(),
      }),
      getTranscript: async () =>
        session === undefined
          ? []
          : personaTranscriptFrom(await sessionClient(session).history()),
      end: (reason) => {
        lifecycle.endedByPersona = true;
        report(`Persona ended the conversation${reason ? `: ${reason}` : "."}`);
        personaStopped();
      },
    });
    const helper = await writePersonaHelper(run, bridge.socketPath);
    const brief = resumed
      ? await writePersonaResumeBrief({
          run,
          helper,
          settlement: resumed.settlement,
          reply: resumed.reply,
          questions: resumed.questions,
        })
      : await writePersonaBrief({ run, helper, objective, opening, pack });
    await save(join(run, "run.json"), {
      ...record,
      socketPath: bridge.socketPath,
      startedPids: started.map((child) => child.pid),
    });
    // Outside the repository, so the agent loads none of its AGENTS.md or CLAUDE.md files.
    const agentDirectory = await mkdtemp(
      join(tmpdir(), "brunch-persona-agent-"),
    );
    const launchPrompt = personaLaunchPrompt(brief);
    const agentCommand = personaAgentShellCommand(agentSettings, launchPrompt);
    if (agentCommand === undefined) {
      report(
        `Browser bridge ready. Start any coding agent in ${agentDirectory} with this prompt:\n\n  ${launchPrompt}\n\nPersona command: ${helper}\nCtrl-C stops this launcher and its owned resources; run data is retained.`,
      );
    } else {
      agentProcess = await startPersonaAgent({
        run,
        cwd: agentDirectory,
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
          personaStopped();
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
        // so terminal Ctrl-C cannot orphan the launcher's process groups. The
        // packet step below awaits the same stop and reports any failure.
        stopStartedServices().catch(() => undefined);
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
          if (page && !page.isClosed() && session !== undefined)
            await hostRun
              .capture(page, session, join(run, "evidence"))
              .catch(reportEvidenceFailure);
        } finally {
          await browser?.close();
        }
      } finally {
        await hostRun.release();
        await stopStartedServices();
        // After the services stop, the server log and conversation store are final.
        await writeRunPacket(run)
          .then(() => refreshProofManifest(join(run, "evidence")))
          .then(
            () => report(`Run packet: ${join(run, "evidence", "packet.md")}`),
            (error: unknown) =>
              process.stderr.write(
                `Could not write the run packet (retry with \`yarn workspace @apps/brunch-agent packet:run ${run}\`): ${String(error)}\n`,
              ),
          );
        report(`Retained run: ${run}`);
      }
      if (agentProcess?.kind === "foreground" && !lifecycle.agentExited) {
        report("The run is closed; exit the persona agent when you are done.");
        await agentProcess.exited.catch(() => undefined);
      }
    } finally {
      process.removeListener("SIGINT", onInterruptKey);
      process.removeListener("SIGTERM", interrupt);
      process.removeListener("SIGHUP", interrupt);
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
      "interview-length": { type: "string" },
      route: { type: "string" },
      host: { type: "string" },
      "brunch-model": { type: "string" },
      "brunch-thinking": { type: "string" },
      agent: { type: "string" },
      "agent-command": { type: "string" },
      "persona-model": { type: "string" },
      "persona-thinking": { type: "string" },
      "skip-recording-pause": { type: "boolean" },
      "max-messages": { type: "string" },
      hold: { type: "boolean" },
      resume: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    report(
      `Usage: yarn brunch:persona --case <name-or-directory> [--host website|hash] [--objective <the person's aim>] [--initial-net <sdcpn.json>] [--brunch-model <provider/id>] [--brunch-thinking <level>] [website options] [agent options]\nDiscover cases: yarn brunch:persona --list-cases\nHosts: website (default) runs Brunch on the Petrinaut website on free ports; hash runs it in the HASH app's process editor, signed in as a seeded user, against the HASH stack you have started, with Brunch at ${hashOrigins.brunch}, which the frontend must have been started with (HASH_BRUNCH_AGENT_ORIGIN). One HASH run uses the machine at a time; each creates a process in the user's web.\nWebsite options: --route </path?search>, --interview-length quick|standard|thorough|deep.\nDefault: empty net on / (the website) or a new empty process (HASH); optional --initial-net stages a model and is not a from-scratch run. --interview-length turns on the website's Interview length at that level for the whole run; without it the run has none. --objective is a private aim for the person, phrased in their own terms; without it the person's goal comes from the case. --objective is fresh-run-only and is neither retained nor reapplied on resume. Starts owned services, a fresh headed Chrome window and a browser bridge; on an interactive terminal, pauses for Enter before sending anything (--skip-recording-pause skips it). --max-messages <n> stops the run once Brunch has replied to the persona's nth message (the case's opening is not counted). --hold keeps Chrome and services open for you when the persona stops, at that limit, on persona end or when its agent exits, until Ctrl-C or closing Chrome. Defaults: Brunch ${DEFAULT_CHAT_MODEL} ${DEFAULT_CHAT_THINKING}. Native usage is retained; ordinary external-agent runs have no automatic budget cutoff. Takes free ports unless ${brunchEnv.chatPort} or ${brunchEnv.panelPort} is set, and names the panel in portless when it is installed. --initial-net also takes a retained run's evidence/net.json. Requires macOS Chrome and Brunch's provider API key. The persona stops by its own rule; Ctrl-C here or <run>/bin/persona end stops the run at any point, stopping owned resources and retaining run data.`,
    );
    report(
      `Agent options:\n  --agent ${personaAgentPresets.join("|")}   Start that agent with the persona brief.\n  --agent-command '<shell command with {prompt}>'   Start any other agent; {prompt} becomes the quoted launch prompt.\n  --persona-model <model>   Passed to the --agent preset's own model flag.\n  --persona-thinking <level>   Passed to pi's --thinking (only with --agent pi).\nThe agent runs in a Herdr pane when HERDR_ENV=1, otherwise in this terminal. Without an agent option the launcher prints the launch prompt for you to give any agent. The agent talks to Brunch through <run>/bin/persona (say, transcript, state, end, rpc).`,
    );
    report(
      `Resume the Brunch conversation: yarn brunch:persona --resume <run-directory> [agent options] [--skip-recording-pause]\nReuses the original profile and database, and starts a fresh persona agent session with a resume notice (the original agent and model unless agent options are given); the earlier agent session is not resumed. Fresh-run options are rejected; --objective is neither retained nor reapplied. Returns to the panel port in run.json and takes a free chat port unless ${brunchEnv.panelPort} or ${brunchEnv.chatPort} is set. Pauses before backend recovery. Old accounting ledgers are preserved but not consulted.\nOperator guide: apps/brunch-agent/evals/persona/README.md`,
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
    const maxMessages =
      values["max-messages"] === undefined
        ? undefined
        : Number(values["max-messages"]);
    const invalidMaxMessages =
      maxMessages !== undefined &&
      !(Number.isInteger(maxMessages) && maxMessages > 0);
    const hostName = values.host ?? "website";
    const isHostName = (name: string): name is PersonaHostName =>
      name === "website" || name === "hash";
    const resumeRun = async (resumeDirectory: string) => {
      if (
        values.case ||
        values.objective ||
        values.host ||
        values.route ||
        values["initial-net"] ||
        values["interview-length"] ||
        values["brunch-model"] ||
        values["brunch-thinking"]
      )
        throw new Error("--resume cannot be combined with fresh-run options");
      const selectedAgent = agent();
      const retained = await readPersonaResume(
        resolve(process.env.INIT_CWD ?? process.cwd(), resumeDirectory),
      );
      const { config } = retained;
      await launchPersona({
        // The host takes its own settings back from the retained run.
        host: config.host === "hash" ? hashHost() : websiteHost(),
        caseDirectory: config.caseDirectory,
        resume: retained,
        agent: selectedAgent,
        recordingPause,
        maxMessages,
        hold: values.hold,
      });
    };
    const freshRun = async (caseDirectory: string) => {
      if (!isHostName(hostName))
        throw new Error(`--host takes website or hash, not ${hostName}`);
      if (
        hostName === "hash" &&
        (values.route !== undefined || values["interview-length"] !== undefined)
      )
        throw new Error(
          "--route and --interview-length are website options; the HASH app has neither",
        );
      return launchPersona({
        host:
          hostName === "hash"
            ? hashHost()
            : websiteHost({
                route: values.route,
                interviewLength: values["interview-length"],
              }),
        caseDirectory,
        objective: values.objective,
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
        agent: agent() ?? {},
        recordingPause,
        maxMessages,
        hold: values.hold,
      });
    };
    const task = invalidMaxMessages
      ? Promise.reject(
          new Error("--max-messages takes a positive whole number"),
        )
      : values.resume
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
