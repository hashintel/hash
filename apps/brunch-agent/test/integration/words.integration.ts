/** Exercises the real built Flue mount with a local scripted model; no provider calls. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
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

import { petrinautWordsUserMessageBody } from "@hashintel/brunch-agent-transport-aisdk";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

process.env.NODE_ENV = "test";
const directory = mkdtempSync(join(tmpdir(), "brunch-words-"));
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
delete process.env.HASH_OTLP_ENDPOINT;
const faux = fauxProvider({ provider: "openai" });
installFauxProvider(faux.provider);
let application = await loadBuiltBrunchApplication();
const identity = {
  principalKey: "words-owner",
  conversationId: `words-${crypto.randomUUID()}`,
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
let checked = 0;
const check = (context: Context, expected: readonly string[]) => {
  const system = context.systemPrompt ?? "";
  if (expected.length)
    assert(system.includes(JSON.stringify(expected)), system);
  else assert(!system.includes("Preferred literal spellings"));
  const history = JSON.stringify(context.messages);
  assert(!history.includes("petrinaut-contextual-user-message:v2"));
  assert(!history.includes('\\"words\\"'));
  checked++;
};
const speak = async (words?: readonly string[]) => {
  const body =
    words === undefined
      ? "Continue."
      : petrinautWordsUserMessageBody({ userText: "Continue.", words });
  const initialData = initialized
    ? {}
    : {
        initialData: {
          binding: {
            conversationId: identity.conversationId,
            documentId: "words-doc",
            incarnationId: "words-inc",
          },
        },
      };
  initialized = true;
  await client.wait(
    await client.send({ ...initialData, message: { kind: "user", body } }),
  );
};
try {
  faux.setResponses([
    (context) => {
      check(context, ["RelayDesk", "SDCPN"]);
      return fauxAssistantMessage(
        [fauxToolCall("read_workpiece", {}, { id: "words-read" })],
        { stopReason: "toolUse" },
      );
    },
    (context) => {
      check(context, ["RelayDesk", "SDCPN"]);
      return fauxAssistantMessage([fauxText("Ready.")]);
    },
  ]);
  await speak(["RelayDesk", "SDCPN"]);
  for (const words of [["Bay 3"], [], ["RelayDesk"], undefined]) {
    await application.stop();
    application = await loadBuiltBrunchApplication();
    faux.setResponses([
      (context) => {
        check(context, words ?? []);
        return fauxAssistantMessage([fauxText("Ready.")]);
      },
    ]);
    await speak(words);
  }
  assert.equal(checked, 6);
  process.stdout.write("WORDS_RUNTIME_PASS\n");
} finally {
  await application.stop();
  rmSync(directory, { recursive: true, force: true });
}
