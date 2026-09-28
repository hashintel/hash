// Sums the persona agent's recorded spend from its pi session file.
// Usage: node persona-cost.mjs <pi-session.jsonl>
import { readFileSync } from "node:fs";

let usd = 0;
let messages = 0;
for (const line of readFileSync(process.argv[2], "utf8").split("\n")) {
  if (!line) continue;
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    continue;
  }
  const usage = record.message?.usage ?? record.usage;
  if (usage?.cost?.total !== undefined) {
    usd += usage.cost.total;
    messages += 1;
  }
}
console.log(JSON.stringify({ messages, usd: Number(usd.toFixed(4)) }));
