import {
  type Card,
  type EmbeddedPayload,
  type GenericEmbeddedPayload,
  type Label,
  LabelSchema,
  type QualificationCard,
  type SessionSnapshot,
  SaltValidationError,
  type Study,
  type StudyManifest,
  type StoredAdjudicationRecord,
  StoredAdjudicationRecordSchema,
  createStudy,
  createSwipeEvent,
  formatZodIssues,
  safeParseEmbeddedPayload,
  SessionSnapshotSchema,
} from "../../core.ts";

import type { QualificationDraft, StudyPlan } from "../../study-planning.ts";

export type { EmbeddedPayload, GenericEmbeddedPayload, SessionSnapshot };

export type AppMode =
  | "home"
  | "access"
  | "resume"
  | "builder"
  | "merge"
  | "resolve"
  | "workspace";

export type WorkspaceTab = "adjudicate" | "progress" | "merge" | "resolve";
export type BuilderFileKind = "cards";
export type MergeFileKind = "swipes" | "manifest" | "adjudications";
export type DropKind = BuilderFileKind | MergeFileKind;
export type BuilderStep =
  | "import"
  | "qualification"
  | "planning"
  | "review"
  | "result";
export type VerificationManifest = StudyManifest;
export type StudyBuildResult = ReturnType<typeof createStudy>;
export type SwipeEvent = ReturnType<typeof createSwipeEvent>;
export type ImportedSwipeRecord = ReturnType<
  typeof import("../../core.ts").parseSwipesJsonl
>[number];
export type MergeStudy = Study | VerificationManifest;
export type { StoredAdjudicationRecord };

export type RetractionEvent = ReturnType<
  typeof import("../../core.ts").createRetractionEvent
>;

export interface BuilderState {
  cards: Card[] | null;
  cardsName: string;
  qualificationDrafts: QualificationDraft[];
  selectedRelationId: string | null;
  step: BuilderStep;
  plan: StudyPlan | null;
  result: StudyBuildResult | null;
  error: unknown | null;
}

export interface MergeState {
  sources: Map<string, ImportedSwipeRecord[]>;
  manifest: VerificationManifest | null;
  manifestName: string;
  adjudications: StoredAdjudicationRecord[];
  error: unknown | null;
  warning: string;
}

export interface QualificationSwipeContext {
  phase: "qualification";
  pass: 0;
  card: QualificationCard;
  remaining: QualificationCard[];
  total: number;
  completed: number;
}

export interface QualificationReviewContext {
  phase: "qualification-review";
  card: null;
  remaining: [];
  total: number;
  completed: number;
}

export interface ProductionSwipeContext {
  phase: "production";
  pass: number;
  card: Card | null;
  remaining: Card[];
  total: number;
  completed: number;
}

export type SwipeContext =
  | QualificationSwipeContext
  | QualificationReviewContext
  | ProductionSwipeContext;

export type SwipeTransition =
  | {
      phase: "qualification";
      pass: 0;
      card: QualificationCard;
      label: Label;
    }
  | {
      phase: "production";
      pass: number;
      card: Card;
      label: Label;
    };

export interface AppState {
  mode: AppMode;
  activeTab: WorkspaceTab;
  study: Study | null;
  annotatorId: string | null;
  repository: SessionRepository | null;
  snapshot: SessionSnapshot | null;
  resumeCandidate: SessionSnapshot | null;
  accessError: string;
  fatalError: string;
  restartConfirmation: boolean;
  flagged: boolean;
  noteOpen: boolean;
  noteDraft: string;
  transition: SwipeTransition | null;
  storageError: string;
  rubricOpen: boolean;
  guideOpen: boolean;
  builder: BuilderState;
  merge: MergeState;
  adjudicationError: string;
  lastAdjudicationTimestampMs: number;
}

export const isLabel = (value: unknown): value is Label =>
  LabelSchema.safeParse(value).success;

export const isStoredAdjudicationRecord = (
  value: unknown,
): value is StoredAdjudicationRecord =>
  StoredAdjudicationRecordSchema.safeParse(value).success;

export const parseEmbeddedPayload = (
  serializedPayload: string | null,
): EmbeddedPayload => {
  try {
    const parsed: unknown = JSON.parse(serializedPayload ?? "null");
    const result = safeParseEmbeddedPayload(parsed);
    if (result.success) {
      return result.data;
    }
    return {
      kind: "error",
      message: `The embedded study payload has an unsupported shape: ${formatZodIssues(
        result.error,
      ).join(" ")}`,
    };
  } catch (error) {
    return {
      kind: "error",
      message: `The embedded study payload is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
};

export class SessionRepository {
  readonly key: string;

  constructor(study: Study, annotatorId: string) {
    this.key = `salt:session:${study.study_id}:${study.deck_hash}:${annotatorId}`;
    const probeKey = `${this.key}:probe`;
    localStorage.setItem(probeKey, "ok");
    localStorage.removeItem(probeKey);
  }

  load(): SessionSnapshot | null {
    const serialized = localStorage.getItem(this.key);
    if (!serialized) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      throw new SaltValidationError(
        "The saved session contains invalid JSON.",
        [error instanceof Error ? error.message : String(error)],
      );
    }
    const result = SessionSnapshotSchema.safeParse(parsed);
    if (!result.success) {
      throw new SaltValidationError(
        "The saved session does not match the SALT session contract.",
        formatZodIssues(result.error),
      );
    }
    return result.data;
  }

  save(snapshot: SessionSnapshot): void {
    localStorage.setItem(this.key, JSON.stringify(snapshot));
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }
}

export const createSessionSnapshot = (
  study: Study,
  annotatorId: string,
): SessionSnapshot => ({
  snapshot_version: 1,
  study_id: study.study_id,
  deck_hash: study.deck_hash,
  annotator_id: annotatorId,
  session_id: `${study.study_id}:${annotatorId}:${Date.now().toString(36)}`,
  session_started_at: new Date().toISOString(),
  current_pass: 1,
  rubric_version: study.rubric_version,
  qualification_reviewed: study.qualification_cards.length === 0,
  events: [],
  exported_event_count: 0,
  last_timestamp_ms: 0,
});

export const createInitialState = (
  embeddedPayload: EmbeddedPayload,
): AppState => ({
  mode: embeddedPayload.kind === "study" ? "access" : "home",
  activeTab: "adjudicate",
  study: embeddedPayload.kind === "study" ? embeddedPayload.study : null,
  annotatorId: null,
  repository: null,
  snapshot: null,
  resumeCandidate: null,
  accessError: "",
  fatalError: embeddedPayload.kind === "error" ? embeddedPayload.message : "",
  restartConfirmation: false,
  flagged: false,
  noteOpen: false,
  noteDraft: "",
  transition: null,
  storageError: "",
  rubricOpen: false,
  guideOpen: false,
  builder: {
    cards: null,
    cardsName: "",
    qualificationDrafts: [],
    selectedRelationId: null,
    step: "import",
    plan: null,
    result: null,
    error: null,
  },
  merge: {
    sources: new Map(),
    manifest: null,
    manifestName: "",
    adjudications: [],
    error: null,
    warning: "",
  },
  adjudicationError: "",
  lastAdjudicationTimestampMs: 0,
});

export const requireStateValue = <Value>(
  value: Value | null,
  description: string,
): Value => {
  if (value === null) {
    throw new Error(`SALT state is missing ${description}.`);
  }
  return value;
};
