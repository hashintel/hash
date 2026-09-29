// The conversation as the person saw it: each user message and Brunch's visible
// reply text, by turn, without tool calls or their outputs.
// Usage: node dialogue.mjs <run-dir>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const snapshot = JSON.parse(
  readFileSync(join(process.argv[2], "evidence", "snapshot.json"), "utf8"),
);
const text = (message) =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

let turn = 0;
const lines = [];
for (const message of snapshot.messages) {
  if (message.role === "user" && message.purpose === "user") {
    turn += 1;
    lines.push(`## Turn ${turn}\n\n**Person:** ${text(message)}`);
  } else if (message.role === "assistant" && turn > 0) {
    const reply = text(message);
    if (reply) lines.push(`**Brunch:** ${reply}`);
  }
}
console.log(lines.join("\n\n"));
