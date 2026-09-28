// Prepares deterministic audit inputs from a persona run's canonical evidence.
// Usage: node brunch-audit-prep.mjs <run-dir> <sample-size>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const run = process.argv[2];
const sampleSize = Number(process.argv[3] ?? 30);
const snapshot = JSON.parse(
  readFileSync(join(run, "evidence", "snapshot.json"), "utf8"),
);
const commits = JSON.parse(
  readFileSync(join(run, "evidence", "ledger.json"), "utf8"),
);

const text = (message) =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

// Turn t: the persona's t-th message and the Brunch reply that answered it.
const turns = [];
for (const message of snapshot.messages) {
  if (message.role === "user" && message.purpose === "user")
    turns.push({ personaId: message.id, persona: text(message), brunch: "" });
  else if (message.role === "assistant" && turns.length > 0)
    turns.at(-1).brunch += `${text(message)}\n`;
}
const turnOf = (messageId) =>
  turns.findIndex((turn) => turn.personaId === messageId) + 1;

const notes = commits.flatMap((commit) =>
  commit.notes.map((note) => ({
    ...note,
    turn: turnOf(commit.afterMessageId),
  })),
);
const successors = new Map();
for (const note of notes)
  if (note.supersedes)
    successors.set(note.supersedes, [
      ...(successors.get(note.supersedes) ?? []),
      note,
    ]);

const exchange = (turn) => ({
  brunchAsked: turns[turn - 2]?.brunch.trim().slice(-1500) ?? "(opening)",
  personaSaid: turns[turn - 1]?.persona ?? "",
});

// Every k-th Note, so the sample spreads across the conversation.
const every = (items, count) => {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
};

const noteView = ({
  id,
  address,
  turn,
  content,
  source,
  basis,
  standing,
  precision,
  qualifier,
  disposition,
  supersedes,
}) => ({
  id,
  address,
  turn,
  content,
  ...(source === undefined
    ? {}
    : { source, basis, standing, precision, qualifier }),
  ...(disposition === undefined ? {} : { disposition }),
  ...(supersedes === undefined
    ? {}
    : { supersedes: supersedes.split("/").at(-1) }),
});

const classification = every(notes, sampleSize).map((note) => ({
  note: noteView(note),
  ...exchange(note.turn),
}));

const typed = notes.some((note) => note.standing !== undefined);
const gapNotes = notes.filter((note) =>
  typed
    ? note.standing === "open"
    : note.category === "open-matters" ||
      /\b(open|gap|blocked|unknown|unresolved|deferred)\b/iu.test(
        note.disposition ?? "",
      ),
);
const followUp = every(gapNotes, sampleSize).map((note) => ({
  note: noteView(note),
  brunchNextReplies: [0, 1, 2]
    .map((offset) => turns[note.turn - 1 + offset])
    .filter(Boolean)
    .map((turn, offset) => ({
      turn: note.turn + offset,
      brunch: turn.brunch.trim().slice(0, 1200),
      personaNext: turns[note.turn + offset]?.persona.slice(0, 600) ?? "",
    })),
  laterSuccessors: (successors.get(note.address) ?? []).map(noteView),
}));

writeFileSync(
  join(run, "audit-classification-input.json"),
  `${JSON.stringify(classification, null, 2)}\n`,
);
writeFileSync(
  join(run, "audit-followup-input.json"),
  `${JSON.stringify(followUp, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    run,
    typed,
    notes: notes.length,
    classificationSample: classification.length,
    gapNotes: gapNotes.length,
    followUpSample: followUp.length,
  }),
);
