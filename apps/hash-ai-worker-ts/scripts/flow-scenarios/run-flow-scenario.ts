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

import { WorkflowNotFoundError } from "@temporalio/common";
import proto from "@temporalio/proto";
import { v5 as uuidv5 } from "uuid";

import {
  entityIdFromComponents,
  extractBaseUrl,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { getStorageProvider } from "@local/hash-backend-utils/flows/payload-storage";
import { resolveStoredPayloadsInEvents } from "@local/hash-backend-utils/flows/run-events";
import { getFlowRunRecord } from "@local/hash-backend-utils/flows/run-record";
import { getFlowDefinitionEntityById } from "@local/hash-backend-utils/flows/shared/get-flow-definition-entity-by-id";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import {
  createTemporalClient,
  temporalNamespace,
} from "@local/hash-backend-utils/temporal";
import {
  HashEntity,
  mergePropertyObjectAndMetadata,
  queryEntities,
} from "@local/hash-graph-sdk/entity";
import { getFlowType } from "@local/hash-isomorphic-utils/flows/get-flow-type";
import { mapFlowDefinitionToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import { findRunFinishedEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import { getStepRunsFromEvents } from "@local/hash-isomorphic-utils/flows/step-runs";
import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import { assertValidFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  FlowRunStatus,
  FlowStepStatus,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import type { FlowScenario, ScenarioRun, SeedEntity } from "./scenario.js";
import type {
  EntityId,
  EntityUuid,
  ProvidedEntityEditionProvenance,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { GraphApi } from "@local/hash-graph-client";
import type { FlowRunEventError } from "@local/hash-isomorphic-utils/flows/run-events";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowDefinition,
  FlowDefinitionWithId,
  FlowInputValues,
  ResolvedPayload,
  ResolvedStepOutput,
  StepDefinition,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

type FlowRun = {
  flowRunEntityId: EntityId;
  status: FlowRunStatus;
  failure?: FlowRunEventError;
  steps: FlowRunStepRunState[];
  flowOutputs?: StepOutput[];
};
type StepRun = FlowRunStepRunState;
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
    if (
      directory &&
      directory !== repoRoot &&
      !directory.startsWith(`${repoRoot}${path.sep}`)
    ) {
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
 * Runs load their definition from its `Flow Definition` entity, in the user's web here. Migrations only
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
    flowDefinitionEntityId: entityIdFromComponents(userId, flowDefinitionId),
    graphApiClient: graphApi,
    userAuthentication: authentication,
  });

  if (!existingEntity) {
    await HashEntity.create<FlowDefinitionEntity>(graphApi, authentication, {
      webId: userId,
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

/**
 * Creates a scenario's seed entities in the user's web, as the user, one after another. They're all checked against
 * their types first, so that a value that doesn't fit is named, and no entity is created.
 */
const seedEntities = async ({
  entities,
  graphApi,
  userId,
}: {
  entities: SeedEntity[];
  graphApi: GraphApi;
  userId: UserId;
}) => {
  const authentication = { actorId: userId };

  const invalidEntities = await Promise.all(
    entities.map(async ({ entityTypeId, properties }, index) => {
      const report = await HashEntity.validate(graphApi, authentication, {
        entityTypes: [entityTypeId],
        properties: mergePropertyObjectAndMetadata(properties, undefined),
        components: {
          linkData: false,
          linkValidation: false,
          numItems: true,
          requiredProperties: true,
        },
      });

      return report
        ? [
            `  - ${index + 1}, a ${entityTypeId}: ${
              report.properties
                ? `${Object.keys(report.properties).join(", ")} don't fit the type`
                : JSON.stringify(report)
            }`,
          ]
        : [];
    }),
  ).then((results) => results.flat());

  if (invalidEntities.length > 0) {
    throw new SetupError(
      `Seed entities don't fit their types, so none were created:\n${invalidEntities.join("\n")}`,
    );
  }

  for (const [index, { entityTypeId, properties }] of entities.entries()) {
    await HashEntity.create(graphApi, authentication, {
      webId: userId,
      entityTypeIds: [entityTypeId],
      properties: mergePropertyObjectAndMetadata(properties, undefined),
      provenance: { actorType: "user", origin: { type: "api" } },
    }).catch((error: unknown) => {
      throw new SetupError(
        `Couldn't create seed entity ${index + 1} of ${entities.length}, a ${entityTypeId} (${(error as Error).message})`,
      );
    });
  }
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
  inputs: FlowInputValues;
  taskQueue: string;
  userId: UserId;
}) => {
  const workflowId = generateUuid() as EntityUuid;
  const webId = userId as WebId;
  const flowDefinitionEntityId = entityIdFromComponents(
    webId,
    flow.flowDefinitionId,
  );
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
    flowRunEntityUuid: workflowId,
    flowInputs: inputs,
    flowDefinitionEntityId,
    userAuthentication: { actorId: userId },
    webId,
  };

  await client.workflow.start("runFlow", {
    taskQueue,
    args: [params],
    memo: {
      flowDefinitionEntityId,
      userAccountId: userId,
      webId,
    },
    workflowId,
    retry: { maximumAttempts: 1 },
  });

  return workflowId;
};

/** The payload of each output, by output name. The run's stored payloads are resolved in its events. */
const getOutputs = (outputs: StepOutput[] | undefined) =>
  new Map(
    ((outputs ?? []) as ResolvedStepOutput[]).map(({ outputName, payload }) => [
      outputName,
      payload,
    ]),
  );

const getStepError = (step: StepRun | undefined) =>
  step?.errorStatus?.message ?? step?.lastFailure?.message;

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

/**
 * Why a step id in a run's expectations can never match a step run, if it can't: a for-each step isn't run itself, and
 * a step inside one runs once per item, as `<stepId>~<index>`.
 */
const getStepExpectationError = (
  flowDefinition: FlowDefinition,
  expectedStepId: string,
) => {
  const [stepId = "", index, ...rest] = expectedStepId.split("~");

  const findStep = (
    steps: StepDefinition[],
    inForEach: boolean,
  ): { step: StepDefinition; inForEach: boolean } | undefined => {
    for (const step of steps) {
      if (step.stepId === stepId) {
        return { step, inForEach };
      }
      if (step.kind === "for-each") {
        const found = findStep(step.steps, true);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  };

  const found = findStep(flowDefinition.steps, false);

  if (!found) {
    return "no such step";
  }
  if (found.step.kind === "for-each") {
    return `a forEach step isn't run itself: expect its nested steps, as "<stepId>~<index>"`;
  }
  if (found.inForEach) {
    return index !== undefined && /^\d+$/.test(index) && rest.length === 0
      ? undefined
      : `inside a forEach, so it runs once per item, as "${stepId}~<index>"`;
  }
  return index === undefined
    ? undefined
    : `not inside a forEach, so it runs once, as "${stepId}"`;
};

const checkExpectations = (
  { expect }: ScenarioRun,
  flowRun: FlowRun,
): ExpectationResult[] => [
  checkStatus(
    "flow",
    expect.status ?? "COMPLETED",
    flowRun.status,
    flowRun.failure?.message,
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
    getOutputs(flowRun.flowOutputs),
  ),
];

type RunResult = {
  run: ScenarioRun;
  flowRun: FlowRun;
  results: ExpectationResult[];
  /** Why the run failed when none of its steps did, e.g. an activity it runs itself, like naming the run. */
  runError?: string;
};

/** The innermost cause of a workflow's failure, and the activity it came from, if any. */
const describeWorkflowError = (error: unknown) => {
  let activityType: string | undefined;
  let current = error as
    | { cause?: unknown; message?: string; activityType?: string }
    | undefined;

  while (current?.cause) {
    activityType = current.activityType ?? activityType;
    current = current.cause;
  }

  return `${activityType ? `\`${activityType}\` failed: ` : ""}${current?.message ?? "unknown error"}`;
};

const countMet = (results: ExpectationResult[]) =>
  `${results.filter(({ failure }) => !failure).length} of ${results.length} met`;

/** A row per step run: a step inside a `forEach` has one per item, named `<stepId>~<index>`. */
const renderStepRows = ({ run, flowRun }: RunResult) => {
  const nestedStepIds = new Set(
    run.flow.flowDefinition.steps.flatMap((step) =>
      step.kind === "for-each" ? step.steps.map(({ stepId }) => stepId) : [],
    ),
  );

  return getAllStepDefinitionsInFlowDefinition(run.flow.flowDefinition).flatMap(
    (stepDefinition) => {
      const action =
        stepDefinition.kind === "action"
          ? stepDefinition.actionDefinitionId
          : stepDefinition.kind;

      const stepRuns = flowRun.steps
        .filter(
          ({ stepId }) =>
            stepId === stepDefinition.stepId ||
            stepId.startsWith(`${stepDefinition.stepId}~`),
        )
        .sort((a, b) =>
          a.stepId.localeCompare(b.stepId, "en", { numeric: true }),
        );

      if (stepRuns.length === 0) {
        /* A for-each step isn't run itself: its nested steps are. */
        if (stepDefinition.kind === "for-each") {
          return [];
        }
        return nestedStepIds.has(stepDefinition.stepId)
          ? [
              `| \`${stepDefinition.stepId}~<index>\` | ${action} | NOT RUN | for no item |`,
            ]
          : [`| \`${stepDefinition.stepId}\` | ${action} | NOT RUN | – |`];
      }

      return stepRuns.map((step) => {
        const outputs = [...getOutputs(step.outputs)].map(
          ([name, payload]) => `\`${name}\`: ${formatPayload(payload)}`,
        );
        const error = getStepError(step);
        const result = [...outputs, ...(error ? [`error: ${error}`] : [])]
          .join("<br>")
          .replaceAll("|", "\\|");

        return `| \`${step.stepId}\` | ${action} | ${step.status} | ${result || "–"} |`;
      });
    },
  );
};

const renderReport = (
  scenario: FlowScenario,
  runTag: string,
  seededCount: number,
  runResults: RunResult[],
) => {
  const allResults = runResults.flatMap(({ results }) => results);
  const notStarted = scenario.runs.slice(runResults.length);

  return [
    `### Flow scenario: ${scenario.name}`,
    "",
    ...(scenario.purpose ? [scenario.purpose, ""] : []),
    `Local stack at \`${git("rev-parse", "--short", "HEAD")}\`, started through Temporal. Run tag \`${runTag}\`${
      seededCount > 0 ? `, ${seededCount} entities seeded` : ""
    }.`,
    "",
    ...runResults.flatMap((runResult, index) => {
      const { run, flowRun, results, runError } = runResult;

      return [
        `#### Run ${index + 1} of ${scenario.runs.length}: ${run.flow.flowDefinition.name}`,
        "",
        `**\`${extractEntityUuidFromEntityId(flowRun.flowRunEntityId)}\`: ${flowRun.status}**${
          flowRun.failure ? ` (${flowRun.failure.message})` : ""
        }`,
        "",
        ...(runError ? [`No step failed: ${runError}`, ""] : []),
        "| Step | Action | Status | Outputs |",
        "| --- | --- | --- | --- |",
        ...renderStepRows(runResult),
        "",
        `Expectations: ${countMet(results)}`,
        "",
        ...results.map(({ label, failure }) =>
          failure ? `- ✗ ${failure}` : `- ✓ ${label}`,
        ),
        "",
      ];
    }),
    ...notStarted.map(
      ({ flow }) =>
        `#### Not started: ${flow.flowDefinition.name}, as an earlier run didn't meet its expectations\n`,
    ),
    `**Expectations: ${countMet(allResults)}${
      notStarted.length > 0
        ? `, ${notStarted.length} of ${scenario.runs.length} runs not started`
        : ""
    }**`,
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
  const taskQueues = new Set<string>();

  for (const [index, { flow, expect }] of scenario.runs.entries()) {
    assertValidFlowDefinition(flow.flowDefinition);
    const taskQueue = getFlowType(flow.flowDefinition);
    taskQueues.add(taskQueue);

    const stepExpectationErrors = Object.keys(expect.steps ?? {}).flatMap(
      (stepId) => {
        const error = getStepExpectationError(flow.flowDefinition, stepId);
        return error ? [`  - "${stepId}": ${error}`] : [];
      },
    );
    if (stepExpectationErrors.length > 0) {
      throw new SetupError(
        `Run ${index + 1} ("${flow.flowDefinition.name}") expects steps that can't run:\n${stepExpectationErrors.join("\n")}`,
      );
    }

    console.log(
      `Scenario "${scenario.name}", run ${index + 1} of ${scenario.runs.length}: "${flow.flowDefinition.name}", ${
        getAllStepDefinitionsInFlowDefinition(flow.flowDefinition).length
      } steps, valid definition, runs on the "${taskQueue}" task queue`,
    );
  }

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
  for (const taskQueue of taskQueues) {
    await assertWorkerRunsThisCheckout(client, taskQueue);
  }

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
  const runTag = generateUuid();
  const runResults: RunResult[] = [];

  const seed = scenario.seed?.({ runTag }) ?? [];
  if (seed.length > 0) {
    await seedEntities({ entities: seed, graphApi, userId });
    console.log(`Seeded ${seed.length} entities in ${shortname}'s web`);
  }

  for (const run of scenario.runs) {
    const { flowDefinition } = run.flow;
    const flowDefinitionId = getUserFlowDefinitionId(
      run.flow.flowDefinitionId,
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
      inputs:
        typeof run.inputs === "function" ? run.inputs({ runTag }) : run.inputs,
      taskQueue: getFlowType(flowDefinition),
      userId,
    });
    console.log(`Started ${workflowId}: ${temporalUiUrl(workflowId)}`);

    const handle = client.workflow.getHandle(workflowId);
    const workflowErrorWhenClosed = handle.result().then(
      () => undefined,
      (error: unknown) => error,
    );

    const closed = await Promise.race([
      workflowErrorWhenClosed.then(() => true),
      sleep(timeoutSeconds * 1_000, false, { ref: false }),
    ]);
    if (!closed) {
      /* Stopped, so that it can't go on changing the graph after the scenario has moved on. */
      const terminated = await handle
        .terminate(`run-flow-scenario: still running after ${timeoutSeconds}s`)
        .then(
          () => true,
          (error: unknown) => {
            /* Temporal can't find a running execution to terminate once it has closed. */
            if (error instanceof WorkflowNotFoundError) {
              return false;
            }
            throw error;
          },
        );
      if (terminated) {
        console.warn(
          `⚠ Still running after ${timeoutSeconds}s: terminated it, reporting the steps so far. Is a step waiting on something?`,
        );
      }
    }
    const workflowError = await workflowErrorWhenClosed;

    const storageProvider = getStorageProvider();
    const { header, events: recordEvents } = await getFlowRunRecord({
      temporalClient: client,
      storageProvider,
      workflowId,
    });
    const events = await resolveStoredPayloadsInEvents(recordEvents, {
      storageProvider,
      workflowId,
    });
    const runFinished = findRunFinishedEvent(events);

    const flowRun: FlowRun = {
      flowRunEntityId: entityIdFromComponents(userId, workflowId),
      status: header.status,
      ...(runFinished?.failure ? { failure: runFinished.failure } : {}),
      steps: getStepRunsFromEvents(events, header),
      ...(runFinished?.flowOutputs
        ? { flowOutputs: runFinished.flowOutputs }
        : {}),
    };

    const results = checkExpectations(run, flowRun);
    runResults.push({
      run,
      flowRun,
      results,
      ...(flowRun.status === FlowRunStatus.Failed &&
      !flowRun.steps.some(({ status }) => status === FlowStepStatus.Failed)
        ? { runError: describeWorkflowError(workflowError) }
        : {}),
    });

    /* A later run builds on what this one did, so its results would only follow from this run's failure. */
    if (results.some(({ failure }) => failure)) {
      break;
    }
  }

  await client.connection.close();

  const failedRuns = runResults.filter(({ results }) =>
    results.some(({ failure }) => failure),
  );
  const report = renderReport(scenario, runTag, seed.length, runResults);

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
  for (const { flowRun } of failedRuns) {
    writeFileSync(
      path.join(
        runDirectory,
        `flow-run-${extractEntityUuidFromEntityId(flowRun.flowRunEntityId)}.json`,
      ),
      JSON.stringify(flowRun, null, 2),
    );
  }

  console.log(`\n${report}`);
  console.log(`Saved to ${path.relative(repoRoot, runDirectory)}`);

  return failedRuns.length > 0 ? 1 : 0;
};

main().then(
  (exitCode) => process.exit(exitCode),
  (error: unknown) => {
    console.error(error instanceof SetupError ? `✗ ${error.message}` : error);
    process.exit(2);
  },
);
