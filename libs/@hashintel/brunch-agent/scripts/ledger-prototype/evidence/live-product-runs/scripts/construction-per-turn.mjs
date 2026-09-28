// Net size after each turn, from the latest net read or read-back the turn produced;
// whether each turn changed the net, recorded a construction blocker, or neither;
// and the composition of the final net.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const run = process.argv[2];
const snapshot = JSON.parse(
  readFileSync(join(run, "evidence", "snapshot.json"), "utf8"),
);
const commits = JSON.parse(
  readFileSync(join(run, "evidence", "ledger.json"), "utf8"),
);
const finalNet = JSON.parse(
  readFileSync(join(run, "evidence", "net.json"), "utf8"),
).sdcpn;

const arcsOf = (transition) => [
  ...(transition.inputArcs ?? []),
  ...(transition.outputArcs ?? []),
];

const size = (definition) =>
  (definition.places?.length ?? 0) +
  (definition.transitions?.length ?? 0) +
  (definition.transitions ?? []).reduce(
    (total, transition) => total + arcsOf(transition).length,
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

// Typed runs mark a construction gap with `standing: open` under `construction`;
// open runs, lacking that field, file it under `open-matters` with prose.
const blockerPattern =
  /\bblock|cannot yet|not yet|do not (yet )?(add|build|construct|automate|model|turn|convert)/iu;
const isConstructionBlocker = (note) =>
  (note.category === "construction" || note.category === "open-matters") &&
  (note.standing === "open" ||
    (note.standing === undefined &&
      blockerPattern.test(`${note.disposition ?? ""} ${note.content ?? ""}`) &&
      /construct|net\b|fragment|represent/iu.test(
        `${note.disposition ?? ""} ${note.content ?? ""}`,
      )));

for (const row of rows) {
  const notes = commits
    .filter((commit) => commit.afterMessageId === row.userId)
    .flatMap((commit) => commit.notes);
  row.outcome =
    row.changes > 0
      ? "built"
      : notes.some(isConstructionBlocker)
        ? "blocked"
        : "neither";
  delete row.userId;
}

const transitions = finalNet.transitions ?? [];
const arcs = transitions.flatMap(arcsOf);
const count = (outcome) => rows.filter((row) => row.outcome === outcome).length;

console.log(
  JSON.stringify(
    {
      run: run.split("/").at(-1),
      turns: rows.length,
      firstBuiltTurn: rows.find((row) => row.outcome === "built")?.turn ?? null,
      turnsBuilt: count("built"),
      turnsBlocked: count("blocked"),
      turnsNeither: count("neither"),
      // B built, x blocked, - neither
      outcomeByTurn: rows
        .map((row) => ({ built: "B", blocked: "x", neither: "-" })[row.outcome])
        .join(""),
      netElementsByTurn: rows.map((row) => row.netElements).join(","),
      finalNet: {
        places: finalNet.places?.length ?? 0,
        transitions: transitions.length,
        arcs: arcs.length,
        readOrInhibitorArcs: arcs.filter(
          (arc) => arc.type === "read" || arc.type === "inhibitor",
        ).length,
        tokenTypes: finalNet.types?.length ?? 0,
        colouredPlaces: (finalNet.places ?? []).filter((place) => place.colorId)
          .length,
        transitionsWithCode: transitions.filter(
          (transition) =>
            (transition.lambdaCode?.length ?? 0) > 0 ||
            (transition.transitionKernelCode?.length ?? 0) > 0,
        ).length,
        parameters: finalNet.parameters?.length ?? 0,
        differentialEquations: finalNet.differentialEquations?.length ?? 0,
        metrics: finalNet.metrics?.length ?? 0,
        scenarios: finalNet.scenarios?.length ?? 0,
      },
    },
    null,
    2,
  ),
);
