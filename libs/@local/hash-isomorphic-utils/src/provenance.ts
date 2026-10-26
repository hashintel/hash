import { generateUuid } from "./generate-uuid.js";

import type { SourceProvenance } from "@blockprotocol/type-system";

const hasValue = (value: string | undefined): value is string =>
  value !== undefined && value !== "";

/**
 * Whether two sources which share a key should nevertheless be kept as separate sources.
 */
const shouldKeepSeparate = (
  existingSource: SourceProvenance,
  source: SourceProvenance,
): boolean => {
  if (
    hasValue(existingSource.entityId) &&
    hasValue(source.entityId) &&
    existingSource.entityId !== source.entityId
  ) {
    /**
     * The sources have different entityIds – we'll keep both.
     * The merging should happen at the entity level, elsewhere, if these are indeed the same source.
     */
    return true;
  }

  /**
   * If the sources have different types for some reason, even though they have the same id – we'll keep both.
   */
  return existingSource.type !== source.type;
};

const mergeAuthors = (
  existingAuthors: string[] | undefined,
  newAuthors: string[] | undefined,
): string[] | undefined => {
  if (existingAuthors === undefined && newAuthors === undefined) {
    return undefined;
  }

  return [...new Set([...(existingAuthors ?? []), ...(newAuthors ?? [])])];
};

/**
 * Pick the later of two ISO string timestamps, treating missing or empty values as absent.
 */
const laterTimestamp = <Timestamp extends string>(
  existing: Timestamp | undefined,
  incoming: Timestamp | undefined,
): Timestamp | undefined => {
  if (!hasValue(existing)) {
    return incoming;
  }

  if (hasValue(incoming) && incoming > existing) {
    return incoming;
  }

  return existing;
};

/**
 * Merge a source into an existing source which has the same key, returning a new source.
 */
const mergeSources = (
  existingSource: SourceProvenance,
  source: SourceProvenance,
): SourceProvenance => {
  const clonedSource = structuredClone(existingSource);

  if (hasValue(source.entityId)) {
    clonedSource.entityId = source.entityId;
  }

  clonedSource.authors = mergeAuthors(existingSource.authors, source.authors);

  /**
   * In practice we know that location is defined, because the sourceKey is defined and derived from location,
   * but we might as well be explicit in case the sourceKey logic above changes.
   */
  clonedSource.location ??= {};

  /**
   * These values may be undefined or empty strings.
   * Set them if they're nullish in the first encountered source.
   */
  clonedSource.location.uri ??= source.location?.uri;
  clonedSource.location.name ??= source.location?.name;
  clonedSource.firstPublished ??= source.firstPublished;

  /** lastUpdated and loadedAt are ISO Strings */
  clonedSource.lastUpdated = laterTimestamp(
    clonedSource.lastUpdated,
    source.lastUpdated,
  );
  clonedSource.loadedAt = laterTimestamp(
    clonedSource.loadedAt,
    source.loadedAt,
  );

  return clonedSource;
};

/**
 * Deduplicate a list of sources, merging values as appropriate (see inline comments).
 */
export const deduplicateSources = (
  sources: SourceProvenance[],
): SourceProvenance[] => {
  const sourcesByIdentifier = new Map<string, SourceProvenance>();

  for (const source of sources) {
    const sourceKey = source.location?.uri ?? source.location?.name;

    if (hasValue(sourceKey)) {
      const existingSource = sourcesByIdentifier.get(sourceKey);

      if (
        existingSource === undefined ||
        shouldKeepSeparate(existingSource, source)
      ) {
        sourcesByIdentifier.set(sourceKey, source);
      } else {
        sourcesByIdentifier.set(
          sourceKey,
          mergeSources(existingSource, source),
        );
      }
    } else {
      /**
       * The source has nothing to usefully identify it by.
       * This shouldn't happen, but we'll preserve it in case it has for some reason.
       */
      sourcesByIdentifier.set(generateUuid(), source);
    }
  }

  return [...sourcesByIdentifier.values()];
};
