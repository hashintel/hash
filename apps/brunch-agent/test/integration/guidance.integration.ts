/** Exercises native skill activation, packaged resources and the Ledger tools through the built app. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentSystemPrompt,
  getCurrentTools,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { agentOwnershipHeaders } from "@hashintel/brunch-agent";
import { installFauxProvider } from "@local/pi-faux-providers/install-faux-provider";

import { flueConversationId } from "../../src/shared/conversation/identity.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

const directory = mkdtempSync(join(tmpdir(), "brunch-guidance-"));
process.env.NODE_ENV = "test";
process.env.OTEL_SDK_DISABLED = "true";
process.env.BRUNCH_DEV_DB_PATH = join(directory, "conversation.db");
process.env.BRUNCH_DB_KIND = "sqlite";
process.env.BRUNCH_CHAT_MODEL = "openai/gpt-5.5-2026-04-23";
process.env.BRUNCH_STEP_A_ACCOUNTING = "";
delete process.env.HASH_OTLP_ENDPOINT;

const faux = fauxProvider({ provider: "openai" });
installFauxProvider(faux.provider);
const toolResult = (context: TranscriptContext, id: string) => {
  const result = context.messages.find(
    (message) => message.role === "toolResult" && message.toolCallId === id,
  );
  assert(result?.role === "toolResult", `Missing ${id}`);
  assert(!result.isError, JSON.stringify(result));
  return result.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
};
let completed = false;
faux.setResponses([
  (context) => {
    assert(
      getCurrentSystemPrompt(context.messages).includes("modelling"),
      "The modelling skill must be discoverable before activation",
    );
    return fauxAssistantMessage(
      [
        fauxToolCall(
          "activate_skill",
          { name: "modelling" },
          { id: "activate" },
        ),
      ],
      { stopReason: "toolUse" },
    );
  },
  (context) => {
    const activation = toolResult(context, "activate");
    const path = activation.match(
      /\/\.flue\/packaged-skills\/[^\s"<>]+\/references\/mapping\.md/u,
    )?.[0];
    assert(
      path,
      `Activation must advertise a native resource path: ${activation}`,
    );
    return fauxAssistantMessage(
      [fauxToolCall("read_skill_resource", { path }, { id: "resource" })],
      { stopReason: "toolUse" },
    );
  },
  (context) => {
    toolResult(context, "resource");
    const commitTool = getCurrentTools(context.messages).find(
      ({ name }) => name === "ledger_commit",
    );
    assert(JSON.stringify(commitTool?.parameters).includes('"entity/create"'));
    return fauxAssistantMessage(
      [
        fauxToolCall(
          "ledger_commit",
          {
            entries: [
              [
                "entity/create",
                {
                  name: "Cleaning crew",
                  kind: "resource",
                  origin: "stated",
                  status: "confirmed",
                },
              ],
            ],
          },
          { id: "commit" },
        ),
      ],
      { stopReason: "toolUse" },
    );
  },
  (context) => {
    const receipt = toolResult(context, "commit");
    assert(receipt.includes('"recorded"') && receipt.includes('"e1"'));
    return fauxAssistantMessage(
      [fauxToolCall("ledger_compile", {}, { id: "map" })],
      { stopReason: "toolUse" },
    );
  },
  (context) => {
    assert(
      toolResult(context, "map").includes(
        "**Cleaning crew** — stated · confirmed `e1`",
      ),
    );
    completed = true;
    return fauxAssistantMessage("Ledger recorded and mapped.");
  },
]);

const application = await loadBuiltBrunchApplication();
try {
  const identity = {
    ownerKey: "guidance-test",
    conversationId: crypto.randomUUID(),
  };
  const client = createFlueClient({
    url: `http://brunch.local/agents/petrinaut/${flueConversationId(identity)}`,
    headers: agentOwnershipHeaders(identity),
    fetch: async (input, init) =>
      application.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
  });
  await client.wait(
    await client.send({
      message: { kind: "user", body: "Inspect the construction guidance." },
    }),
  );
  assert(
    completed,
    "The production entrypoint must complete every scripted step",
  );
  process.stdout.write("GUIDANCE_PASS\n");
} finally {
  await application.stop();
  rmSync(directory, { recursive: true, force: true });
}
