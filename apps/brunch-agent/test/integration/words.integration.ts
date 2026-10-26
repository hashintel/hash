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
  getCurrentSystemPrompt,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  agentOwnershipHeaders,
  brunchTools,
  petrinautContextualUserMessageBody,
  petrinautSubmissionContext,
} from "@hashintel/brunch-agent";
import { installFauxProvider } from "@local/pi-faux-providers/install-faux-provider";

import { flueConversationId } from "../../src/shared/conversation/identity.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "brunch-words-"));
process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
process.env.BRUNCH_DB_KIND = "sqlite";
process.env.BRUNCH_CHAT_MODEL = "openai/gpt-5.5-2026-04-23";
process.env.BRUNCH_STEP_A_ACCOUNTING = "";
delete process.env.HASH_OTLP_ENDPOINT;

const faux = fauxProvider({ provider: "openai" });
installFauxProvider(faux.provider);
let application = await loadBuiltBrunchApplication();
const identity = {
  principalKey: "words-owner",
  conversationId: `words-${crypto.randomUUID()}`,
};
const client = createFlueClient({
  url: `http://brunch.local/agents/petrinaut/${flueConversationId(identity)}`,
  headers: agentOwnershipHeaders(identity),
  fetch: async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    ),
});
let checked = 0;
const check = (context: TranscriptContext, expected: readonly string[]) => {
  const system = getCurrentSystemPrompt(context.messages);
  if (expected.length)
    assert(system.includes(JSON.stringify(expected)), system);
  else assert(!system.includes("Preferred literal spellings"));
  const history = JSON.stringify(context.messages);
  assert(!history.includes("petrinaut-contextual-user-message:v2"));
  assert(!history.includes('\\"words\\"'));
  checked++;
};
const speak = async (words?: readonly string[]) => {
  const submissionContext =
    words === undefined ? undefined : petrinautSubmissionContext({ words });
  const body =
    submissionContext === undefined
      ? "Continue."
      : petrinautContextualUserMessageBody({
          userText: "Continue.",
          diagnosticsContext: "",
          submissionContext,
        });
  await client.wait(await client.send({ message: { kind: "user", body } }));
};
try {
  faux.setResponses([
    (context) => {
      check(context, ["RelayDesk", "SDCPN"]);
      return fauxAssistantMessage(
        [fauxToolCall(brunchTools.ping, {}, { id: "words-ping" })],
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
