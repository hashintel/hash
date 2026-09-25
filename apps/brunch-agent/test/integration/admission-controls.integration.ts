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

import { brunchModes, brunchTools } from "@hashintel/brunch-agent";
import { snapshotToUiMessages } from "@hashintel/brunch-agent-transport-aisdk";

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
const project = (history: FlueConversationSnapshot) =>
  snapshotToUiMessages(history, {
    clientToolNames: new Set(["addType", brunchTools.readPetrinautDocs]),
    asyncClientToolNames: new Set(["addType"]),
  });
const faux = fauxProvider({ provider: "openai" });
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
const question = "What remains unknown?";
const privateMarkdown =
  "# Workpiece payload must not be spoken\nUnknown timing.";
const makeCall = (name: string, baseRevisionId: string | null) =>
  fauxToolCall(
    name,
    name === brunchTools.mutateWorkpiece
      ? { markdown: privateMarkdown, baseRevisionId }
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
    const initialData = {
      mode: brunchModes.integrated,
      construction: {
        binding: {
          conversationId: identity.conversationId,
          documentId: `document-${caseId}`,
          incarnationId: `incarnation-${caseId}`,
        },
      },
    };
    const client = createFlueClient({
      url: `http://brunch.local/agents/chat/${flueConversationIdFrom(
        identity,
      )}`,
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
  const refusals = [];
  try {
    // I admits allowlisted mixes; `task` (Flue's built-in server tool) and an
    // unmounted name are outside that allowlist beside a browser tool.
    for (const names of [
      ["task", "addType"],
      ["addType", "task"],
      ["addType", "unmounted_admission_probe"],
    ]) {
      caseId = names.join("-");
      const conversation = clientFor();
      const requestStart = requests.length;
      const generated = names.map((name) => makeCall(name, null));
      faux.setResponses([
        fauxAssistantMessage(generated, { stopReason: "toolUse" }),
        fauxAssistantMessage([fauxText(question)]),
      ]);
      const attempt = await conversation.send({
        kind: "user",
        body: "Synthetic admission-control probe; no plant facts.",
      });
      refusals.push({
        caseId,
        generated,
        attempt,
        history: await conversation.client.history(),
        providerCalls: requests.length - requestStart,
      });
    }
    caseId = brunchTools.mutateWorkpiece;
    const conversation = clientFor();
    const baseRevisionId = `${caseId}-old-revision`;
    const seeding = await seedRevision(conversation, baseRevisionId);
    const requestStart = requests.length;
    faux.setResponses([
      fauxAssistantMessage(
        [makeCall(brunchTools.mutateWorkpiece, baseRevisionId)],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText(question)]),
    ]);
    const attempt = await conversation.send({
      kind: "user",
      body: "Synthetic admission-control probe; no plant facts.",
    });
    observations.push({
      caseId,
      seed: seeding.seed,
      seeded: seeding.seeded,
      attempt,
      providerCallsBeforeClientResult: requests.length - requestStart,
    });
    // Voice runs on I, the product baseline, which also mounts the Ledger.
    const buffering = [];
    for (const abort of [false, true]) {
      caseId = abort ? "buffered-cancelled" : "buffered-valid";
      const { client, initialData } = clientFor();
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
        projectedDuring: project(during),
        projectedAfter: project(after),
        text,
        privateMarkdown,
      });
    }
    const voice: AdmissionVoiceEvidence = { question, buffering };
    return { observations, refusals, buffering, question, wire, voice };
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
