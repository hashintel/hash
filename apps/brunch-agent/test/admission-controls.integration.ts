/** Unpaid control experiments on the built mount, NOT production admission wiring. */
/* eslint-disable no-await-in-loop -- A single faux response queue and event timeline discriminate ordering. */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type AssistantMessageEvent,
  type Provider,
} from "@earendil-works/pi-ai";
import { instrument, setProvider } from "@flue/runtime";
import { createFlueClient, type FlueConversationSnapshot } from "@flue/sdk";

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
} from "../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { createHeadlessPetrinautClient } from "../src/evaluations/runbook/headless-petrinaut-client.ts";
import { loadBuiltBrunchApplication } from "../src/evaluations/runbook/load-built-application.ts";

import type { PetrinautAiToolInput } from "@hashintel/petrinaut-core/ai";

const control = process.env.A2_ADMISSION_CONTROL ?? "baseline";
if (
  !["baseline", "observer-throw", "tool-veto", "provider-reject"].includes(
    control,
  )
) {
  throw new Error(`Unknown diagnostic control: ${control}`);
}
const directory =
  process.env.A2_OUTPUT_DIRECTORY ??
  join(tmpdir(), `admission-${crypto.randomUUID()}`);
mkdirSync(directory, { recursive: true });
process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
const save = (name: string, value: unknown) =>
  writeFileSync(join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
const timeline: unknown[] = [];
const requests: unknown[] = [];
const proposals: unknown[] = [];
let caseId = "setup";
let finalizedNames: string[] = [];
const record = (type: string, detail: unknown) =>
  timeline.push({ sequence: timeline.length, caseId, type, detail });
const browserNames: ReadonlySet<string> = new Set([
  ...PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  READ_PETRINAUT_DOC_TOOL_NAME,
]);
const mixedClasses = (names: readonly string[]) =>
  names.some((name) => browserNames.has(name)) &&
  names.some((name) => !browserNames.has(name));
const dispose = instrument({
  observe(event) {
    record("runtime", event);
    if (event.type === "turn" && event.response.output?.role === "assistant") {
      finalizedNames = event.response.output.content.flatMap((part) =>
        part.type === "toolCall" ? [part.name] : [],
      );
      if (control === "observer-throw" && mixedClasses(finalizedNames)) {
        record("observer-veto-attempt", finalizedNames);
        throw new Error("Diagnostic observer refusal");
      }
    }
  },
  async interceptor(operation, context, next) {
    record("interceptor-enter", { operation, context });
    if (
      control === "tool-veto" &&
      operation.type === "tool" &&
      browserNames.has(operation.toolName) &&
      mixedClasses(finalizedNames)
    ) {
      // Diagnostic correlation only: one serial conversation at a time. This
      // live observer variable is NOT an authorized production state authority.
      record("tool-veto", { operation, finalizedNames });
      throw new Error("Diagnostic per-tool refusal of mixed batch");
    }
    return next();
  },
  dispose() {},
});

// Demonstrate the supported custom-provider boundary without patching Flue or
// mounting a second agent. Buffer/reject is an interaction-policy candidate,
// not a shipped fix: unsafe responses fail the submission, without auto retry.
class DiagnosticAdmissionStream extends EventStream<
  AssistantMessageEvent,
  AssistantMessage
> {
  readonly admitted;
  constructor(upstream: AssistantMessageEventStream) {
    super(
      (event) => event.type === "done" || event.type === "error",
      (event) => {
        if (event.type === "done") return event.message;
        if (event.type === "error") return event.error;
        throw new Error("Not a terminal provider event");
      },
    );
    this.admitted = (async () => {
      const events: AssistantMessageEvent[] = [];
      for await (const event of upstream) events.push(structuredClone(event));
      const message = await upstream.result();
      proposals.push({ caseId, message, events });
      const names = message.content.flatMap((part) =>
        part.type === "toolCall" ? [part.name] : [],
      );
      record("provider-finalized", { names, stopReason: message.stopReason });
      if (mixedClasses(names)) {
        record("provider-refusal", names);
        throw new Error(
          "Diagnostic admission refusal: mixed browser/server proposal",
        );
      }
      return { events, message };
    })();
  }
  override async *[Symbol.asyncIterator]() {
    yield* (await this.admitted).events;
  }
  override async result() {
    return (await this.admitted).message;
  }
}
const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: "claude-sonnet-4-6", reasoning: true }],
});
const provider: Provider = {
  ...faux.provider,
  stream() {
    throw new Error("Expected streamSimple");
  },
  streamSimple(model, context, options) {
    requests.push({ caseId, context });
    record("provider-request", { requestIndex: requests.length - 1 });
    const upstream = faux.provider.streamSimple(model, context, options);
    return control === "provider-reject"
      ? new DiagnosticAdmissionStream(upstream)
      : upstream;
  },
};
setProvider(provider);
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
const makeCall = (name: string, suffix = name) =>
  fauxToolCall(
    name,
    name === "addType"
      ? typeInput
      : name === "update_workpiece"
        ? { markdown: "# Synthetic replacement\nUnknown timing." }
        : { question: "What remains unknown?" },
    { id: `${caseId}-${suffix}` },
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
    const mixedCases = [
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
    ];
    for (const names of mixedCases) {
      caseId = names.join("-");
      finalizedNames = [];
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
            onEvent: (chunk) => {
              record("wire", chunk);
            },
          });
          return { receipt, error: null };
        } catch (error) {
          return { receipt, error: String(error) };
        }
      };
      // Each attempted mixed proposal has an independently settled older revision.
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
      const generated = names.map((name) => makeCall(name));
      faux.setResponses([
        fauxAssistantMessage(generated, { stopReason: "toolUse" }),
        fauxAssistantMessage([
          fauxText("Continuation without a client result."),
        ]),
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
            body: JSON.stringify(results),
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
            projected: snapshotToUiMessages(resumed, {
              clientToolNames: browserNames,
            }),
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
    return { control, observations };
  } finally {
    await application.stop();
    await dispose();
    save("timeline.json", timeline);
    save("requests.json", requests);
    save("proposals.json", proposals);
  }
};
export type AdmissionControlsResult = Awaited<ReturnType<typeof run>>;
const result = await run();
save("observations.json", result);
process.stdout.write(`ADMISSION_CONTROLS ${JSON.stringify(result)}\n`);
