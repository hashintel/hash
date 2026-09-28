/**
 * The Ledger through the built mount: whether a running `ledger_commit` sees
 * the accepted commits before it in the same turn, how sibling commits in one
 * proposal settle, and whether compilation survives a restart and a
 * compaction. Every model-facing context, history snapshot and tool output is
 * written to the observation directory before any assertion runs.
 * Spawned by `test/integration/ledger-history.test.ts`.
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

import { reconstructLedger } from "@hashintel/brunch-agent";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

const directory =
  process.env.LEDGER_OBSERVATION_DIRECTORY ??
  mkdtempSync(join(tmpdir(), "ledger-history-"));
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
process.env.BRUNCH_TEST_KEEP_RECENT_TOKENS = "200";

const faux = fauxProvider({ provider: "openai" });
const contexts: { label: string; context: Context }[] = [];
type Step = (context: Context) => AssistantMessage;
const steps: Step[] = [];
const isSummaryRequest = (context: Context) =>
  (context.tools ?? []).length === 0;
installFauxProvider(faux.provider);
faux.setResponses(
  Array.from({ length: 40 }, () => (context: Context) => {
    if (isSummaryRequest(context)) {
      contexts.push({ label: "summary-request", context });
      return fauxAssistantMessage(
        "Summary: the person described truck loading and crew size.",
      );
    }
    const step = steps.shift();
    assert(step, "The script ran out of scripted agent steps.");
    contexts.push({ label: `agent-${contexts.length}`, context });
    return step(context);
  }),
);

const call = (id: string, name: string, args: Record<string, unknown>) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const calls = (...entries: [string, string, Record<string, unknown>][]) =>
  fauxAssistantMessage(
    entries.map(([id, name, args]) => fauxToolCall(name, args, { id })),
    { stopReason: "toolUse" },
  );
const toolOutput = (context: Context, toolCallId: string): unknown => {
  const result = context.messages.find(
    (message) =>
      message.role === "toolResult" && message.toolCallId === toolCallId,
  );
  if (result?.role !== "toolResult") return { missing: toolCallId };
  const text = result.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { unparsed: text, isError: result.isError };
  }
};
/** Report a large context so the next turn crosses the compaction threshold. */
const inflated = (message: AssistantMessage): AssistantMessage => ({
  ...message,
  usage: { ...message.usage, input: 1_000_000, totalTokens: 1_000_000 },
});

const observed: Record<string, unknown> = {};
const note = (
  op: "add" | "supersede",
  address: string,
  content: string,
  standing = "settled",
) => ({ op, address, content, source: "person", standing });

let application = await loadBuiltBrunchApplication();
const identity = {
  principalKey: "ledger-owner",
  conversationId: `ledger-${crypto.randomUUID()}`,
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
            documentId: "ledger-document",
          },
        },
      };
  initialized = true;
  await client.wait(
    await client.send({ ...initialData, message: { kind: "user", body } }),
  );
};

try {
  steps.push(
    () =>
      call("c1", "ledger_commit", {
        changes: [
          note("add", "purpose", "Size the night crew for truck loading."),
          note("add", "operational/resources", "Two people load each truck."),
        ],
      }),
    (context) => {
      observed.c1 = toolOutput(context, "c1");
      return call("c2", "ledger_commit", {
        changes: [
          note("supersede", "n2", "Three people load a hazardous truck."),
        ],
      });
    },
    (context) => {
      observed.c2 = toolOutput(context, "c2");
      return calls(
        ["s1", "ledger_commit", { changes: [note("add", "delivery", "A.")] }],
        ["s2", "ledger_commit", { changes: [note("add", "delivery", "B.")] }],
      );
    },
    (context) => {
      observed.s1 = toolOutput(context, "s1");
      observed.s2 = toolOutput(context, "s2");
      return call("k1", "ledger_compile", {});
    },
    (context) => {
      observed.k1 = toolOutput(context, "k1");
      return fauxAssistantMessage([fauxText("Recorded.")]);
    },
  );
  await speak("Two people load each truck; we need to size the night crew.");
  save("history-turn-1", await client.history());

  await application.stop();
  application = await loadBuiltBrunchApplication();
  steps.push(
    () => call("k2", "ledger_compile", {}),
    (context) => {
      observed.k2 = toolOutput(context, "k2");
      return call("c3", "ledger_commit", {
        changes: [
          note("supersede", "n1", "Size both night crews.", "tentative"),
        ],
      });
    },
    (context) => {
      observed.c3 = toolOutput(context, "c3");
      return inflated(fauxAssistantMessage([fauxText("Recorded again.")]));
    },
  );
  await speak("After the restart: there are two night crews, I think.");
  save("history-turn-2", await client.history());

  steps.push(
    (context) => {
      observed.turn3ContextMessages = context.messages.length;
      observed.turn3ContextHasC1 = JSON.stringify(context.messages).includes(
        '"c1"',
      );
      return call("k3", "ledger_compile", {});
    },
    (context) => {
      observed.k3 = toolOutput(context, "k3");
      return fauxAssistantMessage([fauxText("Read back.")]);
    },
  );
  await speak("Read the Ledger back.");
  const finalHistory = await client.history();
  save("history-turn-3", finalHistory);
  observed.summaryRequests = contexts.filter(
    ({ label }) => label === "summary-request",
  ).length;
  observed.reconstructed = reconstructLedger(finalHistory);
  observed.userMessageIds = finalHistory.messages
    .filter((message) => message.role === "user" && message.purpose === "user")
    .map((message) => message.id);
} finally {
  save("contexts", contexts);
  save("observations", observed);
  await application.stop();
}

process.stdout.write(`LEDGER_OBSERVATIONS ${directory}\n`);

const markdownOf = (output: unknown): string => {
  assert(
    typeof output === "object" &&
      output !== null &&
      "markdown" in output &&
      typeof output.markdown === "string",
    `Expected a compilation, got ${JSON.stringify(output)}`,
  );
  return output.markdown;
};

assert.deepEqual(observed.c1, {
  status: "recorded",
  commitId: "c1",
  revision: 1,
  notes: [{ address: "purpose/n1" }, { address: "operational/resources/n2" }],
});
assert.deepEqual(
  observed.c2,
  {
    status: "recorded",
    commitId: "c2",
    revision: 2,
    notes: [
      {
        address: "operational/resources/n3",
        supersedes: "operational/resources/n2",
      },
    ],
  },
  "A later call in the same turn sees the earlier accepted commit.",
);
assert.partialDeepStrictEqual(observed.s1, {
  status: "recorded",
  notes: [{ address: "delivery/n4" }],
});
// Flue may run a proposal's calls together or in turn; either way the ids
// never collide.
const siblingRecorded =
  (observed.s2 as { status?: string } | undefined)?.status === "recorded";
assert.partialDeepStrictEqual(
  observed.s2,
  siblingRecorded
    ? { status: "recorded", notes: [{ address: "delivery/n5" }] }
    : { status: "refused", code: "concurrent-commit", revision: 2 },
);
const beforeRestart = markdownOf(observed.k1);
assert.match(beforeRestart, /\[n2 — superseded by n3; person; settled\]/u);
assert.equal(
  markdownOf(observed.k2),
  beforeRestart,
  "Restart changes nothing.",
);
const c3Id = siblingRecorded ? "n6" : "n5";
assert.partialDeepStrictEqual(observed.c3, {
  status: "recorded",
  notes: [{ address: `purpose/${c3Id}`, supersedes: "purpose/n1" }],
});
const reconstructed = observed.reconstructed as ReturnType<
  typeof reconstructLedger
>;
const userIds = observed.userMessageIds as string[];
assert.deepEqual(
  reconstructed.map(({ commitId, afterMessageId }) => ({
    commitId,
    afterMessageId,
  })),
  [
    { commitId: "c1", afterMessageId: userIds[0] },
    { commitId: "c2", afterMessageId: userIds[0] },
    { commitId: "s1", afterMessageId: userIds[0] },
    ...(siblingRecorded
      ? [{ commitId: "s2", afterMessageId: userIds[0] }]
      : []),
    { commitId: "c3", afterMessageId: userIds[1] },
  ],
  "The host stamps each commit with the user message it followed.",
);
assert.match(
  markdownOf(observed.k3),
  new RegExp(`\\[${c3Id} — supersedes n1; person; tentative\\]`, "u"),
);
process.stdout.write(
  `LEDGER_SIBLINGS ${siblingRecorded ? "sequential" : "concurrent"}; SUMMARY_REQUESTS ${String(observed.summaryRequests)}; TURN3_CONTEXT_MESSAGES ${String(observed.turn3ContextMessages)}; TURN3_CONTEXT_HAS_C1 ${String(observed.turn3ContextHasC1)}\n`,
);
process.stdout.write("LEDGER_HISTORY_PASS\n");
