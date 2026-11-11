/**
 * Whether `offer_answers` beside the closing `ledger_commit` still ends the
 * turn in one model step, through the real built Flue mount with a local
 * scripted model; no provider calls. Spawned by `offer-answers.test.ts`.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type JsonObject,
  type ToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { agentOwnershipHeaders, brunchTools } from "@hashintel/brunch-agent";
import { installFauxProvider } from "@local/pi-faux-providers/install-faux-provider";

import { flueConversationId } from "../../src/shared/conversation/identity.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "brunch-offer-answers-"));
process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
process.env.BRUNCH_DB_KIND = "sqlite";
process.env.BRUNCH_CHAT_MODEL = "openai/gpt-5.5-2026-04-23";
process.env.BRUNCH_STEP_A_ACCOUNTING = "";
delete process.env.HASH_OTLP_ENDPOINT;

const faux = fauxProvider({ provider: "openai" });
installFauxProvider(faux.provider);
const application = await loadBuiltBrunchApplication();
const identity = {
  ownerKey: "offer-answers-owner",
  conversationId: `offer-answers-${crypto.randomUUID()}`,
};
const client = createFlueClient({
  url: `http://brunch.local/agents/petrinaut/${flueConversationId(identity)}`,
  headers: agentOwnershipHeaders(identity),
  fetch: async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    ),
});

const reply = fauxText(
  "When a shipment is quarantined, does it stay counted as an open purchase order, or drop out until quality releases it?",
);
const offer = (id: string) =>
  fauxToolCall(
    brunchTools.offerAnswers,
    {
      questions: [
        {
          kind: "choose",
          label: "Quarantined shipment",
          options: ["Stays counted as open", "Drops out until released"],
        },
      ],
    },
    { id },
  );
const commit = (id: string, entries: JsonObject[]) =>
  fauxToolCall(
    brunchTools.ledgerCommit,
    { entries, endTurn: true } as unknown as JsonObject,
    { id },
  );
const entity = (name: string) =>
  [
    "entity/create",
    { name, kind: "resource", origin: "stated", status: "confirmed" },
  ] as unknown as JsonObject;
const unanchoredClaim = [
  "claim/create",
  {
    text: "Quarantine is slow.",
    entities: [],
    origin: "stated",
    status: "confirmed",
  },
] as unknown as JsonObject;
const proposal = (content: ToolCall[]) =>
  fauxAssistantMessage([reply, ...content], { stopReason: "toolUse" });

/** Model calls one user turn takes when the model answers with `responses`. */
const modelCallsFor = async (
  body: string,
  responses: AssistantMessage[],
): Promise<number> => {
  const before = faux.state.callCount;
  faux.setResponses([
    ...responses,
    fauxAssistantMessage([fauxText("An unscripted extra step.")]),
  ]);
  await client.wait(await client.send({ message: { kind: "user", body } }));
  return faux.state.callCount - before;
};

const toolPart = async (toolCallId: string) =>
  (await client.history()).messages
    .flatMap((message) => message.parts)
    .find((part) => "toolCallId" in part && part.toolCallId === toolCallId) as
    | { state?: string; output?: unknown }
    | undefined;

try {
  const closing = await modelCallsFor("We quarantine Flowbind on arrival.", [
    proposal([
      offer("offer-closing"),
      commit("commit-closing", [entity("Flowbind")]),
    ]),
  ]);
  const closingHistory = JSON.stringify(await client.history());
  assert.equal(
    closing,
    1,
    `A reply, offer_answers and a closing commit end the turn in one step. History: ${closingHistory}`,
  );
  assert.partialDeepStrictEqual(await toolPart("offer-closing"), {
    state: "output-available",
    output: { offered: 1 },
  });
  assert.partialDeepStrictEqual(await toolPart("commit-closing"), {
    state: "output-available",
    output: { status: "recorded" },
  });

  const commitFirst = await modelCallsFor("Flowbind comes from India.", [
    proposal([
      commit("commit-first", [entity("Flowbind India")]),
      offer("offer-after-commit"),
    ]),
  ]);
  assert.equal(commitFirst, 1, "The calls' order does not matter.");

  const offerAlone = await modelCallsFor("It arrives on Tuesdays.", [
    proposal([offer("offer-alone")]),
    fauxAssistantMessage([fauxText("Noted.")]),
  ]);
  assert.equal(offerAlone, 2, "offer_answers alone leaves the turn open.");

  const refused = await modelCallsFor("Quality releases it in four days.", [
    proposal([
      offer("offer-refused"),
      commit("commit-refused", [unanchoredClaim]),
    ]),
    fauxAssistantMessage([fauxText("Noted.")]),
  ]);
  assert.partialDeepStrictEqual(await toolPart("commit-refused"), {
    output: { status: "refused" },
  });
  assert.equal(refused, 2, "A refused closing commit leaves the turn open.");

  const silentSteps = await modelCallsFor("Expiry is twelve months.", [
    fauxAssistantMessage([commit("commit-silent", [entity("Expiry")])], {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage([offer("offer-silent")], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxText("Noted.")]),
  ]);
  assert.partialDeepStrictEqual(await toolPart("commit-silent"), {
    output: { status: "recorded" },
  });
  assert.equal(
    silentSteps,
    3,
    "A commit and then an offer, each in its own step and with no reply, leave the turn open.",
  );

  const failed = await modelCallsFor("Release needs two signatures.", [
    proposal([
      fauxToolCall(
        brunchTools.ledgerCommit,
        { entries: "not-an-array", endTurn: true },
        { id: "commit-failed" },
      ),
    ]),
    fauxAssistantMessage([offer("offer-after-failure")], {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage([fauxText("Noted.")]),
  ]);
  assert.partialDeepStrictEqual(await toolPart("commit-failed"), {
    state: "output-error",
  });
  assert.equal(
    failed,
    3,
    "A closing commit that failed validation leaves the turn open for a later offer.",
  );
  process.stdout.write("OFFER_ANSWERS_PASS\n");
} finally {
  await application.stop();
  rmSync(directory, { recursive: true, force: true });
}
