import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Diagnostic only: the real Chrome reopen is the product oracle. This creates
// a separate canonical handle from an observed definition, never restores Flue state.
const { createJsonDocHandle, normalizeSDCPN } = await import(
  pathToFileURL(resolve("libs/@hashintel/petrinaut-core/dist/index.js")).href
);
const { verifyArcTransitionAttempt } = await import(
  pathToFileURL(
    resolve("libs/@hashintel/brunch-agent/packages/plugin-sdcpn/dist/index.js"),
  ).href
);
assert(process.argv[2], "Pass the actual browser records.json path");
const records = JSON.parse(readFileSync(process.argv[2], "utf8"));
const attempt = await verifyArcTransitionAttempt(
  records.find((result) => result.toolCallId === "creation-pause").metadata
    .transitionRecord.attempts[0],
);
const original = attempt.post.definition;
const normalized = normalizeSDCPN(original);
const reopened = createJsonDocHandle({
  id: "test-direct-reopen",
  initial: original,
  capabilities: { disabledExtensions: [] },
}).doc();
assert.equal(original.places[0].capacity, 3);
process.stdout.write(
  `${JSON.stringify(
    {
      source: "Verified actual Chrome creation-pause post definition",
      before: original,
      normalized,
      reopened,
      capacity: {
        before: original.places[0].capacity,
        normalizedPresent: Object.hasOwn(normalized.places[0], "capacity"),
        reopenedPresent: Object.hasOwn(reopened.places[0], "capacity"),
      },
      claim:
        "Diagnostic reproduction of loss; not a green preservation oracle or restored conversation",
    },
    null,
    2,
  )}\n`,
);
assert.equal(
  reopened.places[0].capacity,
  3,
  "Canonical handle initialization must preserve capacity",
);
