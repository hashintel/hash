import {
  agreementStatistics,
  latestVotesByAnnotator,
  relationSummaries,
  summarizeCoverage,
} from "../../core.ts";

import type {
  AppState,
  EmbeddedPayload,
  ImportedSwipeRecord,
  MergeStudy,
} from "./model.ts";

export const activeStudy = (
  state: AppState,
  embeddedPayload: EmbeddedPayload,
) =>
  state.study ??
  (embeddedPayload.kind === "generic" ? embeddedPayload.demo_study : null);

export const deduplicatedMergedSwipes = (
  state: AppState,
): ImportedSwipeRecord[] => {
  const swipesById = new Map<string, ImportedSwipeRecord>();
  for (const swipes of state.merge.sources.values()) {
    for (const swipe of swipes) {
      const swipeId =
        swipe.swipe_id ??
        [
          swipe.study_id,
          swipe.annotator_id,
          swipe.relation_id,
          swipe.pass,
          swipe.ts,
        ].join(":");
      const existingSwipe = swipesById.get(swipeId);
      if (!existingSwipe || (!existingSwipe.retracted && swipe.retracted)) {
        swipesById.set(swipeId, swipe);
      }
    }
  }
  return [...swipesById.values()];
};

const mergeStudy = (
  state: AppState,
  embeddedPayload: EmbeddedPayload,
  swipes: readonly ImportedSwipeRecord[],
): MergeStudy | null => {
  const studyIds = new Set(
    swipes.map((swipe) => swipe.study_id).filter(Boolean),
  );
  const candidate = activeStudy(state, embeddedPayload);
  if (candidate && (studyIds.size === 0 || studyIds.has(candidate.study_id))) {
    return candidate;
  }
  const importedManifest = state.merge.manifest;
  if (
    importedManifest?.manifest &&
    (studyIds.size === 0 || studyIds.has(importedManifest.study_id))
  ) {
    return {
      ...importedManifest,
      cards: importedManifest.cards ?? [],
    };
  }
  return null;
};

export const computeMerge = (
  state: AppState,
  embeddedPayload: EmbeddedPayload,
) => {
  const swipes = deduplicatedMergedSwipes(state);
  const latest = latestVotesByAnnotator(swipes);
  const study = mergeStudy(state, embeddedPayload, swipes);
  const cards = study && "kind" in study ? study.cards : [];
  const summaries = relationSummaries(latest, cards).filter(
    (summary) => summary.labels.length > 0,
  );
  const agreement = agreementStatistics(swipes);
  const studyIds = [
    ...new Set(swipes.map((swipe) => swipe.study_id).filter(Boolean)),
  ];
  const deckHashes = [
    ...new Set(swipes.map((swipe) => swipe.deck_hash).filter(Boolean)),
  ];
  const rubricVersions = [
    ...new Set(swipes.map((swipe) => swipe.rubric_version).filter(Boolean)),
  ];
  const coverageStudy = study
    ? "kind" in study
      ? study
      : {
          ...study,
          kind: "study" as const,
          cards: study.cards.map((card) => ({ ...card, card_text: "" })),
          qualification_cards: [],
          access: [],
        }
    : null;
  const coverage = coverageStudy
    ? summarizeCoverage(coverageStudy, swipes)
    : null;

  return {
    swipes,
    latest,
    study,
    summaries,
    agreement,
    studyIds,
    deckHashes,
    rubricVersions,
    coverage,
  };
};

export type MergeComputation = ReturnType<typeof computeMerge>;

export const mergeWarnings = (
  state: AppState,
  embeddedPayload: EmbeddedPayload,
  merge: MergeComputation,
): string[] => {
  const warnings: string[] = [];
  const verificationSource =
    embeddedPayload.kind === "study" ? state.study : state.merge.manifest;

  if (merge.studyIds.length > 1) {
    warnings.push(
      `Exports contain ${merge.studyIds.length} different study IDs.`,
    );
  }
  if (merge.deckHashes.length > 1) {
    warnings.push(
      `Exports contain ${merge.deckHashes.length} different deck hashes.`,
    );
  }
  if (merge.rubricVersions.length > 1) {
    warnings.push(
      `Evidence spans rubric versions: ${merge.rubricVersions.join(", ")}.`,
    );
  }
  if (
    verificationSource?.study_id &&
    merge.studyIds.some((studyId) => studyId !== verificationSource.study_id)
  ) {
    warnings.push(
      `At least one export does not match verification study ${verificationSource.study_id}.`,
    );
  }
  if (
    verificationSource?.deck_hash &&
    merge.deckHashes.some(
      (deckHash) => deckHash !== verificationSource.deck_hash,
    )
  ) {
    warnings.push(
      "At least one export does not match the verification deck hash.",
    );
  }

  const expectedHashes = new Map(
    (merge.study?.cards ?? []).map((card) => [
      card.relation_id,
      card.card_hash,
    ]),
  );
  if (expectedHashes.size > 0) {
    const unknownRelations = new Set<string>();
    const mismatchedRelations = new Set<string>();
    for (const swipe of merge.swipes) {
      const expectedHash = expectedHashes.get(swipe.relation_id);
      if (!expectedHash) {
        unknownRelations.add(swipe.relation_id);
      } else if (expectedHash !== swipe.card_hash) {
        mismatchedRelations.add(swipe.relation_id);
      }
    }
    if (unknownRelations.size > 0) {
      warnings.push(
        `${unknownRelations.size} relation IDs are absent from the matching manifest.`,
      );
    }
    if (mismatchedRelations.size > 0) {
      warnings.push(
        `${mismatchedRelations.size} relations have card hashes that differ from the matching manifest.`,
      );
    }
  }

  const filesByAnnotator = new Map<string, Set<string>>();
  for (const [filename, swipes] of state.merge.sources) {
    for (const annotatorId of new Set(
      swipes.map((swipe) => swipe.annotator_id),
    )) {
      const filenames = filesByAnnotator.get(annotatorId) ?? new Set<string>();
      filenames.add(filename);
      filesByAnnotator.set(annotatorId, filenames);
    }
  }
  for (const [annotatorId, filenames] of filesByAnnotator) {
    if (filenames.size > 1) {
      warnings.push(
        `${annotatorId} appears in ${filenames.size} files; duplicate swipe IDs were collapsed.`,
      );
    }
  }

  return [state.merge.warning, ...warnings].filter(Boolean);
};
