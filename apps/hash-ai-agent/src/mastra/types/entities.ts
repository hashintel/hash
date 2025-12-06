/**
 * Entity types for Mastra-based entity extraction
 *
 * Ported from hash-ai-worker-ts:
 * - /activities/flow-activities/shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.ts (LocalEntitySummary)
 * - /activities/flow-activities/shared/claims.ts (Claim)
 * - /libs/@local/hash-isomorphic-utils/src/flows/types.ts (ProposedEntity)
 */

import { z } from 'zod';

/**
 * Source provenance tracking for entity data
 */
export const SourceProvenanceSchema = z.object({
  location: z.object({
    uri: z.string().url(),
    name: z.string().optional(),
  }),
  loadedAt: z.string().datetime().optional(),
  /**
   * The MIME type of the source file/document
   */
  contentType: z.string().optional(),
});

export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;

/**
 * Local entity summary (Step 1: Named Entity Recognition)
 *
 * Represents an entity identified in text with:
 * - name: The entity name as it appears in text
 * - summary: Brief one-sentence description
 * - entityTypeIds: One or more entity type identifiers (versioned URLs)
 */
export const LocalEntitySummarySchema = z.object({
  localId: z.string(),
  name: z.string(),
  summary: z.string(),
  entityTypeIds: z.array(z.string()).min(1),
});

export type LocalEntitySummary = z.infer<typeof LocalEntitySummarySchema>;

/**
 * Claim (Step 2: Claim Extraction)
 *
 * Represents a fact/assertion about an entity:
 * - text: "Subject predicate object" form (e.g., "OpenAI released GPT-4")
 * - prepositionalPhrases: Additional context (e.g., ["in March 2023", "for research"])
 * - subjectEntityLocalId: The entity this claim is about
 * - objectEntityLocalId: Optional target entity (for relationships)
 */
export const ClaimSchema = z.object({
  claimId: z.string(),
  subjectEntityLocalId: z.string(),
  objectEntityLocalId: z.string().nullable().optional(),
  text: z.string(),
  prepositionalPhrases: z.array(z.string()),
  sources: z.array(SourceProvenanceSchema).optional(),
});

export type Claim = z.infer<typeof ClaimSchema>;

/**
 * Helper to format claim text with prepositional phrases
 */
export const claimTextualContent = (claim: Claim): string =>
  `${claim.text}${
    claim.prepositionalPhrases.length
      ? `– ${claim.prepositionalPhrases.join(', ')}`
      : ''
  }`;

/**
 * Property metadata for tracking provenance per property
 */
export const PropertyMetadataSchema = z.object({
  value: z.record(
    z.object({
      metadata: z.object({
        dataTypeId: z.string().nullable().optional(),
        provenance: z.object({
          sources: z.array(SourceProvenanceSchema),
        }).optional(),
      }),
    })
  ),
});

export type PropertyMetadata = z.infer<typeof PropertyMetadataSchema>;

/**
 * Local or existing entity ID reference
 * Used for link entities (source/target)
 */
export const LocalOrExistingEntityIdSchema = z.union([
  z.object({
    kind: z.literal('proposed-entity'),
    localId: z.string(),
  }),
  z.object({
    kind: z.literal('existing-entity'),
    entityId: z.string(),
  }),
]);

export type LocalOrExistingEntityId = z.infer<typeof LocalOrExistingEntityIdSchema>;

/**
 * Entity edition provenance
 */
export const ProvidedEntityEditionProvenanceSchema = z.object({
  actorType: z.enum(['ai', 'human', 'machine']),
  origin: z.object({
    type: z.enum(['flow', 'api', 'migration']),
    id: z.string().optional(),
  }),
  sources: z.array(SourceProvenanceSchema).optional(),
});

export type ProvidedEntityEditionProvenance = z.infer<typeof ProvidedEntityEditionProvenanceSchema>;

/**
 * Proposed Entity (Step 3: Full Entity with Properties)
 *
 * Represents a complete entity with:
 * - properties: Key-value property data
 * - propertyMetadata: Provenance tracking per property
 * - claims: Associated claims (with provenance to source)
 * - entityTypeIds: One or more entity types
 * - sourceEntityId/targetEntityId: For link entities
 */
export const ProposedEntitySchema = z.object({
  localEntityId: z.string(),
  entityTypeIds: z.array(z.string()).min(1),
  properties: z.record(z.unknown()),
  propertyMetadata: PropertyMetadataSchema,
  provenance: ProvidedEntityEditionProvenanceSchema,
  claims: z.object({
    isSubjectOf: z.array(z.string()),
    isObjectOf: z.array(z.string()),
  }),
  summary: z.string().optional(),
  sourceEntityId: LocalOrExistingEntityIdSchema.optional(),
  targetEntityId: LocalOrExistingEntityIdSchema.optional(),
});

export type ProposedEntity = z.infer<typeof ProposedEntitySchema>;

/**
 * Proposed entity with resolved link data
 */
export const ProposedEntityWithResolvedLinksSchema = ProposedEntitySchema.omit({
  sourceEntityId: true,
  targetEntityId: true,
}).extend({
  linkData: z.object({
    leftEntityId: z.string(),
    rightEntityId: z.string(),
  }).optional(),
});

export type ProposedEntityWithResolvedLinks = z.infer<typeof ProposedEntityWithResolvedLinksSchema>;

/**
 * Persisted entity result
 */
export const PersistedEntitySchema = z.object({
  entity: z.unknown().optional(), // SerializedEntity from hash-graph-sdk
  existingEntity: z.unknown().optional(), // SerializedEntity
  operation: z.enum(['create', 'update', 'already-exists-as-proposed']),
});

export type PersistedEntity = z.infer<typeof PersistedEntitySchema>;

/**
 * Failed entity proposal
 */
export const FailedEntityProposalSchema = z.object({
  existingEntity: z.unknown().optional(),
  operation: z.enum(['create', 'update', 'already-exists-as-proposed']).optional(),
  proposedEntity: ProposedEntityWithResolvedLinksSchema,
  message: z.string(),
});

export type FailedEntityProposal = z.infer<typeof FailedEntityProposalSchema>;

/**
 * Batch result of persisted entities
 */
export const PersistedEntitiesSchema = z.object({
  persistedEntities: z.array(PersistedEntitySchema),
  failedEntityProposals: z.array(FailedEntityProposalSchema),
});

export type PersistedEntities = z.infer<typeof PersistedEntitiesSchema>;
