import {
  SaltValidationError,
  deriveSeed,
  formatZodIssues,
  sha256Hex,
  shuffled,
  stableStringify,
} from "./core.ts";
import {
  type Card,
  type Label,
  type PlanningMode,
  type Prescreen,
  type QualificationCard,
  QualificationCardSchema,
  type StudySampling,
  StudySamplingSchema,
} from "./data-contracts.ts";

export const DEFAULT_COVERAGE_TARGET = 3;
export const MINIMUM_COVERAGE_TARGET = 2;
export const DEFAULT_SECONDS_PER_CARD = 10;
export const RECOMMENDED_QUALIFICATION_SIZE = 20;

interface CommonPlanInput {
  annotatorCount: number;
  eligiblePoolSize: number;
  qualificationSize: number;
  secondsPerCard?: number;
}

export interface BudgetFirstPlanInput extends CommonPlanInput {
  mode: "budget-first";
  productionCardsPerAnnotator: number;
  coverageTarget: number;
}

export interface SampleFirstPlanInput extends CommonPlanInput {
  mode: "sample-first";
  productionCardsPerAnnotator: number;
  sampleSize: number;
}

export interface CoverageFirstPlanInput extends CommonPlanInput {
  mode: "coverage-first";
  sampleSize: number;
  coverageTarget: number;
}

export type StudyPlanInput =
  | BudgetFirstPlanInput
  | SampleFirstPlanInput
  | CoverageFirstPlanInput;

export interface StudyPlan {
  mode: PlanningMode;
  annotatorCount: number;
  eligiblePoolSize: number;
  qualificationSize: number;
  productionCardsPerAnnotator: number;
  sampleSize: number;
  coverageTarget: number;
  assignmentCapacity: number;
  usedAssignmentSlots: number;
  spareCapacity: number;
  minimumProductionLoad: number;
  maximumProductionLoad: number;
  secondsPerCard: number;
  qualificationSeconds: number;
  minimumProductionSeconds: number;
  maximumProductionSeconds: number;
  minimumTotalSeconds: number;
  maximumTotalSeconds: number;
  warnings: string[];
}

export interface QualificationDraft {
  relationId: string;
  answer: Label;
  rationale: string;
}

export interface QualificationPartition {
  eligibleCards: Card[];
  qualificationCards: QualificationCard[];
}

export interface PreparedStudySelection extends QualificationPartition {
  productionCards: Card[];
  sampling: StudySampling;
}

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new SaltValidationError(`${label} must be a positive integer.`);
  }
};

const assertNonNegativeInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new SaltValidationError(`${label} must be a non-negative integer.`);
  }
};

const validateCoverage = (
  coverageTarget: number,
  annotatorCount: number,
): void => {
  assertPositiveInteger(coverageTarget, "Coverage");
  if (coverageTarget < MINIMUM_COVERAGE_TARGET) {
    throw new SaltValidationError(
      `Coverage must be at least ${MINIMUM_COVERAGE_TARGET}× so every production card receives independent review.`,
    );
  }
  if (coverageTarget > annotatorCount) {
    throw new SaltValidationError(
      `Coverage ${coverageTarget}× requires at least ${coverageTarget} annotators.`,
    );
  }
};

const planWarnings = (coverageTarget: number): string[] =>
  coverageTarget === MINIMUM_COVERAGE_TARGET
    ? [
        "Two reviews detect disagreement but cannot produce a majority. Three-fold coverage is recommended.",
      ]
    : [];

export const planStudy = (input: StudyPlanInput): StudyPlan => {
  assertPositiveInteger(input.annotatorCount, "Annotator count");
  assertPositiveInteger(input.eligiblePoolSize, "Eligible pool size");
  assertNonNegativeInteger(input.qualificationSize, "Qualification size");
  const secondsPerCard = input.secondsPerCard ?? DEFAULT_SECONDS_PER_CARD;
  assertPositiveInteger(secondsPerCard, "Seconds per card");

  let productionCardsPerAnnotator: number;
  let sampleSize: number;
  let coverageTarget: number;

  if (input.mode === "budget-first") {
    assertPositiveInteger(
      input.productionCardsPerAnnotator,
      "Production cards per annotator",
    );
    validateCoverage(input.coverageTarget, input.annotatorCount);
    productionCardsPerAnnotator = input.productionCardsPerAnnotator;
    coverageTarget = input.coverageTarget;
    sampleSize = Math.min(
      input.eligiblePoolSize,
      Math.floor(
        (input.annotatorCount * productionCardsPerAnnotator) / coverageTarget,
      ),
    );
  } else if (input.mode === "sample-first") {
    assertPositiveInteger(
      input.productionCardsPerAnnotator,
      "Production cards per annotator",
    );
    assertPositiveInteger(input.sampleSize, "Production sample size");
    if (input.sampleSize > input.eligiblePoolSize) {
      throw new SaltValidationError(
        `The requested sample of ${input.sampleSize} cards exceeds the ${input.eligiblePoolSize} eligible production cards.`,
      );
    }
    productionCardsPerAnnotator = input.productionCardsPerAnnotator;
    sampleSize = input.sampleSize;
    coverageTarget = Math.min(
      input.annotatorCount,
      Math.floor(
        (input.annotatorCount * productionCardsPerAnnotator) / sampleSize,
      ),
    );
    validateCoverage(coverageTarget, input.annotatorCount);
  } else {
    assertPositiveInteger(input.sampleSize, "Production sample size");
    if (input.sampleSize > input.eligiblePoolSize) {
      throw new SaltValidationError(
        `The requested sample of ${input.sampleSize} cards exceeds the ${input.eligiblePoolSize} eligible production cards.`,
      );
    }
    validateCoverage(input.coverageTarget, input.annotatorCount);
    sampleSize = input.sampleSize;
    coverageTarget = input.coverageTarget;
    productionCardsPerAnnotator = Math.ceil(
      (sampleSize * coverageTarget) / input.annotatorCount,
    );
  }

  if (sampleSize < 1) {
    throw new SaltValidationError(
      "The configured annotator budget cannot cover one production card.",
    );
  }

  const usedAssignmentSlots = sampleSize * coverageTarget;
  const assignmentCapacity = input.annotatorCount * productionCardsPerAnnotator;
  const minimumProductionLoad = Math.floor(
    usedAssignmentSlots / input.annotatorCount,
  );
  const maximumProductionLoad = Math.ceil(
    usedAssignmentSlots / input.annotatorCount,
  );
  const qualificationSeconds = input.qualificationSize * secondsPerCard;
  const minimumProductionSeconds = minimumProductionLoad * secondsPerCard;
  const maximumProductionSeconds = maximumProductionLoad * secondsPerCard;

  return {
    mode: input.mode,
    annotatorCount: input.annotatorCount,
    eligiblePoolSize: input.eligiblePoolSize,
    qualificationSize: input.qualificationSize,
    productionCardsPerAnnotator,
    sampleSize,
    coverageTarget,
    assignmentCapacity,
    usedAssignmentSlots,
    spareCapacity: assignmentCapacity - usedAssignmentSlots,
    minimumProductionLoad,
    maximumProductionLoad,
    secondsPerCard,
    qualificationSeconds,
    minimumProductionSeconds,
    maximumProductionSeconds,
    minimumTotalSeconds: qualificationSeconds + minimumProductionSeconds,
    maximumTotalSeconds: qualificationSeconds + maximumProductionSeconds,
    warnings: planWarnings(coverageTarget),
  };
};

const compareCards = (left: Card, right: Card): number =>
  left.relation_id.localeCompare(right.relation_id) ||
  left.card_hash.localeCompare(right.card_hash);

export const sampleProductionCards = (
  cards: readonly Card[],
  sampleSize: number,
  seed: unknown,
): Card[] => {
  assertPositiveInteger(sampleSize, "Production sample size");
  if (sampleSize > cards.length) {
    throw new SaltValidationError(
      `The requested sample of ${sampleSize} cards exceeds the ${cards.length} eligible production cards.`,
    );
  }

  const sortedCards = [...cards].sort(compareCards);
  const strata = (["equivalence", "normal"] as const).map((prescreen) => {
    const stratumCards = sortedCards.filter(
      (card) => card.prescreen === prescreen,
    );
    const exactQuota = (stratumCards.length * sampleSize) / cards.length;
    return {
      prescreen,
      cards: shuffled(
        stratumCards,
        deriveSeed(seed, "production-sample", prescreen),
      ),
      quota: Math.floor(exactQuota),
      remainder: exactQuota - Math.floor(exactQuota),
    };
  });

  let remaining =
    sampleSize - strata.reduce((total, stratum) => total + stratum.quota, 0);
  const quotaOrder = [...strata].sort(
    (left, right) =>
      right.remainder - left.remainder ||
      deriveSeed(seed, "production-sample-quota", left.prescreen) -
        deriveSeed(seed, "production-sample-quota", right.prescreen),
  );
  for (const stratum of quotaOrder) {
    if (remaining === 0) {
      break;
    }
    if (stratum.quota < stratum.cards.length) {
      stratum.quota += 1;
      remaining -= 1;
    }
  }

  const sampledCards = strata.flatMap((stratum) =>
    stratum.cards.slice(0, stratum.quota),
  );
  return shuffled(
    sampledCards,
    deriveSeed(seed, "production-sample", "combined"),
  );
};

export const partitionQualificationCards = (
  sourcePool: readonly Card[],
  drafts: readonly QualificationDraft[],
): QualificationPartition => {
  const draftsByRelationId = new Map<string, QualificationDraft>();
  for (const draft of drafts) {
    if (draftsByRelationId.has(draft.relationId)) {
      throw new SaltValidationError(
        `Qualification card ${draft.relationId} was selected more than once.`,
      );
    }
    draftsByRelationId.set(draft.relationId, draft);
  }

  const knownRelationIds = new Set(sourcePool.map((card) => card.relation_id));
  for (const draft of drafts) {
    if (!knownRelationIds.has(draft.relationId)) {
      throw new SaltValidationError(
        `Qualification card ${draft.relationId} is not present in the imported pool.`,
      );
    }
  }

  const qualificationCards: QualificationCard[] = [];
  const eligibleCards: Card[] = [];
  for (const card of sourcePool) {
    const draft = draftsByRelationId.get(card.relation_id);
    if (!draft) {
      eligibleCards.push(card);
      continue;
    }
    const result = QualificationCardSchema.safeParse({
      ...card,
      answer: draft.answer,
      rationale: draft.rationale,
    });
    if (!result.success) {
      throw new SaltValidationError(
        `Qualification card ${card.relation_id} is incomplete.`,
        formatZodIssues(result.error),
      );
    }
    qualificationCards.push(result.data);
  }

  return { eligibleCards, qualificationCards };
};

export const prepareStudySelection = ({
  sourcePool,
  qualificationDrafts,
  plan,
  seed,
}: {
  sourcePool: readonly Card[];
  qualificationDrafts: readonly QualificationDraft[];
  plan: StudyPlan;
  seed: unknown;
}): PreparedStudySelection => {
  const { eligibleCards, qualificationCards } = partitionQualificationCards(
    sourcePool,
    qualificationDrafts,
  );
  if (eligibleCards.length !== plan.eligiblePoolSize) {
    throw new SaltValidationError(
      "The production pool changed after the study plan was calculated.",
    );
  }
  if (qualificationCards.length !== plan.qualificationSize) {
    throw new SaltValidationError(
      "The qualification set changed after the study plan was calculated.",
    );
  }

  const normalizedSeed = String(seed).trim();
  if (normalizedSeed === "") {
    throw new SaltValidationError("A study seed is required.");
  }
  const productionCards = sampleProductionCards(
    eligibleCards,
    plan.sampleSize,
    normalizedSeed,
  );
  const normalizedSourcePool = [...sourcePool].sort(compareCards);
  const sampling = StudySamplingSchema.parse({
    strategy: "prescreen-stratified-v1",
    planner_mode: plan.mode,
    source_pool_hash: sha256Hex(stableStringify(normalizedSourcePool)!),
    source_pool_size: sourcePool.length,
    eligible_pool_size: eligibleCards.length,
    sample_size: productionCards.length,
    qualification_size: qualificationCards.length,
    annotator_count: plan.annotatorCount,
    production_cards_per_annotator: plan.productionCardsPerAnnotator,
    coverage_target: plan.coverageTarget,
    spare_capacity: plan.spareCapacity,
    seconds_per_card: plan.secondsPerCard,
    sampling_seed: normalizedSeed,
  });

  return {
    eligibleCards,
    qualificationCards,
    productionCards,
    sampling,
  };
};

export const countQualificationLabels = (
  drafts: readonly QualificationDraft[],
): Record<Label, number> => {
  const counts: Record<Label, number> = { C: 0, P: 0, O: 0, U: 0 };
  for (const draft of drafts) {
    counts[draft.answer] += 1;
  }
  return counts;
};

export const countCardsByPrescreen = (
  cards: readonly Card[],
): Record<Prescreen, number> => {
  const counts: Record<Prescreen, number> = {
    equivalence: 0,
    normal: 0,
  };
  for (const card of cards) {
    counts[card.prescreen] += 1;
  }
  return counts;
};
