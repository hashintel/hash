// Scripted scratchpad, not an agent-authored Ledger or a persona-quality evaluation.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ledger } from "./ledger.mjs";

const base = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(base, "runs"), { recursive: true });
const directory = mkdtempSync(join(base, "runs/demo-"));
const ledger = new Ledger(join(directory, "ledger.jsonl"));
const host = (invocationId, inputId) => ({
  invocationId,
  inputId,
  sessionId: "scripted-demo",
});
const first = ledger.commit(
  [
    {
      op: "add",
      address: "operational/resources",
      content: "Loading requires two people.",
    },
    {
      op: "add",
      address: "operational",
      content: "A scripted receiving example, not elicited evidence.",
      disposition: "authored demo",
    },
  ],
  host("c1", "u1"),
);
console.log(first);
const predecessor = first.notes[0].address; // Host-generated; no invented Note ID or version.
console.log(
  ledger.commit(
    [
      {
        op: "supersede",
        address: predecessor,
        content:
          "Loading requires two people normally, three for hazardous loads.",
        disposition: "inferred",
      },
      {
        op: "supersede",
        address: predecessor,
        content:
          "Loading requires three people whenever the second loading bay is open.",
        disposition: "direct",
      },
    ],
    host("c2", "u2"),
  ),
);
// Both successors AND the original remain visible; the elicitor must interpret their relationship.
for (const revision of [1, 2]) {
  writeFileSync(
    join(directory, `revision-${revision}.md`),
    ledger.compile({ revision }).markdown,
  );
}
writeFileSync(
  join(directory, "resources.md"),
  ledger.compile({ address: "operational/resources" }).markdown,
);
console.log(`Inspect ${directory}`);
console.log(ledger.compile().markdown);
