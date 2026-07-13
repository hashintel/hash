import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DecisionTimer,
  LABEL_DETAILS,
  SaltValidationError,
  accessCodeHash,
  activeSwipes,
  adjudicationsToJsonl,
  agreementStatistics,
  createAccessCode,
  createAdjudication,
  createRetractionEvent,
  createStudy,
  createSwipeEvent,
  deckSeedFor,
  edgeCaseMarkdown,
  exampleSeedFor,
  generateAssignments,
  getProductionDeck,
  isAccessCodeWellFormed,
  latestVotesByAnnotator,
  majorityLabel,
  manifestForExport,
  nextMonotoneTimestamp,
  nominalKrippendorffAlpha,
  parseAdjudicationsJsonl,
  parseCardText,
  parseCardsJsonl,
  parseRoster,
  parseSwipesJsonl,
  perAnnotatorGoldAgreement,
  projectSwipes,
  relationSummaries,
  resolveAnnotatorCode,
  serializePayload,
  sha256Hex,
  shannonEntropy,
  shuffleCardText,
  shuffled,
  summarizeCoverage,
  swipesToJsonl,
} from "../src/core.ts";

test("provides an operational explanation for every geometry class", () => {
  assert.deepEqual(Object.keys(LABEL_DETAILS), ["C", "P", "O", "U"]);
  for (const detail of Object.values(LABEL_DETAILS)) {
    assert.ok(detail.description.length > 40);
  }
});

const makeCard = (index, prescreen = "normal") => ({
  relation_id: `R${String(index).padStart(2, "0")}`,
  family_id: `F${Math.floor(index / 2)}`,
  card_text: `Relation: synthetic ${index}\nExample ${index}.a\nExample ${index}.b\nExample ${index}.c`,
  card_hash: `hash-${index}`,
  prescreen,
});

const makeCards = (count) =>
  Array.from({ length: count }, (_, index) =>
    makeCard(index, index % 3 === 0 ? "equivalence" : "normal"),
  );

const swipeEvent = ({
  study,
  annotatorId,
  card,
  pass,
  label,
  sequence,
  timestampMs,
  qualification = false,
  sessionId = "session-1",
}) =>
  createSwipeEvent({
    study,
    annotatorId,
    card,
    pass,
    label,
    latencyMs: 1_000 + sequence,
    flagged: false,
    note: null,
    rubricVersion: study.rubric_version,
    qualification,
    sessionId,
    sequence,
    timestamp: {
      timestampMs,
      iso: new Date(timestampMs).toISOString(),
    },
  });

describe("JSONL contracts", () => {
  test("parses the card contract and qualification extension", () => {
    const card = makeCard(1);
    const cards = parseCardsJsonl(`${JSON.stringify(card)}\n`);
    assert.deepEqual(cards, [card]);

    const qualification = parseCardsJsonl(
      `${JSON.stringify({
        ...card,
        answer: "P",
        rationale: "The first item is structurally contained by the second.",
      })}\n`,
      { qualification: true },
    );
    assert.equal(qualification[0].answer, "P");
  });

  test("normalizes atlas Wikidata records into production cards", () => {
    const cards = parseCardsJsonl(
      `${JSON.stringify({
        card_hash: "wikidata-p6-hash",
        card_text:
          "Relation: head of government\nDescription: head of the executive power\n\nExamples:\n  - country: Germany -> Friedrich Merz\n\nSlug: head-of-government\n",
        pid: "P6",
        retrieved_at: "Sat, 11 Jul 2026 21:49:16 GMT",
        severely_truncated: false,
        token_count: 42,
        truncations: [],
      })}\n`,
    );

    assert.equal(cards[0]?.relation_id, "P6");
    assert.equal(cards[0]?.family_id, "P6");
    assert.equal(cards[0]?.prescreen, "normal");
    assert.deepEqual(cards[0]?.source_metadata, {
      kind: "wikidata-extract",
      retrieved_at: "Sat, 11 Jul 2026 21:49:16 GMT",
      severely_truncated: false,
      token_count: 42,
      truncations: [],
    });
  });

  test("reports malformed lines and duplicate identifiers together", () => {
    const card = makeCard(1);
    assert.throws(
      () =>
        parseCardsJsonl(
          [
            JSON.stringify(card),
            "{not-json}",
            JSON.stringify({ ...card, card_hash: "other" }),
          ].join("\n"),
        ),
      (error) =>
        error instanceof SaltValidationError &&
        error.issues.some((issue) => issue.includes("invalid JSON")) &&
        error.issues.some((issue) => issue.includes("duplicate relation_id")),
    );
  });

  test("accepts opaque roster IDs and rejects unsafe TSV values", () => {
    assert.deepEqual(parseRoster("annotator-01\nteam.alpha_2"), [
      "annotator-01",
      "team.alpha_2",
    ]);
    assert.throws(
      () => parseRoster("annotator-01\n=HYPERLINK(example)"),
      /may contain only letters/u,
    );
  });

  test("rejects swipe exports without verifiable study metadata", () => {
    assert.throws(
      () =>
        parseSwipesJsonl(
          `${JSON.stringify({
            annotator_id: "a",
            relation_id: "R00",
            card_hash: "hash",
            rubric_version: "v1",
            ts: "not-a-date",
            pass: 1,
            label: "C",
            latency_ms: 100,
          })}\n`,
        ),
      (error) =>
        error instanceof SaltValidationError &&
        error.issues.some((issue) => issue.includes('"study_id"')) &&
        error.issues.some((issue) => issue.includes("valid date-time")) &&
        error.issues.some((issue) => issue.includes("shuffle_seed")),
    );
  });
});

describe("hashing and deterministic randomization", () => {
  test("matches the SHA-256 known vector", () => {
    assert.equal(
      sha256Hex("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("uses stable shuffles without mutating the input", () => {
    const values = ["a", "b", "c", "d", "e"];
    const first = shuffled(values, 42);
    const second = shuffled(values, 42);
    assert.deepEqual(first, second);
    assert.deepEqual(values, ["a", "b", "c", "d", "e"]);
    assert.notDeepEqual(first, shuffled(values, 43));
  });

  test("keeps the relation heading fixed while shuffling example lines", () => {
    const text = "Relation: test\none\ntwo\nthree\nfour";
    const first = shuffleCardText(text, 10);
    const second = shuffleCardText(text, 10);
    assert.equal(first, second);
    assert.equal(first.split("\n")[0], "Relation: test");
    assert.deepEqual(first.split("\n").slice(1).sort(), [
      "four",
      "one",
      "three",
      "two",
    ]);
  });

  test("shuffles only the Examples section in structured cards", () => {
    const text = [
      "Relation: head of government",
      "Description: head of executive power",
      "Aliases:",
      "  - mayor",
      "  - prime minister",
      "",
      "Source types:",
      "  - country (sovereign state)",
      "",
      "Examples:",
      "  - country: Germany -> Friedrich Merz",
      "  - country: Japan -> Shigeru Ishiba",
      "  - city: Boston -> Michelle Wu",
      "",
      "Slug: head-of-government",
      "",
    ].join("\n");

    const randomized = shuffleCardText(text, 17);
    const randomizedLines = randomized.split("\n");
    assert.deepEqual(
      randomizedLines.slice(0, 10),
      text.split("\n").slice(0, 10),
    );
    assert.deepEqual(randomizedLines.slice(10, 13).sort(), [
      "  - city: Boston -> Michelle Wu",
      "  - country: Germany -> Friedrich Merz",
      "  - country: Japan -> Shigeru Ishiba",
    ]);
    assert.deepEqual(randomizedLines.slice(13), text.split("\n").slice(13));
  });

  test("parses the canonical Wikidata card hierarchy", () => {
    const parsed = parseCardText(
      [
        "Relation: head of government",
        "Description: head of executive power",
        "Aliases:",
        "  - prime minister",
        "Inverse Name: government headed by",
        "",
        "Source types:",
        "  - country (sovereign state)",
        "",
        "Target types:",
        "  - human (member of Homo sapiens)",
        "",
        "Constraints:",
        "  - direction: source -> target",
        "",
        "Examples:",
        "  - country: Germany -> Friedrich Merz",
        "",
        "Slug: head-of-government",
      ].join("\n"),
    );

    assert.equal(parsed.relation, "head of government");
    assert.equal(parsed.description, "head of executive power");
    assert.equal(parsed.inverseName, "government headed by");
    assert.equal(parsed.slug, "head-of-government");
    assert.deepEqual(parsed.sections.aliases, ["prime minister"]);
    assert.deepEqual(parsed.sections.sourceTypes, [
      "country (sovereign state)",
    ]);
    assert.deepEqual(parsed.sections.targetTypes, [
      "human (member of Homo sapiens)",
    ]);
    assert.deepEqual(parsed.sections.constraints, [
      "direction: source -> target",
    ]);
    assert.deepEqual(parsed.sections.examples, [
      "country: Germany -> Friedrich Merz",
    ]);
  });
});

describe("balanced study assignment", () => {
  test("guarantees coverage, distinct annotators, cap, and balanced loads", () => {
    const cards = makeCards(41);
    const annotatorIds = ["a", "b", "c", "d", "e", "f"];
    const result = generateAssignments({
      cards,
      annotatorIds,
      coverageTarget: 2,
      sliceSize: 20,
      seed: "assignment-seed",
    });

    for (const card of cards) {
      const assigned = annotatorIds.filter((annotatorId) =>
        result.assignments[annotatorId].includes(card.relation_id),
      );
      assert.equal(assigned.length, 2);
      assert.equal(new Set(assigned).size, 2);
    }

    const loads = Object.values(result.loads);
    assert.ok(Math.max(...loads) <= 20);
    assert.ok(Math.max(...loads) - Math.min(...loads) <= 1);

    for (const stratum of ["equivalence", "normal"]) {
      const stratumLoads = Object.values(result.stratum_loads[stratum]);
      assert.ok(Math.max(...stratumLoads) - Math.min(...stratumLoads) <= 1);
    }
  });

  test("rejects an infeasible slice cap", () => {
    assert.throws(
      () =>
        generateAssignments({
          cards: makeCards(100),
          annotatorIds: ["a", "b"],
          coverageTarget: 2,
          sliceSize: 50,
          seed: "impossible",
        }),
      /needs at least 100 cards per annotator/u,
    );
  });

  test("creates reproducible typo-checked access codes", () => {
    const code = createAccessCode("seed", "annotator-1");
    assert.equal(code, createAccessCode("seed", "annotator-1"));
    assert.equal(isAccessCodeWellFormed(code), true);
    assert.equal(isAccessCodeWellFormed(`${code.slice(0, -1)}Z`), false);
  });

  test("resolves codes without embedding plaintext codes", () => {
    const { study, codeSheet } = createStudy({
      cards: makeCards(8),
      annotatorIds: ["a", "b"],
      seed: "study-seed",
      coverageTarget: 2,
      sliceSize: 8,
    });
    assert.equal(resolveAnnotatorCode(study, codeSheet[0].code), "a");
    assert.equal(
      study.access[0].code_hash,
      accessCodeHash(study.study_id, codeSheet[0].code),
    );
    assert.equal(JSON.stringify(study).includes(codeSheet[0].code), false);
    assert.equal(manifestForExport(study).cards.length, 8);
  });
});

describe("append-only events and timing", () => {
  test("projects a retraction without removing the original swipe", () => {
    const { study } = createStudy({
      cards: makeCards(2),
      annotatorIds: ["a"],
      seed: "events",
      coverageTarget: 1,
      sliceSize: 2,
    });
    const first = swipeEvent({
      study,
      annotatorId: "a",
      card: study.cards[0],
      pass: 1,
      label: "C",
      sequence: 1,
      timestampMs: 1_000,
    });
    const retraction = createRetractionEvent({
      swipeId: first.swipe.swipe_id,
      annotatorId: "a",
      sessionId: "session-1",
      timestamp: {
        timestampMs: 2_000,
        iso: new Date(2_000).toISOString(),
      },
    });
    const events = [first, retraction];
    assert.equal(events.length, 2);
    assert.equal(projectSwipes(events)[0].retracted, true);
    assert.equal(activeSwipes(events).length, 0);
    assert.match(swipesToJsonl(events), /"retracted":true/u);
  });

  test("pauses note-taking time and resumes accurately", () => {
    let now = 0;
    const timer = new DecisionTimer(() => now);
    timer.start();
    now = 1_000;
    timer.pause();
    now = 8_000;
    assert.equal(timer.elapsed(), 1_000);
    timer.resume();
    now = 10_500;
    assert.equal(timer.elapsed(), 3_500);
  });

  test("forces monotone timestamps when the wall clock moves backward", () => {
    const first = nextMonotoneTimestamp(10_000, 9_000);
    const second = nextMonotoneTimestamp(first.timestampMs, 8_000);
    assert.equal(first.timestampMs, 10_001);
    assert.equal(second.timestampMs, 10_002);
  });
});

describe("round trip and targeted passes", () => {
  test("round-trips a 30-card deck through three deterministic passes", () => {
    const { study } = createStudy({
      cards: makeCards(30),
      annotatorIds: ["a"],
      seed: "acceptance-seed",
      coverageTarget: 1,
      sliceSize: 30,
    });
    const events = [];
    const observedOrders = [];
    let timestampMs = Date.UTC(2026, 6, 12);

    for (let pass = 1; pass <= 3; pass += 1) {
      const expectedOrder = getProductionDeck({
        study,
        annotatorId: "a",
        pass,
        events: [],
      }).map((card) => card.relation_id);
      const observed = [];

      while (true) {
        const deck = getProductionDeck({
          study,
          annotatorId: "a",
          pass,
          events,
        });
        if (deck.length === 0) {
          break;
        }
        const card = deck[0];
        observed.push(card.relation_id);
        timestampMs += 1_000;
        events.push(
          swipeEvent({
            study,
            annotatorId: "a",
            card,
            pass,
            label: ["C", "P", "O"][pass - 1],
            sequence: events.length + 1,
            timestampMs,
          }),
        );
      }

      observedOrders.push(observed);
      assert.deepEqual(observed, expectedOrder);
      assert.equal(
        deckSeedFor(study, "a", pass),
        events.at(-1).swipe.shuffle_seed,
      );
    }

    assert.equal(new Set(observedOrders.map(JSON.stringify)).size, 3);
    const parsed = parseSwipesJsonl(swipesToJsonl(events));
    assert.equal(parsed.filter((swipe) => !swipe.retracted).length, 90);
    assert.deepEqual(
      [...new Set(parsed.map((swipe) => swipe.pass))],
      [1, 2, 3],
    );
    assert.ok(
      parsed.every(
        (swipe, index) =>
          index === 0 ||
          Date.parse(swipe.ts) > Date.parse(parsed[index - 1].ts),
      ),
    );
  });

  test("pass four selects exactly disagreement or U relations", () => {
    const { study } = createStudy({
      cards: makeCards(4),
      annotatorIds: ["a"],
      seed: "targeted",
      coverageTarget: 1,
      sliceSize: 4,
    });
    const labelsByPass = [
      ["C", "P", "O", "C"],
      ["C", "O", "O", "U"],
    ];
    const events = [];
    let timestampMs = 1_000;
    for (let pass = 1; pass <= 2; pass += 1) {
      study.cards.forEach((card, index) => {
        timestampMs += 1;
        events.push(
          swipeEvent({
            study,
            annotatorId: "a",
            card,
            pass,
            label: labelsByPass[pass - 1][index],
            sequence: events.length + 1,
            timestampMs,
          }),
        );
      });
    }
    assert.deepEqual(
      getProductionDeck({
        study,
        annotatorId: "a",
        pass: 4,
        events,
      })
        .map((card) => card.relation_id)
        .sort(),
      ["R01", "R03"],
    );
  });

  test("uses independently namespaced deck and example seeds", () => {
    const { study } = createStudy({
      cards: makeCards(1),
      annotatorIds: ["a"],
      seed: "namespaces",
      coverageTarget: 1,
      sliceSize: 1,
    });
    assert.notEqual(
      deckSeedFor(study, "a", 1),
      exampleSeedFor(study, "a", 1, study.cards[0]),
    );
  });
});

describe("analysis and exports", () => {
  test("calculates entropy, majority, and nominal alpha", () => {
    assert.equal(shannonEntropy(["C", "C", "C"]), 0);
    assert.equal(shannonEntropy(["C", "P"]), 1);
    assert.equal(majorityLabel(["C", "C", "P"]), "C");
    assert.equal(majorityLabel(["C", "P"]), null);
    assert.equal(
      nominalKrippendorffAlpha([
        ["C", "C"],
        ["P", "P"],
      ]),
      1,
    );
    assert.ok(
      Math.abs(
        nominalKrippendorffAlpha([
          ["C", "P"],
          ["C", "P"],
        ]) + 0.5,
      ) < 1e-12,
    );
  });

  test("computes overall and one-vs-rest agreement", () => {
    const swipes = [
      ["R1", "a", "C"],
      ["R1", "b", "C"],
      ["R2", "a", "P"],
      ["R2", "b", "P"],
    ].map(([relation_id, annotator_id, label], index) => ({
      swipe_id: String(index),
      relation_id,
      annotator_id,
      label,
      pass: 1,
      ts: new Date(index + 1).toISOString(),
      retracted: false,
      qualification: false,
    }));
    const statistics = agreementStatistics(swipes);
    assert.equal(statistics.overall, 1);
    assert.equal(statistics.by_class.C, 1);
    assert.equal(statistics.by_class.P, 1);
  });

  test("uses the latest active vote and verifies manifest coverage", () => {
    const { study } = createStudy({
      cards: makeCards(2),
      annotatorIds: ["a", "b"],
      seed: "coverage",
      coverageTarget: 2,
      sliceSize: 2,
    });
    const swipes = [
      {
        swipe_id: "a-p1",
        relation_id: "R00",
        annotator_id: "a",
        label: "C",
        pass: 1,
        ts: new Date(1).toISOString(),
        retracted: false,
        qualification: false,
      },
      {
        swipe_id: "a-p2",
        relation_id: "R00",
        annotator_id: "a",
        label: "P",
        pass: 2,
        ts: new Date(2).toISOString(),
        retracted: false,
        qualification: false,
      },
      {
        swipe_id: "b-p1",
        relation_id: "R00",
        annotator_id: "b",
        label: "C",
        pass: 1,
        ts: new Date(3).toISOString(),
        retracted: false,
        qualification: false,
      },
    ];

    assert.deepEqual(
      latestVotesByAnnotator(swipes)
        .map((swipe) => `${swipe.annotator_id}:${swipe.label}`)
        .sort(),
      ["a:P", "b:C"],
    );
    assert.deepEqual(summarizeCoverage(study, swipes), {
      rows: [
        { relation_id: "R00", expected: 2, observed: 2 },
        { relation_id: "R01", expected: 2, observed: 0 },
      ],
      complete: 1,
      total: 2,
    });
  });

  test("round-trips binding adjudications separately from swipe evidence", () => {
    const adjudication = createAdjudication({
      studyId: "study",
      deckHash: "deck",
      relationId: "R00",
      cardHash: "hash-0",
      label: "P",
      rationale: "Containment is the binding interpretation.",
      adjudicatorId: "lead",
      timestamp: {
        timestampMs: 10,
        iso: new Date(10).toISOString(),
      },
    });
    const parsed = parseAdjudicationsJsonl(
      adjudicationsToJsonl([adjudication]),
    );
    assert.deepEqual(parsed, [adjudication]);

    const agreement = perAnnotatorGoldAgreement(
      [
        {
          swipe_id: "a",
          relation_id: "R00",
          annotator_id: "a",
          label: "P",
          pass: 1,
          ts: new Date(1).toISOString(),
          retracted: false,
          qualification: false,
        },
        {
          swipe_id: "b",
          relation_id: "R00",
          annotator_id: "b",
          label: "C",
          pass: 1,
          ts: new Date(2).toISOString(),
          retracted: false,
          qualification: false,
        },
      ],
      parsed,
    );
    assert.equal(agreement[0].agreement, 1);
    assert.equal(agreement[1].agreement, 0);
  });

  test("exports an entropy-sorted markdown edge table with notes", () => {
    const cards = makeCards(2);
    const swipes = [
      {
        relation_id: cards[0].relation_id,
        annotator_id: "a",
        label: "C",
        pass: 1,
        note: "Exact identity.",
        retracted: false,
        qualification: false,
      },
      {
        relation_id: cards[0].relation_id,
        annotator_id: "b",
        label: "P",
        pass: 1,
        note: null,
        retracted: false,
        qualification: false,
      },
    ];
    const markdown = edgeCaseMarkdown(relationSummaries(swipes, cards));
    assert.match(markdown, /R00/u);
    assert.match(markdown, /1\.000/u);
    assert.match(markdown, /a\/p1:C, b\/p1:P/u);
    assert.match(markdown, /Exact identity\./u);
  });

  test("escapes closing tags in embedded payloads", () => {
    const serialized = serializePayload({
      card_text: "</script><p>unsafe</p>",
    });
    assert.equal(serialized.includes("</script>"), false);
    assert.match(serialized, /\\u003c\/script>/u);
  });
});
