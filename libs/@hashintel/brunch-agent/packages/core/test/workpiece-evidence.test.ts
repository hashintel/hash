import { expect, test } from "vitest";

import { settleWorkpieceEvidence } from "../src/update-workpiece";

import type { WorkpieceRevision } from "../src/workpiece";

const markdown = "# Account\nReserve one crew.\n\nTiming unknown.";
const locator = { start: 10, end: 27 };
const relation = { locator, messageIds: ["user-1"], kind: "elicited" as const };
const source = {
  id: "user-1",
  role: "user",
  purpose: "user",
  text: "Reserve one crew.",
};
const previous: WorkpieceRevision = {
  revisionId: "first",
  sha256: "a".repeat(64),
  ordinal: 1,
  markdown,
  evidence: [relation],
  evidenceValidated: true,
};

test("validates actual true-user sources before settling evidence", async () => {
  await expect(
    settleWorkpieceEvidence(
      { markdown, evidence: [relation] },
      null,
      async () => [source],
    ),
  ).resolves.toEqual([relation]);
  for (const invalid of [
    [],
    [{ ...source, role: "assistant", purpose: "assistant" }],
    [{ ...source, role: "system", purpose: "dispatch" }],
    [{ ...source, purpose: "prepared" }],
    [{ ...source, id: "other-conversation" }],
  ]) {
    await expect(
      settleWorkpieceEvidence(
        { markdown, evidence: [relation] },
        null,
        async () => invalid,
      ),
    ).rejects.toThrow("authorized true-user");
  }
});

test("rejects invalid spans, relation kinds, and source-free elicited declarations", async () => {
  for (const invalid of [
    { ...relation, locator: { start: 2, end: 1 } },
    { ...relation, locator: { start: 0, end: markdown.length + 1 } },
    { ...relation, kind: "prepared" },
    { ...relation, messageIds: [] },
  ]) {
    await expect(
      settleWorkpieceEvidence(
        { markdown, evidence: [invalid] },
        null,
        async () => [source],
      ),
    ).rejects.toThrow(/locator|type|authorized true-user/iu);
  }
});

test("carries unchanged unambiguous revision-local relations and reauthorizes their sources", async () => {
  await expect(
    settleWorkpieceEvidence(
      { markdown: `${markdown}\nUnrelated context.` },
      previous,
      async () => [source],
    ),
  ).resolves.toEqual([relation]);
  await expect(
    settleWorkpieceEvidence({ markdown }, previous, async () => []),
  ).rejects.toThrow("authorized true-user");
  await expect(
    settleWorkpieceEvidence({ markdown }, null, async () => [source]),
  ).resolves.toBeUndefined();
});

test("does not guess continuity for moves, renames, paraphrases, split, merge, deletion or reintroduction", async () => {
  for (const changed of [
    `Preface\n${markdown}`,
    markdown.replace("# Account", "# Renamed account"),
    markdown.replace("Reserve one crew.", "Hold one crew."),
    markdown.replace("Reserve one crew.", "Reserve.\nOne crew."),
    markdown.replace(
      "Reserve one crew.\n\nTiming unknown.",
      "Reserve one crew; timing unknown.",
    ),
    "# Account\nTiming unknown.",
  ]) {
    await expect(
      settleWorkpieceEvidence({ markdown: changed }, previous, async () => [
        source,
      ]),
    ).resolves.toBeUndefined();
  }
  await expect(
    settleWorkpieceEvidence(
      { markdown },
      { ...previous, markdown: "# Deleted", evidence: undefined },
      async () => [source],
    ),
  ).resolves.toBeUndefined();
});

test("duplicate quotes and headings never select a source by text search", async () => {
  const duplicated = `${markdown}\n${markdown}`;
  await expect(
    settleWorkpieceEvidence({ markdown: duplicated }, previous, async () => [
      source,
    ]),
  ).resolves.toBeUndefined();
  // Explicit revision-local spans remain legal, but earn neither relevance nor continuity.
  await expect(
    settleWorkpieceEvidence(
      { markdown: duplicated, evidence: [relation] },
      null,
      async () => [source],
    ),
  ).resolves.toEqual([relation]);
});
