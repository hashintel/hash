import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  assertCompleteCondition3Result,
  assertCondition3ProjectionSemantics,
  assertCondition3UnsupportedAnchorContinuity,
  CONDITION_3_ACTIVATION_MATRIX,
  CONDITION_3_COMPARISON_HASHES,
  CONDITION_3_DEMAND_CLAUSES,
  CONDITION_3_OPERATOR_ENVELOPE,
  CONDITION_3_OBJECTIVE_MATCH_PREDICATES,
  CONDITION_3_RESULT_COMPONENT_IDS,
  CONDITION_3_STOPPING_RULES,
  Condition3ResultSchema,
  nextCondition3NoProgressStreak,
  parseCondition3Projection,
  type Condition3Projection,
} from "../../../../evaluations/protocols/process-model-elicitation/baseline/condition-3-instrument";

function projection(
  evidence: Array<{ turn: number; quote: string }> = [],
): Condition3Projection {
  return {
    activeObjectiveRows: [],
    activeObjectiveRowEvidence: [],
    retractedObjectiveAnchors: [],
    unsupportedActiveObjectiveAnchors: [],
    assessments: CONDITION_3_DEMAND_CLAUSES.map((clause) =>
      clause.row === null
        ? {
            clauseId: clause.id,
            demand: clause.demand,
            coordinate: clause.coordinate,
            demanded: true as const,
            currentStatus: "none" as const,
            currentGrade: "none" as const,
            pass: false as const,
            failureDiagnostic: clause.demand.startsWith("presence count >=")
              ? ("below-minimum-count" as const)
              : ("unaddressed" as const),
            activationPredicates: [],
            evidence: clause.id === "SF-OBJ" ? evidence : [],
            observedCount: clause.demand.startsWith("presence count >=")
              ? 0
              : null,
            rationale: "fixture",
          }
        : {
            clauseId: clause.id,
            demand: clause.demand,
            coordinate: clause.coordinate,
            demanded: false as const,
            currentStatus: "not-applicable" as const,
            currentGrade: "not-applicable" as const,
            pass: true as const,
            failureDiagnostic: null,
            activationPredicates: [] as [],
            evidence: [],
            observedCount: null,
            rationale: "inactive fixture row",
          },
    ),
    notes: [],
  };
}

describe("condition 3 material-frame no-progress rule", () => {
  test("counts onset and reaches the frozen advisory and hard-stop thresholds", () => {
    const first = projection();
    const second = projection();
    const third = projection();
    const fourth = projection();
    const fifth = projection();
    const streak1 = nextCondition3NoProgressStreak([], first, 1, 0);
    const streak2 = nextCondition3NoProgressStreak([first], second, 2, streak1);
    const streak3 = nextCondition3NoProgressStreak(
      [first, second],
      third,
      3,
      streak2,
    );
    const streak4 = nextCondition3NoProgressStreak(
      [first, second, third],
      fourth,
      4,
      streak3,
    );
    const streak5 = nextCondition3NoProgressStreak(
      [first, second, third, fourth],
      fifth,
      5,
      streak4,
    );

    expect(streak1).toBe(1);
    expect(streak3).toBe(CONDITION_3_STOPPING_RULES.noProgressAdvisoryAfter);
    expect(streak5).toBe(CONDITION_3_STOPPING_RULES.noProgressHardStopAfter);
  });

  test("does not reset for regrading, active-row drift, duplicates, or reordered evidence", () => {
    const prior = projection([
      { turn: 1, quote: "first" },
      { turn: 1, quote: "second" },
    ]);
    const current = projection([
      { turn: 1, quote: "second" },
      { turn: 1, quote: "first" },
      { turn: 1, quote: "first" },
    ]);
    current.activeObjectiveRows = ["ROW-SPLIT"];
    const objective = current.assessments.find(
      ({ clauseId }) => clauseId === "SF-OBJ",
    );
    if (!objective?.demanded)
      throw new Error("fixture lost demanded objective");
    objective.currentStatus = "explicit";
    objective.currentGrade = "structured";

    expect(nextCondition3NoProgressStreak([prior], current, 2, 2)).toBe(3);
    expect(
      nextCondition3NoProgressStreak(
        [{ ...prior, assessments: [...prior.assessments].reverse() }],
        { ...current, assessments: [...current.assessments].reverse() },
        2,
        2,
      ),
    ).toBe(3);
  });

  test("resets for new or replacement demanded evidence at equal array length", () => {
    const prior = projection([{ turn: 1, quote: "old evidence" }]);
    const replacement = projection([{ turn: 2, quote: "new evidence" }]);

    expect(nextCondition3NoProgressStreak([prior], replacement, 2, 4)).toBe(0);
  });

  test("does not reset for evidence-array growth made only of old-frame quotes", () => {
    const prior = projection([{ turn: 1, quote: "old evidence" }]);
    const duplicateGrowth = projection([
      { turn: 1, quote: "old evidence" },
      { turn: 1, quote: "old evidence" },
    ]);

    expect(nextCondition3NoProgressStreak([prior], duplicateGrowth, 2, 1)).toBe(
      2,
    );
  });

  test("resets for new demanded unsupported-anchor evidence", () => {
    const prior = projection();
    prior.unsupportedActiveObjectiveAnchors = [
      {
        label: "energy-use",
        state: "active",
        demanded: true,
        pass: false,
        failureDiagnostic: "unsupported-active-anchor",
        evidence: [{ turn: 1, quote: "Minimize energy use." }],
        resolutionEvidence: [],
        resolutionRationale: null,
        rationale: "No frozen row.",
      },
    ];
    const current = structuredClone(prior);
    current.unsupportedActiveObjectiveAnchors[0]?.evidence.push({
      turn: 2,
      quote: "Peak energy matters most.",
    });

    expect(nextCondition3NoProgressStreak([prior], current, 2, 4)).toBe(0);
  });

  test("does not reset when an older quote disappears and later resurfaces", () => {
    const first = projection([{ turn: 1, quote: "old evidence" }]);
    const middle = projection();
    const resurfaced = projection([{ turn: 3, quote: "old evidence" }]);

    expect(
      nextCondition3NoProgressStreak([first, middle], resurfaced, 3, 2),
    ).toBe(3);
  });

  test("does not reset when evidence first appeared on an inactive row", () => {
    const first = projection();
    const inactiveBreakdown = first.assessments.find(
      ({ clauseId }) => clauseId === "BR-CAP",
    );
    if (!inactiveBreakdown) throw new Error("fixture lost BR-CAP");
    inactiveBreakdown.evidence = [{ turn: 1, quote: "Both lines can coat." }];
    const current = projection([{ turn: 3, quote: "Both lines can coat." }]);

    expect(nextCondition3NoProgressStreak([first], current, 3, 2)).toBe(3);
  });

  test("does not reset when retraction evidence later resurfaces", () => {
    const first = projection();
    first.unsupportedActiveObjectiveAnchors = [
      {
        label: "energy-use",
        state: "retracted",
        demanded: false,
        pass: true,
        failureDiagnostic: null,
        evidence: [{ turn: 1, quote: "Minimize energy use." }],
        resolutionEvidence: [
          { turn: 2, quote: "Energy use is not an objective." },
        ],
        resolutionRationale: "The expert explicitly retracts it.",
        rationale: "No frozen row.",
      },
    ];
    const current = projection([
      { turn: 3, quote: "Energy use is not an objective." },
    ]);

    expect(nextCondition3NoProgressStreak([first], current, 3, 2)).toBe(3);
  });
});

describe("condition 3 frozen envelopes", () => {
  test("keeps the constructed operator template internally valid", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );

    expect(() => assertCondition3ProjectionSemantics(parsed)).not.toThrow();
  });

  test("requires exact transcript-supported evidence for every active objective row", () => {
    const parsed = parseCondition3Projection({
      ...CONDITION_3_OPERATOR_ENVELOPE.template,
      activeObjectiveRows: ["ROW-SPLIT"],
      activeObjectiveRowEvidence: [],
    });

    expect(() => assertCondition3ProjectionSemantics(parsed)).toThrow(
      "must equal the unique row projection",
    );
  });

  test("freezes each objective row to its exact FE-1402 matching predicate", () => {
    expect(CONDITION_3_OBJECTIVE_MATCH_PREDICATES).toEqual([
      { row: "ROW-BREAKDOWN", matchingPredicate: "breakdown-reshuffle" },
      { row: "ROW-IDLE-WASH", matchingPredicate: "idle-vs-washdown" },
      { row: "ROW-CHANGEOVER", matchingPredicate: "changeover-accounting" },
      { row: "ROW-SPLIT", matchingPredicate: "split-run" },
    ]);
    expect(() =>
      parseCondition3Projection({
        ...CONDITION_3_OPERATOR_ENVELOPE.template,
        activeObjectiveRows: ["ROW-SPLIT"],
        activeObjectiveRowEvidence: [
          {
            row: "ROW-SPLIT",
            anchorLabel: "split-orders",
            matchingPredicate: "changeover-accounting",
            evidence: [{ turn: 1, quote: "Split this order." }],
            rationale: "wrong row/predicate pair",
          },
        ],
      }),
    ).toThrow();
  });

  test("preserves multiple objective anchors that project to one active row", () => {
    const parsed = parseCondition3Projection({
      ...CONDITION_3_OPERATOR_ENVELOPE.template,
      activeObjectiveRows: ["ROW-SPLIT"],
      activeObjectiveRowEvidence: [
        {
          row: "ROW-SPLIT",
          anchorLabel: "split-for-dates",
          matchingPredicate: "split-run",
          evidence: [{ turn: 1, quote: "Split orders to hit dates." }],
          rationale: "Explicit split objective.",
        },
        {
          row: "ROW-SPLIT",
          anchorLabel: "split-for-capacity",
          matchingPredicate: "split-run",
          evidence: [{ turn: 1, quote: "Split orders to use spare capacity." }],
          rationale: "A second explicit split objective.",
        },
      ],
    });
    const objective = parsed.assessments.find(
      ({ clauseId }) => clauseId === "SF-OBJ",
    );
    if (!objective) throw new Error("fixture lost SF-OBJ");
    Object.assign(objective, {
      currentStatus: "explicit",
      currentGrade: "none",
      pass: true,
      failureDiagnostic: null,
      observedCount: 2,
      evidence: [
        { turn: 1, quote: "Split orders to hit dates." },
        { turn: 1, quote: "Split orders to use spare capacity." },
      ],
    });
    for (const assessment of parsed.assessments) {
      if (assessment.clauseId.startsWith("SP-")) {
        Object.assign(assessment, {
          demanded: true,
          currentStatus: "none",
          currentGrade: "none",
          pass: false,
          failureDiagnostic: "unaddressed",
          activationPredicates:
            assessment.clauseId === "SP-ELIG" ? [] : ["slot-unaddressed"],
        });
      }
    }

    expect(() => assertCondition3ProjectionSemantics(parsed)).not.toThrow();
  });

  test("requires matched objective anchors to persist or retract durably", () => {
    const previous = parseCondition3Projection({
      ...CONDITION_3_OPERATOR_ENVELOPE.template,
      activeObjectiveRows: ["ROW-SPLIT"],
      activeObjectiveRowEvidence: [
        {
          row: "ROW-SPLIT",
          anchorLabel: "split-for-dates",
          matchingPredicate: "split-run",
          evidence: [{ turn: 1, quote: "Split orders to hit dates." }],
          rationale: "Explicit split objective.",
        },
      ],
    });
    const omitted = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    expect(() =>
      assertCondition3UnsupportedAnchorContinuity(previous, omitted, 2),
    ).toThrow("disappeared without a durable retraction");

    const retracted = parseCondition3Projection({
      ...CONDITION_3_OPERATOR_ENVELOPE.template,
      retractedObjectiveAnchors: [
        {
          row: "ROW-SPLIT",
          anchorLabel: "split-for-dates",
          matchingPredicate: "split-run",
          evidence: [{ turn: 1, quote: "Split orders to hit dates." }],
          rationale: "Explicit split objective.",
          resolutionEvidence: [
            { turn: 2, quote: "Splitting is no longer an objective." },
          ],
          resolutionRationale: "The expert explicitly retracted it.",
        },
      ],
    });
    expect(() =>
      assertCondition3UnsupportedAnchorContinuity(previous, retracted, 2),
    ).not.toThrow();
    expect(() =>
      assertCondition3UnsupportedAnchorContinuity(retracted, previous, 3),
    ).toThrow("cannot disappear or reactivate");
  });

  test("rejects a demanded pass whose grade does not meet the frozen demand", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    const invalid = structuredClone(parsed);
    const minimum = invalid.assessments.find(
      ({ clauseId }) => clauseId === "SP-MIN",
    );
    if (!minimum) throw new Error("fixture lost SP-MIN");
    Object.assign(minimum, {
      demanded: true,
      currentStatus: "explicit",
      currentGrade: "none",
      pass: true,
      failureDiagnostic: null,
      activationPredicates: [],
      evidence: [{ turn: 1, quote: "some words" }],
    });

    expect(() => assertCondition3ProjectionSemantics(invalid)).toThrow(
      "does not satisfy the frozen evidence/grade demand",
    );
  });

  test("passes a count-only presence demand without manufacturing a grade", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    const entities = parsed.assessments.find(
      ({ clauseId }) => clauseId === "SF-ENT",
    );
    if (!entities) throw new Error("fixture lost SF-ENT");
    Object.assign(entities, {
      demanded: true,
      currentStatus: "explicit",
      currentGrade: "none",
      pass: true,
      failureDiagnostic: null,
      activationPredicates: [],
      evidence: [{ turn: 1, quote: "Orders and lines are entities." }],
      observedCount: 2,
    });

    expect(() => assertCondition3ProjectionSemantics(parsed)).not.toThrow();
  });

  test("rejects a passing presence count below the frozen cardinality", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    const entities = parsed.assessments.find(
      ({ clauseId }) => clauseId === "SF-ENT",
    );
    if (!entities) throw new Error("fixture lost SF-ENT");
    Object.assign(entities, {
      demanded: true,
      currentStatus: "explicit",
      currentGrade: "none",
      pass: true,
      failureDiagnostic: null,
      activationPredicates: [],
      evidence: [{ turn: 1, quote: "One order." }],
      observedCount: 1,
    });

    expect(() => assertCondition3ProjectionSemantics(parsed)).toThrow(
      "presence pass disagrees with observed cardinality",
    );
  });

  test("rejects a contradictory below-grade failure before it can influence the run", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    const invalid = structuredClone(parsed);
    const minimum = invalid.assessments.find(
      ({ clauseId }) => clauseId === "SP-MIN",
    );
    if (!minimum) throw new Error("fixture lost SP-MIN");
    Object.assign(minimum, {
      demanded: true,
      currentStatus: "explicit",
      currentGrade: "quantiles",
      pass: false,
      failureDiagnostic: "below-required-grade",
      activationPredicates: ["below-demanded-grade"],
      evidence: [],
    });

    expect(() => assertCondition3ProjectionSemantics(invalid)).toThrow(
      "requires evidence and a genuinely sub-demand grade",
    );
  });

  test("rejects the presence-only below-minimum diagnostic on a slot", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    const minimum = parsed.assessments.find(
      ({ clauseId }) => clauseId === "SP-MIN",
    );
    if (!minimum) throw new Error("fixture lost SP-MIN");
    Object.assign(minimum, {
      demanded: true,
      currentStatus: "none",
      currentGrade: "none",
      pass: false,
      failureDiagnostic: "below-minimum-count",
      activationPredicates: [],
      evidence: [],
      observedCount: null,
    });

    expect(() => assertCondition3ProjectionSemantics(parsed)).toThrow(
      "slot assessment forbids below-minimum-count",
    );
  });

  test("represents unsupported active objective anchors outside frozen rows", () => {
    const parsed = parseCondition3Projection({
      ...CONDITION_3_OPERATOR_ENVELOPE.template,
      unsupportedActiveObjectiveAnchors: [
        {
          label: "energy-use",
          state: "active",
          demanded: true,
          pass: false,
          failureDiagnostic: "unsupported-active-anchor",
          evidence: [{ turn: 2, quote: "Minimize energy use." }],
          resolutionEvidence: [],
          resolutionRationale: null,
          rationale: "No frozen objective row represents this objective.",
        },
      ],
    });
    const objective = parsed.assessments.find(
      ({ clauseId }) => clauseId === "SF-OBJ",
    );
    if (!objective) throw new Error("fixture lost SF-OBJ");
    Object.assign(objective, {
      currentStatus: "explicit",
      currentGrade: "none",
      pass: true,
      failureDiagnostic: null,
      observedCount: 1,
      evidence: [{ turn: 2, quote: "Minimize energy use." }],
    });

    expect(parsed.unsupportedActiveObjectiveAnchors[0]?.label).toBe(
      "energy-use",
    );
    expect(() => assertCondition3ProjectionSemantics(parsed)).not.toThrow();
  });

  test("accepts structured evidence for a vocabulary-bound minimum", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    const taxonomy = parsed.assessments.find(
      ({ clauseId }) => clauseId === "CH-TAX",
    );
    if (!taxonomy) throw new Error("fixture lost CH-TAX");
    Object.assign(taxonomy, {
      demanded: true,
      currentStatus: "explicit",
      currentGrade: "structured",
      pass: true,
      failureDiagnostic: null,
      activationPredicates: [],
      evidence: [
        { turn: 1, quote: "Dark-to-light is a separate changeover class." },
      ],
    });

    expect(() => assertCondition3ProjectionSemantics(parsed)).not.toThrow();
  });

  test("requires unsupported anchors to persist or retract with current-turn evidence", () => {
    const previous = parseCondition3Projection({
      ...CONDITION_3_OPERATOR_ENVELOPE.template,
      unsupportedActiveObjectiveAnchors: [
        {
          label: "energy-use",
          state: "active",
          demanded: true,
          pass: false,
          failureDiagnostic: "unsupported-active-anchor",
          evidence: [{ turn: 1, quote: "Minimize energy use." }],
          resolutionEvidence: [],
          resolutionRationale: null,
          rationale: "No frozen row.",
        },
      ],
    });
    const omitted = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    expect(() =>
      assertCondition3UnsupportedAnchorContinuity(previous, omitted, 2),
    ).toThrow("disappeared without a durable retraction");

    const rewritten = structuredClone(previous);
    rewritten.unsupportedActiveObjectiveAnchors[0]!.evidence = [
      { turn: 2, quote: "A replacement quote." },
    ];
    expect(() =>
      assertCondition3UnsupportedAnchorContinuity(previous, rewritten, 2),
    ).toThrow("rewrote its original evidence");

    const retracted = parseCondition3Projection({
      ...CONDITION_3_OPERATOR_ENVELOPE.template,
      unsupportedActiveObjectiveAnchors: [
        {
          label: "energy-use",
          state: "retracted",
          demanded: false,
          pass: true,
          failureDiagnostic: null,
          evidence: [{ turn: 1, quote: "Minimize energy use." }],
          resolutionEvidence: [
            { turn: 2, quote: "Energy use is not an objective." },
          ],
          resolutionRationale: "The expert explicitly retracted the objective.",
          rationale: "No frozen row.",
        },
      ],
    });
    expect(() =>
      assertCondition3UnsupportedAnchorContinuity(previous, retracted, 2),
    ).not.toThrow();

    const rewrittenResolution = structuredClone(retracted);
    const retractedAnchor =
      rewrittenResolution.unsupportedActiveObjectiveAnchors[0];
    if (retractedAnchor?.state !== "retracted") {
      throw new Error("fixture lost retracted anchor");
    }
    retractedAnchor.resolutionEvidence = [
      { turn: 3, quote: "Replacement resolution." },
    ];
    expect(() =>
      assertCondition3UnsupportedAnchorContinuity(
        retracted,
        rewrittenResolution,
        3,
      ),
    ).toThrow("rewrote its resolution evidence");
  });

  test("rejects a globally valid activation predicate incompatible with its clause", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    const invalidInput = structuredClone(parsed);
    const minimum = invalidInput.assessments.find(
      ({ clauseId }) => clauseId === "SP-MIN",
    );
    if (!minimum) throw new Error("fixture lost SP-MIN");
    Object.assign(minimum, {
      demanded: true,
      currentStatus: "none",
      currentGrade: "none",
      pass: false,
      failureDiagnostic: "unaccepted-absence",
      activationPredicates: ["absence-uncorroborated"],
      evidence: [{ turn: 1, quote: "I do not know." }],
      observedCount: null,
    });
    const invalid = parseCondition3Projection(invalidInput);

    expect(() => assertCondition3ProjectionSemantics(invalid)).toThrow(
      "activation predicate is incompatible",
    );
  });

  test("rejects omission of a compatible required activation", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    const invalid = structuredClone(parsed);
    const minimum = invalid.assessments.find(
      ({ clauseId }) => clauseId === "SP-MIN",
    );
    if (!minimum) throw new Error("fixture lost SP-MIN");
    Object.assign(minimum, {
      demanded: true,
      currentStatus: "explicit",
      currentGrade: "verbal",
      pass: false,
      failureDiagnostic: "below-required-grade",
      activationPredicates: [],
      evidence: [{ turn: 1, quote: "The minimum is roughly 800." }],
    });

    expect(() => assertCondition3ProjectionSemantics(invalid)).toThrow(
      "required activation predicate below-demanded-grade is missing",
    );
  });

  test("accepts the required unspecified-marker activation for inadmissible status", () => {
    const parsed = parseCondition3Projection(
      CONDITION_3_OPERATOR_ENVELOPE.template,
    );
    const releaseGate = parsed.assessments.find(
      ({ clauseId }) => clauseId === "IW-REL",
    );
    if (!releaseGate) throw new Error("fixture lost IW-REL");
    Object.assign(releaseGate, {
      demanded: true,
      currentStatus: "tentative",
      currentGrade: "structured",
      pass: false,
      failureDiagnostic: "inadmissible-status",
      activationPredicates: ["unspecified-marker-present"],
      evidence: [{ turn: 1, quote: "I think release is probably verbal." }],
    });

    expect(() => assertCondition3ProjectionSemantics(parsed)).not.toThrow();
  });

  test("includes the reviewed SP-SCRAP target in CPS-Q03 activation", () => {
    expect(
      CONDITION_3_ACTIVATION_MATRIX.find(({ cardId }) => cardId === "CPS-Q03")
        ?.clauses,
    ).toEqual(["SP-BATCH", "SP-MIN", "SP-POL", "SP-CO", "SP-SCRAP"]);
  });

  test("requires every machine-readable result component exactly once", () => {
    const result = v.parse(Condition3ResultSchema, {
      schemaVersion: "fe-1404-condition-3-result/2026-08-25.1",
      runRawSha256: "0".repeat(64),
      components: CONDITION_3_RESULT_COMPONENT_IDS.map((id) => ({
        id,
        verdict: "unobservable",
        observation: id.startsWith("signature.") ? "unobservable" : null,
        evidence: [],
        rationale: "pre-observation fixture",
      })),
      comparisons: {
        condition1: {
          ...CONDITION_3_COMPARISON_HASHES.condition1,
          comparison: "pending",
        },
        condition2: {
          ...CONDITION_3_COMPARISON_HASHES.condition2,
          comparison: "pending",
        },
      },
      amendments: [],
      limitations: [],
    });

    expect(() => assertCompleteCondition3Result(result)).not.toThrow();
    const contradictoryGenResult = {
      ...result,
      components: result.components.map((component) =>
        component.id === "guidance.GEN-Q02.layer-2"
          ? { ...component, verdict: "pass" as const }
          : component,
      ),
    };
    expect(() =>
      assertCompleteCondition3Result(contradictoryGenResult),
    ).toThrow("GEN-Q02 layer-2 verdict is frozen as unobservable");
    expect(() =>
      assertCompleteCondition3Result({
        ...result,
        components: result.components.slice(1),
      }),
    ).toThrow("every frozen component exactly once");
    expect(() =>
      v.parse(Condition3ResultSchema, {
        ...result,
        components: result.components.map((component) =>
          component.id === "layer.diagnostic"
            ? { ...component, verdict: "pass", evidence: [] }
            : component,
        ),
      }),
    ).toThrow("scored condition-3 result components require evidence");
    expect(() =>
      v.parse(Condition3ResultSchema, {
        ...result,
        comparisons: {
          ...result.comparisons,
          condition1: { ...result.comparisons.condition1, comparison: "" },
        },
      }),
    ).toThrow();
    expect(() =>
      v.parse(Condition3ResultSchema, {
        ...result,
        comparisons: {
          ...result.comparisons,
          condition1: {
            ...result.comparisons.condition1,
            rawSha256: "0".repeat(64),
          },
        },
      }),
    ).toThrow();
  });
});
