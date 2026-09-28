/**
 * A real threshold compaction through the built mount: which earlier tool
 * results leave the model's context, and whether the Ledger still compiles
 * from canonical history. Contexts and history are written to the observation
 * directory before any assertion runs.
 * Spawned by `test/integration/compaction.test.ts`.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type AssistantMessage,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

const directory =
  process.env.COMPACTION_OBSERVATION_DIRECTORY ??
  mkdtempSync(join(tmpdir(), "brunch-compaction-"));
mkdirSync(directory, { recursive: true });
const save = (name: string, value: unknown) =>
  writeFileSync(
    join(directory, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );

process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
delete process.env.HASH_OTLP_ENDPOINT;
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
// The faux catalogue's model has a 128k-token window and the faux provider
// estimates about four characters per token, so two large messages cross the
// compaction threshold.
process.env.BRUNCH_CHAT_MODEL = "openai/faux-1";
process.env.BRUNCH_TEST_KEEP_RECENT_TOKENS = "200";

const faux = fauxProvider({ provider: "openai" });
const requests: { label: string; messages: number; hasC1: boolean }[] = [];
type Step = (context: Context) => AssistantMessage;
const steps: Step[] = [];
const contains = (context: Context, toolCallId: string) =>
  context.messages.some(
    (message) =>
      message.role === "toolResult" && message.toolCallId === toolCallId,
  );
installFauxProvider(faux.provider);
faux.setResponses(
  Array.from({ length: 20 }, () => (context: Context) => {
    const summary = (context.tools ?? []).length === 0;
    requests.push({
      label: summary ? "summary" : `agent-${requests.length}`,
      messages: context.messages.length,
      hasC1: contains(context, "c1"),
    });
    if (summary)
      return fauxAssistantMessage("Summary: filler about truck loading.");
    const step = steps.shift();
    assert(step, "The script ran out of scripted agent steps.");
    return step(context);
  }),
);

const call = (id: string, name: string, args: Record<string, unknown>) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const reply = (text: string) => () => fauxAssistantMessage([fauxText(text)]);
const filler = (label: string) =>
  `${label}: ${"The loading dock handles one truck at a time. ".repeat(3_500)}`;

const application = await loadBuiltBrunchApplication();
const identity = {
  principalKey: "compaction-owner",
  conversationId: `compaction-${crypto.randomUUID()}`,
};
const client = createFlueClient({
  url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
  headers: agentOwnershipHeaders(identity),
  fetch: async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    ),
});
let initialized = false;
const speak = async (body: string) => {
  const initialData = initialized
    ? {}
    : {
        initialData: {
          binding: {
            conversationId: identity.conversationId,
            documentId: "compaction-document",
            incarnationId: "compaction-incarnation",
          },
        },
      };
  initialized = true;
  await client.wait(
    await client.send({ ...initialData, message: { kind: "user", body } }),
  );
};

let compiled: unknown;
try {
  steps.push(
    () =>
      call("c1", "ledger_commit", {
        changes: [
          {
            op: "add",
            address: "purpose",
            content: "Size the night crew.",
            source: "person",
            standing: "settled",
          },
        ],
      }),
    reply("Recorded."),
  );
  await speak("We need to size the night crew.");
  steps.push(reply("Noted."));
  await speak(filler("First background"));
  steps.push(
    () => call("k1", "ledger_compile", {}),
    (context) => {
      const result = context.messages.find(
        (message) =>
          message.role === "toolResult" && message.toolCallId === "k1",
      );
      compiled =
        result?.role === "toolResult"
          ? JSON.parse(
              result.content
                .flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join(""),
            )
          : undefined;
      return fauxAssistantMessage([fauxText("Read back.")]);
    },
  );
  await speak(filler("Second background"));
  save("history", await client.history());
} finally {
  save("requests", requests);
  save("compiled", compiled ?? null);
  await application.stop();
}

process.stdout.write(`COMPACTION_OBSERVATIONS ${directory}\n`);
const summaries = requests.filter(({ label }) => label === "summary").length;
const afterSummary = requests.slice(
  requests.findIndex(({ label }) => label === "summary") + 1,
);
process.stdout.write(
  `SUMMARY_REQUESTS ${summaries}; REQUESTS ${JSON.stringify(requests)}\n`,
);
assert(summaries > 0, "The scripted context must cross the threshold.");
assert(
  requests.some(({ label, hasC1 }) => label.startsWith("agent") && hasC1),
  "c1's result is in context before compaction.",
);
assert(
  afterSummary.every(({ hasC1 }) => !hasC1),
  "After compaction the model's context no longer carries c1's result.",
);
assert.match(
  (compiled as { markdown?: string } | undefined)?.markdown ?? "",
  /\[n1 — person; settled\] `purpose\/n1`/u,
  "The Ledger still compiles from canonical history.",
);
process.stdout.write("COMPACTION_PASS\n");
