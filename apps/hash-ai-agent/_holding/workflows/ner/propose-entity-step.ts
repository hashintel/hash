/**
 * Workflow Step: Propose Entity
 *
 * This step wraps the entityProposalAgent to provide typed input/output.
 * It takes an entity summary, its claims, and the entity type schema,
 * and produces a full ProposedEntity with properties and provenance.
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { entityProposalAgent } from "../../agents/ner-entity-proposal.js";
import type { DereferencedEntityTypeWithSimplifiedKeys } from "../../shared/dereference-entity-type.js";
import {
  ClaimSchema,
  LocalEntitySummarySchema,
  ProposedEntitySchema,
  type Claim,
  type LocalEntitySummary,
  type ProposedEntity,
} from "../../types/entities.js";

/**
 * Input schema for the propose entity step
 */
export const ProposeEntityInputSchema = z.object({
  /** The entity to propose */
  entity: LocalEntitySummarySchema,

  /** Claims about this entity (where it's the subject) */
  claims: z.array(ClaimSchema),

  /** The entity type schema (for property context) */
  entityType: z.object({
    $id: z.string(),
    title: z.string(),
    properties: z.record(z.unknown()),
  }),

  /** Simplified property mappings (simplified key -> base URL) */
  simplifiedPropertyTypeMappings: z.record(z.string()),

  /** Optional source URL for provenance */
  sourceUrl: z.string().optional(),
});

export type ProposeEntityInput = z.infer<typeof ProposeEntityInputSchema>;

/**
 * Output schema for the propose entity step
 */
export const ProposeEntityOutputSchema = z.object({
  /** The proposed entity, or null if abandoned */
  proposedEntity: ProposedEntitySchema.nullable(),

  /** Whether the entity was abandoned */
  abandoned: z.boolean(),

  /** Reason for abandonment, if applicable */
  abandonReason: z.string().optional(),
});

export type ProposeEntityOutput = z.infer<typeof ProposeEntityOutputSchema>;

/**
 * Build a prompt string from typed input
 */
const buildPrompt = (input: ProposeEntityInput): string => {
  const propertyDescriptions = Object.entries(input.entityType.properties)
    .map(
      ([key, prop]: [string, any]) =>
        `  - ${key}: ${prop.description ?? prop.title ?? "no description"}`,
    )
    .join("\n");

  const claimsText = input.claims
    .map((c) => {
      const phrases =
        c.prepositionalPhrases.length > 0
          ? ` (${c.prepositionalPhrases.join(", ")})`
          : "";
      return `  - [${c.claimId}] ${c.text}${phrases}`;
    })
    .join("\n");

  return `ENTITY TO PROPOSE:
Name: ${input.entity.name}
Summary: ${input.entity.summary}
Type: ${input.entityType.title}

CLAIMS ABOUT THIS ENTITY:
${claimsText || "  (no claims)"}

ENTITY TYPE PROPERTIES:
${propertyDescriptions}

INSTRUCTIONS:
1. Review all claims about "${input.entity.name}"
2. For each property in the schema, see if any claims provide a value
3. When you find a value, note which claim(s) support it
4. Use the proposeEntity tool to submit the entity with all properties you can fill

Property keys to use: ${Object.keys(input.entityType.properties).join(", ")}

Remember: Each property value must have claimIdsUsedToDetermineValue listing the claims that support it.

If there are no claims or you cannot determine any property values, use abandonEntity instead.`;
};

/**
 * Parse tool calls from agent response to extract proposed entity
 */
const parseAgentResponse = (
  result: any,
  entity: LocalEntitySummary,
  claims: Claim[],
  entityTypeId: string,
  simplifiedPropertyTypeMappings: Record<string, string>,
  sourceUrl?: string,
): ProposeEntityOutput => {
  const toolCalls = result.toolCalls ?? [];

  // Check for abandon first
  const abandonCall = toolCalls.find(
    (tc: any) => tc.name === "abandon-entity" || tc.name === "abandonEntity",
  );

  if (abandonCall) {
    return {
      proposedEntity: null,
      abandoned: true,
      abandonReason: abandonCall.args?.explanation ?? "Unknown reason",
    };
  }

  // Look for propose call
  const proposeCall = toolCalls.find(
    (tc: any) => tc.name === "propose-entity" || tc.name === "proposeEntity",
  );

  if (!proposeCall) {
    return {
      proposedEntity: null,
      abandoned: true,
      abandonReason: "No proposeEntity or abandonEntity tool call found",
    };
  }

  const inputProperties = proposeCall.args?.properties ?? {};

  // Build properties object (just the values)
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputProperties)) {
    if (value && typeof value === "object" && "propertyValue" in value) {
      properties[key] = (value as any).propertyValue;
    }
  }

  // Build property metadata with provenance
  const propertyMetadata: ProposedEntity["propertyMetadata"] = {
    value: {},
  };

  for (const [simplifiedKey, value] of Object.entries(inputProperties)) {
    if (value && typeof value === "object") {
      const { claimIdsUsedToDetermineValue = [] } = value as any;

      // Find the claims used
      const usedClaims = claims.filter((c) =>
        claimIdsUsedToDetermineValue.includes(c.claimId),
      );

      // Get sources from claims
      const sources = usedClaims
        .flatMap((c) => c.sources ?? [])
        .filter(
          (source, index, all) =>
            all.findIndex((s) => s.location?.uri === source.location?.uri) ===
            index,
        );

      // Map to base URL
      const baseUrl = simplifiedPropertyTypeMappings[simplifiedKey];
      if (baseUrl) {
        propertyMetadata.value[baseUrl] = {
          metadata: {
            dataTypeId: null,
            provenance:
              sources.length > 0 || sourceUrl
                ? {
                    sources:
                      sources.length > 0
                        ? sources
                        : sourceUrl
                          ? [{ location: { uri: sourceUrl } }]
                          : [],
                  }
                : undefined,
          },
        };
      }
    }
  }

  // Build claims references
  const isSubjectOf = claims
    .filter((c) => c.subjectEntityLocalId === entity.localId)
    .map((c) => c.claimId);
  const isObjectOf = claims
    .filter((c) => c.objectEntityLocalId === entity.localId)
    .map((c) => c.claimId);

  const proposedEntity: ProposedEntity = {
    localEntityId: entity.localId,
    entityTypeIds: [entityTypeId],
    properties,
    propertyMetadata,
    provenance: {
      actorType: "ai",
      origin: {
        type: "flow",
      },
      sources: sourceUrl ? [{ location: { uri: sourceUrl } }] : undefined,
    },
    claims: {
      isSubjectOf,
      isObjectOf,
    },
    summary: entity.summary,
  };

  return {
    proposedEntity,
    abandoned: false,
  };
};

/**
 * Propose Entity Step
 *
 * Workflow step that wraps the entityProposalAgent with typed I/O.
 *
 * Input: Entity + claims + entity type schema
 * Output: ProposedEntity with properties and provenance
 */
export const proposeEntityStep = createStep({
  id: "propose-entity",
  description:
    "Convert claims about an entity into a full entity proposal with properties",
  inputSchema: ProposeEntityInputSchema,
  outputSchema: ProposeEntityOutputSchema,
  execute: async ({ inputData }) => {
    const prompt = buildPrompt(inputData);

    // Call the agent with the constructed prompt
    const result = await entityProposalAgent.generate(prompt);

    // Parse the response to extract proposed entity
    const output = parseAgentResponse(
      result,
      inputData.entity,
      inputData.claims,
      inputData.entityType.$id,
      inputData.simplifiedPropertyTypeMappings,
      inputData.sourceUrl,
    );

    return output;
  },
});

/**
 * Helper to create input for this step from workflow data
 */
export const createProposeEntityInput = (params: {
  entity: LocalEntitySummary;
  claims: Claim[];
  dereferencedType: DereferencedEntityTypeWithSimplifiedKeys;
  sourceUrl?: string;
}): ProposeEntityInput => ({
  entity: params.entity,
  claims: params.claims.filter(
    (c) => c.subjectEntityLocalId === params.entity.localId,
  ),
  entityType: {
    $id: params.dereferencedType.schema.$id,
    title: params.dereferencedType.schema.title,
    properties: params.dereferencedType.schema.properties,
  },
  simplifiedPropertyTypeMappings:
    params.dereferencedType.simplifiedPropertyTypeMappings,
  sourceUrl: params.sourceUrl,
});
