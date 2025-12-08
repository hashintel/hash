/**
 * Workflow Step: Deduplicate Entities
 *
 * This step takes all extracted entities and merges duplicates.
 * It uses simple name-based matching (case-insensitive, normalized).
 *
 * The key insight from the planning phase: LLMs are better at extraction
 * than remembering what NOT to extract. So we extract freely in previous
 * steps and deduplicate here as a separate concern.
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { LocalEntitySummarySchema } from "../../types/entities.js";
import type { LocalEntitySummary } from "../../types/entities.js";

/**
 * Input schema for deduplication step
 */
export const DeduplicateEntitiesInputSchema = z.object({
  /** All entities extracted from previous steps (may contain duplicates) */
  allEntities: z.array(LocalEntitySummarySchema),
});

export type DeduplicateEntitiesInput = z.infer<
  typeof DeduplicateEntitiesInputSchema
>;

/**
 * Merged entity with source tracking
 */
export const MergedEntitySchema = LocalEntitySummarySchema.extend({
  /** Original local IDs that were merged into this entity */
  mergedFromIds: z.array(z.string()),
  /** Number of times this entity was mentioned */
  mentionCount: z.number(),
});

export type MergedEntity = z.infer<typeof MergedEntitySchema>;

/**
 * Output schema for deduplication step
 */
export const DeduplicateEntitiesOutputSchema = z.object({
  /** Unique entities after deduplication */
  uniqueEntities: z.array(MergedEntitySchema),

  /** Count of unique entities */
  uniqueCount: z.number(),

  /** Count of original entities before deduplication */
  originalCount: z.number(),

  /** Count of duplicates that were merged */
  duplicatesMerged: z.number(),
});

export type DeduplicateEntitiesOutput = z.infer<
  typeof DeduplicateEntitiesOutputSchema
>;

/**
 * Normalize entity name for comparison
 *
 * Handles:
 * - Case differences ("OpenAI" vs "openai")
 * - Extra whitespace
 * - Common variations (Inc., Corp., LLC, etc.)
 */
const normalizeName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/,?\s*(inc\.?|corp\.?|llc|ltd\.?|co\.?)$/i, "") // Remove common suffixes
    .replace(/[^\w\s]/g, ""); // Remove punctuation
};

/**
 * Calculate similarity between two normalized names
 * Returns a score from 0 to 1 (1 = exact match)
 */
const calculateSimilarity = (name1: string, name2: string): number => {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);

  // Exact match after normalization
  if (norm1 === norm2) return 1;

  // One contains the other (e.g., "Microsoft" vs "Microsoft Corporation")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;

  // Check word overlap
  const words1 = new Set(norm1.split(" ").filter((w) => w.length > 2));
  const words2 = new Set(norm2.split(" ").filter((w) => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  // Jaccard similarity
  return intersection.size / union.size;
};

/**
 * Merge multiple entities into one
 * Takes the best summary (longest) and combines entity type IDs
 */
const mergeEntities = (entities: LocalEntitySummary[]): MergedEntity => {
  // Use the name from the first entity (could also pick the most common)
  const canonicalName = entities[0]!.name;

  // Use the longest summary (likely most informative)
  const bestSummary = entities.reduce(
    (best, entity) =>
      entity.summary.length > best.length ? entity.summary : best,
    "",
  );

  // Combine all entity type IDs (deduplicated)
  const allTypeIds = new Set(entities.flatMap((e) => e.entityTypeIds));

  // Track merged IDs
  const mergedFromIds = entities.map((e) => e.localId);

  return {
    localId: entities[0]!.localId, // Keep the first local ID as canonical
    name: canonicalName,
    summary: bestSummary,
    entityTypeIds: [...allTypeIds],
    mergedFromIds,
    mentionCount: entities.length,
  };
};

/**
 * Group entities by similarity
 * Returns groups where each group should be merged into one entity
 */
const groupBySimilarity = (
  entities: LocalEntitySummary[],
  threshold = 0.8,
): LocalEntitySummary[][] => {
  const groups: LocalEntitySummary[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < entities.length; i++) {
    if (assigned.has(i)) continue;

    const group: LocalEntitySummary[] = [entities[i]!];
    assigned.add(i);

    for (let j = i + 1; j < entities.length; j++) {
      if (assigned.has(j)) continue;

      const similarity = calculateSimilarity(
        entities[i]!.name,
        entities[j]!.name,
      );

      if (similarity >= threshold) {
        group.push(entities[j]!);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
};

/**
 * Deduplicate Entities Step
 *
 * Takes all extracted entities and merges duplicates based on name similarity.
 * This is a deterministic step (no LLM inference).
 *
 * Input: Array of all extracted entities
 * Output: Array of unique entities with merge tracking
 */
export const deduplicateEntitiesStep = createStep({
  id: "deduplicate-entities",
  description:
    "Merge duplicate entities based on name similarity (deterministic, no LLM)",
  inputSchema: DeduplicateEntitiesInputSchema,
  outputSchema: DeduplicateEntitiesOutputSchema,
  execute: async ({ inputData }) => {
    const { allEntities } = inputData;
    const originalCount = allEntities.length;

    if (originalCount === 0) {
      return {
        uniqueEntities: [],
        uniqueCount: 0,
        originalCount: 0,
        duplicatesMerged: 0,
      };
    }

    // Group similar entities
    const groups = groupBySimilarity(allEntities);

    // Merge each group
    const uniqueEntities = groups.map(mergeEntities);

    return {
      uniqueEntities,
      uniqueCount: uniqueEntities.length,
      originalCount,
      duplicatesMerged: originalCount - uniqueEntities.length,
    };
  },
});

/**
 * Create a local ID to merged ID mapping
 * Useful for remapping claims to point to canonical entities
 */
export const createIdRemapping = (
  mergedEntities: MergedEntity[],
): Record<string, string> => {
  const mapping: Record<string, string> = {};

  for (const entity of mergedEntities) {
    for (const oldId of entity.mergedFromIds) {
      mapping[oldId] = entity.localId;
    }
  }

  return mapping;
};
