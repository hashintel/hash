import { typedEntries } from "@local/advanced-types/typed-entries";
import { createStep, createWorkflow } from "@mastra/core/workflows";

import { claimExtractionAgent } from "../agents/ner-claim-extraction.js";
import { entityProposalAgent } from "../agents/ner-entity-proposal.js";
import { entitySummaryAgent } from "../agents/ner-entity-summary.js";
import type {
  DereferencedEntityType,
  DereferencedEntityTypeWithSimplifiedKeys,
} from "../shared/dereference-entity-type.js";
import {
  getAvailableFixtureEntityTypeIds,
  getDereferencedEntityTypes,
} from "../tools/get-dereferenced-entity-types.js";
import type {
  Claim,
  LocalEntitySummary,
  ProposedEntity,
} from "../types/entities.js";
import { zNerWorkflowInput, zNerWorkflowOutput } from "./ner/types.js";

/**
 * Type for the result of an agent.generate() call.
 * The generate() method returns toolResults which contains both the args and execution results.
 */
type EntitySummaryAgentResult = Awaited<
  ReturnType<typeof entitySummaryAgent.generate>
>;
type ClaimExtractionAgentResult = Awaited<
  ReturnType<typeof claimExtractionAgent.generate>
>;
type EntityProposalAgentResult = Awaited<
  ReturnType<typeof entityProposalAgent.generate>
>;

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

const stringifyEntitySchemaProperties = (
  props: DereferencedEntityType<string>["properties"],
): string => {
  return typedEntries(props)
    .map(([key, prop]) => {
      const value = "items" in prop ? prop.items : prop;
      return `  - ${key}: ${value.description ?? value.title}`;
    })
    .join("\n");
};
/**
 * Build prompt for entity extraction
 */
const buildEntityExtractionPrompt = (
  text: string,
  researchGoal: string,
  entityType: DereferencedEntityTypeWithSimplifiedKeys,
): string => {
  const propertyDescriptions = stringifyEntitySchemaProperties(
    entityType.schema.properties,
  );

  return `TEXT TO ANALYZE:
${text}

RESEARCH GOAL:
${researchGoal}

ENTITY TYPE TO EXTRACT:
ID: ${entityType.schema.$id}
Title: ${entityType.schema.title}
Description: ${entityType.schema.description}

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
  const propertyDescriptions = stringifyEntitySchemaProperties(
    entityType.schema.properties,
  );

  const subjectEntitiesText = subjectEntities
    .map(
      (entity) =>
        `  - localId: ${entity.localId}, name: "${entity.name}", summary: "${entity.summary}"`,
    )
    .join("\n");

  const objectEntitiesText =
    potentialObjectEntities.length > 0
      ? potentialObjectEntities
          .map(
            (entity) =>
              `  - localId: ${entity.localId}, name: "${entity.name}", summary: "${entity.summary}"`,
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
  const propertyDescriptions = stringifyEntitySchemaProperties(
    entityType.schema.properties,
  );

  const entityClaims = claims.filter(
    (claim) => claim.subjectEntityLocalId === entity.localId,
  );

  const claimsText = entityClaims
    .map((claim) => {
      const phrases =
        claim.prepositionalPhrases.length > 0
          ? ` (${claim.prepositionalPhrases.join(", ")})`
          : "";
      return `  - [${claim.claimId}] ${claim.text}${phrases}`;
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
  result: EntitySummaryAgentResult,
  entityTypeId: string,
): LocalEntitySummary[] => {
  const registerResult = result.toolResults.find(
    (toolResult) => toolResult.payload.toolName === "registerEntitySummaries",
  );

  if (!registerResult) {
    return [];
  }

  type RawEntitySummary = { name?: string; summary?: string; type?: string };
  const rawSummaries = (
    registerResult.payload.args as { entitySummaries: RawEntitySummary[] }
  ).entitySummaries;

  return rawSummaries.map((raw, index) => ({
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
  result: ClaimExtractionAgentResult,
  subjectEntities: LocalEntitySummary[],
  potentialObjectEntities: LocalEntitySummary[],
): Claim[] => {
  const submitResult = result.toolResults.find(
    (toolResult) => toolResult.payload.toolName === "submitClaims",
  );

  if (!submitResult) {
    return [];
  }

  type RawClaim = {
    subjectEntityLocalId: string | null;
    objectEntityLocalId: string | null;
    text: string;
    prepositionalPhrases: string[];
  };

  const rawClaims = (submitResult.payload.args as { claims: RawClaim[] })
    .claims;

  const allKnownEntities = [...subjectEntities, ...potentialObjectEntities];
  const validClaims: Claim[] = [];

  for (let index = 0; index < rawClaims.length; index++) {
    const raw = rawClaims[index];
    if (!raw?.subjectEntityLocalId) {
      continue;
    }

    const subjectEntity = subjectEntities.find(
      (entity) => entity.localId === raw.subjectEntityLocalId,
    );
    if (!subjectEntity) {
      continue;
    }

    if (!raw.text.toLowerCase().includes(subjectEntity.name.toLowerCase())) {
      continue;
    }

    if (raw.objectEntityLocalId) {
      const objectEntity = allKnownEntities.find(
        (entity) => entity.localId === raw.objectEntityLocalId,
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
      prepositionalPhrases: raw.prepositionalPhrases,
    });
  }

  return validClaims;
};

/**
 * Parse proposed entity from agent response
 */
const parseProposedEntity = (
  result: EntityProposalAgentResult,
  entity: LocalEntitySummary,
  claims: Claim[],
  entityType: DereferencedEntityTypeWithSimplifiedKeys,
  sourceUrl?: string,
): { proposed: ProposedEntity | null; abandoned: boolean; reason?: string } => {
  const abandonResult = result.toolResults.find(
    (toolResult) => toolResult.payload.toolName === "abandonEntity",
  );

  if (abandonResult) {
    return {
      proposed: null,
      abandoned: true,
      reason: (abandonResult.payload.args as { explanation: string })
        .explanation,
    };
  }

  const proposeResult = result.toolResults.find(
    (toolResult) => toolResult.payload.toolName === "proposeEntity",
  );

  if (!proposeResult) {
    return { proposed: null, abandoned: true, reason: "No tool call found" };
  }

  type PropertyValue = {
    propertyValue: unknown;
    claimIdsUsedToDetermineValue: string[];
  };

  const inputProperties = (
    proposeResult.payload.args as { properties: Record<string, PropertyValue> }
  ).properties;

  const properties: Record<string, unknown> = {};
  const propertyMetadata: ProposedEntity["propertyMetadata"] = { value: {} };

  for (const [key, value] of Object.entries(inputProperties)) {
    properties[key] = value.propertyValue;

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

  const entityClaims = claims.filter(
    (claim) => claim.subjectEntityLocalId === entity.localId,
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
        isSubjectOf: entityClaims.map((claim) => claim.claimId),
        isObjectOf: claims
          .filter((claim) => claim.objectEntityLocalId === entity.localId)
          .map((claim) => claim.claimId),
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

/* steps that are actually happening

  getDereferencedEntityTypes

*/

export const nerPipelineStep = createStep({
  id: "ner-pipeline",
  description: "Full NER pipeline: extract → dedupe → claims → propose",
  inputSchema: zNerWorkflowInput,
  outputSchema: zNerWorkflowOutput,
  execute: async ({ inputData }) => {
    const {
      text,
      researchGoal,
      entityTypeIds,
      sourceUrl,
      useFixtures = true, // FIXME: this is a dumb idea
    } = inputData;

    // Step 1: Get dereferenced entity types
    const dereferencedTypes = getDereferencedEntityTypes(
      entityTypeIds,
      useFixtures, // FIXME:
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
      if (!entityType) {
        continue;
      }
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
      const subjectEntities = uniqueEntities.filter((entity) =>
        entity.entityTypeIds.includes(typeId),
      );
      const otherEntities = uniqueEntities.filter(
        (entity) => !entity.entityTypeIds.includes(typeId),
      );

      if (entityType == null || subjectEntities.length === 0) {
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
      const typeId = entity.entityTypeIds[0] ?? "";
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
  inputSchema: zNerWorkflowInput,
  outputSchema: zNerWorkflowOutput,
})
  .then(nerPipelineStep)
  .commit();

/**
 * Helper to get default entity type IDs for testing
 */
export const getDefaultEntityTypeIds = (): string[] => {
  return getAvailableFixtureEntityTypeIds();
};

const testStep = createStep({
  id: "get-dereferenced-entity-types",
  inputSchema: zNerWorkflowInput,
  outputSchema: zNerWorkflowOutput,
  execute: async ({ inputData }) => {
    const { entityTypeIds, useFixtures } = inputData;
    return Promise.resolve(
      getDereferencedEntityTypes(entityTypeIds, useFixtures),
    );
  },
});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const realNERWorkflow = createWorkflow({
  id: "real-ner-workflow",
  inputSchema: zNerWorkflowInput,
  outputSchema: zNerWorkflowOutput,
})
  // Step 1: Get dereferenced entity types
  .then(testStep)
  // Step 2: Extract entity summaries (per type)
  .then(extractEntitySummariesStep)
  // Step 3: Deduplicate entities
  .then(deduplicateEntitiesStep)
  // Step 4: Extract claims (per type, with all entities as context)
  .then(extractClaimsStep)
  // Step 5: Propose entities (per entity)
  .then(proposeEntitiesStep)
  .commit();
