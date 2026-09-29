// Where each turn's wall time goes, from the run's conversation stream:
// model generation (assistant message started → completed), tool phases
// (assistant message completed → next assistant message started, attributed
// to the tools called in that step), and the remainder.
// Usage: node turn-timing.mjs <run-dir> [--turns]
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const run = process.argv[2];
const showTurns = process.argv.includes("--turns");
const db = join(run, "conversation.db");

const query = (sql) =>
  execFileSync("sqlite3", ["-json", db, sql], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  }).trim() || "[]";

const submissions = JSON.parse(
  query(
    "select submission_id, accepted_at, settled_at from flue_agent_submissions order by sequence",
  ),
);
const batches = JSON.parse(
  query(
    "select submission_id, data from flue_conversation_stream_batches where submission_id is not null order by seq",
  ),
);

const eventsBySubmission = new Map();
for (const { submission_id, data } of batches) {
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    continue;
  }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  const list = eventsBySubmission.get(submission_id) ?? [];
  for (const event of events)
    if (event?.timestamp)
      list.push({ ...event, at: Date.parse(event.timestamp) });
  eventsBySubmission.set(submission_id, list);
}

const browserTool = (name) =>
  /^(add|update|remove|set|apply|get|create)[A-Z]|^readNet/u.test(name);
const classify = (name) => {
  if (name === "ledger_commit" || name === "ledger_compile") return "ledger";
  if (/^(activate_skill|read_skill_resource)$/u.test(name)) return "skills";
  if (/^(getLatestNetDefinition|readNetOutline|readNetStructure)$/u.test(name))
    return "net reads";
  if (name === "getNetCompilationErrors") return "compile checks";
  if (name === "applyAutoLayout") return "layout";
  if (browserTool(name)) return "net changes";
  return "other";
};

const totals = {};
const add = (key, ms) => {
  totals[key] = (totals[key] ?? 0) + ms;
};
const rows = [];
let turn = 0;
for (const { submission_id, accepted_at, settled_at } of submissions) {
  turn += 1;
  const events = (eventsBySubmission.get(submission_id) ?? []).sort(
    (left, right) => left.at - right.at,
  );
  const wall = settled_at - accepted_at;
  let model = 0;
  let steps = 0;
  const phases = {};
  let stepStart;
  let stepTools = [];
  let toolPhaseStart;
  for (const event of events) {
    if (event.type === "assistant_message_started") {
      if (toolPhaseStart !== undefined && stepTools.length > 0) {
        const phase = event.at - toolPhaseStart;
        const key = [...new Set(stepTools.map(classify))].sort().join("+");
        phases[key] = (phases[key] ?? 0) + phase;
      }
      stepStart = event.at;
      stepTools = [];
      steps += 1;
    } else if (event.type === "assistant_message_completed") {
      if (stepStart !== undefined) model += event.at - stepStart;
      toolPhaseStart = event.at;
    } else if (event.type === "assistant_tool_call") {
      stepTools.push(event.toolName ?? event.name ?? event.tool?.name ?? "?");
    }
  }
  const tools = Object.values(phases).reduce((sum, ms) => sum + ms, 0);
  const row = {
    turn,
    wallS: +(wall / 1000).toFixed(0),
    modelS: +(model / 1000).toFixed(0),
    toolsS: +(tools / 1000).toFixed(0),
    otherS: +((wall - model - tools) / 1000).toFixed(0),
    steps,
    phases: Object.fromEntries(
      Object.entries(phases).map(([key, ms]) => [key, +(ms / 1000).toFixed(0)]),
    ),
  };
  rows.push(row);
  add("wall", wall);
  add("model", model);
  add("tools", tools);
  for (const [key, ms] of Object.entries(phases)) add(`tool phase: ${key}`, ms);
}

const seconds = (ms) => `${(ms / 1000).toFixed(0)} s`;
const share = (ms) => `${((100 * ms) / totals.wall).toFixed(0)}%`;
console.log(`run ${run.split("/").at(-1)}: ${rows.length} turns`);
console.log(
  `wall ${seconds(totals.wall)}; model ${seconds(totals.model)} (${share(totals.model)}); tool phases ${seconds(totals.tools)} (${share(totals.tools)}); other ${seconds(totals.wall - totals.model - totals.tools)}`,
);
const sorted = rows.map((row) => row.wallS).sort((left, right) => left - right);
console.log(
  `per turn: median ${sorted[Math.floor(sorted.length / 2)]} s, p90 ${sorted[Math.floor(sorted.length * 0.9)]} s, max ${sorted.at(-1)} s; steps per turn ${(rows.reduce((sum, row) => sum + row.steps, 0) / rows.length).toFixed(1)}`,
);
console.log("tool phases by category:");
for (const [key, ms] of Object.entries(totals)
  .filter(([key]) => key.startsWith("tool phase: "))
  .sort((left, right) => right[1] - left[1]))
  console.log(
    `  ${key.slice(12).padEnd(34)} ${seconds(ms).padStart(7)}  ${share(ms)}`,
  );
if (showTurns) {
  console.log("per turn (wall / model / tools / other, steps):");
  for (const row of rows)
    console.log(
      `  t${String(row.turn).padStart(2)}  ${String(row.wallS).padStart(4)} / ${String(row.modelS).padStart(4)} / ${String(row.toolsS).padStart(4)} / ${String(row.otherS).padStart(3)}  steps ${String(row.steps).padStart(2)}  ${JSON.stringify(row.phases)}`,
    );
}
