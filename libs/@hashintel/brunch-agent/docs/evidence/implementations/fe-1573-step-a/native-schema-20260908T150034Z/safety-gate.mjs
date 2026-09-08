// Claim gate, separate from the reproducer's expected-negative observations.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const mode = process.argv[2] ?? "candidate";
const report = JSON.parse(
  readFileSync(new URL(`${mode}.json`, import.meta.url)),
);
assert.equal(
  report.declaration.accepted,
  true,
  "Native public declaration must succeed",
);
for (const payload of report.payloads)
  for (const delta of payload.deltas)
    assert.equal(
      delta.equal,
      true,
      `${delta.name}: supplied schema must survive serialization`,
    );
const find = (name) => {
  const sample = report.runtimeCases.find((entry) => entry.name === name);
  assert(sample, name);
  return sample;
};
for (const name of [
  "boolean-weight",
  "two-endpoints",
  "output-type",
  "async-invalid",
  "before-block",
  "mixed-rejection",
  "validation-cancellation",
  "durable-invalid",
])
  assert.equal(
    find(name).executions.length,
    0,
    `${name}: invalid, blocked or cancelled input must not run`,
  );
for (const name of [
  "valid-arc",
  "scenario-default",
  "recursive-native",
  "empty-required",
  "explicit-normalization",
  "transformed-output",
  "async-valid",
  "valibot-default-transform",
  "valibot-generic-control",
  "durable-normalized",
])
  assert.equal(
    find(name).executions.length,
    1,
    `${name}: valid input must execute exactly once`,
  );
assert.equal(report.transformParses, 1, "Native parse must not be duplicated");
assert.equal(report.networkAttempts, 0);
console.log(`${mode}: native schema/validation ownership gate passed`);
