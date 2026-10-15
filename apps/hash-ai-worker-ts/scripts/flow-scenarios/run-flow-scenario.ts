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
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";

import proto from "@temporalio/proto";

import {
  extractBaseUrl,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
/**
 * Runs a flow scenario end to end through Temporal on the local stack, checks its expectations and writes a run
 * report. See README.md.
 *
 *   yarn workspace @apps/hash-ai-worker-ts run-flow-scenario <scenario.ts> [--dry-run] [--timeout <seconds>]
 *
 * Exit codes: 0 every expectation was met, 1 an expectation failed, 2 the scenario couldn't be run.
 */
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
import {
  getFlowDefinitionFromEntity,
  mapFlowDefinitionToEntityProperties,
} from "@local/hash-isomorphic-utils/flows/mappings";
import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import { assertValidFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
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
import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinition as FlowDefinitionEntity } from "@local/hash-isomorphic-utils/system-types/flowdefinition";

type FlowRun = Awaited<ReturnType<typeof getFlowRunFromTemporalWorkflowId>>;
type Payload = { kind: string; value: unknown };

const scriptDirectory = import.meta.dirname;
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: scriptDirectory,
  encoding: "utf8",
}).trim();

const temporalUiUrl = (workflowId: string) =>
  `http://localhost:3100/namespaces/${temporalNamespace}/workflows/${workflowId}`;

/** An error that means the scenario couldn't be run, shown without a stack trace. */
class SetupError extends Error {}

const truncate = (text: string, length = 140) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

const formatValue = (value: unknown) => truncate(String(JSON.stringify(value)));

const formatPayload = ({ kind, value }: Payload) =>
  Array.isArray(value)
    ? `${value.length} × ${kind} ${formatValue(value)}`
    : `${kind} ${formatValue(value)}`;

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

/**
 * The workers polling a task queue, with the working directory of those on this machine, so that a worker started
 * from another checkout is caught before its code produces a misleading result. Temporal lists a stopped worker for
 * a while after it stops, so local workers whose process has exited are left out.
 */
const getWorkers = async (client: TemporalClient, taskQueue: string) => {
  const { pollers } = await client.workflowService.describeTaskQueue({
    namespace: temporalNamespace,
    taskQueue: { name: taskQueue },
    taskQueueType:
      proto.temporal.api.enums.v1.TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY,
  });

  return pollers.flatMap(({ identity }) => {
    const [pid, host] = (identity ?? "").split("@");

    if (!pid || host !== hostname()) {
      return [{ identity, directory: undefined }];
    }

    if (!isProcessRunning(Number(pid))) {
      return [];
    }

    try {
      const cwdLine = execFileSync(
        "lsof",
        ["-a", "-d", "cwd", "-p", pid, "-Fn"],
        { encoding: "utf8" },
      )
        .split("\n")
        .find((line) => line.startsWith("n"));

      return [
        {
          identity,
          directory: cwdLine ? realpathSync(cwdLine.slice(1)) : undefined,
        },
      ];
    } catch {
      return [{ identity, directory: undefined }];
    }
  });
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
        `Couldn't create the Flow Definition entity ${flowDefinitionId} in the user's web (${(error as Error).message}). Is another flow already using this id?`,
      );
    });
    return "created";
  }

  let storedDefinition;
  try {
    storedDefinition = getFlowDefinitionFromEntity(existingEntity);
  } catch {
    // An invalid stored definition is replaced below.
  }

  /** JSON drops `undefined` values, as storing the definition does. */
  if (
    isDeepStrictEqual(
      storedDefinition,
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

/** The payload of each output from a step's last attempt, by output name. */
const getOutputs = (outputs: FlowRun["outputs"]) => {
  const lastAttempt = outputs?.at(-1);
  const payloads = (lastAttempt?.contents[0]?.outputs ?? []) as {
    outputName: string;
    payload: Payload;
  }[];

  return new Map(
    payloads.map(({ outputName, payload }) => [outputName, payload]),
  );
};

const getStepError = (step: FlowRun["steps"][number] | undefined) => {
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

const checkExpectations = (scenario: FlowScenario, flowRun: FlowRun) => {
  const results: { label: string; failure?: string }[] = [];

  const checkOutputs = (
    getLabel: (outputName: string) => string,
    expected: Record<string, unknown>,
    actual: Map<string, Payload>,
  ) => {
    for (const [outputName, expectedValue] of Object.entries(expected)) {
      const label = getLabel(outputName);
      const payload = actual.get(outputName);

      results.push({
        label,
        failure: !payload
          ? `${label}: not produced`
          : isDeepStrictEqual(expectedValue, payload.value)
            ? undefined
            : `${label}: expected ${formatValue(expectedValue)}, got ${formatValue(payload.value)}`,
      });
    }
  };

  const expectedFlowStatus = scenario.expect.status ?? "COMPLETED";
  results.push({
    label: `flow is ${expectedFlowStatus}`,
    failure:
      String(flowRun.status) === expectedFlowStatus
        ? undefined
        : `flow status: expected ${expectedFlowStatus}, got ${flowRun.status}${
            flowRun.failureMessage ? ` (${flowRun.failureMessage})` : ""
          }`,
  });

  for (const [stepId, expectation] of Object.entries(
    scenario.expect.steps ?? {},
  )) {
    const step = flowRun.steps.find((run) => run.stepId === stepId);
    const outputs = getOutputs(step?.outputs);

    const expectedStatus =
      expectation.status ??
      (expectation.outputs || expectation.absentOutputs
        ? "COMPLETED"
        : undefined);

    if (expectedStatus) {
      const actualStatus = step ? String(step.status) : "NOT RUN";
      const error = getStepError(step);

      results.push({
        label: `\`${stepId}\` is ${expectedStatus}`,
        failure:
          actualStatus === expectedStatus
            ? undefined
            : `\`${stepId}\` status: expected ${expectedStatus}, got ${actualStatus}${
                error ? ` (${error})` : ""
              }`,
      });
    }

    checkOutputs(
      (outputName) => `\`${stepId}.${outputName}\``,
      expectation.outputs ?? {},
      outputs,
    );

    for (const outputName of expectation.absentOutputs ?? []) {
      const label = `\`${stepId}.${outputName}\``;
      const payload = outputs.get(outputName);

      results.push({
        label: `${label} not produced`,
        failure: payload
          ? `${label}: expected no output, got ${formatPayload(payload)}`
          : undefined,
      });
    }
  }

  checkOutputs(
    (outputName) => `flow output \`${outputName}\``,
    scenario.expect.outputs ?? {},
    getOutputs(flowRun.outputs),
  );

  return results;
};

const renderReport = ({
  scenario,
  flowRun,
  results,
  commit,
}: {
  scenario: FlowScenario;
  flowRun: FlowRun;
  results: ReturnType<typeof checkExpectations>;
  commit: string;
}) => {
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
    `Local stack at \`${commit}\`, started through Temporal.`,
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

  const { flowDefinition, flowDefinitionId } = scenario.flow;
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

  const workers = await getWorkers(client, taskQueue);
  if (workers.length === 0) {
    throw new SetupError(
      `No worker is polling the "${taskQueue}" task queue. Start it with \`yarn workspace @apps/hash-${
        taskQueue === "ai" ? "ai-worker-ts" : "integration-worker"
      } dev\`.`,
    );
  }
  for (const { identity, directory } of workers) {
    if (directory && !directory.startsWith(realpathSync(repoRoot))) {
      throw new SetupError(
        `The "${taskQueue}" worker ${identity} runs from ${directory}, not this checkout (${repoRoot}). Stop it and start the worker here.`,
      );
    }
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

  const userId = await getUserIdByShortname(graphApi, scenario.user ?? "alice");
  const webId = userId as WebId;

  const definitionChange = await ensureFlowDefinitionEntity({
    flow: scenario.flow,
    graphApi,
    userId,
  });
  if (definitionChange !== "unchanged") {
    console.log(
      `Flow Definition ${flowDefinitionId} ${definitionChange} in ${scenario.user ?? "alice"}'s web`,
    );
  }

  /** Started like the `startFlow` resolver starts a run. */
  const workflowId = generateUuid() as EntityUuid;
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
    flowInputs: scenario.inputs,
    flowDefinitionId,
    userAuthentication: { actorId: userId },
    webId,
  };

  await client.workflow.start("runFlow", {
    taskQueue,
    args: [params],
    memo: { flowDefinitionId, userAccountId: userId, webId },
    workflowId,
    retry: { maximumAttempts: 1 },
  });

  console.log(`Started ${workflowId}: ${temporalUiUrl(workflowId)}`);

  const outcome = await Promise.race([
    client.workflow
      .getHandle(workflowId)
      .result()
      .then(
        () => "closed" as const,
        () => "closed" as const,
      ),
    new Promise<"timedOut">((resolve) => {
      setTimeout(() => resolve("timedOut"), timeoutSeconds * 1_000).unref();
    }),
  ]);

  if (outcome === "timedOut") {
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
    webId,
    storageProvider: getStorageProvider(),
  });

  await client.connection.close();

  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const results = checkExpectations(scenario, flowRun);
  const failed = results.some(({ failure }) => failure);
  const report = renderReport({ scenario, flowRun, results, commit });

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
