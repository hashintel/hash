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
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  getCurrentTools,
  type AssistantMessage,
  type JsonObject,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  brunchSignals,
  foldCommits,
  ledgerCommentsMessage,
} from "@hashintel/brunch-agent";
import { installFauxProvider } from "@local/pi-faux-providers/install-faux-provider";

import { flueConversationId } from "../../src/shared/conversation/identity.ts";
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
const contexts: { label: string; context: TranscriptContext }[] = [];
type Step = (context: TranscriptContext) => AssistantMessage;
const steps: Step[] = [];
// Tool declarations travel in the transcript's system messages; the
// summarization request declares none.
const isSummaryRequest = (context: TranscriptContext) =>
  getCurrentTools(context.messages).length === 0;
/** Marks a scripted reply whose provider usage reports an overflowing context. */
const overflowingResponseId = "ledger-history-overflowing-reply";
// The faux provider estimates usage from the prompt, so a silent overflow on a
// successful reply is reported at the provider boundary instead.
installFauxProvider({
  ...faux.provider,
  streamSimple(model, context, options) {
    const inner = faux.provider.streamSimple(model, context, options);
    const outer = createAssistantMessageEventStream();
    void (async () => {
      for await (const event of inner) {
        if (
          event.type === "done" &&
          event.message.responseId === overflowingResponseId
        ) {
          outer.push({
            ...event,
            message: {
              ...event.message,
              usage: {
                ...event.message.usage,
                input: 1_000_000,
                totalTokens: 1_000_000,
              },
            },
          });
        } else outer.push(event);
      }
      outer.end();
    })();
    return outer;
  },
});
faux.setResponses(
  Array.from({ length: 40 }, () => (context: TranscriptContext) => {
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

const call = (id: string, name: string, args: JsonObject) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const calls = (...entries: [string, string, JsonObject][]) =>
  fauxAssistantMessage(
    entries.map(([id, name, args]) => fauxToolCall(name, args, { id })),
    { stopReason: "toolUse" },
  );
const toolOutput = (
  context: TranscriptContext,
  toolCallId: string,
): unknown => {
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
/** A successful reply whose usage reports an overflowing context, so it compacts. */
const inflated = (message: AssistantMessage): AssistantMessage => ({
  ...message,
  responseId: overflowingResponseId,
});

const observed: Record<string, unknown> = {};
const commentId = `n-${crypto.randomUUID()}`;
const claim = (
  text: string,
  {
    supersedes,
    status = "confirmed",
  }: { supersedes?: string; status?: string } = {},
) => [
  "claim/create",
  {
    text,
    entities: ["e1"],
    origin: "stated",
    status,
    ...(supersedes === undefined ? {} : { supersedes: [supersedes] }),
  },
];

let application = await loadBuiltBrunchApplication();
const identity = {
  principalKey: "ledger-owner",
  conversationId: `ledger-${crypto.randomUUID()}`,
};
const client = createFlueClient({
  url: `http://brunch.local/agents/petrinaut/${flueConversationId(identity)}`,
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
      call("commit-1", "ledger_commit", {
        entries: [
          [
            "entity/create",
            {
              name: "Night crew",
              kind: "resource",
              origin: "stated",
              status: "confirmed",
            },
          ],
          claim("Two people load each truck."),
        ],
      }),
    (context) => {
      observed.commit1 = toolOutput(context, "commit-1");
      return call("commit-2", "ledger_commit", {
        entries: [
          claim("Three people load a hazardous truck.", { supersedes: "c1" }),
        ],
      });
    },
    (context) => {
      observed.commit2 = toolOutput(context, "commit-2");
      return calls(
        ["sibling-1", "ledger_commit", { entries: [claim("A.")] }],
        ["sibling-2", "ledger_commit", { entries: [claim("B.")] }],
      );
    },
    (context) => {
      observed.sibling1 = toolOutput(context, "sibling-1");
      observed.sibling2 = toolOutput(context, "sibling-2");
      return call("compile-1", "ledger_compile", {});
    },
    (context) => {
      observed.compile1 = toolOutput(context, "compile-1");
      return fauxAssistantMessage([fauxText("Recorded.")]);
    },
  );
  await speak("Two people load each truck; we need to size the night crew.");
  save("history-turn-1", await client.history());

  await application.stop();
  application = await loadBuiltBrunchApplication();
  steps.push(
    () => call("compile-2", "ledger_compile", {}),
    (context) => {
      observed.compile2 = toolOutput(context, "compile-2");
      return call("commit-3", "ledger_commit", {
        entries: [
          claim("Size both night crews.", {
            supersedes: "c2",
            status: "tentative",
          }),
        ],
      });
    },
    (context) => {
      observed.commit3 = toolOutput(context, "commit-3");
      return inflated(fauxAssistantMessage([fauxText("Recorded again.")]));
    },
  );
  const turn2Start = contexts.length;
  await speak("After the restart: there are two night crews, I think.");
  save("history-turn-2", await client.history());
  // The final reply reports an overflowing context on a successful stop:
  // compaction follows it, but the completed reply is never re-requested.
  observed.turn2Requests = contexts
    .slice(turn2Start)
    .map(({ label }) => (label === "summary-request" ? "summary" : "agent"));

  steps.push(
    (context) => {
      observed.turn3ContextMessages = context.messages.length;
      observed.turn3ContextHasCommit1 = JSON.stringify(
        context.messages,
      ).includes('"commit-1"');
      return call("compile-3", "ledger_compile", {});
    },
    (context) => {
      observed.compile3 = toolOutput(context, "compile-3");
      return fauxAssistantMessage([fauxText("Read back.")]);
    },
  );
  await speak("Read the Ledger back.");

  steps.push(
    (context) => {
      observed.commentReachedModel = JSON.stringify(context.messages).includes(
        "There are two night crews, not one.",
      );
      return call("commit-4", "ledger_commit", {
        entries: [
          [
            "entity/update/e1",
            {
              name: "Night crews",
              kind: "resource",
              origin: "stated",
              status: "confirmed",
              resolves: [commentId],
            },
          ],
        ],
      });
    },
    (context) => {
      observed.commit4 = toolOutput(context, "commit-4");
      return fauxAssistantMessage([fauxText("Renamed.")]);
    },
  );
  await client.wait(
    await client.send({
      message: ledgerCommentsMessage([
        {
          id: commentId,
          records: ["e1"],
          quote: "Night crew",
          text: "There are two night crews, not one.",
        },
      ]),
    }),
  );
  const finalHistory = await client.history();
  save("history-turn-3", finalHistory);
  observed.summaryRequests = contexts.filter(
    ({ label }) => label === "summary-request",
  ).length;
  const finalLedger = foldCommits(finalHistory);
  observed.reconstructed = finalLedger.commits;
  observed.comments = finalLedger.state.comments;
  observed.userMessageIds = finalHistory.messages
    .filter((message) => message.role === "user" && message.purpose === "user")
    .map((message) => message.id);
  observed.commentMessageId = finalHistory.messages.find(
    (message) => message.signal?.tagName === brunchSignals.ledgerComments,
  )?.id;
} finally {
  save("contexts", contexts);
  save("observations", observed);
  await application.stop();
}

process.stdout.write(`LEDGER_OBSERVATIONS ${directory}\n`);

const mapOf = (output: unknown): string => {
  assert(
    typeof output === "object" &&
      output !== null &&
      "map" in output &&
      typeof output.map === "string",
    `Expected a compilation, got ${JSON.stringify(output)}`,
  );
  return output.map;
};

assert.partialDeepStrictEqual(observed.commit1, {
  status: "recorded",
  commitId: "commit-1",
  revision: 1,
  ids: ["e1", "c1"],
});
assert.partialDeepStrictEqual(
  observed.commit2,
  { status: "recorded", commitId: "commit-2", revision: 2, ids: ["c2"] },
  "A later call in the same turn sees the earlier accepted commit.",
);
assert.partialDeepStrictEqual(observed.sibling1, {
  status: "recorded",
  ids: ["c3"],
});
// Flue may run a proposal's calls together or in turn; either way the IDs
// never collide.
const siblingRecorded =
  (observed.sibling2 as { status?: string } | undefined)?.status === "recorded";
assert.partialDeepStrictEqual(
  observed.sibling2,
  siblingRecorded
    ? { status: "recorded", ids: ["c4"] }
    : { status: "refused", code: "concurrent-commit" },
);
const beforeRestart = mapOf(observed.compile1);
assert(
  beforeRestart.includes("Three people load a hazardous truck."),
  beforeRestart,
);
assert(beforeRestart.includes("superseded `c1`"), beforeRestart);
assert.equal(
  mapOf(observed.compile2),
  beforeRestart,
  "Restart changes nothing.",
);
const commit3Id = siblingRecorded ? "c5" : "c4";
assert.partialDeepStrictEqual(observed.commit3, {
  status: "recorded",
  ids: [commit3Id],
});
const reconstructed = observed.reconstructed as ReturnType<
  typeof foldCommits
>["commits"];
const userIds = observed.userMessageIds as string[];
assert.deepEqual(
  reconstructed.map(({ commitId, afterMessageId }) => ({
    commitId,
    afterMessageId,
  })),
  [
    { commitId: "commit-1", afterMessageId: userIds[0] },
    { commitId: "commit-2", afterMessageId: userIds[0] },
    { commitId: "sibling-1", afterMessageId: userIds[0] },
    ...(siblingRecorded
      ? [{ commitId: "sibling-2", afterMessageId: userIds[0] }]
      : []),
    { commitId: "commit-3", afterMessageId: userIds[1] },
    { commitId: "commit-4", afterMessageId: observed.commentMessageId },
  ],
  "The host stamps each commit with the user message or comment turn it followed.",
);
assert.equal(
  observed.commentReachedModel,
  true,
  "The comment signal reaches the model.",
);
assert.partialDeepStrictEqual(observed.commit4, {
  status: "recorded",
  ids: ["e1"],
});
assert(
  !Object.hasOwn(observed.commit4 as object, "openComments"),
  `No comment stays open once resolved: ${JSON.stringify(observed.commit4)}`,
);
assert.partialDeepStrictEqual(observed.comments, [
  { id: commentId, records: ["e1"], resolvedBy: "e1" },
]);
const turn2Requests = observed.turn2Requests as string[];
assert.deepEqual(
  turn2Requests.filter((label) => label === "agent"),
  ["agent", "agent", "agent"],
  `A successful overflowing reply is compacted after, not retried: ${JSON.stringify(turn2Requests)}`,
);
assert(
  turn2Requests.includes("summary"),
  `The overflowing reply triggers compaction: ${JSON.stringify(turn2Requests)}`,
);
const afterCompaction = mapOf(observed.compile3);
assert(
  afterCompaction.includes(
    `Size both night crews. \u2014 stated \u00b7 tentative \`${commit3Id}\``,
  ),
  afterCompaction,
);
assert(afterCompaction.includes("superseded `c2`"), afterCompaction);
process.stdout.write(
  `LEDGER_SIBLINGS ${siblingRecorded ? "sequential" : "concurrent"}; SUMMARY_REQUESTS ${String(observed.summaryRequests)}; TURN3_CONTEXT_MESSAGES ${String(observed.turn3ContextMessages)}; TURN3_CONTEXT_HAS_COMMIT1 ${String(observed.turn3ContextHasCommit1)}\n`,
);
process.stdout.write("LEDGER_HISTORY_PASS\n");
