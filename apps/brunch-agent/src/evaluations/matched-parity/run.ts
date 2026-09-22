/* eslint-disable no-await-in-loop -- Evaluation arms and scenarios intentionally run serially. */
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
  type ArmExecutionAction,
  type ArmExecutionRecord,
} from "./artifacts.ts";
import { runBrowserArm } from "./browser-run.ts";
import {
  evaluationEnvironment,
  matchedParityArms,
  resolveMatchedParityConfiguration,
  type EvaluationArm,
  type MatchedParityConfiguration,
} from "./configuration.ts";
import { loadCompletedArm } from "./resume.ts";
import { matchedParityScenarios } from "./scenarios.ts";

import type { BrowserArmResult } from "./browser-run.ts";

const execute = promisify(execFile);
const appRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const repoRoot = resolve(appRoot, "../..");
const panelOrigin = `http://${localPanelListen.host}:${localPanelListen.port}`;

export const armArtifactDirectory = (
  outputRoot: string,
  scenarioId: string,
  arm: EvaluationArm,
) => join(outputRoot, scenarioId, arm);

export interface MatchedParityRunDependencies {
  readonly execute: (
    configuration: MatchedParityConfiguration,
    report: (message: string) => void,
  ) => Promise<void>;
  readonly report: (message: string) => void;
}

export const matchedParityPlan = (
  configuration: MatchedParityConfiguration,
) => ({
  execution: configuration.executePaid ? "paid" : "dry-run",
  order: matchedParityArms.flatMap((arm) =>
    matchedParityScenarios.map(({ id }) => ({
      arm,
      mode: configuration.arms[arm].websiteMode,
      scenarioId: id,
      action: configuration.resumeCompleted
        ? "reuse-complete-or-execute-missing"
        : "execute-fresh",
    })),
  ),
  outputRoot: configuration.outputRoot,
  provider: configuration.provider,
  stock: configuration.stock,
  brunch: configuration.brunch,
  arms: configuration.arms,
  budget: {
    allowanceUsd: configuration.budgetUsd,
    estimatedSpendUsd: null,
    note: "Future provider cost is unknown; paid execution warns before every arm.",
  },
  maxTurnMs: configuration.maxTurnMs,
  resumeCompleted: configuration.resumeCompleted,
  freshBrowserContextPerExecutedArm: true,
});

export const allowanceWarning = (input: {
  readonly arm: EvaluationArm;
  readonly budgetUsd: number;
  readonly knownObservedSpendUsd: number;
  readonly unknownSpendArmCount: number;
}): string => {
  const remaining = input.budgetUsd - input.knownObservedSpendUsd;
  return [
    `WARNING before ${input.arm}: remaining known allowance USD ${remaining.toFixed(6)} of ${input.budgetUsd.toFixed(6)}.`,
    "Estimated cost for the next arm is unknown, so sufficient allowance cannot be established.",
    `Observed provider cost so far is USD ${input.knownObservedSpendUsd.toFixed(6)}; ${input.unknownSpendArmCount} completed arm(s) have unknown cost.`,
    remaining <= 0
      ? "The known allowance is exhausted; continuing may exceed the standing allowance."
      : "Continuing may exceed the standing allowance; review this warning before launch.",
  ].join(" ");
};

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
  dependencies.report(
    allowanceWarning({
      arm: "S",
      budgetUsd: configuration.budgetUsd,
      knownObservedSpendUsd: 0,
      unknownSpendArmCount: 0,
    }),
  );
  await dependencies.execute(configuration, dependencies.report);
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
  readonly logName: string;
  readonly script: string;
  readonly url: string;
}) => {
  const log = await open(
    join(input.configuration.outputRoot, `${input.logName}.log`),
    "a",
    0o600,
  );
  const child = spawn("yarn", [input.script], {
    cwd: repoRoot,
    detached: true,
    env: input.environment,
    stdio: ["ignore", log.fd, log.fd],
  });
  await log.close();
  const deadline = AbortSignal.timeout(120_000);
  while (!(await responds(input.url, deadline))) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`${input.script} exited before readiness.`);
    await delay(200, undefined, { signal: deadline });
  }
  return child;
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

const buildForArm = async (
  configuration: MatchedParityConfiguration,
  arm: EvaluationArm,
  environment: NodeJS.ProcessEnv,
) => {
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
      "--force",
    ],
    { cwd: repoRoot, env: environment },
  );
  const expectedMode = configuration.arms[arm].websiteMode;
  if (
    expectedMode !== null &&
    environment.VITE_BRUNCH_EVALUATION_MODE !== expectedMode
  )
    throw new Error(
      `Website build for ${arm} did not receive its exact mode override.`,
    );
};

const executePaidEvaluation = async (
  configuration: MatchedParityConfiguration,
  report: (message: string) => void,
) => {
  const startedAt = new Date().toISOString();
  const armRecords: ArmExecutionRecord[] = [];
  const resultsByScenario = new Map<
    string,
    Partial<Record<EvaluationArm, BrowserArmResult>>
  >();
  const executionByScenario = new Map<
    string,
    Partial<Record<EvaluationArm, ArmExecutionAction>>
  >();
  await mkdir(configuration.outputRoot, { recursive: true });
  if (!configuration.resumeCompleted)
    await writeRunRecord(
      configuration.outputRoot,
      configuration,
      matchedParityScenarios,
      { arms: armRecords, startedAt },
    );
  if ((await responds(defaultChatOrigin)) || (await responds(panelOrigin)))
    throw new Error(
      "Matched parity evaluation requires its own Brunch and panel ports; stop existing services or choose unused BRUNCH_CHAT_PORT and BRUNCH_PANEL_PORT values.",
    );

  const serverEnvironment = evaluationEnvironment(configuration, "I");
  const started: ChildProcess[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await buildForArm(configuration, "I", serverEnvironment);
    started.push(
      await startService({
        configuration,
        environment: serverEnvironment,
        logName: "dev-brunch-server",
        script: "dev:brunch:server",
        url: `${defaultChatOrigin}/health`,
      }),
    );
    browser = await chromium.launch({ headless: true });

    for (const arm of matchedParityArms) {
      const retainedByScenario = new Map<string, BrowserArmResult>();
      for (const scenario of matchedParityScenarios) {
        const retained = await loadCompletedArm({
          arm,
          configuration,
          directory: armArtifactDirectory(
            configuration.outputRoot,
            scenario.id,
            arm,
          ),
          resumeCompleted: configuration.resumeCompleted,
          scenario,
        });
        if (retained !== undefined)
          retainedByScenario.set(scenario.id, retained);
      }

      let panel: ChildProcess | undefined;
      if (retainedByScenario.size !== matchedParityScenarios.length) {
        const armEnvironment = evaluationEnvironment(configuration, arm);
        await buildForArm(configuration, arm, armEnvironment);
        panel = await startService({
          configuration,
          environment: armEnvironment,
          logName: `dev-brunch-panel-${arm}`,
          script: "dev:brunch:panel",
          url: panelOrigin,
        });
      }

      try {
        for (const scenario of matchedParityScenarios) {
          const retained = retainedByScenario.get(scenario.id);
          let result: BrowserArmResult;
          let action: ArmExecutionAction;
          if (retained !== undefined) {
            result = retained;
            action = "reused";
          } else {
            const knownObservedSpendUsd = armRecords.reduce(
              (sum, record) => sum + (record.observedSpendUsd ?? 0),
              0,
            );
            report(
              allowanceWarning({
                arm,
                budgetUsd: configuration.budgetUsd,
                knownObservedSpendUsd,
                unknownSpendArmCount: armRecords.filter(
                  ({ observedSpendUsd }) => observedSpendUsd === null,
                ).length,
              }),
            );
            const context = await browser.newContext();
            try {
              result = await runBrowserArm({
                arm,
                configuration,
                context,
                origin: panelOrigin,
                scenario,
              });
              await writeArmArtifacts(
                armArtifactDirectory(
                  configuration.outputRoot,
                  scenario.id,
                  arm,
                ),
                result,
              );
              action = "executed";
            } finally {
              await context.close();
            }
          }
          const scenarioResults = resultsByScenario.get(scenario.id) ?? {};
          scenarioResults[arm] = result;
          resultsByScenario.set(scenario.id, scenarioResults);
          const scenarioExecution = executionByScenario.get(scenario.id) ?? {};
          scenarioExecution[arm] = action;
          executionByScenario.set(scenario.id, scenarioExecution);
          armRecords.push({
            action,
            arm,
            mode: arm,
            observedSpendUsd: result.artifact.spend.observedUsd,
            scenarioId: scenario.id,
          });
          report(`${scenario.id}/${arm}: ${action}`);
          await writeRunRecord(
            configuration.outputRoot,
            configuration,
            matchedParityScenarios,
            { arms: armRecords, startedAt },
          );
        }
      } finally {
        if (panel !== undefined) await stopServices([panel]);
      }
    }

    for (const scenario of matchedParityScenarios) {
      const partialResults = resultsByScenario.get(scenario.id);
      const partialExecution = executionByScenario.get(scenario.id);
      if (
        partialResults === undefined ||
        partialExecution === undefined ||
        !matchedParityArms.every(
          (arm) =>
            partialResults[arm] !== undefined &&
            partialExecution[arm] !== undefined,
        )
      )
        throw new Error(
          "All five serial arms must complete before comparison.",
        );
      await writeScenarioComparison(
        join(configuration.outputRoot, scenario.id),
        partialResults as Record<EvaluationArm, BrowserArmResult>,
        partialExecution as Record<EvaluationArm, ArmExecutionAction>,
      );
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
      "budget-usd": { type: "string" },
      "execute-paid": { type: "boolean", default: false },
      "resume-completed": { type: "boolean", default: false },
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
  const budgetUsd =
    parsed.values["budget-usd"] === undefined
      ? undefined
      : Number(parsed.values["budget-usd"]);
  const configuration = resolveMatchedParityConfiguration(environment, {
    budgetUsd,
    executePaid: parsed.values["execute-paid"],
    resumeCompleted: parsed.values["resume-completed"],
  });
  await runMatchedParityEvaluation(configuration, {
    execute: executePaidEvaluation,
    report: (message) => process.stdout.write(`${message}\n`),
  });
  if (configuration.executePaid)
    process.stdout.write(`Artifacts: ${configuration.outputRoot}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
