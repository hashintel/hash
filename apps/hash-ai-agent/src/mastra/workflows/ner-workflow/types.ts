import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// Core Types for NER Pipeline
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Character span in the source text.
 * Used for provenance - linking extracted data back to source positions.
 */
export const zTextSpan = z.object({
  /** Character offset (0-based, inclusive) */
  start: z.number().int().nonnegative(),
  /** Character offset (0-based, exclusive) */
  end: z.number().int().nonnegative(),
});
export type TextSpan = z.infer<typeof zTextSpan>;

/**
 * Source metadata for provenance tracking.
 */
export const zSourceMetadata = z.object({
  /** Original URL or file path */
  uri: z.string().optional(),
  /** Human-readable name of the source */
  name: z.string().optional(),
  /** ISO timestamp when the source was retrieved */
  loadedAt: z.string().optional(),
});
export type SourceMetadata = z.infer<typeof zSourceMetadata>;

// ═══════════════════════════════════════════════════════════════════════════
// Workflow Input
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input to the NER workflow.
 */
export const zNERWorkflowInput = z.object({
  /** Pre-processed text content (plain text or markdown) */
  text: z.string(),
  /** Metadata about the source document */
  source: zSourceMetadata.optional(),
  /** Entity type IDs to extract (e.g., "https://hash.ai/@h/types/entity-type/person/v/1") */
  entityTypeIds: z.array(z.string()),
  /** Research goal - context for the LLM about what we're looking for */
  researchGoal: z.string(),
});
export type NERWorkflowInput = z.infer<typeof zNERWorkflowInput>;

// ═══════════════════════════════════════════════════════════════════════════
// Step 1: Entity Type Resolution
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A simplified property definition for LLM consumption.
 */
export const zSimplifiedPropertyType = z.object({
  /** Property key (simplified, e.g., "firstName" not the full URL) */
  key: z.string(),
  /** Human-readable title */
  title: z.string(),
  /** Description of what this property represents */
  description: z.string().optional(),
  /** Expected data type (string, number, boolean, etc.) */
  dataType: z.string(),
  /** Whether this property is required */
  required: z.boolean(),
  /** Whether this property can have multiple values */
  array: z.boolean(),
});
export type SimplifiedPropertyType = z.infer<typeof zSimplifiedPropertyType>;

/**
 * A dereferenced entity type with simplified property definitions.
 * This is what the LLM sees when extracting entities.
 */
export const zDereferencedEntityType = z.object({
  /** Full entity type ID (URL) */
  entityTypeId: z.string(),
  /** Human-readable title */
  title: z.string(),
  /** Description of this entity type */
  description: z.string().optional(),
  /** Simplified property definitions */
  properties: z.array(zSimplifiedPropertyType),
});
export type DereferencedEntityType = z.infer<typeof zDereferencedEntityType>;

// ═══════════════════════════════════════════════════════════════════════════
// Step 2: Entity Mention Extraction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A mention of an entity in the source text.
 * Multiple mentions may refer to the same underlying entity.
 */
export const zEntityMention = z.object({
  /** Unique ID for this mention */
  mentionId: z.string(),
  /** Entity name as it appears in the text */
  name: z.string(),
  /** Which entity type this matches */
  entityTypeId: z.string(),
  /** Where in the source text this mention appears */
  textSpan: zTextSpan,
  /** Brief contextual summary of this entity */
  summary: z.string().optional(),
});
export type EntityMention = z.infer<typeof zEntityMention>;

// ═══════════════════════════════════════════════════════════════════════════
// Step 3: Observation Extraction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An observation (fact) about an entity extracted from the text.
 */
export const zObservation = z.object({
  /** Unique ID for this observation */
  observationId: z.string(),
  /** Which entity mention this observation is about */
  subjectMentionId: z.string(),
  /** Optional: another entity involved in this observation */
  objectMentionId: z.string().optional(),
  /** The observation in natural language */
  text: z.string(),
  /** Where in the source text this observation comes from */
  textSpan: zTextSpan,
  /** Additional context phrases (e.g., "in 2020", "for $10M") */
  prepositionalPhrases: z.array(z.string()),
  /** Hint: which property this observation might fill */
  propertyHint: z.string().optional(),
});
export type Observation = z.infer<typeof zObservation>;

// ═══════════════════════════════════════════════════════════════════════════
// Step 4: Entity Deduplication
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A deduplicated entity - multiple mentions merged into one canonical entity.
 */
export const zDeduplicatedEntity = z.object({
  /** Canonical ID for this entity */
  localId: z.string(),
  /** Canonical name for this entity */
  canonicalName: z.string(),
  /** Which entity type this is */
  entityTypeId: z.string(),
  /** All mention IDs that refer to this entity */
  mentionIds: z.array(z.string()),
  /** All observation IDs about this entity */
  observationIds: z.array(z.string()),
});
export type DeduplicatedEntity = z.infer<typeof zDeduplicatedEntity>;

// ═══════════════════════════════════════════════════════════════════════════
// Step 5: Entity Proposal (Property Filling)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Provenance for a single property value.
 */
export const zPropertyProvenance = z.object({
  /** Sources that contributed to this property value */
  sources: z.array(
    z.object({
      /** Type of source */
      type: z.enum(["document", "webpage"]),
      /** Location information */
      location: z
        .object({
          name: z.string().optional(),
          uri: z.string().optional(),
        })
        .optional(),
      /** Character span in the source document */
      textSpan: zTextSpan.optional(),
      /** The observation ID that led to this property */
      observationId: z.string().optional(),
    }),
  ),
});
export type PropertyProvenance = z.infer<typeof zPropertyProvenance>;

/**
 * A proposed entity with filled properties.
 * This is the final output of the NER pipeline.
 */
export const zProposedEntity = z.object({
  /** Local ID for this entity (used within the workflow) */
  localEntityId: z.string(),
  /** Entity type IDs this entity conforms to */
  entityTypeIds: z.array(z.string()),
  /** The filled property values */
  properties: z.record(z.string(), z.unknown()),
  /** Provenance metadata for each property */
  propertyMetadata: z
    .object({
      value: z.record(z.string(), zPropertyProvenance),
    })
    .optional(),
  /** Which observation IDs were used to fill this entity */
  observationIds: z.array(z.string()),
});
export type ProposedEntity = z.infer<typeof zProposedEntity>;

// ═══════════════════════════════════════════════════════════════════════════
// Workflow Output
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Output from the NER workflow.
 */
export const zNERWorkflowOutput = z.object({
  /** Extracted entities with filled properties */
  entities: z.array(zProposedEntity),
  /** All observations extracted from the document */
  observations: z.array(zObservation),
  /** Processing statistics */
  stats: z.object({
    entitiesFound: z.number().int(),
    observationsExtracted: z.number().int(),
    entitiesAfterDedup: z.number().int(),
  }),
});
export type NERWorkflowOutput = z.infer<typeof zNERWorkflowOutput>;
