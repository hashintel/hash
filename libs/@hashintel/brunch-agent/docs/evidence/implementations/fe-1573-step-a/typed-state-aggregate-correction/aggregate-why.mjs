import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Read-only product-function replay of the independent review's actual capture.
// Never import this captured history into a product store or overwrite its original red.
const originalDirectory = process.argv[2];
const output = process.argv[3];
assert(
  originalDirectory && output,
  "Supply original review directory and fresh output file",
);
const { explainRootArc } = await import(
  pathToFileURL(resolve("apps/brunch-agent/src/conversation/why.ts")).href
);
const { parseConstructionWhyInput } = await import(
  pathToFileURL(
    resolve("libs/@hashintel/brunch-agent/packages/plugin-sdcpn/dist/index.js"),
  ).href
);
const read = (name) =>
  JSON.parse(readFileSync(resolve(originalDirectory, name), "utf8"));
const snapshot = read("primary/history.json");
const existing = read("primary/why.json")[0];
const baseline = read("aggregate-why.json");
const results = [];
for (const { query } of baseline) {
  const result = await explainRootArc({
    snapshot,
    current: existing.currentWorkpiece,
    browser: { binding: existing.binding, construction: true },
    query: parseConstructionWhyInput(query),
  });
  results.push({ query, result });
}
writeFileSync(output, JSON.stringify(results, null, 2), { flag: "wx" });
// Original required safety assertion, followed by the row/type aggregates and exact leaf controls.
assert.equal(
  results[0].result.disposition,
  "refused",
  "Aggregate initialState includes derived cell(s); original creation basis must not explain current aggregate",
);
for (const index of [0, 1, 4]) {
  const answer = results[index].result;
  assert.equal(answer.disposition, "refused");
  assert.match(answer.reason, /aggregate.*descendant/iu);
  assert.equal(answer.governing, undefined);
  assert.equal(answer.recordedChange, undefined);
  for (const field of [
    "target",
    "originToolCallId",
    "appliedChanges",
    "attempts",
    "reconciliation",
    "currentWorkpiece",
  ])
    assert.deepEqual(answer[field], baseline[index].result[field]);
}
for (const index of [2, 3])
  assert.deepEqual(
    results[index],
    baseline[index],
    "Working explicit/derived leaf answers must remain byte-value equivalent",
  );
process.stdout.write(
  "PASS original aggregate assertion, row/type refusals, exact leaf/origin/history/reconciliation controls\n",
);
