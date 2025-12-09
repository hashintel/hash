/**
 * NER Workflow: Named Entity Recognition Pipeline
 *
 * A 5-step workflow for extracting structured entities from text:
 *
 * 1. Get Dereferenced Entity Types - Resolve entity type schemas
 * 2. Extract Entity Summaries - NER to identify entities (per type)
 * 3. Deduplicate Entities - Merge duplicates
 * 4. Extract Claims - Extract facts about entities
 * 5. Propose Entities - Convert claims to full entities with properties
 *
 * This workflow uses Mastra's step composition with typed inputs/outputs.
 */

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { claimExtractionAgent } from "../agents/claim-extraction-agent.js";
import { entityProposalAgent } from "../agents/entity-proposal-agent.js";
import { entitySummaryAgent } from "../agents/entity-summary-agent.js";
import type { DereferencedEntityTypeWithSimplifiedKeys } from "../shared/dereference-entity-type.js";
import {
  getAvailableFixtureEntityTypeIds,
  getDereferencedEntityTypes,
} from "../tools/get-dereferenced-entity-types.js";
import type {
  Claim,
  LocalEntitySummary,
  ProposedEntity,
} from "../types/entities.js";

/**
 * Workflow input schema
 */
export const NerWorkflowInputSchema = z.object({
  /** The source text to extract entities from */
  text: z.string().describe("The source text to extract entities from"),

  /** The research goal describing what entities are relevant */
  researchGoal: z
    .string()
    .describe("Research goal describing what entities are relevant"),

  /** Entity type IDs to look for */
  entityTypeIds: z
    .array(z.string())
    .describe("Entity type IDs to extract (e.g., person, organization)"),

  /** Optional source URL for provenance tracking */
  sourceUrl: z.string().optional(),

  /** Whether to use fixtures (default: true for testing) */
  useFixtures: z.boolean().default(true),
});

export type NerWorkflowInput = z.infer<typeof NerWorkflowInputSchema>;

/**
 * Workflow output schema
 */
export const NerWorkflowOutputSchema = z.object({
  /** Proposed entities with full properties */
  proposedEntities: z.array(z.unknown()), // ProposedEntity

  /** All extracted claims */
  claims: z.array(z.unknown()), // Claim

  /** Entity summaries (before proposals) */
  entitySummaries: z.array(z.unknown()), // LocalEntitySummary

  /** Statistics */
  stats: z.object({
    entityTypesProcessed: z.number(),
    totalEntitiesExtracted: z.number(),
    uniqueEntitiesAfterDedup: z.number(),
    totalClaims: z.number(),
    proposedEntities: z.number(),
    abandonedEntities: z.number(),
  }),
});

export type NerWorkflowOutput = z.infer<typeof NerWorkflowOutputSchema>;

/**
 * Build prompt for entity extraction
 */
const buildEntityExtractionPrompt = (
  text: string,
  researchGoal: string,
  entityType: DereferencedEntityTypeWithSimplifiedKeys,
): string => {
  const propertyDescriptions = Object.entries(entityType.schema.properties)
    .map(
      ([key, prop]: [string, any]) =>
        `  - ${key}: ${prop.description ?? prop.title ?? "no description"}`,
    )
    .join("\n");

  return `TEXT TO ANALYZE:
${text}

RESEARCH GOAL:
${researchGoal}

ENTITY TYPE TO EXTRACT:
ID: ${entityType.schema.$id}
Title: ${entityType.schema.title}
Description: ${entityType.schema.description ?? "No description"}

Properties for this entity type:
${propertyDescriptions}

INSTRUCTIONS:
1. Read the text carefully and identify all entities that match the entity type "${entityType.schema.title}"
2. For each entity found, provide its name as it appears in the text and a brief summary
3. Use the type ID "${entityType.schema.$id}" for entities matching this type
4. Use the registerEntitySummaries tool to report all entities found

Remember: Extract ALL entities matching this type. Be thorough.`;
};

/**
 * Build prompt for claim extraction
 */
const buildClaimExtractionPrompt = (
  text: string,
  researchGoal: string,
  subjectEntities: LocalEntitySummary[],
  potentialObjectEntities: LocalEntitySummary[],
  entityType: DereferencedEntityTypeWithSimplifiedKeys,
): string => {
  const propertyDescriptions = Object.entries(entityType.schema.properties)
    .map(
      ([key, prop]: [string, any]) =>
        `  - ${key}: ${prop.description ?? prop.title ?? "no description"}`,
    )
    .join("\n");

  const subjectEntitiesText = subjectEntities
    .map(
      (e) =>
        `  - localId: ${e.localId}, name: "${e.name}", summary: "${e.summary}"`,
    )
    .join("\n");

  const objectEntitiesText =
    potentialObjectEntities.length > 0
      ? potentialObjectEntities
          .map(
            (e) =>
              `  - localId: ${e.localId}, name: "${e.name}", summary: "${e.summary}"`,
          )
          .join("\n")
      : "  (none)";

  return `TEXT TO ANALYZE:
${text}

RESEARCH GOAL:
${researchGoal}

SUBJECT ENTITIES (claims must be ABOUT one of these):
${subjectEntitiesText}

POTENTIAL OBJECT ENTITIES (may be the object of a claim):
${objectEntitiesText}

ENTITY TYPE: ${entityType.schema.title}
Properties of interest:
${propertyDescriptions}

INSTRUCTIONS:
1. Extract ALL claims about the subject entities from the text
2. Each claim must start with a subject entity's name (exactly as written above)
3. Use subjectEntityLocalId to identify which entity the claim is about
4. If a claim involves another entity, use objectEntityLocalId
5. Separate prepositional phrases (dates, amounts) from the main claim text
6. Be exhaustive - don't miss any information about the entities

Use the submitClaims tool to submit all extracted claims.`;
};

/**
 * Build prompt for entity proposal
 */
const buildEntityProposalPrompt = (
  entity: LocalEntitySummary,
  claims: Claim[],
  entityType: DereferencedEntityTypeWithSimplifiedKeys,
): string => {
  const propertyDescriptions = Object.entries(entityType.schema.properties)
    .map(
      ([key, prop]: [string, any]) =>
        `  - ${key}: ${prop.description ?? prop.title ?? "no description"}`,
    )
    .join("\n");

  const entityClaims = claims.filter(
    (c) => c.subjectEntityLocalId === entity.localId,
  );

  const claimsText = entityClaims
    .map((c) => {
      const phrases =
        c.prepositionalPhrases.length > 0
          ? ` (${c.prepositionalPhrases.join(", ")})`
          : "";
      return `  - [${c.claimId}] ${c.text}${phrases}`;
    })
    .join("\n");

  return `ENTITY TO PROPOSE:
Name: ${entity.name}
Summary: ${entity.summary}
Type: ${entityType.schema.title}

CLAIMS ABOUT THIS ENTITY:
${claimsText || "  (no claims)"}

ENTITY TYPE PROPERTIES:
${propertyDescriptions}

INSTRUCTIONS:
1. Review all claims about "${entity.name}"
2. For each property in the schema, see if any claims provide a value
3. When you find a value, note which claim(s) support it
4. Use the proposeEntity tool to submit the entity with all properties you can fill

Property keys to use: ${Object.keys(entityType.schema.properties).join(", ")}

Remember: Each property value must have claimIdsUsedToDetermineValue listing the claims that support it.

If there are no claims or you cannot determine any property values, use abandonEntity instead.`;
};

/**
 * Parse entity summaries from agent response
 */
const parseEntitySummaries = (
  result: any,
  entityTypeId: string,
): LocalEntitySummary[] => {
  const toolCalls = result.toolCalls ?? [];
  const registerCall = toolCalls.find(
    (tc: any) =>
      tc.name === "register-entity-summaries" ||
      tc.name === "registerEntitySummaries",
  );

  if (!registerCall) {
    return [];
  }

  const rawSummaries = registerCall.args?.entitySummaries ?? [];
  return rawSummaries.map((raw: any, index: number) => ({
    localId: `entity-${entityTypeId.split("/").pop()}-${index + 1}`,
    name: raw.name ?? "Unknown",
    summary: raw.summary ?? "",
    entityTypeIds: [raw.type ?? entityTypeId],
  }));
};

/**
 * Parse claims from agent response
 */
const parseClaims = (
  result: any,
  subjectEntities: LocalEntitySummary[],
  potentialObjectEntities: LocalEntitySummary[],
): Claim[] => {
  const toolCalls = result.toolCalls ?? [];
  const submitCall = toolCalls.find(
    (tc: any) => tc.name === "submit-claims" || tc.name === "submitClaims",
  );

  if (!submitCall) {
    return [];
  }

  const rawClaims = submitCall.args?.claims ?? [];
  const allKnownEntities = [...subjectEntities, ...potentialObjectEntities];
  const validClaims: Claim[] = [];

  for (let index = 0; index < rawClaims.length; index++) {
    const raw = rawClaims[index];
    if (!raw.subjectEntityLocalId) {
      continue;
    }

    const subjectEntity = subjectEntities.find(
      (e) => e.localId === raw.subjectEntityLocalId,
    );
    if (!subjectEntity) {
      continue;
    }

    if (!raw.text.toLowerCase().includes(subjectEntity.name.toLowerCase())) {
      continue;
    }

    if (raw.objectEntityLocalId) {
      const objectEntity = allKnownEntities.find(
        (e) => e.localId === raw.objectEntityLocalId,
      );
      if (!objectEntity) {
        continue;
      }
    }

    validClaims.push({
      claimId: `claim-${index + 1}`,
      subjectEntityLocalId: raw.subjectEntityLocalId,
      objectEntityLocalId: raw.objectEntityLocalId ?? undefined,
      text: raw.text,
      prepositionalPhrases: raw.prepositionalPhrases ?? [],
    });
  }

  return validClaims;
};

/**
 * Parse proposed entity from agent response
 */
const parseProposedEntity = (
  result: any,
  entity: LocalEntitySummary,
  claims: Claim[],
  entityType: DereferencedEntityTypeWithSimplifiedKeys,
  sourceUrl?: string,
): { proposed: ProposedEntity | null; abandoned: boolean; reason?: string } => {
  const toolCalls = result.toolCalls ?? [];

  const abandonCall = toolCalls.find(
    (tc: any) => tc.name === "abandon-entity" || tc.name === "abandonEntity",
  );

  if (abandonCall) {
    return {
      proposed: null,
      abandoned: true,
      reason: abandonCall.args?.explanation,
    };
  }

  const proposeCall = toolCalls.find(
    (tc: any) => tc.name === "propose-entity" || tc.name === "proposeEntity",
  );

  if (!proposeCall) {
    return { proposed: null, abandoned: true, reason: "No tool call found" };
  }

  const inputProperties = proposeCall.args?.properties ?? {};

  const properties: Record<string, unknown> = {};
  const propertyMetadata: ProposedEntity["propertyMetadata"] = { value: {} };

  for (const [key, value] of Object.entries(inputProperties)) {
    if (value && typeof value === "object" && "propertyValue" in value) {
      properties[key] = (value as any).propertyValue;

      const baseUrl = entityType.simplifiedPropertyTypeMappings[key];
      if (baseUrl) {
        propertyMetadata.value[baseUrl] = {
          metadata: {
            dataTypeId: null,
            provenance: sourceUrl
              ? { sources: [{ location: { uri: sourceUrl } }] }
              : undefined,
          },
        };
      }
    }
  }

  const entityClaims = claims.filter(
    (c) => c.subjectEntityLocalId === entity.localId,
  );

  return {
    proposed: {
      localEntityId: entity.localId,
      entityTypeIds: entity.entityTypeIds,
      properties,
      propertyMetadata,
      provenance: {
        actorType: "ai",
        origin: { type: "flow" },
        sources: sourceUrl ? [{ location: { uri: sourceUrl } }] : undefined,
      },
      claims: {
        isSubjectOf: entityClaims.map((c) => c.claimId),
        isObjectOf: claims
          .filter((c) => c.objectEntityLocalId === entity.localId)
          .map((c) => c.claimId),
      },
      summary: entity.summary,
    },
    abandoned: false,
  };
};

/**
 * Simple name-based deduplication
 */
const deduplicateEntities = (
  entities: LocalEntitySummary[],
): LocalEntitySummary[] => {
  const seen = new Map<string, LocalEntitySummary>();

  for (const entity of entities) {
    const normalizedName = entity.name.toLowerCase().trim();
    if (!seen.has(normalizedName)) {
      seen.set(normalizedName, entity);
    }
  }

  return Array.from(seen.values());
};

/**
 * Main NER Workflow Step
 *
 * This is a single "mega step" that orchestrates the full pipeline.
 * In a more advanced setup, this could be broken into separate steps
 * with Mastra's .then() and .foreach() composition.
 */
export const nerPipelineStep = createStep({
  id: "ner-pipeline",
  description: "Full NER pipeline: extract → dedupe → claims → propose",
  inputSchema: NerWorkflowInputSchema,
  outputSchema: NerWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const {
      text,
      researchGoal,
      entityTypeIds,
      sourceUrl,
      useFixtures = true,
    } = inputData;

    // Step 1: Get dereferenced entity types
    const dereferencedTypes = getDereferencedEntityTypes(
      entityTypeIds,
      useFixtures,
    );
    const foundTypeIds = Object.keys(dereferencedTypes);

    if (foundTypeIds.length === 0) {
      return {
        proposedEntities: [],
        claims: [],
        entitySummaries: [],
        stats: {
          entityTypesProcessed: 0,
          totalEntitiesExtracted: 0,
          uniqueEntitiesAfterDedup: 0,
          totalClaims: 0,
          proposedEntities: 0,
          abandonedEntities: 0,
        },
      };
    }

    // Step 2: Extract entity summaries (per type)
    let allEntities: LocalEntitySummary[] = [];

    for (const typeId of foundTypeIds) {
      const entityType = dereferencedTypes[typeId];
      const prompt = buildEntityExtractionPrompt(
        text,
        researchGoal,
        entityType,
      );
      const result = await entitySummaryAgent.generate(prompt);
      const entities = parseEntitySummaries(result, typeId);
      allEntities = allEntities.concat(entities);
    }

    // Step 3: Deduplicate entities
    const uniqueEntities = deduplicateEntities(allEntities);

    // Step 4: Extract claims (per type, with all entities as context)
    let allClaims: Claim[] = [];

    for (const typeId of foundTypeIds) {
      const entityType = dereferencedTypes[typeId];
      const subjectEntities = uniqueEntities.filter((e) =>
        e.entityTypeIds.includes(typeId),
      );
      const otherEntities = uniqueEntities.filter(
        (e) => !e.entityTypeIds.includes(typeId),
      );

      if (subjectEntities.length === 0) {
        continue;
      }

      const prompt = buildClaimExtractionPrompt(
        text,
        researchGoal,
        subjectEntities,
        otherEntities,
        entityType,
      );
      const result = await claimExtractionAgent.generate(prompt);
      const claims = parseClaims(result, subjectEntities, otherEntities);
      allClaims = allClaims.concat(claims);
    }

    // Step 5: Propose entities (per entity)
    const proposedEntities: ProposedEntity[] = [];
    let abandonedCount = 0;

    for (const entity of uniqueEntities) {
      const typeId = entity.entityTypeIds[0];
      const entityType = dereferencedTypes[typeId];
      if (!entityType) {
        continue;
      }

      const prompt = buildEntityProposalPrompt(entity, allClaims, entityType);
      const result = await entityProposalAgent.generate(prompt);
      const { proposed, abandoned } = parseProposedEntity(
        result,
        entity,
        allClaims,
        entityType,
        sourceUrl,
      );

      if (proposed) {
        proposedEntities.push(proposed);
      } else if (abandoned) {
        abandonedCount++;
      }
    }

    return {
      proposedEntities,
      claims: allClaims,
      entitySummaries: uniqueEntities,
      stats: {
        entityTypesProcessed: foundTypeIds.length,
        totalEntitiesExtracted: allEntities.length,
        uniqueEntitiesAfterDedup: uniqueEntities.length,
        totalClaims: allClaims.length,
        proposedEntities: proposedEntities.length,
        abandonedEntities: abandonedCount,
      },
    };
  },
});

/**
 * NER Workflow
 *
 * The full Named Entity Recognition workflow.
 *
 * Usage:
 * ```ts
 * const result = await nerWorkflow.start({
 *   inputData: {
 *     text: "...",
 *     researchGoal: "Find all people and organizations mentioned",
 *     entityTypeIds: [
 *       "https://hash.ai/@h/types/entity-type/person/v/1",
 *       "https://hash.ai/@h/types/entity-type/organization/v/3",
 *     ],
 *   },
 * });
 * ```
 */
export const nerWorkflow = createWorkflow({
  id: "ner-workflow",
  inputSchema: NerWorkflowInputSchema,
  outputSchema: NerWorkflowOutputSchema,
})
  .then(nerPipelineStep)
  .commit();

/**
 * Helper to get default entity type IDs for testing
 */
export const getDefaultEntityTypeIds = (): string[] => {
  return getAvailableFixtureEntityTypeIds();
};
