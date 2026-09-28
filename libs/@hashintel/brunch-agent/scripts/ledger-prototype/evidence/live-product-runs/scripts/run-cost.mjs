// Sums Brunch model usage from a persona run's server log chronology lines.
// Prices: GPT-6 Luna catalogue USD per million tokens (input 0.1, output 0.5, cache read 0.01).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const run = process.argv[2];
const log = readFileSync(join(run, "dev-brunch-server.log"), "utf8");
let requests = 0;
let input = 0;
let output = 0;
let cached = 0;
let submissions = 0;
for (const line of log.split("\n")) {
  const start = line.indexOf("{");
  if (!line.includes("flue.submission chronology") || start < 0) continue;
  let record;
  try {
    record = JSON.parse(line.slice(start));
  } catch {
    continue;
  }
  submissions += 1;
  for (const turn of record.turns ?? []) {
    requests += 1;
    input += turn.inputTokens ?? 0;
    output += turn.outputTokens ?? 0;
    cached += turn.cacheReadTokens ?? 0;
  }
}
const million = 1_000_000;
const runConfig = JSON.parse(readFileSync(join(run, "run.json"), "utf8"));
const sol = JSON.stringify(runConfig).includes("gpt-6-sol");
const price = sol
  ? { input: 2, output: 10, cached: 0.2 }
  : { input: 0.1, output: 0.5, cached: 0.01 };
const expected =
  (input * price.input + output * price.output + cached * price.cached) /
  million;
const bound =
  ((input + cached) * price.input + output * price.output) / million;
console.log(
  JSON.stringify({
    submissions,
    requests,
    input,
    output,
    cached,
    usdExpected: Number(expected.toFixed(4)),
    usdUpperBound: Number(bound.toFixed(4)),
  }),
);
