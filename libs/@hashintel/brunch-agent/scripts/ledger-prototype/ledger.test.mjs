import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Ledger } from "./ledger.mjs";

const setup = (testContext) => {
  const directory = mkdtempSync(join(tmpdir(), "ledger-check-"));
  testContext.after(() => rmSync(directory, { recursive: true, force: true }));
  return new Ledger(join(directory, "ledger.jsonl"));
};
const add = (
  address = "operational/resources",
  content = "Loading requires two people.",
) => ({ op: "add", address, content });
const host = (invocationId) => ({
  invocationId,
  sessionId: "session-a",
  inputId: "u1",
});
const rows = (ledger) =>
  readFileSync(ledger.file, "utf8").trim().split("\n").map(JSON.parse);

test("only op, address and content are needed; host assigns identity and conversation linkage", (testContext) => {
  const ledger = setup(testContext);
  const receipt = ledger.commit([add()], host("c1"));
  assert.equal(receipt.status, "recorded");
  assert.deepEqual(receipt.notes, [{ address: "operational/resources/n1" }]);
  const commit = rows(ledger)[1];
  assert.equal(commit.sessionId, "session-a");
  assert.equal(commit.invocationId, "c1");
  assert.equal(commit.inputId, "u1");
  assert.ok(commit.recordedAt);
  assert.deepEqual(commit.changes, [add()]);
  assert.equal(commit.notes[0].sourceIds, undefined);
  assert.match(ledger.compile().markdown, /\[n1\]/);
});

test("parents and children accept Notes; subtree and exact-Note reads have explicit scope", (testContext) => {
  const ledger = setup(testContext);
  ledger.commit(
    [add("operational", "Cross-cutting context."), add()],
    host("c1"),
  );
  assert.match(ledger.compile({ address: "operational" }).markdown, /\[n1\]/);
  assert.match(ledger.compile({ address: "operational" }).markdown, /\[n2\]/);
  assert.doesNotMatch(
    ledger.compile({ address: "operational/resources" }).markdown,
    /\[n1\]/,
  );
  const focused = ledger.compile({ address: "operational/resources/n2" });
  assert.equal(focused.scope, "operational/resources/n2");
  assert.match(focused.markdown, /Loading requires two people/);
  assert.doesNotMatch(focused.markdown, /Cross-cutting context/);
  assert.throws(
    () => ledger.compile({ address: "operation" }),
    /No category or Note/,
  );
});

test("supersession is an annotation: predecessor and competing successors all remain visible", (testContext) => {
  const ledger = setup(testContext);
  const target = ledger.commit([add()], host("c1")).notes[0].address;
  const prefix = readFileSync(ledger.file, "utf8");
  const original = rows(ledger)[1].notes[0];
  assert.equal(
    ledger.commit(
      [
        {
          op: "supersede",
          address: target,
          content: "Three for hazardous loads.",
          disposition: "inferred",
        },
        {
          op: "supersede",
          address: target,
          content: "Three when the second bay is open.",
          disposition: "direct",
        },
      ],
      host("c2"),
    ).status,
    "recorded",
  );
  // Another contribution may still reference the same original; no stale/superseded-target refusal.
  assert.equal(
    ledger.commit(
      [
        {
          op: "supersede",
          address: target,
          content: "The two accounts may describe independent conditions.",
          disposition: "tentative interpretation; needs discussion",
        },
      ],
      host("c3"),
    ).status,
    "recorded",
  );
  assert.ok(readFileSync(ledger.file, "utf8").startsWith(prefix));
  assert.deepEqual(rows(ledger)[1].notes[0], original);
  const view = ledger.compile({ address: "operational/resources" }).markdown;
  for (const content of [
    "Loading requires two people.",
    "Three for hazardous loads.",
    "Three when the second bay is open.",
    "independent conditions",
  ]) {
    assert.ok(view.includes(content));
  }
  assert.match(view, /\[n2 — supersedes n1; inferred\]/);
  assert.match(view, /\[n3 — supersedes n1; direct\]/);
  assert.match(
    view,
    /\[n4 — supersedes n1; tentative interpretation; needs discussion\]/,
  );
  assert.equal(
    ledger
      .compile({ address: target })
      .markdown.includes("Three for hazardous loads"),
    false,
  );
});

test("historical compilation and reopening preserve an exact prefix, without suppression", (testContext) => {
  const ledger = setup(testContext);
  ledger.commit([add()], host("c1"));
  const before = ledger.compile({ revision: 1 });
  ledger.commit(
    [
      {
        op: "supersede",
        address: "operational/resources/n1",
        content: "Three people.",
        disposition: "direct",
      },
    ],
    host("c2"),
  );
  assert.deepEqual(new Ledger(ledger.file).compile({ revision: 1 }), before);
  assert.match(ledger.compile().markdown, /Loading requires two people/);
  assert.match(ledger.compile().markdown, /Three people/);
  assert.throws(() => ledger.compile({ revision: 3 }), /Revision must be/);
  assert.throws(
    () =>
      ledger.compile({
        revision: 1,
        address: "operational/resources/n2",
      }),
    /No category or Note/,
  );
  assert.doesNotMatch(
    ledger.compile({ revision: 0 }).markdown,
    /Loading requires two people/,
  );
});

test("invalid categories or targets refuse the whole batch without consuming Note IDs", (testContext) => {
  const ledger = setup(testContext);
  const before = readFileSync(ledger.file, "utf8");
  const result = ledger.commit([add(), add("invented")], host("c1"));
  assert.equal(result.code, "unknown-address");
  assert.match(result.message, /operational\/process-spine/);
  assert.equal(readFileSync(ledger.file, "utf8"), before);
  assert.equal(
    ledger.commit(
      [
        add(),
        {
          op: "supersede",
          address: "operational/resources/n99",
          content: "Missing target.",
        },
      ],
      host("c2"),
    ).code,
    "invalid-target",
  );
  assert.equal(readFileSync(ledger.file, "utf8"), before);
  assert.equal(
    ledger.commit([add()], host("c3")).notes[0].address,
    "operational/resources/n1",
  );
  assert.equal(
    ledger.commit(
      [
        {
          op: "supersede",
          address: "operational/resources",
          content: "A category is not a Note.",
        },
      ],
      host("c4"),
    ).code,
    "invalid-target",
  );
});

test("exact retries reuse host-assigned identities; changed content or annotation refuses", (testContext) => {
  const ledger = setup(testContext);
  const changes = [{ ...add(), disposition: "inferred" }];
  const original = ledger.commit(changes, host("c1"));
  assert.deepEqual(ledger.commit(changes, host("c1")), {
    ...original,
    replayed: true,
  });
  assert.equal(
    ledger.commit([{ ...add(), disposition: "direct" }], host("c1")).code,
    "retry-conflict",
  );
  assert.equal(
    ledger.commit([{ ...changes[0], content: "Different" }], host("c1")).code,
    "retry-conflict",
  );
  assert.equal(ledger.compile().revision, 1);
});

test("old mutation operations and bookkeeping fields refuse; disposition vocabulary stays open", (testContext) => {
  const ledger = setup(testContext);
  for (const op of ["create", "revise", "move", "withdraw"]) {
    assert.equal(ledger.commit([{ ...add(), op }], host(op)).status, "refused");
  }
  for (const [key, value] of Object.entries({
    id: "n99",
    title: "Staff",
    sourceIds: [],
    expectedVersion: 1,
  })) {
    assert.equal(
      ledger.commit([{ ...add(), [key]: value }], host(key)).status,
      "refused",
    );
  }
  assert.equal(ledger.compile().revision, 0);
  const changes = [
    { ...add(), disposition: "guessed via sane defaults; not yet shown" },
  ];
  assert.equal(ledger.commit(changes, host("valid")).status, "recorded");
  assert.match(
    ledger.compile().markdown,
    /guessed via sane defaults; not yet shown/,
  );
});

test("older prototype artifacts refuse explicitly and are never rewritten", (testContext) => {
  const ledger = setup(testContext);
  const legacy = `${JSON.stringify({ ledgerId: "old", profile: { addresses: [] } })}\n`;
  writeFileSync(ledger.file, legacy);
  assert.throws(() => ledger.compile(), /Earlier prototype runs are preserved/);
  assert.throws(
    () => ledger.commit([add()], host("c1")),
    /Unsupported Ledger format/,
  );
  assert.equal(readFileSync(ledger.file, "utf8"), legacy);
});
