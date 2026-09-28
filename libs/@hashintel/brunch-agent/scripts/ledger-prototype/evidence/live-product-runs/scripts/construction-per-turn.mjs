// Net size after each turn, from the latest net read or read-back the turn produced,
// and how many construction Notes that turn recorded as open.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const run = process.argv[2];
const snapshot = JSON.parse(
  readFileSync(join(run, "evidence", "snapshot.json"), "utf8"),
);
const commits = JSON.parse(
  readFileSync(join(run, "evidence", "ledger.json"), "utf8"),
);

const size = (definition) =>
  (definition.places?.length ?? 0) +
  (definition.transitions?.length ?? 0) +
  (definition.transitions ?? []).reduce(
    (total, transition) =>
      total +
      (transition.inputArcs?.length ?? 0) +
      (transition.outputArcs?.length ?? 0),
    0,
  );

const rows = [];
let turn = 0;
let latest = 0;
for (const message of snapshot.messages) {
  if (message.role === "user" && message.purpose === "user") {
    turn += 1;
    rows.push({ turn, userId: message.id, netElements: latest, changes: 0 });
    continue;
  }
  if (message.role !== "assistant" || turn === 0) continue;
  for (const part of message.parts) {
    if (part.type !== "dynamic-tool" || part.state !== "output-available")
      continue;
    const definition =
      part.output?.metadata?.readBack ?? part.output?.output?.definition;
    if (part.output?.metadata?.documentRevision?.after !== undefined)
      rows.at(-1).changes += 1;
    if (definition?.places) latest = size(definition);
  }
  rows.at(-1).netElements = latest;
}
for (const row of rows) {
  const notes = commits
    .filter((commit) => commit.afterMessageId === row.userId)
    .flatMap((commit) => commit.notes);
  row.constructionOpen = notes.filter(
    (note) =>
      note.category === "construction" &&
      (note.standing === "open" ||
        /block|not yet|cannot|do not add/iu.test(note.disposition ?? "")),
  ).length;
  delete row.userId;
}
const turnsWithChanges = rows.filter((row) => row.changes > 0).length;
const blockedTurns = rows.filter((row) => row.constructionOpen > 0).length;
console.log(
  JSON.stringify({
    run: run.split("/").at(-1),
    turns: rows.length,
    turnsWithNetChanges: turnsWithChanges,
    turnsRecordingBlockedConstruction: blockedTurns,
    netElementsByTurn: rows.map((row) => row.netElements).join(","),
  }),
);
