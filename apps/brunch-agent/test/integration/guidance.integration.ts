/** Exercises native skill activation and packaged resources through the built app. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { selectGuidanceVariant } from "../../src/agents/chat-agent/guidance-variant.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

const variant = selectGuidanceVariant();
const baseline = variant === "baseline";
const skill = baseline ? "sdcpn-modelling" : "constructing";
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
const toolResult = (context: Context, id: string) => {
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
    const prompt = context.systemPrompt ?? "";
    assert.equal(
      prompt.includes("# Account–draft feedback"),
      variant === "feedback" || variant === "identity",
    );
    assert.equal(
      prompt.includes("# Low-resolution modelling"),
      variant === "identity",
    );
    assert.equal(
      prompt.includes("Establish early why the model is wanted"),
      !baseline,
    );
    assert(
      prompt.includes(skill),
      "Selected skill must be discoverable before activation",
    );
    assert(
      !prompt.includes(
        baseline ? 'name="constructing"' : 'name="sdcpn-modelling"',
      ),
    );
    return fauxAssistantMessage(
      [fauxToolCall("activate_skill", { name: skill }, { id: "activate" })],
      { stopReason: "toolUse" },
    );
  },
  (context) => {
    const activation = toolResult(context, "activate");
    const path = activation.match(
      /\/\.flue\/packaged-skills\/[^\s"<>]+\/references\/pn-construction\.md/u,
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
    const resource = toolResult(context, "resource");
    assert(resource.includes("netAfterChanges"));
    assert(resource.includes("getNetCompilationErrors"));
    if (variant !== "identity") {
      completed = true;
      return fauxAssistantMessage("Native construction guidance loaded.");
    }
    const commitTool = context.tools?.find(
      ({ name }) => name === "ledger_commit",
    );
    const schema = JSON.stringify(commitTool?.parameters);
    assert(
      schema.includes('"identify"') &&
        schema.includes('"fails-into"') &&
        schema.includes('"validation"'),
    );
    return fauxAssistantMessage(
      [
        fauxToolCall(
          "ledger_commit",
          {
            changes: [
              {
                op: "identify",
                identity: "cleaning-crew",
                kind: "resource",
                covers: ["resources"],
                source: "person",
                standing: "settled",
              },
              {
                op: "note",
                about: ["purpose", "cleaning-crew"],
                content: "Whether one crew can cover both lines.",
                covers: ["goals"],
                source: "person",
                standing: "tentative",
              },
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
    assert(receipt.includes("identities/cleaning-crew/n1"));
    assert(receipt.includes("- resources: 1 confirmed"));
    return fauxAssistantMessage(
      [fauxToolCall("ledger_compile", {}, { id: "map" })],
      { stopReason: "toolUse" },
    );
  },
  (context) => {
    assert(
      toolResult(context, "map").includes(
        "- `cleaning-crew` [resource] — confirmed; n1; 1 note",
      ),
    );
    completed = true;
    return fauxAssistantMessage("Identity Ledger recorded and mapped.");
  },
]);

const application = await loadBuiltBrunchApplication();
try {
  const identity = {
    principalKey: "guidance-test",
    conversationId: crypto.randomUUID(),
  };
  const client = createFlueClient({
    url: `http://brunch.local/agents/chat/${flueConversationIdFrom(identity)}`,
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
  process.stdout.write(`GUIDANCE_PASS ${variant}\n`);
} finally {
  await application.stop();
  rmSync(directory, { recursive: true, force: true });
}
