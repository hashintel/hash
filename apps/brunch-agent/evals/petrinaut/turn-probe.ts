/**
 * One real Brunch turn through the built app, with no browser and no persona.
 * Sends a case's opening message in a conversation with no document binding,
 * so only the guidance and Ledger tools are mounted, then reports the reply,
 * the tool calls and what the Ledger recorded.
 *
 *   yarn workspace @apps/brunch-agent probe:turn [case] [provider/model] [thinking]
 *
 * Needs a built app (`dist/app.mjs`) and the provider's API key in the
 * environment. Spends one live model turn.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createFlueClient } from "@flue/sdk";

import {
  brunchEnv,
  foldCommits,
  projectLedger,
  renderLedgerMarkdown,
} from "@hashintel/brunch-agent";

import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_THINKING,
} from "../../src/shared/chat-model.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/shared/conversation/identity.ts";
import { loadBuiltBrunchApplication } from "../../test/load-built-application.ts";

const [
  caseName = "pharma-cold-chain",
  model = DEFAULT_CHAT_MODEL,
  thinking = DEFAULT_CHAT_THINKING,
] = process.argv.slice(2);
const opening = readFileSync(
  join(import.meta.dirname, "cases", caseName, "opening-message.md"),
  "utf8",
).trim();

const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const probes = join(appRoot, ".data-wipe-me/turn-probes");
mkdirSync(probes, { recursive: true });
const directory = mkdtempSync(join(probes, "probe-"));

process.env.NODE_ENV = "development";
process.env.OTEL_SDK_DISABLED = "true";
delete process.env.HASH_OTLP_ENDPOINT;
process.env[brunchEnv.devDbPath] = join(directory, "conversation.db");
process.env[brunchEnv.dbKind] = "sqlite";
process.env[brunchEnv.chatModel] = model;
process.env[brunchEnv.chatThinking] = thinking;
process.env[brunchEnv.stepAAccounting] = "";

const report = (text: string) => process.stdout.write(`${text}\n`);

const application = await loadBuiltBrunchApplication();
const started = Date.now();
try {
  const identity = {
    principalKey: "probe",
    conversationId: `probe-${randomUUID()}`,
  };
  const client = createFlueClient({
    url: `http://brunch.local/agents/petrinaut/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
    fetch: async (input, init) =>
      application.fetch(
        input instanceof Request ? input : new Request(input, init),
      ),
  });
  await client.wait(
    await client.send({ message: { kind: "user", body: opening } }),
    { signal: AbortSignal.timeout(600_000) },
  );
  const history = await client.history();
  writeFileSync(
    join(directory, "history.json"),
    JSON.stringify(history, null, 2),
  );
  const parts = history.messages.flatMap((message) =>
    message.role === "assistant" ? message.parts : [],
  );
  const tools = parts.flatMap((part) =>
    part.type === "dynamic-tool" ? [`${part.toolName}:${part.state}`] : [],
  );
  const reply = parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
  const { state, commits } = foldCommits(history);
  const failed = history.settlements.filter(
    ({ outcome }) => outcome !== "completed",
  );
  report(
    `PROBE ${caseName} ${model} (${thinking}) in ${Math.round((Date.now() - started) / 1000)}s`,
  );
  report(
    `settlements: ${history.settlements.map(({ outcome }) => outcome).join(", ")}`,
  );
  if (failed.length > 0) {
    report(`FAILED: ${JSON.stringify(failed)}`);
  }
  report(`tools: ${tools.join(" ")}`);
  report(
    `ledger: ${commits.length} accepted commits, ${state.entities.length} entities, ${state.claims.length} claims, ${state.obligations.length} obligations`,
  );
  report(`\n--- reply ---\n${reply}`);
  report(
    `\n--- ledger (agent skin) ---\n${renderLedgerMarkdown(projectLedger(state), "agent")}`,
  );
  report(`\nhistory: ${join(directory, "history.json")}`);
} finally {
  await application.stop();
}
