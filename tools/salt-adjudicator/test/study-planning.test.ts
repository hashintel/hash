import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  SaltValidationError,
  createStudy,
  manifestForExport,
} from "../src/core.ts";
import {
  DEFAULT_COVERAGE_TARGET,
  partitionQualificationCards,
  planStudy,
  prepareStudySelection,
  sampleProductionCards,
  scopeFilterForCards,
} from "../src/study-planning.ts";

const makeCards = (count, equivalenceCount = 0) =>
  Array.from({ length: count }, (_, cardIndex) => ({
    relation_id: `R${String(cardIndex).padStart(4, "0")}`,
    family_id: `F${Math.floor(cardIndex / 2)}`,
    card_text: `Relation: synthetic ${cardIndex}\n\nExamples:\n  - source ${cardIndex} -> target ${cardIndex}`,
    card_hash: `hash-${cardIndex}`,
    prescreen: cardIndex < equivalenceCount ? "equivalence" : "normal",
  }));

describe("study planner formulas", () => {
  test("defaults to three-fold coverage", () => {
    assert.equal(DEFAULT_COVERAGE_TARGET, 3);
  });

  test("derives an exact sample from annotator budget and coverage", () => {
    const plan = planStudy({
      mode: "budget-first",
      annotatorCount: 8,
      eligiblePoolSize: 1_764,
      qualificationSize: 20,
      productionCardsPerAnnotator: 150,
      coverageTarget: 3,
    });

    assert.equal(plan.sampleSize, 400);
    assert.equal(plan.spareCapacity, 0);
    assert.equal(plan.minimumProductionLoad, 150);
    assert.equal(plan.maximumProductionLoad, 150);
    assert.equal(plan.qualificationSeconds, 200);
    assert.equal(plan.minimumTotalSeconds, 1_700);
    assert.equal(plan.maximumTotalSeconds, 1_700);
  });

  test("caps budget-first sampling at the eligible pool", () => {
    const plan = planStudy({
      mode: "budget-first",
      annotatorCount: 8,
      eligiblePoolSize: 100,
      qualificationSize: 10,
      productionCardsPerAnnotator: 150,
      coverageTarget: 3,
    });

    assert.equal(plan.sampleSize, 100);
    assert.equal(plan.spareCapacity, 900);
    assert.equal(plan.minimumProductionLoad, 37);
    assert.equal(plan.maximumProductionLoad, 38);
  });

  test("derives coverage from an exact sample and annotator budget", () => {
    const plan = planStudy({
      mode: "sample-first",
      annotatorCount: 10,
      eligiblePoolSize: 1_764,
      qualificationSize: 20,
      productionCardsPerAnnotator: 100,
      sampleSize: 400,
    });

    assert.equal(plan.coverageTarget, 2);
    assert.equal(plan.spareCapacity, 200);
    assert.equal(plan.warnings.length, 1);
    assert.match(plan.warnings[0], /cannot produce a majority/u);
  });

  test("derives the smallest balanced load for exact sample and coverage", () => {
    const plan = planStudy({
      mode: "coverage-first",
      annotatorCount: 7,
      eligiblePoolSize: 1_764,
      qualificationSize: 20,
      sampleSize: 400,
      coverageTarget: 3,
    });

    assert.equal(plan.productionCardsPerAnnotator, 172);
    assert.equal(plan.usedAssignmentSlots, 1_200);
    assert.equal(plan.assignmentCapacity, 1_204);
    assert.equal(plan.spareCapacity, 4);
    assert.equal(plan.minimumProductionLoad, 171);
    assert.equal(plan.maximumProductionLoad, 172);
  });

  test("rejects coverage below two or above the annotator count", () => {
    assert.throws(
      () =>
        planStudy({
          mode: "sample-first",
          annotatorCount: 3,
          eligiblePoolSize: 1_764,
          qualificationSize: 0,
          productionCardsPerAnnotator: 100,
          sampleSize: 400,
        }),
      SaltValidationError,
    );
    assert.throws(
      () =>
        planStudy({
          mode: "coverage-first",
          annotatorCount: 2,
          eligiblePoolSize: 100,
          qualificationSize: 0,
          sampleSize: 50,
          coverageTarget: 3,
        }),
      /requires at least 3 annotators/u,
    );
  });
});

describe("deterministic production sampling", () => {
  test("returns the exact sample while preserving prescreen proportions", () => {
    const cards = makeCards(30, 6);
    const sample = sampleProductionCards(cards, 10, "sample-seed");

    assert.equal(sample.length, 10);
    assert.equal(
      sample.filter((card) => card.prescreen === "equivalence").length,
      2,
    );
    assert.equal(
      sample.filter((card) => card.prescreen === "normal").length,
      8,
    );
  });

  test("is deterministic across repeated and reordered source pools", () => {
    const cards = makeCards(40, 8);
    const relationIds = (pool) =>
      sampleProductionCards(pool, 12, "stable-seed").map(
        (card) => card.relation_id,
      );

    assert.deepEqual(relationIds(cards), relationIds(cards));
    assert.deepEqual(relationIds(cards), relationIds([...cards].reverse()));
    assert.notDeepEqual(
      relationIds(cards),
      sampleProductionCards(cards, 12, "different-seed").map(
        (card) => card.relation_id,
      ),
    );
  });

  test("falls back to uniform seeded sampling for an all-normal atlas pool", () => {
    const sample = sampleProductionCards(makeCards(50), 17, "atlas-seed");
    assert.equal(sample.length, 17);
    assert.ok(sample.every((card) => card.prescreen === "normal"));
  });
});

describe("qualification curation and provenance", () => {
  test("converts selected pool cards and excludes them from production", () => {
    const cards = makeCards(8, 2);
    const partition = partitionQualificationCards(cards, [
      {
        relationId: "R0000",
        answer: "C",
        rationale: "  Both sides denote the same canonical point.  ",
      },
      {
        relationId: "R0003",
        answer: "O",
        rationale: "The two roles remain distinct across the relation.",
      },
    ]);

    assert.deepEqual(
      partition.qualificationCards.map((card) => card.relation_id),
      ["R0000", "R0003"],
    );
    assert.equal(
      partition.qualificationCards[0].rationale,
      "Both sides denote the same canonical point.",
    );
    assert.ok(
      partition.eligibleCards.every(
        (card) => card.relation_id !== "R0000" && card.relation_id !== "R0003",
      ),
    );
  });

  test("rejects incomplete, duplicate, or unknown qualification drafts", () => {
    const cards = makeCards(4);
    assert.throws(
      () =>
        partitionQualificationCards(cards, [
          { relationId: "R0000", answer: "C", rationale: "" },
        ]),
      /incomplete/u,
    );
    assert.throws(
      () =>
        partitionQualificationCards(cards, [
          { relationId: "R0000", answer: "C", rationale: "Known identity." },
          { relationId: "R0000", answer: "P", rationale: "Duplicate entry." },
        ]),
      /selected more than once/u,
    );
    assert.throws(
      () =>
        partitionQualificationCards(cards, [
          { relationId: "missing", answer: "U", rationale: "Not found." },
        ]),
      /not present/u,
    );
  });

  test("embeds sampling provenance and never includes anchors in production", () => {
    const sourcePool = makeCards(20, 4);
    const qualificationDrafts = [
      {
        relationId: "R0000",
        answer: "C",
        rationale: "Both terms identify one canonical point.",
      },
      {
        relationId: "R0005",
        answer: "P",
        rationale: "The source is structurally close to the target.",
      },
    ];
    const plan = planStudy({
      mode: "coverage-first",
      annotatorCount: 3,
      eligiblePoolSize: 18,
      qualificationSize: 2,
      sampleSize: 6,
      coverageTarget: 3,
    });
    const selection = prepareStudySelection({
      sourcePool,
      qualificationDrafts,
      plan,
      seed: "selection-seed",
    });

    assert.equal(selection.productionCards.length, 6);
    assert.equal(selection.sampling.source_pool_size, 20);
    assert.equal(selection.sampling.eligible_pool_size, 18);
    assert.equal(selection.sampling.sample_size, 6);
    assert.equal(selection.sampling.spare_capacity, 0);
    assert.equal(selection.sampling.scope_filter, "not-applicable");
    assert.ok(
      selection.productionCards.every(
        (card) => card.relation_id !== "R0000" && card.relation_id !== "R0005",
      ),
    );

    const result = createStudy({
      cards: selection.productionCards,
      qualificationCards: selection.qualificationCards,
      annotatorIds: ["a", "b", "c"],
      seed: "selection-seed",
      coverageTarget: plan.coverageTarget,
      sliceSize: plan.productionCardsPerAnnotator,
      sampling: selection.sampling,
    });
    assert.deepEqual(
      manifestForExport(result.study).sampling,
      selection.sampling,
    );
  });

  test("requires filter provenance on Wikidata source pools", () => {
    const card = makeCards(1)[0];
    const wikidataCard = {
      ...card,
      relation_id: "P2553",
      source_metadata: {
        kind: "wikidata-extract",
        retrieved_at: "Sat, 11 Jul 2026 21:49:16 GMT",
        severely_truncated: false,
        token_count: 80,
        truncations: [],
      },
    } as const;

    assert.throws(
      () => scopeFilterForCards([wikidataCard]),
      /predates the main-value scope filter/u,
    );
    assert.equal(
      scopeFilterForCards([
        {
          ...wikidataCard,
          source_metadata: {
            ...wikidataCard.source_metadata,
            scope_filter: "main-value-only",
          },
        },
      ]),
      "main-value-only",
    );
  });

  test("rejects relation or hash overlap across production and qualification", () => {
    const card = makeCards(1)[0];
    assert.throws(
      () =>
        createStudy({
          cards: [card],
          qualificationCards: [
            {
              ...card,
              answer: "C",
              rationale: "This deliberately overlaps the production card.",
            },
          ],
          annotatorIds: ["a"],
          seed: "overlap-seed",
          coverageTarget: 1,
          sliceSize: 1,
        }),
      /generated study is invalid/u,
    );
  });
});
