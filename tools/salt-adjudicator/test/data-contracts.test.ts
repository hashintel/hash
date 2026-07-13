import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  AdjudicationRecordSchema,
  CardSchema,
  CodeSheetEntrySchema,
  ImportedAdjudicationRecordSchema,
  ImportedSwipeRecordSchema,
  MonotoneTimestampSchema,
  QualificationCardSchema,
  SaltValidationError,
  SessionSnapshotSchema,
  SwipeRecordSchema,
  createStudy,
  manifestForExport,
  parseAdjudicationsJsonl,
  parseCardsJsonl,
  parseEmbeddedPayload,
  parseSessionSnapshot,
  parseStudy,
  parseStudyManifest,
  parseSwipesJsonl,
  safeParseEmbeddedPayload,
  safeParseSessionSnapshot,
  safeParseStudy,
  safeParseStudyManifest,
} from "../src/core.ts";

const card = {
  relation_id: "R1",
  family_id: "F1",
  card_text: "Relation: exact match\nExample one\nExample two",
  card_hash: "card-hash-1",
  prescreen: "equivalence",
} as const;

const makeStudy = () =>
  createStudy({
    cards: [card],
    annotatorIds: ["annotator-1"],
    coverageTarget: 1,
    sliceSize: 1,
    seed: "contract-tests",
  }).study;

const swipe = {
  schema_version: "salt-swipes-v1",
  swipe_id: "swipe-1",
  session_id: "session-1",
  study_id: "study-1",
  deck_hash: "deck-hash",
  annotator_id: "annotator-1",
  relation_id: "R1",
  family_id: "F1",
  card_hash: "card-hash-1",
  prescreen: "equivalence",
  pass: 1,
  label: "C",
  latency_ms: 125,
  flagged: false,
  note: null,
  qualification: false,
  rubric_version: "v1",
  shuffle_seed: 42,
  ts: "2026-07-13T08:00:00.000Z",
} as const;

describe("authored data contracts", () => {
  test("rejects unknown keys on canonical records", () => {
    assert.equal(
      CardSchema.safeParse({ ...card, unexpected: true }).success,
      false,
    );
    assert.equal(
      SwipeRecordSchema.safeParse({ ...swipe, unexpected: true }).success,
      false,
    );
    assert.equal(
      CodeSheetEntrySchema.safeParse({
        annotator_id: "annotator-1",
        code: "0123-4567",
        assigned_cards: -1,
      }).success,
      false,
    );
    assert.equal(
      MonotoneTimestampSchema.safeParse({
        timestampMs: -1,
        iso: "not-a-date",
      }).success,
      false,
    );

    const adjudication = {
      schema_version: "salt-adjudications-v1",
      record_type: "adjudication",
      study_id: "study-1",
      deck_hash: "deck-hash",
      relation_id: "R1",
      card_hash: "card-hash-1",
      label: "C",
      rationale: "The records denote the same canonical target.",
      adjudicator_id: "lead",
      ts: "2026-07-13T08:00:00.000Z",
      unexpected: true,
    };
    assert.equal(
      AdjudicationRecordSchema.safeParse(adjudication).success,
      false,
    );
  });

  test("normalizes the qualification gold_label alias", () => {
    assert.deepEqual(
      QualificationCardSchema.parse({
        ...card,
        gold_label: "C",
        rationale: "Both sides identify the same item.",
      }),
      {
        ...card,
        answer: "C",
        rationale: "Both sides identify the same item.",
      },
    );
  });

  test("reports missing qualification fields together", () => {
    const result = QualificationCardSchema.safeParse(card);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.deepEqual(
        result.error.issues.map((issue) => issue.path),
        [["answer"], ["rationale"]],
      );
    }
  });

  test("parses studies and manifests through public helpers", () => {
    const study = makeStudy();
    const manifest = manifestForExport(study);

    assert.deepEqual(parseStudy(study), study);
    assert.equal(safeParseStudy(study).success, true);
    assert.deepEqual(parseStudyManifest(manifest), manifest);
    assert.equal(safeParseStudyManifest(manifest).success, true);

    assert.equal(
      safeParseStudy({ ...study, coverage_target: 0 }).success,
      false,
    );
    assert.equal(
      safeParseStudyManifest({
        ...manifest,
        cards: [manifest.cards[0], manifest.cards[0]],
      }).success,
      false,
    );
  });
});

describe("import data contracts", () => {
  test("preserves imported swipe extensions and supplies boolean defaults", () => {
    const result = ImportedSwipeRecordSchema.parse({
      ...swipe,
      qualification: undefined,
      source_file: "batch-a.jsonl",
      evidence_batch: "batch-a",
    });

    assert.equal(result.evidence_batch, "batch-a");
    assert.equal(result.retracted, false);
    assert.equal(result.qualification, false);
  });

  test("preserves imported adjudication extensions", () => {
    const result = ImportedAdjudicationRecordSchema.parse({
      relation_id: "R1",
      label: "P",
      rationale: "The first item is directly contained by the second.",
      review_round: 2,
    });

    assert.equal(result.review_round, 2);
  });
});

describe("schema-backed JSONL imports", () => {
  test("rejects authored card extensions with a line-prefixed issue", () => {
    assert.throws(
      () =>
        parseCardsJsonl(
          `${JSON.stringify({ ...card, unsupported: "value" })}\n`,
        ),
      (error) =>
        error instanceof SaltValidationError &&
        error.issues.some(
          (issue) =>
            issue.startsWith("Line 1:") && issue.includes("unsupported"),
        ),
    );
  });

  test("normalizes qualification aliases through the JSONL parser", () => {
    assert.deepEqual(
      parseCardsJsonl(
        `${JSON.stringify({
          ...card,
          gold_label: "C",
          rationale: "Both sides identify the same item.",
        })}\n`,
        { qualification: true },
      ),
      [
        {
          ...card,
          answer: "C",
          rationale: "Both sides identify the same item.",
        },
      ],
    );
  });

  test("carries imported extensions through swipe and adjudication parsers", () => {
    const [parsedSwipe] = parseSwipesJsonl(
      `${JSON.stringify({
        ...swipe,
        qualification: undefined,
        evidence_batch: "batch-a",
      })}\n`,
      "batch-a.jsonl",
    );
    assert.equal(parsedSwipe.evidence_batch, "batch-a");
    assert.equal(parsedSwipe.qualification, false);
    assert.equal(parsedSwipe.retracted, false);
    assert.equal(parsedSwipe.source_file, "batch-a.jsonl");

    const [parsedAdjudication] = parseAdjudicationsJsonl(
      `${JSON.stringify({
        relation_id: "R1",
        label: "C",
        rationale: "Both sides identify the same item.",
        review_round: 2,
      })}\n`,
    );
    assert.equal(parsedAdjudication.review_round, 2);
  });
});

describe("embedded and session contracts", () => {
  test("parses every embedded payload variant", () => {
    const study = makeStudy();
    const genericPayload = {
      kind: "generic",
      schema_version: "salt-study-v1",
      build_hash: "build-hash",
      demo_study: study,
      demo_code: "0123-4567",
    } as const;

    assert.deepEqual(parseEmbeddedPayload(genericPayload), genericPayload);
    assert.equal(safeParseEmbeddedPayload(genericPayload).success, true);
    assert.equal(
      safeParseEmbeddedPayload({
        ...genericPayload,
        unsupported: true,
      }).success,
      false,
    );
  });

  test("validates session event and counter constraints", () => {
    const snapshot = {
      snapshot_version: 1,
      study_id: "study-1",
      deck_hash: "deck-hash",
      annotator_id: "annotator-1",
      session_id: "session-1",
      session_started_at: "2026-07-13T08:00:00.000Z",
      current_pass: 1,
      rubric_version: "v1",
      qualification_reviewed: true,
      events: [{ event_type: "swipe", swipe }],
      exported_event_count: 1,
      last_timestamp_ms: Date.parse("2026-07-13T08:00:00.000Z"),
    } as const;

    assert.deepEqual(parseSessionSnapshot(snapshot), snapshot);
    assert.equal(SessionSnapshotSchema.safeParse(snapshot).success, true);
    assert.equal(safeParseSessionSnapshot(snapshot).success, true);
    assert.equal(
      safeParseSessionSnapshot({
        ...snapshot,
        exported_event_count: 2,
      }).success,
      false,
    );
    assert.equal(
      safeParseSessionSnapshot({
        ...snapshot,
        session_started_at: "not-a-date",
      }).success,
      false,
    );
  });
});
