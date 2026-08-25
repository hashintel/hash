import * as v from "valibot";

export const CONDITION_3_INSTRUMENT_VERSION =
  "fe-1404-condition-3/2026-08-25.1";
export const CONDITION_3_DEMAND_TABLE_VERSION =
  "cps-baseline-replay/2026-08-24.3";

export const CONDITION_3_COMPARISON_HASHES = {
  condition1: {
    rawSha256:
      "e8fdb4705ea5223545a0395f26b32dddaf105e6536ffef1b15feee7f73f0d3dd",
    transcriptSha256:
      "307eddf906a8ebd280e7cf1eaaadf124fd053a9d82cc651afbc5c760904f9c30",
    modelSha256:
      "64100739b7668bed749b30f081d4a8fd7149f2b0a21e5791203a7d8dc70f37d2",
  },
  condition2: {
    rawSha256:
      "e50c7b9442758ed97882e843195bb3be1b9f4350a28f0808ee09428cd51c3829",
    transcriptSha256:
      "230c9f643763a2d58790aef5515f22892cc4a6ed7562f0cdb3816138b05a700c",
    modelSha256:
      "cd1d7c38773e991d859866af36c2bb13e3c6c68bfff9ce7e0430840c9d0c9eab",
  },
} as const;

export const CONDITION_3_LOCKED_PATHS = [
  "evaluations/protocols/process-model-elicitation/baseline/run.ts",
  "evaluations/protocols/process-model-elicitation/baseline/condition-3-instrument.ts",
  "evaluations/protocols/process-model-elicitation/baseline/condition-3-prompt.md",
  "evaluations/protocols/process-model-elicitation/baseline/condition-3-operator.md",
  "evaluations/protocols/process-model-elicitation/baseline/condition-3-preregistration.md",
  "evaluations/protocols/process-model-elicitation/baseline/condition-3-scoring.md",
  "evaluations/protocols/process-model-elicitation/baseline/condition-3-pre-run-review.md",
  "evaluations/protocols/process-model-elicitation/baseline/condition-3-legibility.md",
  "evaluations/protocols/process-model-elicitation/baseline/protocol.md",
  "evaluations/cases/process-model-elicitation/baseline/opening-message.md",
  "evaluations/cases/process-model-elicitation/baseline/situation-pack.md",
  "docs/specs/elicitation-completion.md",
  "docs/specs/cps-interview-guidance.md",
  "docs/reference/research/elicitation/frontier-model-elicitor-failure-catalogue.md",
  "docs/evidence/evaluations/process-model-elicitation/baseline/readout.md",
  "docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-1.md",
  "docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-1.raw.json",
  "docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-1-model.txt",
  "docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-2.md",
  "docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-2.raw.json",
  "docs/evidence/evaluations/process-model-elicitation/baseline/transcripts/condition-2-model.txt",
] as const;

export const CONDITION_3_OBJECTIVE_ROWS = [
  "ROW-BREAKDOWN",
  "ROW-IDLE-WASH",
  "ROW-CHANGEOVER",
  "ROW-SPLIT",
] as const;

export type Condition3ObjectiveRow =
  (typeof CONDITION_3_OBJECTIVE_ROWS)[number];

/**
 * Exact FE-1402 design-time `whenObjective` labels. These labels let the
 * experiment operator record which frozen row predicate it adjudicated; they
 * are not a proposed FE-1431 runtime binding representation.
 */
export const CONDITION_3_OBJECTIVE_MATCH_PREDICATES = [
  { row: "ROW-BREAKDOWN", matchingPredicate: "breakdown-reshuffle" },
  { row: "ROW-IDLE-WASH", matchingPredicate: "idle-vs-washdown" },
  { row: "ROW-CHANGEOVER", matchingPredicate: "changeover-accounting" },
  { row: "ROW-SPLIT", matchingPredicate: "split-run" },
] as const satisfies readonly {
  row: Condition3ObjectiveRow;
  matchingPredicate: string;
}[];

export const CONDITION_3_PASSING_STATUSES = ["explicit", "inferred"] as const;

export const CONDITION_3_DEMAND_CLAUSES = [
  {
    id: "SF-OBJ",
    row: null,
    coordinate: "kind(objective)",
    demand: "presence count >= 1",
  },
  {
    id: "SF-ENT",
    row: null,
    coordinate: "kind(entity-type)",
    demand: "presence count >= 2",
  },
  {
    id: "SF-ACT",
    row: null,
    coordinate: "kind(activity)",
    demand: "presence count >= 1",
  },
  {
    id: "SF-PATH",
    row: null,
    coordinate: "kind(ordering/flow)",
    demand: "presence count >= 1",
  },
  {
    id: "SF-FLOW",
    row: null,
    coordinate: "kind(ordering/flow).sequence",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "BR-CAP",
    row: "ROW-BREAKDOWN",
    coordinate: "entity-type[line].capabilities",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "BR-CAL",
    row: "ROW-BREAKDOWN",
    coordinate: "boundary-condition[line-calendar].pattern",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "BR-OCC",
    row: "ROW-BREAKDOWN",
    coordinate: "dynamics[line-failure].occurrenceFrequency",
    demand: "grade range; status explicit or inferred",
  },
  {
    id: "BR-REPAIR",
    row: "ROW-BREAKDOWN",
    coordinate: "dynamics[line-failure].repairDuration",
    demand: "grade quantiles; status explicit or inferred",
  },
  {
    id: "BR-POL",
    row: "ROW-BREAKDOWN",
    coordinate: "policy[resource-conflict].rule",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "IW-REL",
    row: "ROW-IDLE-WASH",
    coordinate: "boundary-condition[order-release].condition",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "IW-CO-DUR",
    row: "ROW-IDLE-WASH",
    coordinate: "dynamics[family-changeover].duration",
    demand: "grade range; status explicit or inferred",
  },
  {
    id: "IW-LATE",
    row: "ROW-IDLE-WASH",
    coordinate: "objective[idle-vs-washdown].latenessConsequence",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "IW-SCRAP",
    row: "ROW-IDLE-WASH",
    coordinate: "dynamics[family-changeover].rampScrap",
    demand: "grade range; status explicit or inferred; no accepted absence",
  },
  {
    id: "CH-TAX",
    row: "ROW-CHANGEOVER",
    coordinate: "entity-type[changeover].directionClass",
    demand: "grade vocabulary-bound; status explicit or inferred",
  },
  {
    id: "CH-DUR",
    row: "ROW-CHANGEOVER",
    coordinate: "dynamics[family-changeover].duration",
    demand: "grade range; status explicit or inferred",
  },
  {
    id: "CH-CREW",
    row: "ROW-CHANGEOVER",
    coordinate: "activity[family-changeover].resourceRequirement",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "CH-SEQ",
    row: "ROW-CHANGEOVER",
    coordinate: "policy[weekly-sequencing].rule",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "CH-SCRAP",
    row: "ROW-CHANGEOVER",
    coordinate: "dynamics[family-changeover].rampScrap",
    demand: "grade range; status explicit or inferred; no accepted absence",
  },
  {
    id: "SP-BATCH",
    row: "ROW-SPLIT",
    coordinate: "activity[production-run].batchStructure",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "SP-MIN",
    row: "ROW-SPLIT",
    coordinate: "constraint[minimum-run-size].threshold",
    demand: "grade range; status explicit or inferred",
  },
  {
    id: "SP-ELIG",
    row: "ROW-SPLIT",
    coordinate: "constraint[line-eligibility].condition",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "SP-POL",
    row: "ROW-SPLIT",
    coordinate: "policy[split-contiguity].rule",
    demand: "grade structured; status explicit or inferred",
  },
  {
    id: "SP-CO",
    row: "ROW-SPLIT",
    coordinate: "dynamics[split-run].extraChangeover",
    demand: "grade range; status explicit or inferred",
  },
  {
    id: "SP-SCRAP",
    row: "ROW-SPLIT",
    coordinate: "dynamics[split-run].repeatedRampScrap",
    demand: "grade range; status explicit or inferred; no accepted absence",
  },
] as const satisfies readonly {
  id: string;
  row: Condition3ObjectiveRow | null;
  coordinate: string;
  demand: string;
}[];

export type Condition3ClauseId =
  (typeof CONDITION_3_DEMAND_CLAUSES)[number]["id"];

export const CONDITION_3_CARD_IDS = [
  "CPS-Q01",
  "CPS-Q02",
  "CPS-Q03",
  "CPS-Q04",
  "CPS-Q05",
  "GEN-Q02",
] as const;

export type Condition3CardId = (typeof CONDITION_3_CARD_IDS)[number];

export const CONDITION_3_FIRES_WHEN = [
  "slot-unaddressed",
  "below-demanded-grade",
  "unspecified-marker-present",
  "conflicted-open",
  "absence-uncorroborated",
  "uniformity-unprobed",
  "identity-ambiguous",
] as const;

export type Condition3FiresWhen = (typeof CONDITION_3_FIRES_WHEN)[number];

export const CONDITION_3_ACTIVATION_MATRIX = [
  {
    cardId: "CPS-Q01",
    clauses: ["BR-OCC", "BR-REPAIR"],
    predicates: [
      "slot-unaddressed",
      "below-demanded-grade",
      "unspecified-marker-present",
    ],
  },
  {
    cardId: "CPS-Q02",
    clauses: ["IW-SCRAP", "CH-SCRAP", "SP-SCRAP"],
    predicates: [
      "slot-unaddressed",
      "below-demanded-grade",
      "absence-uncorroborated",
    ],
  },
  {
    cardId: "CPS-Q03",
    clauses: ["SP-BATCH", "SP-MIN", "SP-POL", "SP-CO", "SP-SCRAP"],
    predicates: ["slot-unaddressed", "below-demanded-grade"],
  },
  {
    cardId: "CPS-Q04",
    clauses: ["IW-REL"],
    predicates: [
      "slot-unaddressed",
      "below-demanded-grade",
      "unspecified-marker-present",
    ],
  },
  {
    cardId: "CPS-Q05",
    clauses: ["BR-POL"],
    predicates: [
      "slot-unaddressed",
      "below-demanded-grade",
      "unspecified-marker-present",
    ],
  },
] as const satisfies readonly {
  cardId: Exclude<Condition3CardId, "GEN-Q02">;
  clauses: readonly Condition3ClauseId[];
  predicates: readonly Condition3FiresWhen[];
}[];

export const CONDITION_3_GEN_Q02_LAYER_2 = {
  cardId: "GEN-Q02",
  verdict: "unobservable",
  reason:
    "the experiment has no lossless independent-question and pending-large-batch adjudicator; punctuation is not a semantic proxy",
} as const;

export const CONDITION_3_DIAGNOSTIC_PRIORITY = [
  "SF-ENT",
  "SF-ACT",
  "SF-PATH",
  "SF-FLOW",
  "BR-OCC",
  "BR-REPAIR",
  "IW-SCRAP",
  "CH-SCRAP",
  "SP-SCRAP",
  "SP-BATCH",
  "SP-MIN",
  "SP-POL",
  "SP-CO",
  "IW-REL",
  "BR-POL",
  "BR-CAP",
  "BR-CAL",
  "IW-CO-DUR",
  "IW-LATE",
  "CH-TAX",
  "CH-DUR",
  "CH-CREW",
  "CH-SEQ",
  "SP-ELIG",
  "SF-OBJ",
] as const satisfies readonly Condition3ClauseId[];

export const CONDITION_3_STOPPING_RULES = {
  forceWrapAt: 20,
  hardStopAt: 24,
  noProgressAdvisoryAfter: 3,
  noProgressHardStopAfter: 5,
  impatiencePhase:
    "first expert reply after all static-floor clauses pass and at least one objective row is active",
  singleSession:
    "no later session or external data arrival is available in this experiment",
  providerSampling: "default temperature; no seed parameter supported",
} as const;

export const CONDITION_3_DEMANDED_STATUSES = [
  "none",
  ...CONDITION_3_PASSING_STATUSES,
  "tentative",
  "defaulted",
  "external-lookup",
  "conflicted",
] as const;

export const CONDITION_3_DEMANDED_GRADES = [
  "none",
  "verbal",
  "point",
  "vocabulary-bound",
  "range",
  "structured",
  "quantiles",
] as const;

export const CONDITION_3_FAILURE_DIAGNOSTICS = [
  "below-minimum-count",
  "no-selected-slot",
  "below-required-grade",
  "inadmissible-status",
  "unaccepted-absence",
  "missing-evidence",
  "unaddressed",
  "open-conflict",
  "unevaluable-divergence",
  "unsupported-active-anchor",
] as const;

const clauseIds = new Set(CONDITION_3_DEMAND_CLAUSES.map(({ id }) => id));
const Condition3ClauseIdSchema = v.custom<Condition3ClauseId>(
  (value) =>
    typeof value === "string" && clauseIds.has(value as Condition3ClauseId),
  "unknown frozen DemandTable clause",
);
const Condition3EvidenceSchema = v.strictObject({
  turn: v.pipe(v.number(), v.integer(), v.minValue(0)),
  quote: v.pipe(v.string(), v.minLength(1)),
});
const Condition3ActiveObjectiveRowEvidenceSchema = v.variant(
  "row",
  CONDITION_3_OBJECTIVE_MATCH_PREDICATES.map(({ row, matchingPredicate }) =>
    v.strictObject({
      row: v.literal(row),
      anchorLabel: v.pipe(v.string(), v.minLength(1)),
      matchingPredicate: v.literal(matchingPredicate),
      evidence: v.pipe(v.array(Condition3EvidenceSchema), v.minLength(1)),
      rationale: v.pipe(v.string(), v.minLength(1)),
    }),
  ),
);
const Condition3RetractedObjectiveAnchorSchema = v.variant(
  "row",
  CONDITION_3_OBJECTIVE_MATCH_PREDICATES.map(({ row, matchingPredicate }) =>
    v.strictObject({
      row: v.literal(row),
      anchorLabel: v.pipe(v.string(), v.minLength(1)),
      matchingPredicate: v.literal(matchingPredicate),
      evidence: v.pipe(v.array(Condition3EvidenceSchema), v.minLength(1)),
      rationale: v.pipe(v.string(), v.minLength(1)),
      resolutionEvidence: v.pipe(
        v.array(Condition3EvidenceSchema),
        v.minLength(1),
      ),
      resolutionRationale: v.pipe(v.string(), v.minLength(1)),
    }),
  ),
);
const unsupportedAnchorBase = {
  label: v.pipe(v.string(), v.minLength(1)),
  evidence: v.pipe(v.array(Condition3EvidenceSchema), v.minLength(1)),
  rationale: v.pipe(v.string(), v.minLength(1)),
};
const Condition3ActiveUnsupportedObjectiveAnchorSchema = v.strictObject({
  ...unsupportedAnchorBase,
  state: v.literal("active"),
  demanded: v.literal(true),
  pass: v.literal(false),
  failureDiagnostic: v.literal("unsupported-active-anchor"),
  resolutionEvidence: v.tuple([]),
  resolutionRationale: v.null(),
});
const Condition3RetractedUnsupportedObjectiveAnchorSchema = v.strictObject({
  ...unsupportedAnchorBase,
  state: v.literal("retracted"),
  demanded: v.literal(false),
  pass: v.literal(true),
  failureDiagnostic: v.null(),
  resolutionEvidence: v.pipe(v.array(Condition3EvidenceSchema), v.minLength(1)),
  resolutionRationale: v.pipe(v.string(), v.minLength(1)),
});
const assessmentBase = {
  clauseId: Condition3ClauseIdSchema,
  demand: v.string(),
  coordinate: v.string(),
  evidence: v.array(Condition3EvidenceSchema),
  observedCount: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  rationale: v.string(),
};

const Condition3InactiveAssessmentSchema = v.strictObject({
  ...assessmentBase,
  demanded: v.literal(false),
  currentStatus: v.literal("not-applicable"),
  currentGrade: v.literal("not-applicable"),
  pass: v.literal(true),
  failureDiagnostic: v.null(),
  activationPredicates: v.tuple([]),
});
const Condition3PassingAssessmentSchema = v.strictObject({
  ...assessmentBase,
  demanded: v.literal(true),
  currentStatus: v.picklist(CONDITION_3_PASSING_STATUSES),
  currentGrade: v.picklist(CONDITION_3_DEMANDED_GRADES),
  pass: v.literal(true),
  failureDiagnostic: v.null(),
  activationPredicates: v.tuple([]),
});
const Condition3FailingAssessmentSchema = v.strictObject({
  ...assessmentBase,
  demanded: v.literal(true),
  currentStatus: v.picklist(CONDITION_3_DEMANDED_STATUSES),
  currentGrade: v.picklist(CONDITION_3_DEMANDED_GRADES),
  pass: v.literal(false),
  failureDiagnostic: v.picklist(CONDITION_3_FAILURE_DIAGNOSTICS),
  activationPredicates: v.array(v.picklist(CONDITION_3_FIRES_WHEN)),
});

export const Condition3ProjectionSchema = v.strictObject({
  activeObjectiveRows: v.array(v.picklist(CONDITION_3_OBJECTIVE_ROWS)),
  activeObjectiveRowEvidence: v.array(
    Condition3ActiveObjectiveRowEvidenceSchema,
  ),
  retractedObjectiveAnchors: v.array(Condition3RetractedObjectiveAnchorSchema),
  unsupportedActiveObjectiveAnchors: v.array(
    v.union([
      Condition3ActiveUnsupportedObjectiveAnchorSchema,
      Condition3RetractedUnsupportedObjectiveAnchorSchema,
    ]),
  ),
  assessments: v.array(
    v.union([
      Condition3InactiveAssessmentSchema,
      Condition3PassingAssessmentSchema,
      Condition3FailingAssessmentSchema,
    ]),
  ),
  notes: v.array(v.string()),
});

export type Condition3Projection = v.InferOutput<
  typeof Condition3ProjectionSchema
>;
export type Condition3Assessment = Condition3Projection["assessments"][number];

export const CONDITION_3_VERDICTS = [
  "pass",
  "fail",
  "mixed",
  "unobservable",
  "not-applicable",
] as const;

export const CONDITION_3_RESULT_COMPONENT_IDS = [
  "layer.diagnostic",
  "layer.activation",
  "layer.evidence-stopping",
  "guidance.GEN-Q02.layer-2",
  "guidance.GEN-Q02.layer-3",
  "guidance.CPS-Q01.aggregate",
  "guidance.CPS-Q02.aggregate",
  "guidance.CPS-Q03.aggregate",
  "guidance.CPS-Q04.aggregate",
  "guidance.CPS-Q05.aggregate",
  "inherited.interaction-quality",
  "inherited.semantic-coverage",
  "inherited.stopping",
  "inherited.completion",
  "stopping.user-request",
  "stopping.no-progress",
  "stopping.budget",
  "inherited.delivery",
  "inherited.deposit",
  "inherited.deferral",
  "inherited.provenance",
  "inherited.target-validity",
  "bano.question-formulation",
  "bano.question-omission",
  "bano.order-of-interview",
  "bano.communication-skills",
  "bano.customer-interaction",
  "coverage.objectives",
  "coverage.structure",
  "coverage.taxonomy",
  "coverage.rates-distributions",
  "coverage.policies",
  "coverage.constraints",
  "coverage.boundary-conditions",
  "excavation.tacit",
  "excavation.belief-correction",
  "excavation.unknown-recording",
  "signature.FM-01",
  "signature.FM-02",
  "signature.FM-03",
  "signature.FM-04",
  "signature.FM-05",
  "signature.FM-06",
  "signature.FM-07",
  "signature.FM-08",
  "signature.FM-09",
  "signature.FM-10",
  "signature.FM-11",
  "signature.FM-12",
  "signature.FM-13",
  "signature.FM-14",
  "signature.FM-15",
] as const;

const nonEmptyResultString = v.pipe(v.string(), v.minLength(1));
const Condition3ResultComponentSchema = v.pipe(
  v.strictObject({
    id: v.picklist(CONDITION_3_RESULT_COMPONENT_IDS),
    verdict: v.picklist(CONDITION_3_VERDICTS),
    observation: v.nullable(
      v.picklist(["observed", "not-observed", "unobservable"]),
    ),
    evidence: v.array(nonEmptyResultString),
    rationale: nonEmptyResultString,
  }),
  v.check(
    ({ verdict, evidence }) =>
      !(["pass", "fail", "mixed"] as const).includes(verdict as never) ||
      evidence.length > 0,
    "scored condition-3 result components require evidence",
  ),
);

export const Condition3ResultSchema = v.strictObject({
  schemaVersion: v.literal("fe-1404-condition-3-result/2026-08-25.1"),
  runRawSha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)),
  components: v.array(Condition3ResultComponentSchema),
  comparisons: v.strictObject({
    condition1: v.strictObject({
      rawSha256: v.literal(CONDITION_3_COMPARISON_HASHES.condition1.rawSha256),
      transcriptSha256: v.literal(
        CONDITION_3_COMPARISON_HASHES.condition1.transcriptSha256,
      ),
      modelSha256: v.literal(
        CONDITION_3_COMPARISON_HASHES.condition1.modelSha256,
      ),
      comparison: nonEmptyResultString,
    }),
    condition2: v.strictObject({
      rawSha256: v.literal(CONDITION_3_COMPARISON_HASHES.condition2.rawSha256),
      transcriptSha256: v.literal(
        CONDITION_3_COMPARISON_HASHES.condition2.transcriptSha256,
      ),
      modelSha256: v.literal(
        CONDITION_3_COMPARISON_HASHES.condition2.modelSha256,
      ),
      comparison: nonEmptyResultString,
    }),
  }),
  amendments: v.array(nonEmptyResultString),
  limitations: v.array(nonEmptyResultString),
});

export type Condition3Result = v.InferOutput<typeof Condition3ResultSchema>;

export function assertCompleteCondition3Result(result: Condition3Result): void {
  const actualIds = result.components.map(({ id }) => id);
  if (
    actualIds.length !== CONDITION_3_RESULT_COMPONENT_IDS.length ||
    new Set(actualIds).size !== CONDITION_3_RESULT_COMPONENT_IDS.length ||
    CONDITION_3_RESULT_COMPONENT_IDS.some(
      (componentId) => !actualIds.includes(componentId),
    )
  ) {
    throw new Error(
      "condition-3 result must contain every frozen component exactly once",
    );
  }
  for (const component of result.components) {
    if (
      component.id === "guidance.GEN-Q02.layer-2" &&
      component.verdict !== "unobservable"
    ) {
      throw new Error(
        "condition-3 GEN-Q02 layer-2 verdict is frozen as unobservable",
      );
    }
    if (
      component.id.startsWith("signature.") !==
      (component.observation !== null)
    ) {
      throw new Error(
        "condition-3 signature components require an observation label and non-signature components forbid one",
      );
    }
    if (component.observation !== null) {
      const expectedVerdict =
        component.observation === "observed"
          ? "fail"
          : component.observation === "not-observed"
            ? "pass"
            : "unobservable";
      if (component.verdict !== expectedVerdict) {
        throw new Error(
          `condition-3 signature observation/verdict mismatch for ${component.id}`,
        );
      }
    }
  }
}

export const CONDITION_3_OPERATOR_ENVELOPE = {
  root: {
    activeObjectiveRows: [...CONDITION_3_OBJECTIVE_ROWS],
    activeObjectiveRowEvidence:
      "one transcript-supported anchor record per active objective, including a stable anchorLabel and that row's exact frozen matchingPredicate; multiple anchors may match one row",
    retractedObjectiveAnchors:
      "durable original and current-turn resolution evidence for previously matched objectives that the expert explicitly retracts",
    unsupportedActiveObjectiveAnchors:
      "persistent transcript-supported unsupported objective anchors: active items are demanded failures; retracted items preserve original and current-turn resolution evidence",
    assessments: "exactly one assessment per frozen clause",
    notes: "string[]",
  },
  assessmentStates: {
    inactive:
      "demanded=false; pass=true; status/grade=not-applicable; observedCount=null; failure=null; activation=[]",
    passing:
      "demanded=true; pass=true; demanded status/grade; presence observedCount or slot null; failure=null; activation=[]",
    failing:
      "demanded=true; pass=false; demanded status/grade; presence observedCount or slot null; non-null failure; activation from frozen vocabulary",
  },
  vocabularies: {
    objectiveRows: [...CONDITION_3_OBJECTIVE_ROWS],
    objectiveMatchPredicates: [...CONDITION_3_OBJECTIVE_MATCH_PREDICATES],
    statuses: [...CONDITION_3_DEMANDED_STATUSES, "not-applicable"],
    grades: [...CONDITION_3_DEMANDED_GRADES, "not-applicable"],
    failures: [...CONDITION_3_FAILURE_DIAGNOSTICS],
    activationPredicates: [...CONDITION_3_FIRES_WHEN],
  },
  template: {
    activeObjectiveRows: [],
    activeObjectiveRowEvidence: [],
    retractedObjectiveAnchors: [],
    unsupportedActiveObjectiveAnchors: [],
    assessments: CONDITION_3_DEMAND_CLAUSES.map((clause) => {
      const demanded = clause.row === null;
      const isPresenceDemand = clause.demand.startsWith("presence count >=");
      const slotUnaddressedCanFire = CONDITION_3_ACTIVATION_MATRIX.some(
        ({ clauses, predicates }) =>
          clauses.includes(clause.id as never) &&
          predicates.includes("slot-unaddressed"),
      );
      return {
        clauseId: clause.id,
        demand: clause.demand,
        coordinate: clause.coordinate,
        demanded,
        currentStatus: demanded ? "none" : "not-applicable",
        currentGrade: demanded ? "none" : "not-applicable",
        pass: !demanded,
        failureDiagnostic: demanded
          ? isPresenceDemand
            ? "below-minimum-count"
            : "unaddressed"
          : null,
        activationPredicates:
          demanded && slotUnaddressedCanFire
            ? (["slot-unaddressed"] as const)
            : ([] as const),
        evidence: [],
        observedCount: demanded && isPresenceDemand ? 0 : null,
        rationale: "replace with transcript-bounded judgment",
      };
    }),
    notes: [],
  },
} as const;

export function parseCondition3Projection(
  value: unknown,
): Condition3Projection {
  return v.parse(Condition3ProjectionSchema, value);
}

export function assertCompleteCondition3Projection(
  projection: Condition3Projection,
): void {
  const expectedIds = new Set(CONDITION_3_DEMAND_CLAUSES.map(({ id }) => id));
  const actualIds = new Set(
    projection.assessments.map(({ clauseId }) => clauseId),
  );
  if (
    projection.assessments.length !== expectedIds.size ||
    actualIds.size !== expectedIds.size ||
    [...expectedIds].some((clauseId) => !actualIds.has(clauseId))
  ) {
    throw new Error(
      "condition-3 operator projection must assess every frozen DemandTable clause exactly once",
    );
  }
}

function gradeSatisfiesDemand(demand: string, grade: string): boolean {
  const requiredGrade = /grade ([a-z-]+)/u.exec(demand)?.[1];
  if (!requiredGrade) return true;
  const qualitativeLadder = [
    "verbal",
    "vocabulary-bound",
    "structured",
  ] as const;
  const quantitativeLadder = ["point", "range", "quantiles"] as const;
  for (const ladder of [qualitativeLadder, quantitativeLadder]) {
    const requiredIndex = ladder.indexOf(requiredGrade as never);
    if (requiredIndex < 0) continue;
    return ladder.indexOf(grade as never) >= requiredIndex;
  }
  return false;
}

function presenceMinimum(demand: string): number | null {
  const match = /^presence count >= (\d+)$/u.exec(demand);
  return match ? Number.parseInt(match[1] ?? "0", 10) : null;
}

const compatibleFailuresByPredicate = {
  "slot-unaddressed": ["missing-evidence", "unaddressed"],
  "below-demanded-grade": ["below-required-grade"],
  "unspecified-marker-present": [
    "below-required-grade",
    "inadmissible-status",
    "missing-evidence",
    "unaddressed",
  ],
  "conflicted-open": ["open-conflict"],
  "absence-uncorroborated": ["unaccepted-absence"],
  "uniformity-unprobed": ["unsupported-active-anchor"],
  "identity-ambiguous": ["unevaluable-divergence"],
} as const satisfies Record<
  Condition3FiresWhen,
  readonly (typeof CONDITION_3_FAILURE_DIAGNOSTICS)[number][]
>;

const requiredPredicateByFailure: Partial<
  Record<(typeof CONDITION_3_FAILURE_DIAGNOSTICS)[number], Condition3FiresWhen>
> = {
  "below-required-grade": "below-demanded-grade",
  "missing-evidence": "slot-unaddressed",
  unaddressed: "slot-unaddressed",
  "open-conflict": "conflicted-open",
  "inadmissible-status": "unspecified-marker-present",
  "unaccepted-absence": "absence-uncorroborated",
  "unevaluable-divergence": "identity-ambiguous",
};

export function assertCondition3ProjectionSemantics(
  projection: Condition3Projection,
): void {
  if (
    new Set(projection.activeObjectiveRows).size !==
    projection.activeObjectiveRows.length
  ) {
    throw new Error("condition-3 active objective rows must be unique");
  }
  const activeEvidenceRows = projection.activeObjectiveRowEvidence.map(
    ({ row }) => row,
  );
  const uniqueActiveEvidenceRows = [...new Set(activeEvidenceRows)];
  if (
    uniqueActiveEvidenceRows.length !== projection.activeObjectiveRows.length ||
    projection.activeObjectiveRows.some(
      (row) => !uniqueActiveEvidenceRows.includes(row),
    )
  ) {
    throw new Error(
      "condition-3 active objective rows must equal the unique row projection of active objective anchors",
    );
  }
  const allObjectiveAnchorLabels = [
    ...projection.activeObjectiveRowEvidence.map(({ anchorLabel }) =>
      anchorLabel.trim(),
    ),
    ...projection.retractedObjectiveAnchors.map(({ anchorLabel }) =>
      anchorLabel.trim(),
    ),
    ...projection.unsupportedActiveObjectiveAnchors.map(({ label }) =>
      label.trim(),
    ),
  ];
  if (
    new Set(allObjectiveAnchorLabels).size !== allObjectiveAnchorLabels.length
  ) {
    throw new Error(
      "condition-3 objective anchor labels must be unique across matched, retracted, and unsupported anchors",
    );
  }
  if (
    new Set(
      projection.unsupportedActiveObjectiveAnchors.map(({ label }) => label),
    ).size !== projection.unsupportedActiveObjectiveAnchors.length
  ) {
    throw new Error(
      "condition-3 unsupported active objective anchors must have unique labels",
    );
  }
  for (const assessment of projection.assessments) {
    const minimumCount = presenceMinimum(assessment.demand);
    if (minimumCount !== null) {
      if (assessment.observedCount === null) {
        throw new Error(
          `condition-3 presence assessment requires observedCount for ${assessment.clauseId}`,
        );
      }
      if (
        assessment.currentGrade !== "none" &&
        assessment.currentGrade !== "not-applicable"
      ) {
        throw new Error(
          `condition-3 presence assessment must not manufacture a grade for ${assessment.clauseId}`,
        );
      }
      if (assessment.observedCount > 0 && assessment.evidence.length === 0) {
        throw new Error(
          `condition-3 positive presence count requires transcript evidence for ${assessment.clauseId}`,
        );
      }
      if (
        assessment.demanded &&
        assessment.pass !== assessment.observedCount >= minimumCount
      ) {
        throw new Error(
          `condition-3 presence pass disagrees with observed cardinality for ${assessment.clauseId}`,
        );
      }
      if (
        assessment.demanded &&
        !assessment.pass &&
        assessment.failureDiagnostic !== "below-minimum-count"
      ) {
        throw new Error(
          `condition-3 failing presence assessment requires below-minimum-count for ${assessment.clauseId}`,
        );
      }
    } else if (assessment.observedCount !== null) {
      throw new Error(
        `condition-3 slot assessment forbids observedCount for ${assessment.clauseId}`,
      );
    } else if (
      assessment.demanded &&
      !assessment.pass &&
      assessment.failureDiagnostic === "below-minimum-count"
    ) {
      throw new Error(
        `condition-3 slot assessment forbids below-minimum-count for ${assessment.clauseId}`,
      );
    }
    const permittedPredicates = new Set(
      CONDITION_3_ACTIVATION_MATRIX.filter(({ clauses }) =>
        clauses.includes(assessment.clauseId as never),
      ).flatMap(({ predicates }) => predicates),
    );
    if (
      assessment.activationPredicates.some(
        (predicate) => !permittedPredicates.has(predicate as never),
      )
    ) {
      throw new Error(
        `condition-3 activation predicate is incompatible with ${assessment.clauseId}`,
      );
    }
    if (
      assessment.demanded &&
      !assessment.pass &&
      assessment.activationPredicates.some(
        (predicate) =>
          !compatibleFailuresByPredicate[predicate].includes(
            assessment.failureDiagnostic as never,
          ),
      )
    ) {
      throw new Error(
        `condition-3 activation predicate/failure mismatch for ${assessment.clauseId}`,
      );
    }
    if (assessment.demanded && !assessment.pass) {
      const requiredPredicate =
        requiredPredicateByFailure[assessment.failureDiagnostic];
      if (
        requiredPredicate &&
        permittedPredicates.has(requiredPredicate as never) &&
        !assessment.activationPredicates.includes(requiredPredicate)
      ) {
        throw new Error(
          `condition-3 required activation predicate ${requiredPredicate} is missing for ${assessment.clauseId}`,
        );
      }
    }
    if (
      assessment.demanded &&
      assessment.pass &&
      (assessment.evidence.length === 0 ||
        !gradeSatisfiesDemand(assessment.demand, assessment.currentGrade))
    ) {
      throw new Error(
        `condition-3 passing assessment does not satisfy the frozen evidence/grade demand for ${assessment.clauseId}`,
      );
    }
    if (
      assessment.demanded &&
      !assessment.pass &&
      assessment.failureDiagnostic === "no-selected-slot" &&
      assessment.activationPredicates.length > 0
    ) {
      throw new Error(
        `condition-3 no-selected-slot cannot activate a card for ${assessment.clauseId}`,
      );
    }
    if (assessment.demanded && !assessment.pass) {
      const hasEvidence = assessment.evidence.length > 0;
      const hasStatus = assessment.currentStatus !== "none";
      const hasGrade = assessment.currentGrade !== "none";
      switch (assessment.failureDiagnostic) {
        case "below-required-grade":
          if (
            !hasEvidence ||
            !hasStatus ||
            !hasGrade ||
            gradeSatisfiesDemand(assessment.demand, assessment.currentGrade)
          ) {
            throw new Error(
              `condition-3 below-required-grade requires evidence and a genuinely sub-demand grade for ${assessment.clauseId}`,
            );
          }
          break;
        case "missing-evidence":
        case "unaddressed":
          if (hasEvidence || hasStatus || hasGrade) {
            throw new Error(
              `condition-3 ${assessment.failureDiagnostic} requires empty evidence and none status/grade for ${assessment.clauseId}`,
            );
          }
          break;
        case "open-conflict":
          if (!hasEvidence || assessment.currentStatus !== "conflicted") {
            throw new Error(
              `condition-3 open-conflict requires conflicted transcript evidence for ${assessment.clauseId}`,
            );
          }
          break;
        case "inadmissible-status":
          if (
            !hasEvidence ||
            !hasStatus ||
            CONDITION_3_PASSING_STATUSES.includes(
              assessment.currentStatus as never,
            )
          ) {
            throw new Error(
              `condition-3 inadmissible-status requires transcript evidence in a non-passing status for ${assessment.clauseId}`,
            );
          }
          break;
        case "unaccepted-absence":
          if (!hasEvidence) {
            throw new Error(
              `condition-3 unaccepted-absence requires transcript evidence for ${assessment.clauseId}`,
            );
          }
          break;
        case "no-selected-slot":
          if (hasEvidence || hasStatus || hasGrade) {
            throw new Error(
              `condition-3 no-selected-slot requires empty evidence and none status/grade for ${assessment.clauseId}`,
            );
          }
          break;
        case "unsupported-active-anchor":
          throw new Error(
            "condition-3 unsupported active anchors belong in unsupportedActiveObjectiveAnchors, not a frozen clause assessment",
          );
        case "unevaluable-divergence":
          if (!hasEvidence) {
            throw new Error(
              `condition-3 ${assessment.failureDiagnostic} requires transcript evidence for ${assessment.clauseId}`,
            );
          }
          break;
        case "below-minimum-count":
          break;
      }
    }
  }
  const objectivePresence = projection.assessments.find(
    ({ clauseId }) => clauseId === "SF-OBJ",
  );
  const activeObjectiveCount =
    projection.activeObjectiveRowEvidence.length +
    projection.unsupportedActiveObjectiveAnchors.filter(
      ({ state }) => state === "active",
    ).length;
  if (objectivePresence?.observedCount !== activeObjectiveCount) {
    throw new Error(
      "condition-3 SF-OBJ observedCount must equal matched plus unsupported active objective anchors",
    );
  }
}

export function assertCondition3UnsupportedAnchorContinuity(
  previous: Condition3Projection | undefined,
  current: Condition3Projection,
  currentTurn: number,
): void {
  if (!previous) return;
  const currentActiveObjectiveByLabel = new Map(
    current.activeObjectiveRowEvidence.map((anchor) => [
      anchor.anchorLabel,
      anchor,
    ]),
  );
  const currentRetractedObjectiveByLabel = new Map(
    current.retractedObjectiveAnchors.map((anchor) => [
      anchor.anchorLabel,
      anchor,
    ]),
  );
  for (const priorAnchor of previous.activeObjectiveRowEvidence) {
    const currentActive = currentActiveObjectiveByLabel.get(
      priorAnchor.anchorLabel,
    );
    const currentRetracted = currentRetractedObjectiveByLabel.get(
      priorAnchor.anchorLabel,
    );
    const currentAnchor = currentActive ?? currentRetracted;
    if (!currentAnchor) {
      throw new Error(
        `condition-3 matched objective anchor '${priorAnchor.anchorLabel}' disappeared without a durable retraction`,
      );
    }
    if (
      currentAnchor.row !== priorAnchor.row ||
      currentAnchor.matchingPredicate !== priorAnchor.matchingPredicate ||
      currentAnchor.rationale !== priorAnchor.rationale
    ) {
      throw new Error(
        `condition-3 matched objective anchor '${priorAnchor.anchorLabel}' rewrote its row, predicate, or rationale`,
      );
    }
    const currentEvidenceKeys = new Set(
      currentAnchor.evidence.map(({ turn, quote }) => `${turn}\u0000${quote}`),
    );
    if (
      priorAnchor.evidence.some(
        ({ turn, quote }) => !currentEvidenceKeys.has(`${turn}\u0000${quote}`),
      )
    ) {
      throw new Error(
        `condition-3 matched objective anchor '${priorAnchor.anchorLabel}' rewrote its original evidence`,
      );
    }
    if (
      currentRetracted &&
      !currentRetracted.resolutionEvidence.some(
        ({ turn }) => turn === currentTurn,
      )
    ) {
      throw new Error(
        `condition-3 matched objective anchor '${priorAnchor.anchorLabel}' retraction requires current-turn evidence`,
      );
    }
  }
  for (const priorAnchor of previous.retractedObjectiveAnchors) {
    const currentAnchor = currentRetractedObjectiveByLabel.get(
      priorAnchor.anchorLabel,
    );
    if (!currentAnchor) {
      throw new Error(
        `condition-3 retracted objective anchor '${priorAnchor.anchorLabel}' cannot disappear or reactivate`,
      );
    }
    if (
      currentAnchor.row !== priorAnchor.row ||
      currentAnchor.matchingPredicate !== priorAnchor.matchingPredicate ||
      currentAnchor.rationale !== priorAnchor.rationale ||
      currentAnchor.resolutionRationale !== priorAnchor.resolutionRationale
    ) {
      throw new Error(
        `condition-3 retracted objective anchor '${priorAnchor.anchorLabel}' rewrote durable metadata`,
      );
    }
    for (const [kind, priorEvidence, currentEvidence] of [
      ["original", priorAnchor.evidence, currentAnchor.evidence],
      [
        "resolution",
        priorAnchor.resolutionEvidence,
        currentAnchor.resolutionEvidence,
      ],
    ] as const) {
      const currentEvidenceKeys = new Set(
        currentEvidence.map(({ turn, quote }) => `${turn}\u0000${quote}`),
      );
      if (
        priorEvidence.some(
          ({ turn, quote }) =>
            !currentEvidenceKeys.has(`${turn}\u0000${quote}`),
        )
      ) {
        throw new Error(
          `condition-3 retracted objective anchor '${priorAnchor.anchorLabel}' rewrote ${kind} evidence`,
        );
      }
    }
  }
  const currentByLabel = new Map(
    current.unsupportedActiveObjectiveAnchors.map((anchor) => [
      anchor.label,
      anchor,
    ]),
  );
  for (const priorAnchor of previous.unsupportedActiveObjectiveAnchors) {
    const currentAnchor = currentByLabel.get(priorAnchor.label);
    if (!currentAnchor) {
      throw new Error(
        `condition-3 unsupported objective anchor '${priorAnchor.label}' disappeared without a durable retraction`,
      );
    }
    if (
      priorAnchor.state === "retracted" &&
      currentAnchor.state !== "retracted"
    ) {
      throw new Error(
        `condition-3 unsupported objective anchor '${priorAnchor.label}' cannot reactivate after retraction`,
      );
    }
    if (
      priorAnchor.state === "active" &&
      currentAnchor.state === "retracted" &&
      !currentAnchor.resolutionEvidence.some(({ turn }) => turn === currentTurn)
    ) {
      throw new Error(
        `condition-3 unsupported objective anchor '${priorAnchor.label}' retraction requires current-turn evidence`,
      );
    }
    if (currentAnchor.rationale !== priorAnchor.rationale) {
      throw new Error(
        `condition-3 unsupported objective anchor '${priorAnchor.label}' rewrote its original rationale`,
      );
    }
    const currentEvidenceKeys = new Set(
      currentAnchor.evidence.map(({ turn, quote }) => `${turn}\u0000${quote}`),
    );
    if (
      priorAnchor.evidence.some(
        ({ turn, quote }) => !currentEvidenceKeys.has(`${turn}\u0000${quote}`),
      )
    ) {
      throw new Error(
        `condition-3 unsupported objective anchor '${priorAnchor.label}' rewrote its original evidence`,
      );
    }
    if (
      priorAnchor.state === "retracted" &&
      currentAnchor.state === "retracted"
    ) {
      if (
        currentAnchor.resolutionRationale !== priorAnchor.resolutionRationale
      ) {
        throw new Error(
          `condition-3 unsupported objective anchor '${priorAnchor.label}' rewrote its resolution rationale`,
        );
      }
      const currentResolutionEvidenceKeys = new Set(
        currentAnchor.resolutionEvidence.map(
          ({ turn, quote }) => `${turn}\u0000${quote}`,
        ),
      );
      if (
        priorAnchor.resolutionEvidence.some(
          ({ turn, quote }) =>
            !currentResolutionEvidenceKeys.has(`${turn}\u0000${quote}`),
        )
      ) {
        throw new Error(
          `condition-3 unsupported objective anchor '${priorAnchor.label}' rewrote its resolution evidence`,
        );
      }
    }
  }
}

export function nextCondition3NoProgressStreak(
  history: readonly Condition3Projection[],
  current: Condition3Projection,
  currentTurn: number,
  previousStreak: number,
): number {
  const priorEvidenceQuotes = new Set([
    ...history
      .flatMap(({ assessments }) => assessments)
      .flatMap(({ evidence }) => evidence.map(({ quote }) => quote)),
    ...history
      .flatMap(
        ({ unsupportedActiveObjectiveAnchors }) =>
          unsupportedActiveObjectiveAnchors,
      )
      .flatMap((anchor) => [
        ...anchor.evidence.map(({ quote }) => quote),
        ...(anchor.state === "retracted"
          ? anchor.resolutionEvidence.map(({ quote }) => quote)
          : []),
      ]),
    ...history.flatMap(({ activeObjectiveRowEvidence }) =>
      activeObjectiveRowEvidence.flatMap(({ evidence }) =>
        evidence.map(({ quote }) => quote),
      ),
    ),
    ...history.flatMap(({ retractedObjectiveAnchors }) =>
      retractedObjectiveAnchors.flatMap((anchor) => [
        ...anchor.evidence.map(({ quote }) => quote),
        ...anchor.resolutionEvidence.map(({ quote }) => quote),
      ]),
    ),
  ]);
  const hasNewDemandedEvidence =
    current.assessments.some(
      (assessment) =>
        assessment.demanded &&
        assessment.evidence.some(
          ({ turn, quote }) =>
            turn === currentTurn && !priorEvidenceQuotes.has(quote),
        ),
    ) ||
    current.unsupportedActiveObjectiveAnchors.some((anchor) =>
      (anchor.state === "active"
        ? anchor.evidence
        : anchor.resolutionEvidence
      ).some(
        ({ turn, quote }) =>
          turn === currentTurn && !priorEvidenceQuotes.has(quote),
      ),
    ) ||
    current.activeObjectiveRowEvidence.some(({ evidence }) =>
      evidence.some(
        ({ turn, quote }) =>
          turn === currentTurn && !priorEvidenceQuotes.has(quote),
      ),
    ) ||
    current.retractedObjectiveAnchors.some(({ resolutionEvidence }) =>
      resolutionEvidence.some(
        ({ turn, quote }) =>
          turn === currentTurn && !priorEvidenceQuotes.has(quote),
      ),
    );
  return hasNewDemandedEvidence ? 0 : previousStreak + 1;
}
