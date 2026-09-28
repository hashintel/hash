// Mechanical measures of one persona run from its canonical evidence snapshot.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const run = process.argv[2];
const maxTurn =
  process.argv[3] === undefined ? Infinity : Number(process.argv[3]);
const snapshot = JSON.parse(
  readFileSync(join(run, "evidence", "snapshot.json"), "utf8"),
);

const parts = [];
const userIds = [];
let turn = 0;
let lastDefinition;
for (const message of snapshot.messages) {
  if (message.role === "user" && message.purpose === "user") {
    turn += 1;
    if (turn <= maxTurn) userIds.push(message.id);
  }
  if (message.role !== "assistant" || turn > maxTurn) continue;
  for (const part of message.parts) {
    if (part.type !== "dynamic-tool") continue;
    parts.push({ turn, part });
    const envelope = part.output;
    const seen =
      envelope?.output?.definition ?? envelope?.metadata?.readBack ?? undefined;
    if (seen?.places) lastDefinition = seen;
  }
}
const commits = JSON.parse(
  readFileSync(join(run, "evidence", "ledger.json"), "utf8"),
).filter((commit) => userIds.includes(commit.afterMessageId));

const count = (items, key) =>
  items.reduce((tally, item) => {
    const value = key(item) ?? "(none)";
    tally[value] = (tally[value] ?? 0) + 1;
    return tally;
  }, {});

const toolCalls = count(parts, ({ part }) => `${part.toolName}:${part.state}`);
const refusedCommits = parts
  .filter(
    ({ part }) =>
      part.toolName === "ledger_commit" && part.output?.status === "refused",
  )
  .map(({ part }) => part.output.code);
const errors = parts
  .filter(({ part }) => part.state === "output-error")
  .map(
    ({ part }) => `${part.toolName}: ${String(part.errorText).slice(0, 90)}`,
  );
const mutating = (name) =>
  /^(add|update|remove|delete|commit|apply|set|move)/u.test(name);
const firstNetChangeTurn = parts.find(
  ({ part }) =>
    mutating(part.toolName) &&
    part.toolName !== "setNetTitle" &&
    part.output?.metadata?.documentRevision?.after !== undefined,
)?.turn;
const notes = commits.flatMap((commit) => commit.notes);
const superseded = new Set(notes.flatMap((note) => note.supersedes ?? []));
const commitsPerTurn = count(commits, (commit) => commit.afterMessageId);

let net;
try {
  net = JSON.parse(readFileSync(join(run, "evidence", "net.json"), "utf8"));
} catch {
  net = undefined;
}
const definition =
  maxTurn === Infinity
    ? (net?.sdcpn ?? net?.definition ?? net)
    : lastDefinition;

console.log(
  JSON.stringify(
    {
      userTurns: turn,
      toolCalls,
      refusedCommits,
      errors,
      firstNetChangeTurn,
      commits: commits.length,
      turnsWithCommits: Object.keys(commitsPerTurn).length,
      notes: notes.length,
      supersessions: notes.filter((note) => note.supersedes).length,
      supersededNotes: superseded.size,
      byCategory: count(notes, (note) => note.category),
      source: count(notes, (note) => note.source),
      basis: count(notes, (note) => note.basis),
      standing: count(notes, (note) => note.standing),
      precision: count(notes, (note) => note.precision),
      qualifiers: notes.filter((note) => note.qualifier).length,
      dispositions: count(notes, (note) => note.disposition),
      meanNoteChars: Math.round(
        notes.reduce((total, note) => total + note.content.length, 0) /
          Math.max(notes.length, 1),
      ),
      ledgerMarkdownChars:
        maxTurn === Infinity
          ? readFileSync(join(run, "evidence", "ledger.md"), "utf8").length
          : undefined,
      net: definition
        ? {
            places: definition.places?.length,
            transitions: definition.transitions?.length,
            arcs: (definition.transitions ?? []).reduce(
              (total, transition) =>
                total +
                (transition.inputArcs?.length ?? 0) +
                (transition.outputArcs?.length ?? 0),
              0,
            ),
            types: definition.types?.length,
            parameters: definition.parameters?.length,
            scenarios: definition.scenarios?.length,
            metrics: definition.metrics?.length,
          }
        : undefined,
    },
    null,
    2,
  ),
);
