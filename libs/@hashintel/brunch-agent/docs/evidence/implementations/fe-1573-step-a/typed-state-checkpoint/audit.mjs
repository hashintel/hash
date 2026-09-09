import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Independent raw JSON audit: no production diff/verification helper imports.
const directory = process.argv[2];
assert(directory, "Supply actual browser evidence directory");
const read = (name) =>
  JSON.parse(readFileSync(join(directory, `${name}.json`), "utf8"));
const normalized = (value) =>
  Array.isArray(value)
    ? value.map(normalized)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, normalized(value[key])]),
        )
      : value;
const equal = (left, right) =>
  assert.deepEqual(normalized(left), normalized(right));
const hash = (definition) =>
  createHash("sha256").update(JSON.stringify(definition)).digest("hex");
const segments = (path) => {
  assert(path.startsWith("/"));
  return path
    .slice(1)
    .split("/")
    .map((key) => key.replaceAll("~1", "/").replaceAll("~0", "~"));
};
const at = (root, path) =>
  segments(path).reduce((value, key) => value?.[key], root);
const records = read("records");
const history = read("control-history");
const parts = history.messages.flatMap((message) => message.parts);
const results = read("deliveries").flatMap((delivery) => {
  const message = JSON.parse(delivery.body);
  return message.kind === "signal" && message.type === "client-tool-result"
    ? JSON.parse(message.body)
    : [];
});
const rows = [];
for (const result of records) {
  const record = result.metadata.transitionRecord;
  assert.equal(record.attempts.length, 1);
  const attempt = record.attempts[0];
  assert.equal(hash(attempt.pre.definition), attempt.pre.sha256);
  assert.equal(hash(attempt.post.definition), attempt.post.sha256);
  equal(attempt.binding, attempt.request.binding);
  const call = parts.find(
    (part) =>
      part.type === "dynamic-tool" && part.toolCallId === result.toolCallId,
  );
  assert(call && call.toolName === result.toolName);
  const { brunch, ...rawInput } = call.input;
  equal(attempt.request.input, rawInput);
  assert.equal(
    brunch.observationToolCallId,
    attempt.request.observationToolCallId,
  );
  assert.equal(brunch.requestedBaseHash, attempt.request.requestedBaseHash);
  const readResult = results.find(
    (entry) => entry.toolCallId === brunch.observationToolCallId,
  );
  assert(readResult?.metadata?.observation);
  const observed = readResult.metadata.observation.observed;
  assert.equal(hash(observed.definition), observed.sha256);
  assert.equal(observed.sha256, brunch.requestedBaseHash);
  equal(readResult.metadata.observation.binding, attempt.binding);
  assert(
    parts.indexOf(
      parts.find(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === brunch.observationToolCallId,
      ),
    ) < parts.indexOf(call),
  );
  const effects = Object.values(attempt.effects).flat();
  for (const effect of effects)
    for (const other of effects)
      if (effect !== other)
        assert(
          effect.path !== other.path &&
            !effect.path.startsWith(`${other.path}/`),
          "Effects must be disjoint",
        );
  const reconstructed = structuredClone(attempt.pre.definition);
  for (const effect of effects) {
    const previous = at(attempt.pre.definition, effect.path);
    const actual = at(attempt.post.definition, effect.path);
    if (effect.kind === "created") {
      assert.equal(previous, undefined);
      equal(effect.after, actual);
    } else {
      equal(effect.before, previous);
      if (effect.kind === "updated") equal(effect.after, actual);
      else assert.equal(actual, undefined);
    }
    const keys = segments(effect.path);
    const leaf = keys.pop();
    assert(leaf !== undefined);
    let target = reconstructed;
    let actualContainer = attempt.post.definition;
    for (const key of keys) {
      actualContainer = actualContainer?.[key];
      if (!Object.hasOwn(target, key)) {
        assert(
          actualContainer && typeof actualContainer === "object",
          "Missing effect ancestor must be an actual observed container",
        );
        target[key] = Array.isArray(actualContainer) ? [] : {};
      }
      target = target[key];
    }
    if (effect.kind === "deleted") delete target[leaf];
    else target[leaf] = structuredClone(effect.after);
  }
  equal(reconstructed, attempt.post.definition);
  if (record.outcome === "applied") {
    assert.equal(attempt.pre.sha256, attempt.request.requestedBaseHash);
    assert.notEqual(attempt.pre.sha256, attempt.post.sha256);
  } else {
    assert(["no-op", "stale"].includes(record.outcome));
    equal(attempt.pre.definition, attempt.post.definition);
  }
  rows.push({
    toolCallId: result.toolCallId,
    operation: result.toolName,
    outcome: record.outcome,
    effects: Object.fromEntries(
      Object.entries(attempt.effects).map(([kind, changes]) => [
        kind,
        changes.map((change) => change.path),
      ]),
    ),
  });
}
assert.equal(rows.length, 12);
assert.equal(rows.filter((row) => row.outcome === "applied").length, 10);
const actual = (id) =>
  records.find((result) => result.toolCallId === id).metadata.transitionRecord
    .attempts[0];
const scenario = actual("typed-scenario");
assert(!Object.hasOwn(scenario.request.input, "parameterOverrides"));
equal(scenario.post.definition.scenarios[0].parameterOverrides, {});
assert(
  scenario.effects.derived.some(
    (effect) => effect.path === "/scenarios/0/parameterOverrides",
  ),
);
const migration = actual("typed-integer");
equal(
  migration.post.definition.scenarios[0].initialState.content["test-queue"],
  [
    [2, false],
    [0, false],
  ],
);
assert.equal(migration.effects.derived.length, 2);
const corrected = actual("typed-explicit-initial");
equal(
  corrected.post.definition.scenarios[0].initialState.content["test-queue"],
  [
    [2, true],
    [3, false],
  ],
);
assert.equal(corrected.effects.derived.length, 0);
assert(
  actual("typed-transfer").effects.derived.some((effect) =>
    effect.path.endsWith("transitionKernelCode"),
  ),
);
assert(
  actual("typed-discard-attributes").effects.derived.some((effect) =>
    effect.path.endsWith("transitionKernelCode"),
  ),
);
const reopened = read("raw-reopen");
assert.equal(hash(reopened.definition), reopened.sha256);
equal(reopened.definition, actual("typed-discard-attributes").post.definition);
assert.equal(
  read("compilation")[0].output,
  "No errors detected in your model – everything compiles!",
);
const report = {
  records: rows,
  totalEffects: Object.fromEntries(
    ["created", "updated", "deleted", "derived"].map((kind) => [
      kind,
      rows.reduce((sum, row) => sum + row.effects[kind].length, 0),
    ]),
  ),
  rawReopenSha256: reopened.sha256,
  recordedReopenSha256: actual("typed-discard-attributes").post.sha256,
  fullRawReconstruction: true,
  limits:
    "Independent mechanical diff/base/identity audit only. Positional row/cell values are not token identities. No simulation, source relevance or utility adjudication.",
};
writeFileSync(
  process.argv[3] ?? join(directory, "independent-audit.json"),
  JSON.stringify(report, null, 2),
);
process.stdout.write(
  `PASS ${rows.length} complete raw records reconstructed\n`,
);
