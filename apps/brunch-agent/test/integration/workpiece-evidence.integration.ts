/**
 * Ledger evidence through the built mount: the ids the model is shown, the
 * locators it gets back, and the settled evidence after a restart. The
 * evidence rules themselves are unit-tested in core.
 * Spawned by `test/integration/workpiece-evidence.test.ts`.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { brunchModes } from "@hashintel/brunch-agent";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

process.env.NODE_ENV = "test";
process.env.BRUNCH_DEV_DB_PATH = join(
  mkdtempSync(join(tmpdir(), "workpiece-evidence-")),
  "conversation.db",
);
delete process.env.HASH_OTLP_ENDPOINT;
const faux = fauxProvider({ provider: "openai" });
installFauxProvider(faux.provider);

let application = await loadBuiltBrunchApplication();
const identity = {
  principalKey: "evidence-owner",
  conversationId: `evidence-${crypto.randomUUID()}`,
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
          mode: brunchModes.integrated,
          construction: {
            binding: {
              conversationId: identity.conversationId,
              documentId: "evidence-document",
              incarnationId: "evidence-incarnation",
            },
          },
        },
      };
  initialized = true;
  await client.wait(
    await client.send({ ...initialData, message: { kind: "user", body } }),
  );
};
const call = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const toolResult = (
  context: Context,
  name: string,
): Record<string, unknown> => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolName === name,
  );
  assert(result?.role === "toolResult");
  return JSON.parse(
    result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  ) as Record<string, unknown>;
};
/** The id of the latest user message, as the model is shown it. */
const shownUserMessageId = (context: Context): string => {
  const marker = context.messages
    .flatMap((message) =>
      message.role === "user" && typeof message.content !== "string"
        ? message.content
        : [],
    )
    .findLast(
      (part) => part.type === "text" && /^\[message [^\]]+\]$/u.test(part.text),
    );
  assert(marker?.type === "text");
  const id = /^\[message ([^\]]+)\]$/u.exec(marker.text)?.at(1);
  assert(id, "The current user message must expose its id to the model.");
  return id;
};
const historyIdOf = async (text: string) =>
  (await client.history()).messages.find(
    (message) =>
      message.role === "user" &&
      message.purpose === "user" &&
      message.parts.some((part) => part.type === "text" && part.text === text),
  )?.id;

const markdown = "# Account\nReserve one crew.\n\nTiming remains unknown.";
const correctedPassage = "The reserve lasts two hours.";
const correctedMarkdown = `${markdown}\n\n${correctedPassage}`;
const locator = {
  start: markdown.indexOf("Reserve"),
  end: markdown.indexOf("\n\n"),
};
const firstTestimony = "Reserve one crew.";
const correction = "Correction: the reserve lasts two hours, not one hour.";
let sourceId = "";
let correctionSourceId = "";
const firstEvidence = () => [
  { locator, messageIds: [sourceId], kind: "elicited" },
  { locator, messageIds: [], kind: "formalism-constraint" },
];
const correctedEvidence = () => [
  {
    locator: {
      start: correctedMarkdown.indexOf(correctedPassage),
      end: correctedMarkdown.length,
    },
    messageIds: [correctionSourceId],
    kind: "elicited",
  },
  ...firstEvidence(),
];
// Assertions inside scripted responses surface as a failed turn, so each
// completed check is recorded and counted at the end.
const completed: string[] = [];

try {
  faux.setResponses([
    (context) => {
      sourceId = shownUserMessageId(context);
      return call(
        "mutate_workpiece",
        {
          markdown,
          baseRevisionId: null,
          evidence: [
            { text: firstTestimony, messageIds: [sourceId], kind: "elicited" },
            {
              text: firstTestimony,
              messageIds: [],
              kind: "formalism-constraint",
            },
          ],
        },
        "evidence-revision",
      );
    },
    (context) => {
      const settled = toolResult(context, "mutate_workpiece");
      assert.equal(settled.revisionId, "evidence-revision");
      assert.equal(settled.markdown, undefined);
      assert.deepEqual(settled.evidence, firstEvidence());
      return call(
        "read_workpiece",
        { includeContent: false, locateTexts: [firstTestimony] },
        "read-settled",
      );
    },
    (context) => {
      const result = toolResult(context, "read_workpiece");
      const pointer = {
        revisionId: "evidence-revision",
        sha256: createHash("sha256").update(markdown).digest("hex"),
        ordinal: 1,
      };
      assert.equal(result.currentWorkpiece, null);
      assert.deepEqual(result.currentWorkpiecePointer, pointer);
      assert.partialDeepStrictEqual(result.locatorLookup, {
        subject: { kind: "current-revision", revisionId: pointer.revisionId },
        sha256: pointer.sha256,
        queries: [
          {
            text: firstTestimony,
            occurrences: [locator],
            matchedCount: 1,
            omittedCount: 0,
          },
        ],
      });
      completed.push("located");
      return fauxAssistantMessage([fauxText("Recorded.")]);
    },
  ]);
  await speak(firstTestimony);
  assert.equal(sourceId, await historyIdOf(firstTestimony));

  faux.setResponses([
    (context) => {
      correctionSourceId = shownUserMessageId(context);
      return call(
        "read_workpiece",
        { includeContent: false, sourceIds: [correctionSourceId] },
        "read-correction-source",
      );
    },
    (context) => {
      assert.deepEqual(toolResult(context, "read_workpiece").sources, [
        {
          id: correctionSourceId,
          role: "user",
          purpose: "user",
          text: correction,
          textTruncated: false,
          untrusted: true,
        },
      ]);
      return call(
        "mutate_workpiece",
        {
          markdown: correctedMarkdown,
          baseRevisionId: "evidence-revision",
          evidence: [
            {
              text: correctedPassage,
              messageIds: [correctionSourceId],
              kind: "elicited",
            },
          ],
        },
        "corrected-revision",
      );
    },
    (context) => {
      const settled = toolResult(context, "mutate_workpiece");
      assert.equal(settled.revisionId, "corrected-revision");
      assert.deepEqual(settled.evidence, correctedEvidence());
      completed.push("corrected");
      return fauxAssistantMessage([fauxText("Corrected.")]);
    },
  ]);
  await speak(correction);
  assert.equal(correctionSourceId, await historyIdOf(correction));

  await application.stop();
  application = await loadBuiltBrunchApplication();
  faux.setResponses([
    call("read_workpiece", {}, "read-after-restart"),
    (context) => {
      const current = toolResult(context, "read_workpiece")
        .currentWorkpiece as {
        revisionId: string;
        ordinal: number;
        evidence: unknown;
      };
      assert.equal(current.revisionId, "corrected-revision");
      assert.equal(current.ordinal, 2);
      assert.deepEqual(current.evidence, correctedEvidence());
      completed.push("reopened");
      return fauxAssistantMessage([fauxText("Reopened.")]);
    },
  ]);
  await speak("Read the current account.");

  assert.deepEqual(completed, ["located", "corrected", "reopened"]);
  process.stdout.write("WORKPIECE_EVIDENCE_PASS\n");
} finally {
  await application.stop();
}
