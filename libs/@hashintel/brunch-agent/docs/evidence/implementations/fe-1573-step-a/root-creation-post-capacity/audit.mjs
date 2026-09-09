import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Offline audit of this witness's raw observations, not a history import or product store.
const plugin = await import(
  pathToFileURL(
    resolve("libs/@hashintel/brunch-agent/packages/plugin-sdcpn/dist/index.js"),
  ).href
);
const { clientToolHistoryFrom } = await import(
  pathToFileURL(
    resolve(
      "libs/@hashintel/brunch-agent/packages/transport-aisdk/dist/index.js",
    ),
  ).href
);
assert(process.argv[2], "Pass the fresh browser output directory");
assert(process.argv[3], "Pass the unchanged direct diagnostic's JSON output");
const read = (name) =>
  JSON.parse(readFileSync(resolve(process.argv[2], `${name}.json`), "utf8"));
const history = read("control-history");
const results = clientToolHistoryFrom(history.messages).results;
const records = results.filter((entry) => entry.metadata?.transitionRecord);
assert.equal(records.length, 9);
const counts = { applied: 0, "no-op": 0, stale: 0 };
const effects = { created: 0, updated: 0, deleted: 0, derived: 0 };
const bases = [];
for (const result of records) {
  const record = result.metadata.transitionRecord;
  assert(Object.hasOwn(counts, record.outcome));
  counts[record.outcome]++;
  for (const raw of record.attempts) {
    const attempt = await plugin.verifyArcTransitionAttempt(raw);
    const callIndex = history.messages.findIndex(
      (message) =>
        message.role === "assistant" &&
        message.parts.some(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolCallId === result.toolCallId,
        ),
    );
    assert(callIndex >= 0);
    const earlier = clientToolHistoryFrom(
      history.messages.slice(0, callIndex),
    ).results;
    const readResult = earlier.find(
      (entry) => entry.toolCallId === attempt.request.observationToolCallId,
    );
    assert(readResult && readResult.toolName === "getLatestNetDefinition");
    const observed = await plugin.verifyDefinitionObservation(
      readResult.metadata.observation.observed,
    );
    assert.equal(
      plugin.canonicalContent(readResult.metadata.observation.binding),
      plugin.canonicalContent(attempt.request.binding),
    );
    assert.equal(attempt.request.requestedBaseHash, observed.sha256);
    if (record.outcome !== "stale")
      assert.equal(attempt.pre.sha256, observed.sha256);
    else assert.notEqual(attempt.pre.sha256, observed.sha256);
    bases.push({
      toolCallId: result.toolCallId,
      observationToolCallId: readResult.toolCallId,
      requestedRawHash: attempt.request.requestedBaseHash,
      verifiedEarlierRawHash: observed.sha256,
      independentlyObservedPreHash: attempt.pre.sha256,
      outcome: record.outcome,
    });
    for (const key of Object.keys(effects))
      effects[key] += attempt.effects[key].length;
  }
}
assert.deepEqual(counts, { applied: 7, "no-op": 1, stale: 1 });
for (const id of ["creation-duplicate", "creation-unknown", "creation-retired"])
  assert(!results.some((entry) => entry.toolCallId === id));
const direct = JSON.parse(readFileSync(process.argv[3], "utf8"));
assert.equal(
  plugin.canonicalContent(direct.before),
  plugin.canonicalContent(direct.normalized),
);
assert.equal(
  plugin.canonicalContent(direct.before),
  plugin.canonicalContent(direct.reopened),
);
const rawReopen = read("raw-reopen-result");
const reopened = await plugin.verifyDefinitionObservation(
  rawReopen.metadata.observation.observed,
);
const stored = read("storage-before-reopen")["synthetic-root-creation-v1"]
  .sdcpn;
assert.equal(
  plugin.canonicalContent(stored),
  plugin.canonicalContent(reopened.definition),
);
assert.equal(reopened.definition.places[0].capacity, 3);
assert.equal(reopened.definition.places[1].capacity, null);
assert.equal(read("summary").completed, 36);
assert.equal(read("summary").requests, 50);
process.stdout.write(
  `${JSON.stringify({ counts, effects, bases, completeReopenContentEqual: true, completeDirectDiagnosticContentEqual: true, semanticUtility: "unassessed; not a useful-coverage denominator" }, null, 2)}\n`,
);
