import { z } from "zod";

/**
 * Entity types for Mastra-based entity extraction
 *
 * Ported from hash-ai-worker-ts:
 * - /activities/flow-activities/shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.ts (LocalEntitySummary)
 * - /activities/flow-activities/shared/claims.ts (Claim)
 * - /libs/@local/hash-isomorphic-utils/src/flows/types.ts (ProposedEntity)
 */

export const zSourceProvenance = z
  .object({
    location: z.object({
      uri: z.url().meta({ description: "URI of the source location" }),
      name: z.string().optional().meta({ description: "Name of the source" }),
    }),
    loadedAt: z
      .iso.datetime()
      .optional()
      .meta({ description: "Timestamp when the source was loaded" }),
    contentType: z
      .string()
      .optional()
      .meta({ description: "MIME type of the source file/document" }),
  })
  .meta({ description: "Source provenance tracking for entity data" });

export type SourceProvenance = z.infer<typeof zSourceProvenance>;

export const zLocalEntitySummary = z
  .object({
    localId: z.string().meta({ description: "Local identifier for the entity" }),
    name: z
      .string()
      .meta({ description: "The entity name as it appears in text" }),
    summary: z
      .string()
      .meta({ description: "Brief one-sentence description of the entity" }),
    entityTypeIds: z
      .array(z.string())
      .min(1)
      .meta({
        description: "One or more entity type identifiers (versioned URLs)",
      }),
  })
  .meta({
    description:
      "Local entity summary from Named Entity Recognition (Step 1). Represents an entity identified in text.",
  });

export type LocalEntitySummary = z.infer<typeof zLocalEntitySummary>;

export const zClaim = z
  .object({
    claimId: z.string().meta({ description: "Unique identifier for the claim" }),
    subjectEntityLocalId: z
      .string()
      .meta({ description: "The entity this claim is about" }),
    objectEntityLocalId: z
      .string()
      .nullable()
      .optional()
      .meta({ description: "Optional target entity for relationships" }),
    text: z.string().meta({
      description:
        'Claim in "Subject predicate object" form (e.g., "OpenAI released GPT-4")',
    }),
    prepositionalPhrases: z
      .array(z.string())
      .meta({
        description:
          'Additional context phrases (e.g., ["in March 2023", "for research"])',
      }),
    sources: z
      .array(zSourceProvenance)
      .optional()
      .meta({ description: "Source provenance for the claim" }),
  })
  .meta({
    description:
      "Claim from Claim Extraction (Step 2). Represents a fact/assertion about an entity.",
  });

export type Claim = z.infer<typeof zClaim>;

/** Helper to format claim text with prepositional phrases */
export const claimTextualContent = (claim: Claim): string =>
  `${claim.text}${
    claim.prepositionalPhrases.length
      ? `– ${claim.prepositionalPhrases.join(", ")}`
      : ""
  }`;

export const zPropertyMetadata = z
  .object({
    value: z.record(
      z.string(),
      z.object({
        metadata: z.object({
          dataTypeId: z
            .string()
            .nullable()
            .optional()
            .meta({ description: "Data type identifier for the property" }),
          provenance: z
            .object({
              sources: z
                .array(zSourceProvenance)
                .meta({ description: "Sources for this property value" }),
            })
            .optional()
            .meta({ description: "Provenance information for the property" }),
        }),
      }),
    ),
  })
  .meta({ description: "Property metadata for tracking provenance per property" });

export type PropertyMetadata = z.infer<typeof zPropertyMetadata>;

export const zLocalOrExistingEntityId = z
  .union([
    z.object({
      kind: z.literal("proposed-entity"),
      localId: z
        .string()
        .meta({ description: "Local ID of the proposed entity" }),
    }),
    z.object({
      kind: z.literal("existing-entity"),
      entityId: z
        .string()
        .meta({ description: "ID of the existing entity" }),
    }),
  ])
  .meta({
    description:
      "Local or existing entity ID reference. Used for link entities (source/target).",
  });

export type LocalOrExistingEntityId = z.infer<typeof zLocalOrExistingEntityId>;

export const zProvidedEntityEditionProvenance = z
  .object({
    actorType: z
      .enum(["ai", "human", "machine"])
      .meta({ description: "Type of actor that created/modified this entity" }),
    origin: z.object({
      type: z
        .enum(["flow", "api", "migration"])
        .meta({ description: "Origin type of the entity edition" }),
      id: z
        .string()
        .optional()
        .meta({ description: "Identifier for the origin" }),
    }),
    sources: z
      .array(zSourceProvenance)
      .optional()
      .meta({ description: "Source provenance for this edition" }),
  })
  .meta({ description: "Entity edition provenance information" });

export type ProvidedEntityEditionProvenance = z.infer<
  typeof zProvidedEntityEditionProvenance
>;

export const zProposedEntity = z
  .object({
    localEntityId: z
      .string()
      .meta({ description: "Local identifier for this proposed entity" }),
    entityTypeIds: z
      .array(z.string())
      .min(1)
      .meta({ description: "One or more entity type identifiers" }),
    properties: z
      .record(z.string(), z.unknown())
      .meta({ description: "Key-value property data" }),
    propertyMetadata: zPropertyMetadata.meta({
      description: "Provenance tracking per property",
    }),
    provenance: zProvidedEntityEditionProvenance,
    claims: z.object({
      isSubjectOf: z
        .array(z.string())
        .meta({ description: "Claim IDs where this entity is the subject" }),
      isObjectOf: z
        .array(z.string())
        .meta({ description: "Claim IDs where this entity is the object" }),
    }),
    summary: z
      .string()
      .optional()
      .meta({ description: "Brief summary of the entity" }),
    sourceEntityId: zLocalOrExistingEntityId
      .optional()
      .meta({ description: "Source entity ID for link entities" }),
    targetEntityId: zLocalOrExistingEntityId
      .optional()
      .meta({ description: "Target entity ID for link entities" }),
  })
  .meta({
    description:
      "Proposed Entity (Step 3). A complete entity with properties, metadata, claims, and optional link data.",
  });

export type ProposedEntity = z.infer<typeof zProposedEntity>;

export const zProposedEntityWithResolvedLinks = zProposedEntity
  .omit({
    sourceEntityId: true,
    targetEntityId: true,
  })
  .extend({
    linkData: z
      .object({
        leftEntityId: z
          .string()
          .meta({ description: "Resolved left entity ID" }),
        rightEntityId: z
          .string()
          .meta({ description: "Resolved right entity ID" }),
      })
      .optional()
      .meta({ description: "Resolved link data with actual entity IDs" }),
  })
  .meta({ description: "Proposed entity with resolved link data" });

export type ProposedEntityWithResolvedLinks = z.infer<
  typeof zProposedEntityWithResolvedLinks
>;

export const zPersistedEntity = z
  .object({
    entity: z
      .unknown()
      .optional()
      .meta({ description: "The persisted entity (SerializedEntity)" }),
    existingEntity: z
      .unknown()
      .optional()
      .meta({ description: "Existing entity if found (SerializedEntity)" }),
    operation: z
      .enum(["create", "update", "already-exists-as-proposed"])
      .meta({ description: "Operation performed on the entity" }),
  })
  .meta({ description: "Result of persisting an entity" });

export type PersistedEntity = z.infer<typeof zPersistedEntity>;

export const zFailedEntityProposal = z
  .object({
    existingEntity: z
      .unknown()
      .optional()
      .meta({ description: "Existing entity if found" }),
    operation: z
      .enum(["create", "update", "already-exists-as-proposed"])
      .optional()
      .meta({ description: "Attempted operation" }),
    proposedEntity: zProposedEntityWithResolvedLinks.meta({
      description: "The entity that failed to persist",
    }),
    message: z.string().meta({ description: "Error message explaining failure" }),
  })
  .meta({ description: "Failed entity proposal with error details" });

export type FailedEntityProposal = z.infer<typeof zFailedEntityProposal>;

export const zPersistedEntities = z
  .object({
    persistedEntities: z
      .array(zPersistedEntity)
      .meta({ description: "Successfully persisted entities" }),
    failedEntityProposals: z
      .array(zFailedEntityProposal)
      .meta({ description: "Entity proposals that failed to persist" }),
  })
  .meta({ description: "Batch result of entity persistence operations" });

export type PersistedEntities = z.infer<typeof zPersistedEntities>;
