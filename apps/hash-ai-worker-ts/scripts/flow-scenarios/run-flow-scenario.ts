/**
 * Runs a flow scenario end to end through Temporal on the local stack, checks its expectations and writes a run
 * report. See README.md.
 *
 *   yarn workspace @apps/hash-ai-worker-ts run-flow-scenario <scenario.ts> [--dry-run] [--timeout <seconds>]
 *
 * Exit codes: 0 every expectation was met, 1 an expectation failed, 2 the scenario couldn't be run.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";

import proto from "@temporalio/proto";
import { v5 as uuidv5 } from "uuid";

import {
  extractBaseUrl,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { getFlowRunFromTemporalWorkflowId } from "@local/hash-backend-utils/flows/get-flow-run-details";
import { getStorageProvider } from "@local/hash-backend-utils/flows/payload-storage";
import { getFlowDefinitionEntityById } from "@local/hash-backend-utils/flows/shared/get-flow-definition-entity-by-id";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import {
  createTemporalClient,
  temporalNamespace,
} from "@local/hash-backend-utils/temporal";
import { HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { getFlowType } from "@local/hash-isomorphic-utils/flows/get-flow-type";
import { mapFlowDefinitionToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import { assertValidFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { StatusCode } from "@local/status";

import type { FlowScenario } from "./scenario.js";
import type {
  EntityUuid,
  ProvidedEntityEditionProvenance,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { GraphApi } from "@local/hash-graph-client";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowDefinitionWithId,
  ResolvedPayload,
} from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

type FlowRun = Awaited<ReturnType<typeof getFlowRunFromTemporalWorkflowId>>;
type StepRun = FlowRun["steps"][number];
type ExpectationResult = { label: string; failure?: string };

const scriptDirectory = import.meta.dirname;

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: scriptDirectory, encoding: "utf8" }).trim();

const repoRoot = realpathSync(git("rev-parse", "--show-toplevel"));

const temporalUiUrl = (workflowId: string) =>
  `http://localhost:${process.env.HASH_TEMPORAL_UI_PORT ?? "3100"}/namespaces/${temporalNamespace}/workflows/${workflowId}`;

/** An error that means the scenario couldn't be run, shown without a stack trace. */
class SetupError extends Error {}

const truncate = (text: string, length = 140) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

const formatValue = (value: unknown) => truncate(String(JSON.stringify(value)));

const formatPayload = ({ kind, value }: ResolvedPayload) =>
  Array.isArray(value)
    ? `${value.length} × ${kind} ${formatValue(value)}`
    : `${kind} ${formatValue(value)}`;

const loadScenario = async (scenarioArgument: string) => {
  /** Yarn runs the script from the workspace, so a relative path starts there. */
  const scenarioPath = path.resolve(scenarioArgument);
  if (!existsSync(scenarioPath)) {
    throw new SetupError(
      `No scenario at ${scenarioPath}. Relative paths start from apps/hash-ai-worker-ts.`,
    );
  }

  const { scenario } = (await import(pathToFileURL(scenarioPath).href)) as {
    scenario?: FlowScenario;
  };
  if (!scenario) {
    throw new SetupError(`${scenarioArgument} doesn't export a \`scenario\``);
  }

  return { scenario, scenarioPath };
};

const newestModificationTime = (directory: string, extension: string) => {
  let newest = 0;
  for (const entry of readdirSync(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile() && entry.name.endsWith(extension)) {
      newest = Math.max(
        newest,
        statSync(path.join(entry.parentPath, entry.name)).mtimeMs,
      );
    }
  }
  return newest;
};

/** Workers import these libraries from `dist`, so source changes only take effect once they're rebuilt. */
const findStaleLibraryBuilds = () =>
  ["hash-isomorphic-utils", "hash-backend-utils"].flatMap((library) => {
    const libraryDirectory = path.join(repoRoot, "libs/@local", library);

    try {
      return newestModificationTime(path.join(libraryDirectory, "src"), ".ts") >
        newestModificationTime(path.join(libraryDirectory, "dist"), ".js")
        ? [`@local/${library}`]
        : [];
    } catch {
      return [`@local/${library} (no dist: build it)`];
    }
  });

const isProcessRunning = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** The working directory of a process on this machine, if it can be found. */
const getProcessDirectory = (pid: string) => {
  try {
    const cwdLine = execFileSync(
      "lsof",
      ["-a", "-d", "cwd", "-p", pid, "-Fn"],
      {
        encoding: "utf8",
      },
    )
      .split("\n")
      .find((line) => line.startsWith("n"));

    return cwdLine ? realpathSync(cwdLine.slice(1)) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Stops before a worker started from another checkout produces a misleading result. Temporal identifies workers as
 * `pid@host`, and lists a stopped worker for a while after it stops, so local workers whose process has exited are
 * ignored.
 */
const assertWorkerRunsThisCheckout = async (
  client: TemporalClient,
  taskQueue: string,
) => {
  const { pollers } = await client.workflowService.describeTaskQueue({
    namespace: temporalNamespace,
    taskQueue: { name: taskQueue },
    taskQueueType:
      proto.temporal.api.enums.v1.TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY,
  });

  const workers = pollers.flatMap(({ identity }) => {
    const [pid, host] = (identity ?? "").split("@");
    const isLocal = !!pid && host === hostname();

    if (isLocal && !isProcessRunning(Number(pid))) {
      return [];
    }

    return [
      { identity, directory: isLocal ? getProcessDirectory(pid) : undefined },
    ];
  });

  if (workers.length === 0) {
    throw new SetupError(
      `No worker is polling the "${taskQueue}" task queue. Start it with \`yarn workspace @apps/hash-${
        taskQueue === "ai" ? "ai-worker-ts" : "integration-worker"
      } dev\`.`,
    );
  }

  for (const { identity, directory } of workers) {
    if (directory && !directory.startsWith(repoRoot)) {
      throw new SetupError(
        `The "${taskQueue}" worker ${identity} runs from ${directory}, not this checkout (${repoRoot}). Stop it and start the worker here.`,
      );
    }
  }
};

const getUserIdByShortname = async (graphApi: GraphApi, shortname: string) => {
  const {
    entities: [userEntity],
  } = await queryEntities(
    { graphApi },
    { actorId: publicUserAccountId },
    {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              { parameter: systemEntityTypes.user.entityTypeBaseUrl },
            ],
          },
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(systemPropertyTypes.shortname.propertyTypeId),
                ],
              },
              { parameter: shortname },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  if (!userEntity) {
    throw new SetupError(
      `No user with shortname "${shortname}" in the local graph. Start the API once so it seeds alice and bob01.`,
    );
  }

  return extractWebIdFromEntityId(
    userEntity.metadata.recordId.entityId,
  ) as UserId;
};

/**
 * The id of a scenario's definition in a user's web. An entity uuid can only be used in one web, so each user gets
 * their own id, derived from the scenario's.
 */
const getUserFlowDefinitionId = (
  scenarioFlowDefinitionId: EntityUuid,
  userId: UserId,
) => uuidv5(userId, scenarioFlowDefinitionId) as EntityUuid;

/**
 * Runs load their definition from the `Flow Definition` entity whose uuid is the definition's id. Migrations only
 * seed the flows HASH provides, so the scenario's definition is written to the user's web: created if it doesn't
 * exist, and updated if it differs, like `seedFlowDefinitions` does for seeded flows.
 */
const ensureFlowDefinitionEntity = async ({
  flow: { flowDefinitionId, flowDefinition },
  graphApi,
  userId,
}: {
  flow: FlowDefinitionWithId;
  graphApi: GraphApi;
  userId: UserId;
}) => {
  const authentication = { actorId: userId };
  const provenance: ProvidedEntityEditionProvenance = {
    actorType: "user",
    origin: { type: "api" },
  };
  const entityTypeIds: FlowDefinitionEntity["entityTypeIds"] = [
    systemEntityTypes.flowDefinition.entityTypeId,
  ];
  const properties = mapFlowDefinitionToEntityProperties(flowDefinition);

  const existingEntity = await getFlowDefinitionEntityById({
    flowDefinitionId,
    graphApiClient: graphApi,
    userAuthentication: authentication,
  });

  if (!existingEntity) {
    await HashEntity.create<FlowDefinitionEntity>(graphApi, authentication, {
      webId: userId as WebId,
      entityUuid: flowDefinitionId,
      entityTypeIds,
      properties,
      provenance,
    }).catch((error: unknown) => {
      throw new SetupError(
        `Couldn't create the Flow Definition entity ${flowDefinitionId} in the user's web (${(error as Error).message}). Has the API run this checkout's migrations?`,
      );
    });
    return "created";
  }

  const {
    name,
    description,
    inputDefinition,
    stepDefinition,
    outputDefinition,
  } = simplifyProperties(existingEntity.properties);

  /** Compared as stored, which drops `undefined` values. */
  if (
    isDeepStrictEqual(
      {
        name,
        description,
        inputs: inputDefinition,
        steps: stepDefinition,
        outputs: outputDefinition,
      },
      JSON.parse(JSON.stringify(flowDefinition)),
    )
  ) {
    return "unchanged";
  }

  await existingEntity.patch(graphApi, authentication, {
    entityTypeIds,
    provenance,
    propertyPatches: [{ op: "replace", path: [], property: properties }],
  });
  return "updated";
};

/** Started like the `startFlow` resolver starts a run. */
const startRun = async ({
  client,
  flow,
  inputs,
  taskQueue,
  userId,
}: {
  client: TemporalClient;
  flow: FlowDefinitionWithId;
  inputs: FlowScenario["inputs"];
  taskQueue: string;
  userId: UserId;
}) => {
  const workflowId = generateUuid() as EntityUuid;
  const webId = userId as WebId;
  const params: RunFlowWorkflowParams = {
    ...(taskQueue === "ai"
      ? {
          dataSources: {
            files: { fileEntityIds: [] },
            internetAccess: {
              enabled: false,
              browserPlugin: { enabled: false, domains: [] },
            },
          },
        }
      : {}),
    flowRunId: workflowId,
    flowInputs: inputs,
    flowDefinitionId: flow.flowDefinitionId,
    userAuthentication: { actorId: userId },
    webId,
  };

  await client.workflow.start("runFlow", {
    taskQueue,
    args: [params],
    memo: {
      flowDefinitionId: flow.flowDefinitionId,
      userAccountId: userId,
      webId,
    },
    workflowId,
    retry: { maximumAttempts: 1 },
  });

  return workflowId;
};

/** The payload of each output from the last attempt, by output name. */
const getOutputs = (outputs: StepRun["outputs"]) =>
  new Map(
    (outputs?.at(-1)?.contents[0]?.outputs ?? []).map(
      ({ outputName, payload }) => [outputName, payload],
    ),
  );

const getStepError = (step: StepRun | undefined) => {
  const lastAttempt = step?.outputs?.at(-1);
  if (
    lastAttempt &&
    lastAttempt.code !== StatusCode.Ok &&
    lastAttempt.message
  ) {
    return lastAttempt.message;
  }

  return (step?.lastFailure as { message?: string } | undefined)?.message;
};

const checkStatus = (
  label: string,
  expected: string,
  actual: string,
  detail: string | undefined,
): ExpectationResult => ({
  label: `${label} is ${expected}`,
  failure:
    actual === expected
      ? undefined
      : `${label} status: expected ${expected}, got ${actual}${detail ? ` (${detail})` : ""}`,
});

const checkOutputs = (
  getLabel: (outputName: string) => string,
  expected: Record<string, unknown> | undefined,
  actual: Map<string, ResolvedPayload>,
): ExpectationResult[] =>
  Object.entries(expected ?? {}).map(([outputName, expectedValue]) => {
    const label = getLabel(outputName);
    const payload = actual.get(outputName);

    if (!payload) {
      return { label, failure: `${label}: not produced` };
    }
    if (!isDeepStrictEqual(expectedValue, payload.value)) {
      return {
        label,
        failure: `${label}: expected ${formatValue(expectedValue)}, got ${formatValue(payload.value)}`,
      };
    }
    return { label };
  });

const checkExpectations = (
  { expect }: FlowScenario,
  flowRun: FlowRun,
): ExpectationResult[] => [
  checkStatus(
    "flow",
    expect.status ?? "COMPLETED",
    flowRun.status,
    flowRun.failureMessage ?? undefined,
  ),
  ...Object.entries(expect.steps ?? {}).flatMap(([stepId, expectation]) => {
    const step = flowRun.steps.find((run) => run.stepId === stepId);
    const outputs = getOutputs(step?.outputs);
    const getLabel = (outputName: string) => `\`${stepId}.${outputName}\``;

    return [
      checkStatus(
        `\`${stepId}\``,
        expectation.status ?? "COMPLETED",
        step?.status ?? "NOT RUN",
        getStepError(step),
      ),
      ...checkOutputs(getLabel, expectation.outputs, outputs),
      ...(expectation.absentOutputs ?? []).map((outputName) => {
        const payload = outputs.get(outputName);
        return {
          label: `${getLabel(outputName)} not produced`,
          failure: payload
            ? `${getLabel(outputName)}: expected no output, got ${formatPayload(payload)}`
            : undefined,
        };
      }),
    ];
  }),
  ...checkOutputs(
    (outputName) => `flow output \`${outputName}\``,
    expect.outputs,
    getOutputs(flowRun.outputs),
  ),
];

const renderReport = (
  scenario: FlowScenario,
  flowRun: FlowRun,
  results: ExpectationResult[],
) => {
  const failures = results.filter(({ failure }) => failure);

  const rows = getAllStepDefinitionsInFlowDefinition(
    scenario.flow.flowDefinition,
  ).map((stepDefinition) => {
    const step = flowRun.steps.find(
      (run) => run.stepId === stepDefinition.stepId,
    );
    const outputs = [...getOutputs(step?.outputs)].map(
      ([name, payload]) => `\`${name}\`: ${formatPayload(payload)}`,
    );
    const error = getStepError(step);
    const action =
      stepDefinition.kind === "action"
        ? stepDefinition.actionDefinitionId
        : stepDefinition.kind;
    const result = [...outputs, ...(error ? [`error: ${error}`] : [])]
      .join("<br>")
      .replaceAll("|", "\\|");

    return `| \`${stepDefinition.stepId}\` | ${action} | ${step?.status ?? "NOT RUN"} | ${result || "–"} |`;
  });

  return [
    `### Flow scenario: ${scenario.name}`,
    "",
    ...(scenario.purpose ? [scenario.purpose, ""] : []),
    `Local stack at \`${git("rev-parse", "--short", "HEAD")}\`, started through Temporal.`,
    "",
    `**\`${flowRun.flowRunId}\`: ${flowRun.status}**${
      flowRun.failureMessage ? ` (${flowRun.failureMessage})` : ""
    }`,
    "",
    "| Step | Action | Status | Outputs |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    `**Expectations: ${results.length - failures.length} of ${results.length} met**`,
    "",
    ...results.map(({ label, failure }) =>
      failure ? `- ✗ ${failure}` : `- ✓ ${label}`,
    ),
    "",
  ].join("\n");
};

const main = async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      timeout: { type: "string", default: "300" },
    },
  });

  const [scenarioArgument] = positionals;
  const timeoutSeconds = Number(values.timeout);
  if (!scenarioArgument || !(timeoutSeconds > 0)) {
    throw new SetupError(
      "Usage: run-flow-scenario <scenario.ts> [--dry-run] [--timeout <seconds>]",
    );
  }

  const { scenario, scenarioPath } = await loadScenario(scenarioArgument);
  const { flowDefinition } = scenario.flow;
  assertValidFlowDefinition(flowDefinition);
  const taskQueue = getFlowType(flowDefinition);

  console.log(
    `Scenario "${scenario.name}": ${
      getAllStepDefinitionsInFlowDefinition(flowDefinition).length
    } steps, valid definition, runs on the "${taskQueue}" task queue`,
  );

  if (values["dry-run"]) {
    return 0;
  }

  const staleBuilds = findStaleLibraryBuilds();
  if (staleBuilds.length > 0) {
    console.warn(
      `⚠ Source is newer than the build for ${staleBuilds.join(", ")}. Workers run the build: rebuild with \`yarn workspace <package> build\` first.`,
    );
  }

  const client = await createTemporalClient().catch((error: unknown) => {
    throw new SetupError(
      `Can't reach Temporal (${(error as Error).message}). Is \`yarn compose --profile hgres up -d\` running?`,
    );
  });
  await assertWorkerRunsThisCheckout(client, taskQueue);

  const graphApi = createGraphClient(
    new Logger({
      environment: "development",
      level: "warn",
      serviceName: "run-flow-scenario",
    }),
    {
      host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
      port: parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
    },
  );

  const shortname = scenario.user ?? "alice";
  const userId = await getUserIdByShortname(graphApi, shortname);
  const flowDefinitionId = getUserFlowDefinitionId(
    scenario.flow.flowDefinitionId,
    userId,
  );
  const flow = { flowDefinitionId, flowDefinition };

  const definitionChange = await ensureFlowDefinitionEntity({
    flow,
    graphApi,
    userId,
  });
  if (definitionChange !== "unchanged") {
    console.log(
      `Flow Definition ${flowDefinitionId} ${definitionChange} in ${shortname}'s web`,
    );
  }

  const workflowId = await startRun({
    client,
    flow,
    inputs: scenario.inputs,
    taskQueue,
    userId,
  });
  console.log(`Started ${workflowId}: ${temporalUiUrl(workflowId)}`);

  const closed = await Promise.race([
    client.workflow
      .getHandle(workflowId)
      .result()
      .then(
        () => true,
        () => true,
      ),
    sleep(timeoutSeconds * 1_000, false, { ref: false }),
  ]);
  if (!closed) {
    console.warn(
      `⚠ Still running after ${timeoutSeconds}s: reporting the steps so far. Is a step waiting on something?`,
    );
  }

  const flowRun = await getFlowRunFromTemporalWorkflowId({
    flowDefinitionId,
    flowRunId: workflowId,
    name: flowDefinition.name,
    temporalClient: client,
    temporalWorkflowId: workflowId,
    webId: userId as WebId,
    storageProvider: getStorageProvider(),
  });

  await client.connection.close();

  const results = checkExpectations(scenario, flowRun);
  const failed = results.some(({ failure }) => failure);
  const report = renderReport(scenario, flowRun, results);

  const runDirectory = path.join(
    scriptDirectory,
    "runs",
    `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${path.basename(
      scenarioPath,
      ".scenario.ts",
    )}`,
  );
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(path.join(runDirectory, "report.md"), report);
  if (failed) {
    writeFileSync(
      path.join(runDirectory, "flow-run.json"),
      JSON.stringify(flowRun, null, 2),
    );
  }

  console.log(`\n${report}`);
  console.log(`Saved to ${path.relative(repoRoot, runDirectory)}`);

  return failed ? 1 : 0;
};

main().then(
  (exitCode) => process.exit(exitCode),
  (error: unknown) => {
    console.error(error instanceof SetupError ? `✗ ${error.message}` : error);
    process.exit(2);
  },
);
