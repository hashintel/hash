/**
 * Flue, not this module, decides whether an idle provider failure is retried:
 * it reads the documented `(retryable_interruption)` marker from the failed
 * turn's message. Run admission under a real in-process Flue runtime so a
 * marker or classification change upstream fails here.
 */
import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  type Provider,
} from "@earendil-works/pi-ai";
import { init, useModel } from "@flue/runtime";
import { start, type Flue } from "@flue/runtime/node";
import { afterAll, beforeAll, expect, test } from "vitest";

import {
  claimModelStreamIdleRetry,
  withBufferedToolAdmission,
  type ModelStreamIdleRetryScope,
} from "./provider-admission.ts";

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "synthetic", reasoning: true }],
});
let retryScope: ModelStreamIdleRetryScope = { idleRetryAvailable: true };
let stallsRemaining = 0;
let requests = 0;

/** A provider whose next `stallsRemaining` invocations open and then go quiet, acknowledging cancellation. */
const stalling: Provider = {
  ...faux.provider,
  streamSimple(model, context, options) {
    requests += 1;
    if (stallsRemaining === 0)
      return faux.provider.streamSimple(model, context, options);
    stallsRemaining -= 1;
    const upstream = createAssistantMessageEventStream();
    upstream.push({ type: "start", partial: fauxAssistantMessage([]) });
    options?.signal?.addEventListener(
      "abort",
      () =>
        upstream.push({
          type: "error",
          reason: "aborted",
          error: fauxAssistantMessage([], { stopReason: "aborted" }),
        }),
      { once: true },
    );
    return upstream;
  },
};

const RetryProbeAgent = () => {
  useModel(`${faux.models[0].provider}/${faux.models[0].id}`);
  return "Answer briefly.";
};
RetryProbeAgent.agentName = "retry-probe";

let flue: Flue;
beforeAll(async () => {
  flue = await start({
    agents: [RetryProbeAgent],
    providers: [
      withBufferedToolAdmission(stalling, () => true, new Set(), {
        cancellationTimeoutMs: 1_000,
        claimRetry: () => claimModelStreamIdleRetry(retryScope),
        firstEventTimeoutMs: 50,
        idleTimeoutMs: 50,
        reasoningStartTimeoutMs: 50,
      }),
    ],
  });
});
afterAll(async () => {
  await flue.stop();
});

const send = async () => {
  const agent = init(RetryProbeAgent, { id: crypto.randomUUID() });
  const receipt = await agent.dispatch("Hello.");
  return agent.read(receipt).then(
    (reply) => ({ reply }),
    (error: unknown) => ({ error }),
  );
};

test("Flue re-runs a pre-tool idle failure once admission marks it retryable", async () => {
  retryScope = { idleRetryAvailable: true };
  stallsRemaining = 1;
  requests = 0;
  faux.setResponses([fauxAssistantMessage([fauxText("Recovered.")])]);

  const outcome = await send();

  expect(outcome).toMatchObject({ reply: { text: "Recovered." } });
  expect(requests).toBe(2);
  expect(retryScope.idleRetryAvailable).toBe(false);
}, 15_000);

test("Flue settles without re-running an idle failure once the single retry is spent", async () => {
  retryScope = { idleRetryAvailable: false };
  stallsRemaining = 1;
  requests = 0;
  faux.setResponses([fauxAssistantMessage([fauxText("Must not run.")])]);

  const outcome = await send();

  expect(outcome).not.toMatchObject({ reply: { text: "Must not run." } });
  expect(requests).toBe(1);
  expect(faux.getPendingResponseCount()).toBe(1);
}, 15_000);
