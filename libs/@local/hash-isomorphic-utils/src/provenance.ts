import type { SourceProvenance } from "@blockprotocol/type-system";

import { generateUuid } from "./generate-uuid.js";

/**
 * Deduplicate a list of sources, merging values as appropriate (see inline comments).
 */
export const deduplicateSources = (
  sources: SourceProvenance[],
): SourceProvenance[] => {
  const sourcesByIdentifier = new Map<string, SourceProvenance>();

  for (const source of sources) {
    const sourceKey = source.location?.uri ?? source.location?.name;

    if (!sourceKey) {
      /**
       * The source has nothing to usefully identify it by.
       * This shouldn't happen, but we'll preserve it in case it has for some reason.
       */
      sourcesByIdentifier.set(generateUuid(), source);
      continue;
    }

    const existingSource = sourcesByIdentifier.get(sourceKey);

    if (!existingSource) {
      sourcesByIdentifier.set(sourceKey, source);
      continue;
    }

    if (
      existingSource.entityId &&
      source.entityId &&
      existingSource.entityId !== source.entityId
    ) {
      /**
       * The sources have different entityIds – we'll keep both.
       * The merging should happen at the entity level, elsewhere, if these are indeed the same source.
       */
      sourcesByIdentifier.set(sourceKey, source);
      continue;
    }

    if (existingSource.type !== source.type) {
      /**
       * The sources have different types for some reason, even though they have the same id – we'll keep both.
       */
      sourcesByIdentifier.set(sourceKey, source);
      continue;
    }

    const clonedSource = JSON.parse(
      JSON.stringify(existingSource),
    ) as typeof existingSource;

    if (source.entityId) {
      clonedSource.entityId = source.entityId;
    }

    clonedSource.authors =
      (existingSource.authors ?? source.authors)
        ? [
            ...new Set([
              ...(existingSource.authors ?? []),
              ...(source.authors ?? []),
            ]),
          ]
        : undefined;

    /**
     * In practice we know that location is defined, because the sourceKey is defined and derived from location,
     * but we might as well be explicit in case the sourceKey logic above changes.
     */
    clonedSource.location ??= {};

    /**
     * These values may be undefined or empty strings.
     * Set them if they're falsy in the first encountered source.
     */
    clonedSource.location.uri ??= source.location?.uri;
    clonedSource.location.name ??= source.location?.name;
    clonedSource.firstPublished ??= source.firstPublished;

    if (!clonedSource.lastUpdated) {
      clonedSource.lastUpdated = source.lastUpdated;
    } else if (
      source.lastUpdated &&
      /** lastUpdated is an ISO String */
      source.lastUpdated > clonedSource.lastUpdated
    ) {
      clonedSource.lastUpdated = source.lastUpdated;
    }

    if (!clonedSource.loadedAt) {
      clonedSource.loadedAt = source.loadedAt;
    } else if (
      source.loadedAt &&
      /** loadedAt is an ISO String */
      source.loadedAt > clonedSource.loadedAt
    ) {
      clonedSource.loadedAt = source.loadedAt;
    }

    sourcesByIdentifier.set(sourceKey, clonedSource);
  }

  return Array.from(sourcesByIdentifier.values());
};
