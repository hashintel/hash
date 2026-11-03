import { setTimeout as sleep } from "node:timers/promises";

import { Context } from "@temporalio/activity";
import proto from "@temporalio/proto";
import Long from "long";

import { temporalNamespace } from "@local/hash-backend-utils/temporal";
import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  constant,
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";
import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { StatusCode } from "@local/status";

import { getExternalInputResponseQuery } from "../../src/shared/queries.js";
import {
  externalInputRequestSignal,
  logProgressSignal,
  researchActionCheckpointSignal,
} from "../../src/shared/signals.js";

import type { UserId } from "@blockprotocol/type-system";
import type {
  FlowDefinitionWithId,
  FlowInputValues,
  Payload,
  StepInput,
  StepOutput,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";
import type { Client, WorkflowHandle } from "@temporalio/client";

type StubAction = (params: {
  inputs: StepInput[];
}) =>
  | Status<{ outputs: StepOutput[] }>
  | Promise<Status<{ outputs: StepOutput[] }>>;

export type RecordingCase = {
  flow: FlowDefinitionWithId;
  flowInputs: FlowInputValues;
  /** Stubs of the actions the flow uses, by activity name. */
  actions: Record<string, StubAction>;
  /** Steers the run while it runs, and records histories it needs before the run closes. */
  steer?: (run: {
    client: Client;
    handle: WorkflowHandle;
    record: (fixtureName: string, runId?: string) => Promise<void>;
  }) => Promise<void>;
  /** The fixture to write the closed run's history to, if not the case's name. */
  closedFixtureName?: string;
  /**
   * Whether the actions don't signal their attempts. Every case's actions signal them (`signalStepAttempts`), as the
   * workers' actions do, except one that stands for signals that didn't get through.
   */
  withoutAttemptSignals?: true;
};

export const answeringUserId = "00000000-0000-4000-8000-0000000000a1" as UserId;

/** An error without a stack, which would put the machine's paths in the history. */
const errorWithoutStack = (message: string) =>
  Object.assign(new Error(message), { stack: `Error: ${message}` });

const ok = (outputs: StepOutput[]): Status<{ outputs: StepOutput[] }> => ({
  code: StatusCode.Ok,
  contents: [{ outputs }],
});

const getInput = (inputs: StepInput[], inputName: string) => {
  const input = inputs.find((stepInput) => stepInput.inputName === inputName);
  if (!input) {
    throw new Error(`No input "${inputName}"`);
  }
  return input.payload;
};

const takeFirst: StubAction = ({ inputs }) => {
  const items = getInput(inputs, "items");
  const count = getInput(inputs, "count").value as number;

  return ok([
    {
      outputName: "items",
      payload: {
        kind: items.kind,
        value: (items.value as unknown[]).slice(0, count),
      } as StepOutput["payload"],
    },
  ]);
};

const count: StubAction = ({ inputs }) =>
  ok([
    {
      outputName: "result",
      payload: {
        kind: "Number",
        value: (getInput(inputs, "items").value as unknown[]).length,
      },
    },
  ]);

const ifNotMet: StubAction = ({ inputs }) =>
  ok([{ outputName: "false", payload: getInput(inputs, "value") }]);

const researched = ok([
  {
    outputName: "proposedEntities",
    /* A real run stores proposed entities, rather than returning them inline. */
    payload: { kind: "ProposedEntity", value: [] } as unknown as Payload,
  },
  {
    outputName: "highlightedEntities",
    payload: { kind: "EntityId", value: [] },
  },
]);

/** Heartbeats until `until` settles, and throws if the activity is cancelled first. */
const waitInActivity = async (until: Promise<void>) => {
  const context = Context.current();
  const heartbeat = setInterval(() => context.heartbeat(), 500);
  try {
    await Promise.race([until, context.cancelled]);
  } finally {
    clearInterval(heartbeat);
  }
};

const getActivityRun = () => {
  const { activityId, attempt, workflowExecution } = Context.current().info;
  if (!workflowExecution) {
    throw new Error("The activity isn't running for a workflow");
  }
  return { activityId, attempt, ...workflowExecution };
};

const planLog = (
  stepId: string,
  type: "CreatedPlan" | "UpdatedPlan",
  plan: string,
): StepProgressLog => ({
  type,
  plan,
  stepId,
  recordedAt: new Date().toISOString(),
  workerType: "Coordinator",
  workerInstanceId: "coordinator",
  parentInstanceId: null,
  toolCallId: null,
});

/** Signals logs to the workflow, as `logProgress` does, without its debouncing. */
const sendLogs = async (client: Client, logs: StepProgressLog[]) => {
  const { attempt, workflowId, runId } = getActivityRun();
  await client.workflow
    .getHandle(workflowId, runId)
    .signal(logProgressSignal, { attempt, logs });
};

/** Polls the history until a signal of the given name is in it, and its workflow task has had time to complete. */
const waitForSignalInHistory = async (
  handle: WorkflowHandle,
  signalName: string,
) => {
  for (;;) {
    const { events } = await handle.fetchHistory();
    if (
      events?.some(
        (event) =>
          event.workflowExecutionSignaledEventAttributes?.signalName ===
          signalName,
      )
    ) {
      await sleep(1_000);
      return;
    }
    await sleep(250);
  }
};

const numbersFlow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-000000002023",
    name: "Numbers",
    description: "Takes the first two numbers, and counts them",
    inputs: { numbers: flowInput("Number", { array: true }) },
  },
  ({ inputs, step }) => {
    const firstTwo = step("firstTwo", actions.takeFirst, {
      description: "The first two numbers",
      inputs: { items: inputs.numbers, count: constant("Number", 2) },
    });

    const counted = step("count", actions.aggregate, {
      description: "How many there are",
      inputs: {
        items: firstTwo.outputs.items,
        aggregation: constant("Aggregation", { operation: "count" }),
      },
    });

    return {
      outputs: {
        firstTwo: firstTwo.outputs.items,
        count: counted.outputs.result,
      },
    };
  },
);

const takeFirstFlow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-000000002024",
    name: "Take first",
    description: "Takes the first two numbers",
    inputs: { numbers: flowInput("Number", { array: true }) },
  },
  ({ inputs, step }) => ({
    outputs: {
      firstTwo: step("firstTwo", actions.takeFirst, {
        description: "The first two numbers",
        inputs: { items: inputs.numbers, count: constant("Number", 2) },
      }).outputs.items,
    },
  }),
);

/** Gives its step an input its action doesn't define, which validating the definition would have refused. */
const unknownStepInputFlow: FlowDefinitionWithId = {
  ...takeFirstFlow,
  flowDefinition: {
    ...takeFirstFlow.flowDefinition,
    steps: takeFirstFlow.flowDefinition.steps.map((step) =>
      step.kind === "action" && step.inputs.count
        ? { ...step, inputs: { ...step.inputs, limit: step.inputs.count } }
        : step,
    ),
  },
};

const skipFlow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-000000002025",
    name: "Skip",
    description: "Keeps a number of 50 or more, and counts what it kept",
    inputs: { number: flowInput("Number") },
  },
  ({ inputs, step }) => {
    const check = step("check", actions.if, {
      description: "Is it 50 or more?",
      inputs: {
        value: inputs.number,
        condition: constant("FilterCondition", {
          kind: "all",
          conditions: [
            {
              kind: "condition",
              subject: { kind: "input", payloadKind: "Number" },
              operator: "greaterThanOrEqual",
              value: { kind: "Number", value: 50 },
            },
          ],
        }),
      },
    });

    const keep = step("keep", actions.takeFirst, {
      description: "Only runs for a number of 50 or more",
      inputs: {
        items: check.outputs.true.orSkip().wrap(),
        count: constant("Number", 1),
      },
    });

    const counted = step("countKept", actions.aggregate, {
      description: "Runs only when keep does",
      inputs: {
        items: keep.outputs.items,
        aggregation: constant("Aggregation", { operation: "count" }),
      },
    });

    return { outputs: { keptCount: counted.outputs.result } };
  },
);

const forEachFlow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-000000002026",
    name: "For each",
    description: "Wraps each number in a list of one, and collects them",
    inputs: { numbers: flowInput("Number", { array: true }) },
  },
  ({ inputs, forEach }) => ({
    outputs: {
      collected: forEach("eachNumber", inputs.numbers, {
        description: "For each number",
        collectAs: "numbers",
        steps: (number, scope) =>
          scope.step("wrap", actions.takeFirst, {
            description: "The number as a list of one",
            inputs: { items: number.wrap(), count: constant("Number", 1) },
          }).outputs.items,
      }),
    },
  }),
);

const researchFlow = defineFlow(
  {
    flowDefinitionId: "00000000-0000-4000-8000-000000002027",
    name: "Research",
    description: "Researches a prompt",
    inputs: { prompt: flowInput("Text") },
  },
  ({ inputs, step }) => ({
    outputs: {
      proposedEntities: step("research", actions.researchEntities, {
        description: "Research the prompt",
        inputs: { prompt: inputs.prompt },
      }).outputs.proposedEntities,
    },
  }),
);

const numbers: FlowInputValues = {
  numbers: { kind: "Number", value: [3, 1, 4] },
};
const prompt: FlowInputValues = {
  prompt: { kind: "Text", value: "Who makes HASH?" },
};

export const recordingCases: Record<string, (client: Client) => RecordingCase> =
  {
    succeeds: () => ({
      flow: numbersFlow,
      flowInputs: numbers,
      actions: { takeFirstAction: takeFirst, aggregateAction: count },
    }),

    "retried-then-succeeds": () => ({
      flow: takeFirstFlow,
      flowInputs: numbers,
      actions: {
        takeFirstAction: (params) => {
          const { attempt } = getActivityRun();
          if (attempt < 3) {
            throw errorWithoutStack(`Flaky failure on attempt ${attempt}`);
          }
          return takeFirst(params);
        },
      },
    }),

    "retried-with-signals-lost": () => ({
      flow: takeFirstFlow,
      flowInputs: numbers,
      withoutAttemptSignals: true,
      actions: {
        takeFirstAction: (params) => {
          const { attempt } = getActivityRun();
          if (attempt < 3) {
            throw errorWithoutStack(`Flaky failure on attempt ${attempt}`);
          }
          return takeFirst(params);
        },
      },
    }),

    "gives-up": () => ({
      flow: takeFirstFlow,
      flowInputs: numbers,
      actions: {
        takeFirstAction: () => {
          throw errorWithoutStack(
            `Failure on attempt ${getActivityRun().attempt}`,
          );
        },
      },
    }),

    "attempt-timed-out": () => ({
      flow: researchFlow,
      flowInputs: prompt,
      actions: {
        researchEntitiesAction: async () => {
          if (getActivityRun().attempt === 1) {
            /* Stops heartbeating, so the attempt times out without throwing. */
            await sleep(15_000);
          }
          return researched;
        },
      },
    }),

    "error-status": () => ({
      flow: takeFirstFlow,
      flowInputs: numbers,
      actions: {
        takeFirstAction: () => ({
          code: StatusCode.InvalidArgument,
          message: "The count must be a whole number",
          contents: [],
        }),
      },
    }),

    "unknown-step-input": () => ({
      flow: unknownStepInputFlow,
      flowInputs: numbers,
      actions: {},
    }),

    skipped: () => ({
      flow: skipFlow,
      flowInputs: { number: { kind: "Number", value: 8 } },
      actions: {
        ifAction: ifNotMet,
        takeFirstAction: takeFirst,
        aggregateAction: count,
      },
    }),

    "for-each": () => ({
      flow: forEachFlow,
      flowInputs: numbers,
      actions: { takeFirstAction: takeFirst },
    }),

    "for-each-empty": () => ({
      flow: forEachFlow,
      flowInputs: { numbers: { kind: "Number", value: [] } },
      actions: { takeFirstAction: takeFirst },
    }),

    "input-request": (client) => {
      const requested = Promise.withResolvers<void>();
      const requestId = generateUuid();

      return {
        flow: researchFlow,
        flowInputs: prompt,
        actions: {
          researchEntitiesAction: async () => {
            const { activityId, workflowId, runId } = getActivityRun();
            const handle = client.workflow.getHandle(workflowId, runId);

            await handle.signal(externalInputRequestSignal, {
              requestId,
              stepId: activityId,
              type: "human-input",
              data: { questions: ["Which HASH do you mean?"] },
            });
            requested.resolve();

            for (;;) {
              const response = await handle.query(
                getExternalInputResponseQuery,
                { requestId },
              );
              if (response) {
                return researched;
              }
              await sleep(250);
            }
          },
        },
        steer: async ({ handle }) => {
          await requested.promise;
          await handle.signal(externalInputResponseSignal, {
            requestId,
            type: "human-input",
            data: { answers: ["The company"] },
            resolvedBy: answeringUserId,
          });
        },
      };
    },

    "progress-logs": (client) => ({
      flow: researchFlow,
      flowInputs: prompt,
      actions: {
        researchEntitiesAction: async () => {
          const { activityId } = getActivityRun();
          await sendLogs(client, [
            planLog(activityId, "CreatedPlan", "Search the web"),
            planLog(activityId, "UpdatedPlan", "Search the web, then read"),
          ]);
          await sleep(1_000);
          await sendLogs(client, [
            planLog(activityId, "UpdatedPlan", "Read what was found"),
          ]);
          await sleep(1_000);
          return researched;
        },
      },
    }),

    cancelled: () => {
      const started = Promise.withResolvers<void>();

      return {
        flow: researchFlow,
        flowInputs: prompt,
        actions: {
          researchEntitiesAction: async () => {
            started.resolve();
            await waitInActivity(new Promise(() => {}));
            return researched;
          },
        },
        steer: async ({ handle }) => {
          await started.promise;
          await sleep(1_000);
          await handle.cancel();
        },
      };
    },

    "in-progress": (client) => {
      const finish = Promise.withResolvers<void>();

      return {
        flow: researchFlow,
        flowInputs: prompt,
        actions: {
          researchEntitiesAction: async () => {
            const { activityId, attempt } = getActivityRun();
            if (attempt === 1) {
              throw errorWithoutStack("Flaky failure on attempt 1");
            }
            await sendLogs(client, [
              planLog(activityId, "CreatedPlan", "Search the web"),
            ]);
            await waitInActivity(finish.promise);
            return researched;
          },
        },
        steer: async ({ handle, record }) => {
          /* Sent by the second attempt, after it has signalled its start. */
          await waitForSignalInHistory(handle, "logProgress");
          await record("in-progress");
          finish.resolve();
        },
        closedFixtureName: "in-progress-finished",
      };
    },

    reset: (client) => {
      const checkpointed = Promise.withResolvers<void>();
      let baseRunId: string | undefined;
      let checkpointId: string | undefined;

      return {
        flow: researchFlow,
        flowInputs: prompt,
        actions: {
          researchEntitiesAction: async () => {
            const { activityId, workflowId, runId } = getActivityRun();

            if (baseRunId && runId !== baseRunId) {
              return researched;
            }

            baseRunId = runId;
            checkpointId = generateUuid();

            /*
             * As a real action checkpoints after some work: a checkpoint signalled while the workflow handles this
             * attempt's start signal isn't followed by a workflow task's start two events later, which is where the
             * run's events put its reset point.
             */
            await sleep(1_000);
            await client.workflow
              .getHandle(workflowId, runId)
              .signal(researchActionCheckpointSignal, {
                data: {},
                recordedAt: new Date().toISOString(),
                stepId: activityId,
                checkpointId,
              });
            await sleep(1_000);
            await sendLogs(client, [
              planLog(activityId, "CreatedPlan", "Search the web"),
            ]);
            await sleep(1_000);
            checkpointed.resolve();

            /* The reset closes this run, and the next heartbeat cancels this attempt. */
            await waitInActivity(new Promise(() => {}));
            return researched;
          },
        },
        steer: async ({ handle, record }) => {
          await checkpointed.promise;

          const { events } = await client.workflow
            .getHandle(handle.workflowId, baseRunId)
            .fetchHistory();
          const checkpointEventId = events
            ?.find(
              (event) =>
                event.workflowExecutionSignaledEventAttributes?.signalName ===
                "researchActionCheckpoint",
            )
            ?.eventId?.toNumber();

          if (!checkpointEventId || !checkpointId) {
            throw new Error("No checkpoint in the run's history");
          }

          /* As the `resetFlow` mutation resets a run to a checkpoint. */
          await client.workflowService.resetWorkflowExecution({
            namespace: temporalNamespace,
            workflowExecution: {
              workflowId: handle.workflowId,
              runId: baseRunId,
            },
            resetReapplyType:
              proto.temporal.api.enums.v1.ResetReapplyType
                .RESET_REAPPLY_TYPE_NONE,
            reason: checkpointId,
            requestId: generateUuid(),
            workflowTaskFinishEventId: Long.fromInt(checkpointEventId + 2),
          });

          await record("reset-base-run", baseRunId);
        },
      };
    },
  };
