/** Unpaid production registration, rejection, continuation and active-Stop probe. */
/* eslint-disable no-await-in-loop -- One faux response queue; ordering is the assertion boundary. */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Provider,
} from "@earendil-works/pi-ai";
import { observe } from "@flue/runtime";
import {
  createFlueClient,
  type ConversationStreamChunk,
  type FlueConversationSnapshot,
} from "@flue/sdk";

import {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  READ_PETRINAUT_DOC_TOOL_NAME,
  VALIDATED_CONSTRUCTION_MODE,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { snapshotToUiMessages } from "@hashintel/brunch-agent-transport-aisdk";
import { BRUNCH_QUESTION_TOOL_NAME } from "@hashintel/brunch-agent/question-marker";

import {
  CLIENT_TOOL_RESULT_SIGNAL,
  isAwaitingClient,
} from "../../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { createHeadlessPetrinautClient } from "../../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../../src/evaluations/runbook/load-built-application.ts";

import type { AdmissionVoiceEvidence } from "../admission-voice-evidence.ts";
import type { PetrinautAiToolInput } from "@hashintel/petrinaut-core/ai";

const directory =
  process.env.A2_OUTPUT_DIRECTORY ?? mkdtempSync(join(tmpdir(), "admission-"));
if (process.env.A2_OUTPUT_DIRECTORY !== undefined) {
  mkdirSync(directory, { recursive: true });
}
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
const save = (name: string, value: unknown) =>
  writeFileSync(join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
const timeline: unknown[] = [];
const requests: unknown[] = [];
let caseId = "setup";
const record = (type: string, detail: unknown) => {
  timeline.push({ sequence: timeline.length, caseId, type, detail });
};
const wire: { caseId: string; chunk: ConversationStreamChunk }[] = [];
const recordWire = (chunk: ConversationStreamChunk) => {
  wire.push({ caseId, chunk });
  record("wire", chunk);
};
const unobserve = observe((event) => record("runtime", event));
const browserNames: ReadonlySet<string> = new Set([
  ...PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  READ_PETRINAUT_DOC_TOOL_NAME,
]);
const project = (history: FlueConversationSnapshot) =>
  snapshotToUiMessages(history, {
    clientToolNames: browserNames,
    hiddenToolNames: new Set([BRUNCH_QUESTION_TOOL_NAME]),
  });
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
const createStall = () => ({
  upstream: createAssistantMessageEventStream(),
  started: Promise.withResolvers<void>(),
  signal: undefined as AbortSignal | undefined,
});
let nextStall: ReturnType<typeof createStall> | undefined;
installFauxProvider({
  ...faux.provider,
  stream() {
    throw new Error("Expected production streamSimple");
  },
  streamSimple(model, context, options) {
    requests.push({ caseId, context });
    record("provider-request", { requestIndex: requests.length - 1 });
    if (nextStall) {
      const stalled = nextStall;
      nextStall = undefined;
      stalled.signal = options?.signal;
      stalled.started.resolve();
      return stalled.upstream;
    }
    return faux.provider.streamSimple(model, context, options);
  },
} satisfies Provider);
const toolsFrom = (snapshot: FlueConversationSnapshot) =>
  snapshot.messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === "dynamic-tool" ? [part] : [],
    ),
  );
const pendingFrom = (snapshot: FlueConversationSnapshot) =>
  toolsFrom(snapshot).filter(
    (part) =>
      part.toolName === "addType" &&
      part.state === "output-available" &&
      isAwaitingClient(part.output),
  );
const typeInput = {
  id: "synthetic-type",
  name: "SyntheticType",
  iconSlug: "circle",
  displayColor: "#808080",
  elements: [],
} satisfies PetrinautAiToolInput<"addType">;
const question = "What remains unknown?";
const privateMarkdown =
  "# Workpiece payload must not be spoken\nUnknown timing.";
const makeCall = (name: string) =>
  fauxToolCall(
    name,
    name === "addType"
      ? typeInput
      : name === "update_workpiece"
        ? { markdown: privateMarkdown }
        : { question },
    { id: `${caseId}-${name}` },
  );
const run = async () => {
  const application = await loadBuiltBrunchApplication();
  const clientFor = () => {
    const identity = {
      principalKey: "admission-synthetic",
      conversationId: `${crypto.randomUUID()}-${caseId}`,
    };
    return createFlueClient({
      url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
      headers: agentOwnershipHeaders(identity),
      fetch: async (input, init) =>
        application.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
    });
  };
  const observations = [];
  try {
    for (const names of [
      [BRUNCH_QUESTION_TOOL_NAME, "addType"],
      ["addType", BRUNCH_QUESTION_TOOL_NAME],
      ["update_workpiece", "addType"],
      ["addType", "update_workpiece"],
      [BRUNCH_QUESTION_TOOL_NAME, "update_workpiece", "addType"],
      [BRUNCH_QUESTION_TOOL_NAME, "addType", "update_workpiece"],
      ["update_workpiece", BRUNCH_QUESTION_TOOL_NAME, "addType"],
      ["update_workpiece", "addType", BRUNCH_QUESTION_TOOL_NAME],
      ["addType", BRUNCH_QUESTION_TOOL_NAME, "update_workpiece"],
      ["addType", "update_workpiece", BRUNCH_QUESTION_TOOL_NAME],
      ["addType", "unmounted_admission_probe"],
      ["addType"],
      [BRUNCH_QUESTION_TOOL_NAME],
      ["update_workpiece", BRUNCH_QUESTION_TOOL_NAME],
    ]) {
      caseId = names.join("-");
      const client = clientFor();
      const send = async (
        message: Parameters<typeof client.send>[0]["message"],
      ) => {
        const receipt = await client.send({
          initialData: { mode: VALIDATED_CONSTRUCTION_MODE },
          message,
        });
        try {
          await client.wait(receipt, {
            signal: AbortSignal.timeout(10000),
            onEvent: recordWire,
          });
          return { receipt, error: null };
        } catch (error) {
          return { receipt, error: String(error) };
        }
      };
      faux.setResponses([
        fauxAssistantMessage(
          [
            fauxToolCall(
              "update_workpiece",
              { markdown: "# Synthetic settled account\nUnknown timing." },
              { id: `${caseId}-old-revision` },
            ),
          ],
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage([fauxText("Recorded the synthetic account.")]),
      ]);
      const seed = await send({
        kind: "user",
        body: "Record this synthetic account.",
      });
      const seeded = await client.history();
      const requestStart = requests.length;
      const generated = names.map(makeCall);
      faux.setResponses([
        fauxAssistantMessage(generated, { stopReason: "toolUse" }),
        fauxAssistantMessage([fauxText(question)]),
      ]);
      const attempt = await send({
        kind: "user",
        body: "Synthetic admission-control probe; no plant facts.",
      });
      const history = await client.history();
      const providerCallsBeforeClientResult = requests.length - requestStart;
      const headless = createHeadlessPetrinautClient(caseId);
      try {
        const before = structuredClone(headless.definition());
        const pending = pendingFrom(history);
        const results = [];
        for (const call of pending)
          results.push(
            await headless.execute({
              toolName: call.toolName,
              toolCallId: call.toolCallId,
              input: call.input,
            }),
          );
        const after = structuredClone(headless.definition());
        let continuation;
        if (names.length === 1 && results.length === 1) {
          const signal = {
            kind: "signal" as const,
            type: CLIENT_TOOL_RESULT_SIGNAL,
            tagName: CLIENT_TOOL_RESULT_SIGNAL,
            body: JSON.stringify(
              results.map((result) => ({ ...result, source: "voice" })),
            ),
          };
          faux.setResponses([
            fauxAssistantMessage([
              fauxText("The correlated synthetic client result is received."),
            ]),
          ]);
          record("client-result-send", signal);
          const outcome = await send(signal);
          const resumed = await client.history();
          continuation = {
            outcome,
            history: resumed,
            projected: project(resumed),
            definitionAfterResume: structuredClone(headless.definition()),
            totalProviderCalls: requests.length - requestStart,
          };
        }
        observations.push({
          caseId,
          seed,
          seeded,
          generated,
          attempt,
          history,
          projected: project(history),
          providerCallsBeforeClientResult,
          pendingMutationIds: pending.map((part) => part.toolCallId),
          results,
          before,
          after,
          mutationApplied: before.types.length !== after.types.length,
          continuation,
          actualBrowserApplied: null,
        });
      } finally {
        headless.dispose();
      }
    }
    const buffering = [];
    for (const abort of [false, true]) {
      caseId = abort ? "buffered-cancelled" : "buffered-valid";
      const client = clientFor();
      const stalled = createStall();
      nextStall = stalled;
      const receipt = await client.send({
        initialData: { mode: VALIDATED_CONSTRUCTION_MODE },
        message: {
          kind: "user",
          body: "Synthetic completed Voice transcript.",
        },
      });
      const settlement = client
        .wait(receipt, {
          signal: AbortSignal.timeout(10000),
          onEvent: recordWire,
        })
        .then(
          () => null,
          (error: unknown) => String(error),
        );
      await stalled.started.promise;
      const text = abort
        ? "Cancelled prose must never be spoken."
        : `The account is recorded. ${question}`;
      const message = fauxAssistantMessage(
        [
          fauxText(text),
          ...(abort
            ? [makeCall("addType")]
            : [
                makeCall("update_workpiece"),
                makeCall(BRUNCH_QUESTION_TOOL_NAME),
              ]),
        ],
        { stopReason: "toolUse" },
      );
      stalled.upstream.push({ type: "start", partial: message });
      stalled.upstream.push({
        type: "text_start",
        contentIndex: 0,
        partial: message,
      });
      stalled.upstream.push({
        type: "text_delta",
        contentIndex: 0,
        delta: text,
        partial: message,
      });
      stalled.upstream.push({
        type: "text_end",
        contentIndex: 0,
        content: text,
        partial: message,
      });
      for (const [contentIndex, part] of message.content.entries()) {
        if (part.type === "toolCall") {
          stalled.upstream.push({
            type: "toolcall_start",
            contentIndex,
            partial: message,
          });
          stalled.upstream.push({
            type: "toolcall_delta",
            contentIndex,
            delta: JSON.stringify(part.arguments),
            partial: message,
          });
          stalled.upstream.push({
            type: "toolcall_end",
            contentIndex,
            toolCall: part,
            partial: message,
          });
        }
      }
      // Reading the mounted store while the provider is unfinished must expose
      // neither the prose nor the proposed tool inputs to Voice/browser hosts.
      const during = await client.history();
      if (abort) await client.abort();
      else
        faux.setResponses([
          fauxAssistantMessage([fauxText("Timing remains unknown.")]),
        ]);
      if (abort) await settlement;
      stalled.upstream.push({ type: "done", reason: "toolUse", message });
      const error = await settlement;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const after = await client.history();
      buffering.push({
        caseId,
        receipt,
        error,
        upstreamAborted: stalled.signal?.aborted,
        during,
        after,
        projectedDuring: project(during),
        projectedAfter: project(after),
        text,
        privateMarkdown,
      });
    }
    const rejected = observations.find(
      (observation) => observation.caseId === "brunch_mark_question-addType",
    )!;
    const priorIds = new Set(
      rejected.seeded.messages.map((message) => message.id),
    );
    const voice: AdmissionVoiceEvidence = {
      question,
      buffering,
      rejectedMessages: rejected.projected.filter(
        (message) => !priorIds.has(message.id),
      ),
    };
    return { observations, buffering, question, wire, voice };
  } finally {
    await application.stop();
    unobserve();
    save("timeline.json", timeline);
    save("requests.json", requests);
  }
};
export type AdmissionControlsResult = Awaited<ReturnType<typeof run>>;
const result = await run();
save("observations.json", result);
process.stdout.write(`ADMISSION_CONTROLS ${JSON.stringify(result)}\n`);
