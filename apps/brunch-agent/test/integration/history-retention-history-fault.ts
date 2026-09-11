/** Review falsifier: change only SDK history observations, never the runtime or its store. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

const mode = process.env.A4_HISTORY_FAULT;
assert(
  mode &&
    ["missing", "replaced", "changed", "duplicate", "settlement"].includes(
      mode,
    ),
);
registerHooks({
  load(url, context, nextLoad) {
    if (
      !url.endsWith(
        "/apps/brunch-agent/test/integration/history-retention.integration.ts",
      )
    )
      return nextLoad(url, context);
    const original = readFileSync(new URL(url), "utf8");
    const needle = "const project = (snapshot: FlueConversationSnapshot) =>";
    assert.equal(original.split(needle).length, 2);
    const source = original.replace(
      needle,
      `
const originalHistory = client.history.bind(client);
client.history = async (...args) => {
  const snapshot = await originalHistory(...args);
  const target = snapshot.messages.find(message => message.parts.some(part => part.type === "text" && part.text === "A4 filler acknowledged."));
  if (!target) return snapshot;
  const mode = ${JSON.stringify(mode)};
  if (mode === "settlement") return { ...snapshot, settlements: snapshot.settlements.filter(item => item.submissionId !== target.submissionId) };
  if (mode === "missing") return { ...snapshot, messages: snapshot.messages.filter(message => message !== target) };
  if (mode === "duplicate") return { ...snapshot, messages: [...snapshot.messages, target] };
  return { ...snapshot, messages: snapshot.messages.map(message => message !== target ? message : mode === "replaced"
    ? { ...message, id: "review-replaced-response" }
    : { ...message, parts: message.parts.map(part => part.type === "text" && part.text === "A4 filler acknowledged." ? { ...part, text: "Review changed the completed response." } : part) }) };
};
${needle}`,
    );
    return { format: "module-typescript", source, shortCircuit: true };
  },
});
