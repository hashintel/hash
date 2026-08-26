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
  operationId: string,
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

test("attributes compaction and nested extraction to the active harness purpose", () => {
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
      turnId: "repair",
      operationId: "outer",
      purpose: "agent",
      request: request('<sweep-repair type="state">\nRetry.\n</sweep-repair>'),
    }),
  );
  recorder.observe(completedTurn("repair", "outer", "agent"));
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "repair-compaction",
      operationId: "outer",
      purpose: "compaction",
      request: request(),
    }),
  );
  recorder.observe(completedTurn("repair-compaction", "outer", "compaction"));
  recorder.observe(
    observation({
      type: "operation_start",
      operationId: "nested",
      operationKind: "prompt",
    }),
  );
  recorder.observe(
    observation({
      type: "turn_request",
      turnId: "repair-extraction",
      operationId: "nested",
      purpose: "agent",
      request: request("Extract repaired proposals."),
    }),
  );
  recorder.observe(completedTurn("repair-extraction", "nested", "agent"));

  expect(
    Object.fromEntries(
      recorder
        .all()
        .map((timing) => [timing.flueTurnId, timing.purpose] as const),
    ),
  ).toEqual<Record<string, TurnTimingPurpose>>({
    interview: "interview",
    repair: "repair",
    "repair-compaction": "repair",
    "repair-extraction": "repair",
  });
});
