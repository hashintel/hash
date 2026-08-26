import { expect, test } from "vitest";

import {
  createTurnTimingRecorder,
  type TurnTimingPurpose,
} from "../../../libs/@hashintel/brunch-agent/evaluations/protocols/process-model-elicitation/baseline/turn-timing.ts";

import type { FlueObservation, ModelRequest } from "@flue/runtime";

const observation = (
  event: Partial<FlueObservation> & Pick<FlueObservation, "type">,
): FlueObservation => event as FlueObservation;

const request = (latestUserMessage = "Continue."): ModelRequest => ({
  providerId: "faux",
  providerName: "faux",
  requestedModel: "faux-model",
  api: "faux",
  input: {
    messages: [{ role: "user", content: latestUserMessage }],
  },
});

const completedTurn = (
  turnId: string,
  operationId: string | undefined,
  purpose: "agent" | "compaction",
): FlueObservation =>
  observation({
    type: "turn",
    turnId,
    operationId,
    purpose,
    durationMs: 17,
    request: {
      providerId: "faux",
      providerName: "faux",
      requestedModel: "faux-model",
      api: "faux",
    },
    response: {},
    isError: false,
  });

test("attributes harness signals and unscoped compaction to the active purpose", () => {
  const recorder = createTurnTimingRecorder();
  recorder.startInterviewerTurn(1);
  recorder.observe(
    observation({
      type: "operation_start",
      operationId: "outer",
      operationKind: "prompt",
    }),
  );
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "interview",
      operationId: "outer",
      purpose: "agent",
      request: request(),
    }),
  );
  recorder.observe(completedTurn("interview", "outer", "agent"));
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "sweep",
      operationId: "outer",
      purpose: "agent",
      request: request(
        '<settlement-check type="state">\nSweep.\n</settlement-check>',
      ),
    }),
  );
  recorder.observe(completedTurn("sweep", "outer", "agent"));
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "sweep-compaction",
      purpose: "compaction",
      request: request(),
    }),
  );
  recorder.observe(completedTurn("sweep-compaction", undefined, "compaction"));
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "repair",
      operationId: "outer",
      purpose: "agent",
      request: request('<sweep-repair type="state">\nRetry.\n</sweep-repair>'),
    }),
  );
  recorder.observe(completedTurn("repair", "outer", "agent"));

  expect(
    Object.fromEntries(
      recorder
        .all()
        .map((timing) => [timing.flueTurnId, timing.purpose] as const),
    ),
  ).toEqual<Record<string, TurnTimingPurpose>>({
    interview: "interview",
    sweep: "sweep",
    "sweep-compaction": "sweep",
    repair: "repair",
  });
});

test("attributes an inline retry after a refused sweep as repair", () => {
  const recorder = createTurnTimingRecorder();
  recorder.startInterviewerTurn(1);
  recorder.observe(
    observation({
      type: "operation_start",
      operationId: "outer",
      operationKind: "prompt",
    }),
  );
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "interview",
      operationId: "outer",
      purpose: "agent",
      request: request(),
    }),
  );
  recorder.observe(
    observation({
      type: "operation_start",
      operationId: "initial-extraction",
      operationKind: "prompt",
    }),
  );
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "sweep-extraction",
      operationId: "initial-extraction",
      purpose: "agent",
      request: request("Extract proposals."),
    }),
  );
  recorder.observe(
    completedTurn("sweep-extraction", "initial-extraction", "agent"),
  );
  recorder.observe(
    observation({
      type: "operation",
      operationId: "initial-extraction",
      operationKind: "prompt",
    }),
  );
  recorder.observe(
    observation({
      type: "tool",
      toolName: "brunch_sweep",
      toolCallId: "refused-sweep",
      isError: false,
      result: { status: "refused" },
      durationMs: 1,
    }),
  );
  recorder.observe(
    observation({
      type: "operation_start",
      operationId: "repair-extraction",
      operationKind: "prompt",
    }),
  );
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "repair-compaction",
      purpose: "compaction",
      request: request(),
    }),
  );
  recorder.observe(completedTurn("repair-compaction", undefined, "compaction"));
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "repair-extraction",
      operationId: "repair-extraction",
      purpose: "agent",
      request: request("Extract repaired proposals."),
    }),
  );
  recorder.observe(
    completedTurn("repair-extraction", "repair-extraction", "agent"),
  );
  recorder.observe(completedTurn("interview", "outer", "agent"));

  expect(
    Object.fromEntries(
      recorder
        .all()
        .map((timing) => [timing.flueTurnId, timing.purpose] as const),
    ),
  ).toEqual<Record<string, TurnTimingPurpose>>({
    "sweep-extraction": "sweep",
    "repair-compaction": "repair",
    "repair-extraction": "repair",
    interview: "interview",
  });
});
