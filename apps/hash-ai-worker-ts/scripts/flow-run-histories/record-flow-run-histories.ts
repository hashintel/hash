/**
 * Records the Temporal histories of flow runs that the tests of `buildFlowRunEvents` read. Each case runs the AI
 * worker's real `runFlow` workflow, with its signal and query handlers, on a worker with a task queue of its own and
 * stub activities. It writes each run's description and history to
 * libs/@local/hash-backend-utils/tests/fixtures/flow-run-histories/<fixture>.json.
 *
 * Each action runs on its own worker's task queue (`getActionActivityOptions`), so the stub actions are on those queues.
 * Record against a Temporal server no real worker polls, such as a dev server of its own:
 *
 *   temporal server start-dev --port 7299 --headless --namespace HASH
 *   HASH_TEMPORAL_SERVER_PORT=7299 yarn workspace @apps/hash-ai-worker-ts record-flow-run-histories [<case>...]
 *
 * Rerun it when the flow workflow changes what its history records. The workflow is bundled from the libraries'
 * builds, so build `@local/hash-backend-utils` first.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Client, Connection } from "@temporalio/client";
import proto from "@temporalio/proto";
import { NativeConnection, Worker } from "@temporalio/worker";

import { getActionActivityOptions } from "@local/hash-backend-utils/flows/action-activity-options";
import { signalStepAttempts } from "@local/hash-backend-utils/flows/signal-step-attempts";
import { temporalNamespace } from "@local/hash-backend-utils/temporal";
import { sentrySinks } from "@local/hash-backend-utils/temporal/sinks/sentry";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import { answeringUserId, recordingCases } from "./cases.js";

import type { RecordingCase } from "./cases.js";
import type { EntityId, EntityUuid, WebId } from "@blockprotocol/type-system";
import type { RunAiFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { FlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/types";

const require = createRequire(import.meta.url);

const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");

const fixturesDirectory = path.join(
  repositoryRoot,
  "libs/@local/hash-backend-utils/tests/fixtures/flow-run-histories",
);

/** Kept out of the histories in place of the machine's `pid@hostname`. */
const identity = "flow-run-histories";

/** Left out of the histories, as `buildFlowRunEvents` doesn't read them. */
const unreadEventTypes = new Set<proto.temporal.api.enums.v1.EventType>([
  proto.temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_TASK_SCHEDULED,
  proto.temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_TASK_STARTED,
  proto.temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_TASK_COMPLETED,
  proto.temporal.api.enums.v1.EventType.EVENT_TYPE_TIMER_STARTED,
  proto.temporal.api.enums.v1.EventType.EVENT_TYPE_TIMER_FIRED,
  proto.temporal.api.enums.v1.EventType
    .EVENT_TYPE_WORKFLOW_EXECUTION_CANCEL_REQUESTED,
]);

const webId: WebId = answeringUserId;

const temporalAddress = `${new URL(process.env.HASH_TEMPORAL_SERVER_HOST ?? "http://localhost").hostname}:${process.env.HASH_TEMPORAL_SERVER_PORT ?? "7233"}`;

const recordRun = async (
  client: Client,
  fixtureName: string,
  workflowId: string,
  runId?: string,
) => {
  const handle = client.workflow.getHandle(workflowId, runId);
  const [description, history] = await Promise.all([
    handle.describe(),
    handle.fetchHistory(),
  ]);

  mkdirSync(fixturesDirectory, { recursive: true });
  writeFileSync(
    path.join(fixturesDirectory, `${fixtureName}.json`),
    /* Workflow failures carry stack traces, with the checkout's path in them. */
    `${JSON.stringify(
      {
        describe: {
          runId: description.runId,
          status: description.status.name,
          startTime: description.startTime.toISOString(),
          closeTime: description.closeTime?.toISOString() ?? null,
          memo: description.memo ?? {},
        },
        /*
         * `historyToJSON` throws on payload metadata with the version of `proto3-json-serializer` installed, so the
         * history is written as protobuf.js writes it, which `History.fromObject` reads.
         */
        history: proto.temporal.api.history.v1.History.toObject(
          proto.temporal.api.history.v1.History.create({
            events: history.events?.filter(
              ({ eventType }) => !unreadEventTypes.has(eventType ?? 0),
            ),
          }),
          { longs: String, enums: String, bytes: String },
        ),
      },
      null,
      2,
    ).replaceAll(repositoryRoot, "<repository>")}\n`,
  );

  console.log(
    `Recorded ${fixtureName}: ${description.status.name}, ${history.events?.length ?? 0} history events`,
  );
};

const waitForClose = async (client: Client, workflowId: string) => {
  const deadline = Date.now() + 120_000;
  while (
    (await client.workflow.getHandle(workflowId).describe()).status.name ===
    "RUNNING"
  ) {
    if (Date.now() > deadline) {
      throw new Error(`Run ${workflowId} hasn't closed after two minutes`);
    }
    await sleep(500);
  }
};

const main = async () => {
  const caseNames = process.argv.slice(2);
  const unknownCaseName = caseNames.find((name) => !(name in recordingCases));
  if (unknownCaseName) {
    throw new Error(
      `No case "${unknownCaseName}". Cases: ${Object.keys(recordingCases).join(", ")}`,
    );
  }

  const client = new Client({
    connection: await Connection.connect({ address: temporalAddress }),
    namespace: temporalNamespace,
    identity,
  });

  let currentCase: RecordingCase | undefined;

  const stubAction =
    (activityName: string) =>
    (...args: Parameters<RecordingCase["actions"][string]>) => {
      const action = currentCase?.actions[activityName];
      if (!action) {
        throw new Error(`The case doesn't stub ${activityName}`);
      }
      if (currentCase?.withoutAttemptSignals) {
        return action(...args);
      }
      return signalStepAttempts({
        action: async (
          ...actionArgs: Parameters<RecordingCase["actions"][string]>
        ) => action(...actionArgs),
      }).action(...args);
    };

  const taskQueue = `flow-run-histories-${generateUuid()}`;

  const stubActions = {
    ifAction: stubAction("ifAction"),
    takeFirstAction: stubAction("takeFirstAction"),
    aggregateAction: stubAction("aggregateAction"),
    researchEntitiesAction: stubAction("researchEntitiesAction"),
  };

  const workerConnection = await NativeConnection.connect({
    address: temporalAddress,
  });

  /* A worker on each task queue the stub actions run on. */
  const actionWorkers = await Promise.all(
    [
      ...new Set(
        Object.keys(stubActions).map(
          (activityName) =>
            getActionActivityOptions(
              activityName.replace(/Action$/, "") as FlowActionDefinitionId,
            ).taskQueue,
        ),
      ),
    ].map((actionTaskQueue) =>
      Worker.create({
        connection: workerConnection,
        namespace: temporalNamespace,
        taskQueue: actionTaskQueue,
        identity,
        maxHeartbeatThrottleInterval: "1 second",
        activities: stubActions,
      }),
    ),
  );

  const worker = await Worker.create({
    connection: workerConnection,
    namespace: temporalNamespace,
    taskQueue,
    identity,
    workflowsPath: require.resolve("./workflows.ts"),
    sinks: sentrySinks(),
    maxHeartbeatThrottleInterval: "1 second",
    activities: {
      getFlowDefinitionActivity: () => ({
        status: "ok",
        flowDefinition: currentCase?.flow.flowDefinition,
        flowDefinitionEntityId: `${webId}~${currentCase?.flow.flowDefinitionId}`,
      }),
      userHasPermissionToRunFlowInWebActivity: () => ({ status: "ok" }),
      persistFlowActivity: () => ({
        flowEntityId: `${webId}~${generateUuid()}`,
      }),
      recordFlowRunActivity: () => undefined,
      generateFlowRunName: () => currentCase?.flow.flowDefinition.name,
      saveOpenInputRequestsActivity: () => undefined,
    },
  });

  const recording = worker.runUntil(async () => {
    for (const [caseName, createCase] of Object.entries(recordingCases)) {
      if (caseNames.length && !caseNames.includes(caseName)) {
        continue;
      }

      currentCase = createCase(client);

      /* As the `startFlow` mutation starts a run. */
      const workflowId = generateUuid();
      const flowDefinitionEntityId =
        `${webId}~${currentCase.flow.flowDefinitionId}` as EntityId;

      const handle = await client.workflow.start("runFlow", {
        taskQueue,
        workflowId,
        args: [
          {
            dataSources: {
              files: { fileEntityIds: [] },
              internetAccess: {
                enabled: false,
                browserPlugin: { enabled: false, domains: [] },
              },
            },
            flowDefinitionEntityId,
            flowInputs: currentCase.flowInputs,
            flowRunEntityUuid: workflowId as EntityUuid,
            userAuthentication: { actorId: answeringUserId },
            webId,
          } satisfies RunAiFlowWorkflowParams,
        ],
        memo: {
          flowDefinitionEntityId,
          userAccountId: answeringUserId,
          webId,
        },
        retry: { maximumAttempts: 1 },
      });

      await currentCase.steer?.({
        client,
        handle,
        record: (fixtureName, runId) =>
          recordRun(client, fixtureName, workflowId, runId),
      });

      await waitForClose(client, workflowId);
      await recordRun(
        client,
        currentCase.closedFixtureName ?? caseName,
        workflowId,
      );
    }
  });

  await Promise.all([
    recording,
    ...actionWorkers.map((actionWorker) => actionWorker.runUntil(recording)),
  ]);

  execFileSync("yarn", ["oxfmt", "--write", fixturesDirectory], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
};

await main();
