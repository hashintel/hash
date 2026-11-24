import { expect, test } from "vitest";

import { createModelCallScope } from "./model-call-scope.ts";

test("a model call inherits the submission ID of the agent operation around it", async () => {
  const scope = createModelCallScope();
  const seen = await scope.interceptor(
    { type: "agent", operationId: "TEST-submission", operationKind: "prompt" },
    {
      instanceId: "TEST-instance",
      submissionId: "TEST-submission",
      agentName: "ChatAgent",
    },
    () =>
      scope.interceptor(
        { type: "model", turnId: "TEST-turn" },
        // Flue builds a model call's context from the harness identity,
        // which has no submission ID.
        {
          instanceId: "TEST-instance",
          agentName: "ChatAgent",
          conversationId: "TEST-conversation",
          operationId: "TEST-operation",
          turnId: "TEST-turn",
        },
        async () => scope.current(),
      ),
  );
  expect(seen).toEqual({
    submissionId: "TEST-submission",
    turnId: "TEST-turn",
  });
  expect(scope.current()).toBeUndefined();
});
