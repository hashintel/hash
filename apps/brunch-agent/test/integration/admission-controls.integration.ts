/** Unpaid production rejection, continuation and active-Stop probe. */
/* oxlint-disable eslint/no-await-in-loop -- One faux response queue; ordering is the assertion boundary. */
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
  brunchModes,
  brunchSignals,
  brunchTools,
} from "@hashintel/brunch-agent";
import { CANONICAL_PETRINAUT_TOOL_NAMES } from "@hashintel/brunch-agent-plugin-sdcpn";
import { snapshotToUiMessages } from "@hashintel/brunch-agent-transport-aisdk";
import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";
import {
  createPetrinautAiWritableCallbacks,
  petrinautAiTools,
  type PetrinautAiToolInput,
} from "@hashintel/petrinaut-core/ai";

import { isAwaitingClient } from "../../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

import type { AdmissionVoiceEvidence } from "../admission-voice-evidence.ts";

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
type Mode = (typeof brunchModes)[keyof typeof brunchModes];
const canonicalNames: ReadonlySet<string> = new Set(
  CANONICAL_PETRINAUT_TOOL_NAMES,
);
const browserNames: ReadonlySet<string> = new Set([
  ...CANONICAL_PETRINAUT_TOOL_NAMES,
  brunchTools.readPetrinautDocs,
]);
// F delivers canonical calls as terminal client tools; I executes them in band.
const project = (mode: Mode, history: FlueConversationSnapshot) =>
  snapshotToUiMessages(history, {
    clientToolNames: browserNames,
    ...(mode === brunchModes.integrated
      ? { asyncClientToolNames: canonicalNames }
      : {}),
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
/** The part of a headless Petrinaut host these cases need: one addType. */
const createHeadlessPetrinaut = () => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({ initial: { places: [], transitions: [] } }),
  });
  const callbacks = createPetrinautAiWritableCallbacks(instance);
  return {
    definition: () => structuredClone(instance.definition.get()),
    addType: (input: unknown) => {
      callbacks.addType(petrinautAiTools.addType.inputSchema.parse(input));
      return { applied: true } as const;
    },
    dispose: instance.dispose,
  };
};
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
const makeCall = (name: string, baseRevisionId: string | null) =>
  fauxToolCall(
    name,
    name === "addType"
      ? typeInput
      : name === brunchTools.mutateWorkpiece
        ? { markdown: privateMarkdown, baseRevisionId }
        : { question },
    { id: `${caseId}-${name}` },
  );
const run = async () => {
  const application = await loadBuiltBrunchApplication();
  const clientFor = (mode: Mode) => {
    const identity = {
      principalKey: "admission-synthetic",
      conversationId: `${crypto.randomUUID()}-${caseId}`,
    };
    const initialData = {
      mode,
      construction: {
        binding: {
          conversationId: identity.conversationId,
          documentId: `document-${caseId}`,
          incarnationId: `incarnation-${caseId}`,
        },
      },
    };
    const client = createFlueClient({
      url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
      headers: agentOwnershipHeaders(identity),
      fetch: async (input, init) =>
        application.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
    });
    const send = async (
      message: Parameters<typeof client.send>[0]["message"],
    ) => {
      const receipt = await client.send({ initialData, message });
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
    return { client, initialData, send };
  };
  const seedRevision = async (
    { client, send }: ReturnType<typeof clientFor>,
    revisionId: string,
  ) => {
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(
            brunchTools.mutateWorkpiece,
            {
              markdown: "# Synthetic settled account\nUnknown timing.",
              baseRevisionId: null,
            },
            { id: revisionId },
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
    return { seed, seeded: await client.history() };
  };
  const observations = [];
  try {
    // F refuses any browser/server mix (`task` is Flue's built-in server tool,
    // mounted in F) and delivers browser results by signal. I admits
    // independent mixes by design and mounts the server-side Ledger revision.
    for (const [mode, names] of [
      [brunchModes.stockOverFlue, ["task", "addType"]],
      [brunchModes.stockOverFlue, ["addType", "task"]],
      [brunchModes.stockOverFlue, ["addType", "unmounted_admission_probe"]],
      [brunchModes.stockOverFlue, ["addType"]],
      [brunchModes.integrated, [brunchTools.mutateWorkpiece]],
    ] as const) {
      caseId = names.join("-");
      const conversation = clientFor(mode);
      const { client, send } = conversation;
      const baseRevisionId = `${caseId}-old-revision`;
      const seeding =
        mode === brunchModes.integrated
          ? await seedRevision(conversation, baseRevisionId)
          : undefined;
      const requestStart = requests.length;
      const generated = names.map((name) =>
        makeCall(name, seeding ? baseRevisionId : null),
      );
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
      const headless = createHeadlessPetrinaut();
      try {
        const before = headless.definition();
        const pending = pendingFrom(history);
        const results = [];
        for (const call of pending)
          results.push({
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: headless.addType(call.input),
          });
        const after = headless.definition();
        let continuation;
        if (names.length === 1 && results.length === 1) {
          const signal = {
            kind: "signal" as const,
            type: brunchSignals.clientToolResult,
            tagName: brunchSignals.clientToolResult,
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
            projected: project(mode, resumed),
            definitionAfterResume: headless.definition(),
            totalProviderCalls: requests.length - requestStart,
          };
        }
        observations.push({
          caseId,
          mode,
          seed: seeding?.seed,
          seeded: seeding?.seeded,
          generated,
          attempt,
          history,
          projected: project(mode, history),
          providerCallsBeforeClientResult,
          pendingMutationIds: pending.map((part) => part.toolCallId),
          results,
          before,
          after,
          continuation,
        });
      } finally {
        headless.dispose();
      }
    }
    // Voice runs on I, the product baseline, which also mounts the Ledger.
    const buffering = [];
    for (const abort of [false, true]) {
      caseId = abort ? "buffered-cancelled" : "buffered-valid";
      const { client, initialData } = clientFor(brunchModes.integrated);
      const stalled = createStall();
      const progressed = Promise.withResolvers<void>();
      nextStall = stalled;
      const receipt = await client.send({
        initialData,
        message: {
          kind: "user",
          body: "Synthetic completed Voice transcript.",
        },
      });
      const settlement = client
        .wait(receipt, {
          signal: AbortSignal.timeout(10000),
          onEvent: (chunk) => {
            recordWire(chunk);
            if (chunk.type === "message-delta") progressed.resolve();
          },
        })
        .then(
          () => null,
          (error: unknown) => String(error),
        );
      await stalled.started.promise;
      const text = abort
        ? "Visible progress before Stop."
        : `The account is recorded. ${question}`;
      const message = fauxAssistantMessage(
        [
          fauxText(text),
          makeCall(abort ? "addType" : brunchTools.mutateWorkpiece, null),
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
      // Progress is published natively before completion, but executable tool
      // inputs remain withheld until the proposal is admitted.
      await Promise.race([
        progressed.promise,
        settlement.then((error) => {
          throw new Error(error ?? "Submission completed before progress");
        }),
      ]);
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
        projectedDuring: project(brunchModes.integrated, during),
        projectedAfter: project(brunchModes.integrated, after),
        text,
        privateMarkdown,
      });
    }
    // The rejected F conversation holds only the refused submission.
    const rejected = observations.find(
      (observation) => observation.caseId === "task-addType",
    )!;
    const voice: AdmissionVoiceEvidence = {
      question,
      buffering,
      rejectedMessages: rejected.projected,
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
