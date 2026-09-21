/* eslint-disable no-await-in-loop -- Product arms and scenarios intentionally run serially. */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

import { chromium } from "@playwright/test";

import {
  defaultChatOrigin,
  localPanelListen,
} from "../../http/local-origins.ts";
import {
  writeArmArtifacts,
  writeManifest,
  writeRunRecord,
  writeScenarioComparison,
} from "./artifacts.ts";
import { runBrowserArm } from "./browser-run.ts";
import {
  evaluationEnvironment,
  resolveMatchedParityConfiguration,
  type MatchedParityConfiguration,
} from "./configuration.ts";
import { matchedParityScenarios } from "./scenarios.ts";

const execute = promisify(execFile);
const appRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const repoRoot = resolve(appRoot, "../..");
const panelOrigin = `http://${localPanelListen.host}:${localPanelListen.port}`;

export interface MatchedParityRunDependencies {
  readonly execute: (
    configuration: MatchedParityConfiguration,
  ) => Promise<void>;
  readonly report: (message: string) => void;
}

export const matchedParityPlan = (
  configuration: MatchedParityConfiguration,
) => ({
  execution: configuration.executePaid ? "paid-authorized" : "dry-run",
  order: matchedParityScenarios.flatMap(({ id }) => [
    `${id}/stock`,
    `${id}/brunch`,
  ]),
  outputRoot: configuration.outputRoot,
  provider: configuration.provider,
  stock: configuration.stock,
  brunch: configuration.brunch,
  maxTurnMs: configuration.maxTurnMs,
  freshBrowserContextPerArm: true,
});

/** Dry-run is the default and cannot call the injected paid executor. */
export const runMatchedParityEvaluation = async (
  configuration: MatchedParityConfiguration,
  dependencies: MatchedParityRunDependencies,
) => {
  dependencies.report(
    JSON.stringify(matchedParityPlan(configuration), null, 2),
  );
  if (!configuration.executePaid) {
    dependencies.report(
      "Dry run only. No browser, provider, model, or inference process was started.",
    );
    return;
  }
  await dependencies.execute(configuration);
};

const responds = async (url: string, signal?: AbortSignal) => {
  try {
    const response = await fetch(url, { signal });
    return response.ok;
  } catch {
    return false;
  }
};

const startService = async (input: {
  readonly configuration: MatchedParityConfiguration;
  readonly environment: NodeJS.ProcessEnv;
  readonly script: string;
  readonly started: ChildProcess[];
  readonly url: string;
}) => {
  const log = await open(
    join(
      input.configuration.outputRoot,
      `${input.script.replaceAll(":", "-")}.log`,
    ),
    "a",
    0o600,
  );
  const child = spawn("yarn", [input.script], {
    cwd: repoRoot,
    detached: true,
    env: input.environment,
    stdio: ["ignore", log.fd, log.fd],
  });
  input.started.push(child);
  await log.close();
  const deadline = AbortSignal.timeout(120_000);
  while (!(await responds(input.url, deadline))) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`${input.script} exited before readiness.`);
    await delay(200, undefined, { signal: deadline });
  }
};

const stopServices = async (started: readonly ChildProcess[]) => {
  const exits: Promise<void>[] = [];
  for (const child of started) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null)
      continue;
    exits.push(
      new Promise((resolveExit) => child.once("exit", () => resolveExit())),
    );
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ESRCH"
      )
        throw error;
    }
  }
  const allExited = Promise.allSettled(exits);
  const settled = await Promise.race([
    allExited.then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!settled) {
    for (const child of started) {
      if (child.pid && child.exitCode === null && child.signalCode === null)
        process.kill(-child.pid, "SIGKILL");
    }
    await allExited;
  }
};

const executePaidEvaluation = async (
  configuration: MatchedParityConfiguration,
) => {
  const environment = evaluationEnvironment(configuration);
  const started: ChildProcess[] = [];
  await mkdir(configuration.outputRoot, { recursive: true });
  await writeRunRecord(
    configuration.outputRoot,
    configuration,
    matchedParityScenarios,
  );
  if ((await responds(defaultChatOrigin)) || (await responds(panelOrigin)))
    throw new Error(
      "Matched parity evaluation requires its own Brunch and panel ports; stop existing services or choose unused BRUNCH_CHAT_PORT and BRUNCH_PANEL_PORT values.",
    );

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await execute(
      "yarn",
      [
        "exec",
        "turbo",
        "run",
        "build",
        "--filter",
        "@apps/brunch-agent...",
        "--filter",
        "@apps/petrinaut-website...",
        "--env-mode=loose",
      ],
      { cwd: repoRoot, env: environment },
    );
    await startService({
      configuration,
      environment,
      script: "dev:brunch:server",
      started,
      url: `${defaultChatOrigin}/health`,
    });
    await startService({
      configuration,
      environment,
      script: "dev:brunch:panel",
      started,
      url: panelOrigin,
    });
    browser = await chromium.launch({ headless: true });

    for (const scenario of matchedParityScenarios) {
      const scenarioDirectory = join(configuration.outputRoot, scenario.id);
      const results = [];
      for (const arm of ["stock", "brunch"] as const) {
        const context = await browser.newContext();
        try {
          const result = await runBrowserArm({
            arm,
            configuration,
            context,
            origin: panelOrigin,
            scenario,
          });
          results.push(result);
          await writeArmArtifacts(join(scenarioDirectory, arm), result);
        } finally {
          await context.close();
        }
      }
      const [stock, brunch] = results;
      if (!stock || !brunch) throw new Error("Both serial arms must complete.");
      await writeScenarioComparison(scenarioDirectory, stock, brunch);
    }
  } finally {
    await browser?.close();
    await stopServices(started);
  }
  await writeManifest(configuration.outputRoot);
};

const main = async () => {
  const parsed = parseArgs({
    options: {
      "execute-paid": { type: "boolean", default: false },
      output: { type: "string" },
    },
    strict: true,
  });
  const environment = {
    ...process.env,
    ...(parsed.values.output === undefined
      ? {}
      : { MATCHED_PARITY_OUTPUT_ROOT: parsed.values.output }),
  };
  const configuration = resolveMatchedParityConfiguration(environment, {
    executePaid: parsed.values["execute-paid"],
  });
  await runMatchedParityEvaluation(configuration, {
    execute: executePaidEvaluation,
    report: (message) => process.stdout.write(`${message}\n`),
  });
  if (configuration.executePaid)
    process.stdout.write(`Artifacts: ${configuration.outputRoot}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
