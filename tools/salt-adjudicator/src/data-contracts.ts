import * as z from "zod";

export const SCHEMA_VERSION = "salt-study-v1" as const;
export const SWIPE_SCHEMA_VERSION = "salt-swipes-v1" as const;
export const ADJUDICATION_SCHEMA_VERSION = "salt-adjudications-v1" as const;

export const LABELS = Object.freeze(["C", "P", "O", "U"] as const);
export const PRESCREENS = Object.freeze(["equivalence", "normal"] as const);
export const PLANNING_MODES = Object.freeze([
  "budget-first",
  "sample-first",
  "coverage-first",
] as const);

const nonEmptyString = (message: string = "must be a non-empty string.") =>
  z.string({ error: message }).trim().min(1, { error: message });

const preservedNonEmptyString = (
  message: string = "must be a non-empty string.",
) =>
  z
    .string({ error: message })
    .refine((value) => value.trim() !== "", { error: message });

const nonNegativeInteger = (
  message: string = "must be a non-negative integer.",
) =>
  z
    .number({ error: message })
    .finite({ error: message })
    .int({ error: message })
    .min(0, { error: message });

const positiveInteger = (message: string = "must be a positive integer.") =>
  z
    .number({ error: message })
    .finite({ error: message })
    .int({ error: message })
    .min(1, { error: message });

const nonNegativeNumber = (
  message: string = "must be a non-negative number.",
) =>
  z
    .number({ error: message })
    .finite({ error: message })
    .min(0, { error: message });

export const LabelSchema = z.enum(LABELS, {
  error: "must be C/P/O/U.",
});

export type Label = z.infer<typeof LabelSchema>;

export const PrescreenSchema = z.enum(PRESCREENS, {
  error: 'must be "equivalence" or "normal".',
});

export type Prescreen = z.infer<typeof PrescreenSchema>;

export const PlanningModeSchema = z.enum(PLANNING_MODES);

export type PlanningMode = z.infer<typeof PlanningModeSchema>;

export const AnnotatorIdSchema = z
  .string({
    error:
      "may contain only letters, numbers, periods, underscores, and hyphens (maximum 64 characters).",
  })
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u, {
    error:
      "may contain only letters, numbers, periods, underscores, and hyphens (maximum 64 characters).",
  });

export const DateTimeSchema = z
  .string({ error: "must be a valid date-time string." })
  .min(1, { error: "must be a valid date-time string." })
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    error: "must be a valid date-time string.",
  });

export const MonotoneTimestampSchema = z.strictObject({
  timestampMs: nonNegativeInteger(),
  iso: DateTimeSchema,
});

export type MonotoneTimestamp = z.infer<typeof MonotoneTimestampSchema>;

export const CardSourceMetadataSchema = z.strictObject({
  kind: z.literal("wikidata-extract"),
  retrieved_at: preservedNonEmptyString(),
  severely_truncated: z.boolean(),
  token_count: nonNegativeInteger(),
  truncations: z.array(z.string()),
});

export type CardSourceMetadata = z.infer<typeof CardSourceMetadataSchema>;

const cardShape = {
  relation_id: nonEmptyString(),
  family_id: nonEmptyString(),
  card_text: nonEmptyString(),
  card_hash: nonEmptyString(),
  prescreen: PrescreenSchema,
  source_metadata: CardSourceMetadataSchema.optional(),
};

export const CardSchema = z.strictObject(cardShape);

export type Card = z.infer<typeof CardSchema>;

export const WikidataCardRecordSchema = z
  .looseObject({
    card_hash: nonEmptyString(),
    card_text: nonEmptyString(),
    pid: z
      .string({ error: "must be a Wikidata property ID such as P6." })
      .regex(/^P[1-9]\d*$/u, {
        error: "must be a Wikidata property ID such as P6.",
      }),
    retrieved_at: preservedNonEmptyString(),
    severely_truncated: z.boolean(),
    token_count: nonNegativeInteger(),
    truncations: z.array(z.string()),
    family_id: nonEmptyString().optional(),
    prescreen: PrescreenSchema.optional().default("normal"),
  })
  .transform((record) =>
    CardSchema.parse({
      relation_id: record.pid,
      family_id: record.family_id ?? record.pid,
      card_text: record.card_text,
      card_hash: record.card_hash,
      prescreen: record.prescreen,
      source_metadata: {
        kind: "wikidata-extract",
        retrieved_at: record.retrieved_at,
        severely_truncated: record.severely_truncated,
        token_count: record.token_count,
        truncations: record.truncations,
      },
    }),
  );

export type WikidataCardRecord = z.input<typeof WikidataCardRecordSchema>;

const qualificationRationaleSchema = nonEmptyString(
  'qualification "rationale" must be a non-empty string.',
);

const canonicalQualificationCardSchema = z.strictObject({
  ...cardShape,
  answer: LabelSchema,
  rationale: qualificationRationaleSchema,
});

export const QualificationCardSchema = z
  .strictObject({
    relation_id: z.unknown().optional(),
    family_id: z.unknown().optional(),
    card_text: z.unknown().optional(),
    card_hash: z.unknown().optional(),
    prescreen: z.unknown().optional(),
    source_metadata: z.unknown().optional(),
    answer: z.unknown().optional(),
    gold_label: z.unknown().optional(),
    rationale: z.unknown().optional(),
  })
  .superRefine((card, context) => {
    const cardResult = CardSchema.safeParse({
      relation_id: card.relation_id,
      family_id: card.family_id,
      card_text: card.card_text,
      card_hash: card.card_hash,
      prescreen: card.prescreen,
      source_metadata: card.source_metadata,
    });
    if (!cardResult.success) {
      cardResult.error.issues.forEach((issue) => {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      });
    }
    const answerResult = LabelSchema.safeParse(card.answer ?? card.gold_label);
    if (!answerResult.success) {
      context.addIssue({
        code: "custom",
        path: ["answer"],
        message: 'qualification "answer" must be C/P/O/U.',
      });
    }
    const rationaleResult = qualificationRationaleSchema.safeParse(
      card.rationale,
    );
    if (!rationaleResult.success) {
      context.addIssue({
        code: "custom",
        path: ["rationale"],
        message: 'qualification "rationale" must be a non-empty string.',
      });
    }
  })
  .transform((card) => {
    const parsedCard = CardSchema.parse({
      relation_id: card.relation_id,
      family_id: card.family_id,
      card_text: card.card_text,
      card_hash: card.card_hash,
      prescreen: card.prescreen,
      ...(card.source_metadata === undefined
        ? {}
        : { source_metadata: card.source_metadata }),
    });
    return {
      ...parsedCard,
      answer: LabelSchema.parse(card.answer ?? card.gold_label),
      rationale: qualificationRationaleSchema.parse(card.rationale),
    };
  })
  .pipe(canonicalQualificationCardSchema);

export type QualificationCard = z.infer<typeof QualificationCardSchema>;

const stringArrayRecordSchema = z.record(z.string(), z.array(nonEmptyString()));
const nonNegativeIntegerRecordSchema = z.record(
  z.string(),
  nonNegativeInteger(),
);

export const AssignmentManifestSchema = z
  .strictObject({
    annotator_ids: z.array(AnnotatorIdSchema).min(1, {
      error: "must contain at least one annotator ID.",
    }),
    assignments: stringArrayRecordSchema,
    loads: nonNegativeIntegerRecordSchema,
    stratum_loads: z.strictObject({
      equivalence: nonNegativeIntegerRecordSchema,
      normal: nonNegativeIntegerRecordSchema,
    }),
  })
  .superRefine((manifest, context) => {
    const observedAnnotatorIds = new Set<string>();
    manifest.annotator_ids.forEach((annotatorId, annotatorIndex) => {
      if (observedAnnotatorIds.has(annotatorId)) {
        context.addIssue({
          code: "custom",
          path: ["annotator_ids", annotatorIndex],
          message: `duplicate annotator ID "${annotatorId}".`,
        });
      }
      observedAnnotatorIds.add(annotatorId);
    });
  });

export type AssignmentManifest = z.infer<typeof AssignmentManifestSchema>;

export const StudyAccessEntrySchema = z.strictObject({
  annotator_id: AnnotatorIdSchema,
  code_hash: nonEmptyString(),
});

export type StudyAccessEntry = z.infer<typeof StudyAccessEntrySchema>;

export const CodeSheetEntrySchema = z.strictObject({
  annotator_id: AnnotatorIdSchema,
  code: nonEmptyString(),
  assigned_cards: nonNegativeInteger(),
});

export type CodeSheetEntry = z.infer<typeof CodeSheetEntrySchema>;

export const StudyManifestCardSchema = z.strictObject({
  relation_id: nonEmptyString(),
  family_id: nonEmptyString(),
  card_hash: nonEmptyString(),
  prescreen: PrescreenSchema,
});

export type StudyManifestCard = z.infer<typeof StudyManifestCardSchema>;

export const StudySamplingSchema = z
  .strictObject({
    strategy: z.literal("prescreen-stratified-v1"),
    planner_mode: PlanningModeSchema,
    source_pool_hash: nonEmptyString(),
    source_pool_size: positiveInteger(),
    eligible_pool_size: positiveInteger(),
    sample_size: positiveInteger(),
    qualification_size: nonNegativeInteger(),
    annotator_count: positiveInteger(),
    production_cards_per_annotator: positiveInteger(),
    coverage_target: positiveInteger(),
    spare_capacity: nonNegativeInteger(),
    seconds_per_card: positiveInteger(),
    sampling_seed: nonEmptyString(),
  })
  .superRefine((sampling, context) => {
    if (sampling.eligible_pool_size > sampling.source_pool_size) {
      context.addIssue({
        code: "custom",
        path: ["eligible_pool_size"],
        message: "cannot exceed source_pool_size.",
      });
    }
    if (sampling.sample_size > sampling.eligible_pool_size) {
      context.addIssue({
        code: "custom",
        path: ["sample_size"],
        message: "cannot exceed eligible_pool_size.",
      });
    }
    if (sampling.coverage_target > sampling.annotator_count) {
      context.addIssue({
        code: "custom",
        path: ["coverage_target"],
        message: "cannot exceed annotator_count.",
      });
    }
  });

export type StudySampling = z.infer<typeof StudySamplingSchema>;

interface CardIdentifier {
  relation_id: string;
  card_hash: string;
}

type DuplicateIssueReporter = (
  path: [number, "relation_id" | "card_hash"],
  message: string,
) => void;

const reportDuplicateCardIdentifiers = (
  cards: readonly CardIdentifier[],
  reportIssue: DuplicateIssueReporter,
): void => {
  const relationIds = new Set<string>();
  const cardHashes = new Set<string>();

  cards.forEach((card, cardIndex) => {
    if (relationIds.has(card.relation_id)) {
      reportIssue(
        [cardIndex, "relation_id"],
        `duplicate relation_id "${card.relation_id}".`,
      );
    }
    if (cardHashes.has(card.card_hash)) {
      reportIssue(
        [cardIndex, "card_hash"],
        `duplicate card_hash "${card.card_hash}".`,
      );
    }
    relationIds.add(card.relation_id);
    cardHashes.add(card.card_hash);
  });
};

const studyMetadataShape = {
  schema_version: z.literal(SCHEMA_VERSION),
  study_id: nonEmptyString(),
  title: nonEmptyString(),
  deck_hash: nonEmptyString(),
  seed: nonEmptyString(),
  rubric_version: nonEmptyString(),
  coverage_target: positiveInteger(),
  slice_size: positiveInteger(),
  coincident_target: positiveInteger(),
  required_production_passes: positiveInteger(),
  sampling: StudySamplingSchema.optional(),
};

export const StudySchema = z
  .strictObject({
    ...studyMetadataShape,
    kind: z.literal("study"),
    cards: z.array(CardSchema).min(1, {
      error: "must contain at least one production card.",
    }),
    qualification_cards: z.array(QualificationCardSchema),
    manifest: AssignmentManifestSchema,
    access: z.array(StudyAccessEntrySchema).min(1, {
      error: "must contain at least one access entry.",
    }),
  })
  .superRefine((study, context) => {
    reportDuplicateCardIdentifiers(study.cards, (path, message) => {
      context.addIssue({
        code: "custom",
        path: ["cards", ...path],
        message,
      });
    });
    reportDuplicateCardIdentifiers(
      study.qualification_cards,
      (path, message) => {
        context.addIssue({
          code: "custom",
          path: ["qualification_cards", ...path],
          message,
        });
      },
    );
    const productionRelationIds = new Set(
      study.cards.map((card) => card.relation_id),
    );
    const productionCardHashes = new Set(
      study.cards.map((card) => card.card_hash),
    );
    study.qualification_cards.forEach((card, cardIndex) => {
      if (productionRelationIds.has(card.relation_id)) {
        context.addIssue({
          code: "custom",
          path: ["qualification_cards", cardIndex, "relation_id"],
          message: `also appears in the production deck as "${card.relation_id}".`,
        });
      }
      if (productionCardHashes.has(card.card_hash)) {
        context.addIssue({
          code: "custom",
          path: ["qualification_cards", cardIndex, "card_hash"],
          message: `also appears in the production deck as "${card.card_hash}".`,
        });
      }
    });
    if (study.sampling) {
      if (study.sampling.sample_size !== study.cards.length) {
        context.addIssue({
          code: "custom",
          path: ["sampling", "sample_size"],
          message: `must equal the ${study.cards.length} embedded production cards.`,
        });
      }
      if (
        study.sampling.qualification_size !== study.qualification_cards.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["sampling", "qualification_size"],
          message: `must equal the ${study.qualification_cards.length} embedded qualification cards.`,
        });
      }
      if (study.sampling.coverage_target !== study.coverage_target) {
        context.addIssue({
          code: "custom",
          path: ["sampling", "coverage_target"],
          message: "must match coverage_target.",
        });
      }
      if (study.sampling.production_cards_per_annotator !== study.slice_size) {
        context.addIssue({
          code: "custom",
          path: ["sampling", "production_cards_per_annotator"],
          message: "must match slice_size.",
        });
      }
      if (
        study.sampling.annotator_count !== study.manifest.annotator_ids.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["sampling", "annotator_count"],
          message: "must match the assignment manifest roster.",
        });
      }
      if (study.sampling.sampling_seed !== study.seed) {
        context.addIssue({
          code: "custom",
          path: ["sampling", "sampling_seed"],
          message: "must match the study seed.",
        });
      }
      if (
        study.sampling.source_pool_size !==
        study.sampling.eligible_pool_size + study.sampling.qualification_size
      ) {
        context.addIssue({
          code: "custom",
          path: ["sampling", "source_pool_size"],
          message: "must equal eligible_pool_size plus qualification_size.",
        });
      }
      const expectedSpareCapacity =
        study.sampling.annotator_count *
          study.sampling.production_cards_per_annotator -
        study.sampling.sample_size * study.sampling.coverage_target;
      if (study.sampling.spare_capacity !== expectedSpareCapacity) {
        context.addIssue({
          code: "custom",
          path: ["sampling", "spare_capacity"],
          message: `must equal the ${expectedSpareCapacity} unused assignment slots.`,
        });
      }
    }
    const accessAnnotatorIds = new Set<string>();
    study.access.forEach((entry, entryIndex) => {
      if (accessAnnotatorIds.has(entry.annotator_id)) {
        context.addIssue({
          code: "custom",
          path: ["access", entryIndex, "annotator_id"],
          message: `duplicate annotator ID "${entry.annotator_id}".`,
        });
      }
      accessAnnotatorIds.add(entry.annotator_id);
    });
  });

export type Study = z.infer<typeof StudySchema>;

export const StudyManifestSchema = z
  .strictObject({
    ...studyMetadataShape,
    cards: z.array(StudyManifestCardSchema).min(1, {
      error: "must contain at least one card.",
    }),
    manifest: AssignmentManifestSchema,
  })
  .superRefine((manifest, context) => {
    reportDuplicateCardIdentifiers(manifest.cards, (path, message) => {
      context.addIssue({
        code: "custom",
        path: ["cards", ...path],
        message,
      });
    });
    if (
      manifest.sampling &&
      manifest.sampling.sample_size !== manifest.cards.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["sampling", "sample_size"],
        message: `must equal the ${manifest.cards.length} manifest cards.`,
      });
    }
    if (
      manifest.sampling &&
      manifest.sampling.annotator_count !==
        manifest.manifest.annotator_ids.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["sampling", "annotator_count"],
        message: "must match the assignment manifest roster.",
      });
    }
  });

export type StudyManifest = z.infer<typeof StudyManifestSchema>;

const swipeIdentityShape = {
  swipe_id: nonEmptyString(),
  study_id: nonEmptyString(),
  deck_hash: nonEmptyString(),
  annotator_id: nonEmptyString(),
  relation_id: nonEmptyString(),
  family_id: nonEmptyString(),
  card_hash: nonEmptyString(),
  prescreen: PrescreenSchema,
  pass: nonNegativeInteger(),
  label: LabelSchema,
  latency_ms: nonNegativeNumber(),
  qualification: z.boolean({
    error: "must be a boolean.",
  }),
  rubric_version: nonEmptyString(),
  shuffle_seed: nonNegativeInteger(),
  ts: DateTimeSchema,
};

export const SwipeRecordSchema = z.strictObject({
  schema_version: z.literal(SWIPE_SCHEMA_VERSION),
  ...swipeIdentityShape,
  session_id: nonEmptyString(),
  flagged: z.boolean({ error: "must be a boolean." }),
  note: z.string().nullable(),
});

export type SwipeRecord = z.infer<typeof SwipeRecordSchema>;

export const ImportedSwipeRecordSchema = z.looseObject({
  swipe_id: preservedNonEmptyString(),
  study_id: preservedNonEmptyString(),
  deck_hash: preservedNonEmptyString(),
  annotator_id: preservedNonEmptyString(),
  relation_id: preservedNonEmptyString(),
  family_id: preservedNonEmptyString(),
  card_hash: preservedNonEmptyString(),
  prescreen: PrescreenSchema,
  pass: nonNegativeInteger(),
  label: LabelSchema,
  latency_ms: nonNegativeNumber(),
  qualification: z
    .boolean({ error: "must be a boolean when present." })
    .optional()
    .default(false),
  retracted: z
    .boolean({ error: "must be a boolean when present." })
    .optional()
    .default(false),
  note: z.unknown().optional(),
  rubric_version: preservedNonEmptyString(),
  shuffle_seed: nonNegativeInteger(),
  ts: DateTimeSchema,
  source_file: preservedNonEmptyString().optional().default("swipes.jsonl"),
});

export type ImportedSwipeRecord = z.infer<typeof ImportedSwipeRecordSchema>;

export const SwipeEventSchema = z.strictObject({
  event_type: z.literal("swipe"),
  swipe: SwipeRecordSchema,
});

export type SwipeEvent = z.infer<typeof SwipeEventSchema>;

export const RetractionEventSchema = z.strictObject({
  event_type: z.literal("retraction"),
  swipe_id: nonEmptyString(),
  annotator_id: nonEmptyString(),
  session_id: nonEmptyString(),
  ts: DateTimeSchema,
});

export type RetractionEvent = z.infer<typeof RetractionEventSchema>;

export const RubricChangeEventSchema = z.strictObject({
  event_type: z.literal("rubric_change"),
  from: nonEmptyString(),
  to: nonEmptyString(),
  annotator_id: nonEmptyString(),
  session_id: nonEmptyString(),
  ts: DateTimeSchema,
});

export type RubricChangeEvent = z.infer<typeof RubricChangeEventSchema>;

export const SessionEventSchema = z.discriminatedUnion("event_type", [
  SwipeEventSchema,
  RetractionEventSchema,
  RubricChangeEventSchema,
]);

export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type InternalEvent = SessionEvent;

export const SessionSnapshotSchema = z
  .strictObject({
    snapshot_version: z.literal(1),
    study_id: nonEmptyString(),
    deck_hash: nonEmptyString(),
    annotator_id: nonEmptyString(),
    session_id: nonEmptyString(),
    session_started_at: DateTimeSchema,
    current_pass: positiveInteger(),
    rubric_version: nonEmptyString(),
    qualification_reviewed: z.boolean(),
    events: z.array(SessionEventSchema),
    exported_event_count: nonNegativeInteger(),
    last_timestamp_ms: nonNegativeInteger(),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.exported_event_count > snapshot.events.length) {
      context.addIssue({
        code: "custom",
        path: ["exported_event_count"],
        message: "cannot exceed the number of session events.",
      });
    }
  });

export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;
export type Session = SessionSnapshot;

const adjudicationDecisionShape = {
  relation_id: preservedNonEmptyString(),
  label: LabelSchema,
  rationale: preservedNonEmptyString(),
};

export const AdjudicationDecisionSchema = z.strictObject(
  adjudicationDecisionShape,
);

export type AdjudicationDecision = z.infer<typeof AdjudicationDecisionSchema>;

export const AdjudicationRecordSchema = z.strictObject({
  schema_version: z.literal(ADJUDICATION_SCHEMA_VERSION),
  record_type: z.literal("adjudication"),
  study_id: nonEmptyString(),
  deck_hash: nonEmptyString(),
  card_hash: nonEmptyString(),
  adjudicator_id: nonEmptyString(),
  ts: DateTimeSchema,
  ...adjudicationDecisionShape,
});

export type AdjudicationRecord = z.infer<typeof AdjudicationRecordSchema>;
export type CreatedAdjudicationRecord = AdjudicationRecord;

export const ImportedAdjudicationRecordSchema = z.looseObject(
  adjudicationDecisionShape,
);

export type ImportedAdjudicationRecord = z.infer<
  typeof ImportedAdjudicationRecordSchema
>;

export const StoredAdjudicationRecordSchema = z.looseObject({
  ...adjudicationDecisionShape,
  ts: DateTimeSchema,
});

export type StoredAdjudicationRecord = z.infer<
  typeof StoredAdjudicationRecordSchema
>;

export const StudyEmbeddedPayloadSchema = z.strictObject({
  kind: z.literal("study"),
  study: StudySchema,
});

export type StudyEmbeddedPayload = z.infer<typeof StudyEmbeddedPayloadSchema>;

export const GenericEmbeddedPayloadSchema = z.strictObject({
  kind: z.literal("generic"),
  schema_version: z.literal(SCHEMA_VERSION).optional(),
  build_hash: nonEmptyString().optional(),
  demo_study: StudySchema,
  demo_code: nonEmptyString(),
});

export type GenericEmbeddedPayload = z.infer<
  typeof GenericEmbeddedPayloadSchema
>;

export const ErrorEmbeddedPayloadSchema = z.strictObject({
  kind: z.literal("error"),
  message: nonEmptyString(),
});

export type ErrorEmbeddedPayload = z.infer<typeof ErrorEmbeddedPayloadSchema>;

export const EmbeddedPayloadSchema = z.discriminatedUnion("kind", [
  StudyEmbeddedPayloadSchema,
  GenericEmbeddedPayloadSchema,
  ErrorEmbeddedPayloadSchema,
]);

export type EmbeddedPayload = z.infer<typeof EmbeddedPayloadSchema>;

const formatContractPath = (path: readonly PropertyKey[]): string =>
  path
    .map((segment, segmentIndex) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }
      const renderedSegment = String(segment);
      if (segmentIndex === 0) {
        return JSON.stringify(renderedSegment);
      }
      return /^[A-Za-z_$][\w$]*$/u.test(renderedSegment)
        ? `.${renderedSegment}`
        : `[${JSON.stringify(renderedSegment)}]`;
    })
    .join("");

const asSentence = (message: string): string =>
  /[.!?]$/u.test(message) ? message : `${message}.`;

export const formatZodIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const message = asSentence(issue.message);
    const path = formatContractPath(issue.path);
    return path === "" ? message : `${path}: ${message}`;
  });

export const parseStudy = (value: unknown): Study => StudySchema.parse(value);

export const safeParseStudy = (value: unknown) => StudySchema.safeParse(value);

export const parseStudyManifest = (value: unknown): StudyManifest =>
  StudyManifestSchema.parse(value);

export const safeParseStudyManifest = (value: unknown) =>
  StudyManifestSchema.safeParse(value);

export const parseStudyEmbeddedPayload = (
  value: unknown,
): StudyEmbeddedPayload => StudyEmbeddedPayloadSchema.parse(value);

export const safeParseStudyEmbeddedPayload = (value: unknown) =>
  StudyEmbeddedPayloadSchema.safeParse(value);

export const parseGenericEmbeddedPayload = (
  value: unknown,
): GenericEmbeddedPayload => GenericEmbeddedPayloadSchema.parse(value);

export const safeParseGenericEmbeddedPayload = (value: unknown) =>
  GenericEmbeddedPayloadSchema.safeParse(value);

export const parseErrorEmbeddedPayload = (
  value: unknown,
): ErrorEmbeddedPayload => ErrorEmbeddedPayloadSchema.parse(value);

export const safeParseErrorEmbeddedPayload = (value: unknown) =>
  ErrorEmbeddedPayloadSchema.safeParse(value);

export const parseEmbeddedPayload = (value: unknown): EmbeddedPayload =>
  EmbeddedPayloadSchema.parse(value);

export const safeParseEmbeddedPayload = (value: unknown) =>
  EmbeddedPayloadSchema.safeParse(value);

export const parseSessionSnapshot = (value: unknown): SessionSnapshot =>
  SessionSnapshotSchema.parse(value);

export const safeParseSessionSnapshot = (value: unknown) =>
  SessionSnapshotSchema.safeParse(value);
