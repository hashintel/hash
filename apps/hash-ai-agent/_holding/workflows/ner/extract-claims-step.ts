/**
 * Workflow Step: Extract Claims
 *
 * This step wraps the claimExtractionAgent to provide typed input/output.
 * It takes entities and text and produces structured claims.
 *
 * Claims follow subject-predicate-object format with prepositional phrases
 * for additional context (dates, amounts, etc.).
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { claimExtractionAgent } from "../../agents/ner-claim-extraction.js";
import type { DereferencedEntityTypeWithSimplifiedKeys } from "../../shared/dereference-entity-type.js";
import {
  ClaimSchema,
  LocalEntitySummarySchema,
  type Claim,
  type LocalEntitySummary,
} from "../../types/entities.js";

/**
 * Input schema for the extract claims step
 */
export const ExtractClaimsInputSchema = z.object({
  /** The source text to extract claims from */
  text: z.string().describe("The source text to extract claims from"),

  /** The research goal describing what information is relevant */
  researchGoal: z
    .string()
    .describe("Research goal describing what information is relevant"),

  /** Subject entities - claims will be ABOUT these entities */
  subjectEntities: z
    .array(LocalEntitySummarySchema)
    .describe("Entities that claims should be about"),

  /** Potential object entities - these may be the TARGET of claims */
  potentialObjectEntities: z
    .array(LocalEntitySummarySchema)
    .describe("Other entities that may be mentioned in claims"),

  /** The entity type schema (for property context) */
  entityType: z.object({
    $id: z.string(),
    title: z.string(),
    properties: z.record(z.unknown()),
  }),

  /** Optional source URL for provenance */
  sourceUrl: z.string().optional(),
});

export type ExtractClaimsInput = z.infer<typeof ExtractClaimsInputSchema>;

/**
 * Output schema for the extract claims step
 */
export const ExtractClaimsOutputSchema = z.object({
  /** Extracted claims */
  claims: z.array(ClaimSchema),

  /** Number of claims extracted */
  count: z.number(),

  /** Claims that were invalid and discarded */
  invalidClaimsCount: z.number(),
});

export type ExtractClaimsOutput = z.infer<typeof ExtractClaimsOutputSchema>;

/**
 * Build a prompt string from typed input
 */
const buildPrompt = (input: ExtractClaimsInput): string => {
  const propertyDescriptions = Object.entries(input.entityType.properties)
    .map(
      ([key, prop]: [string, any]) =>
        `  - ${key}: ${prop.description ?? prop.title ?? "no description"}`,
    )
    .join("\n");

  const subjectEntitiesText = input.subjectEntities
    .map(
      (e) =>
        `  - localId: ${e.localId}, name: "${e.name}", summary: "${e.summary}"`,
    )
    .join("\n");

  const objectEntitiesText =
    input.potentialObjectEntities.length > 0
      ? input.potentialObjectEntities
          .map(
            (e) =>
              `  - localId: ${e.localId}, name: "${e.name}", summary: "${e.summary}"`,
          )
          .join("\n")
      : "  (none)";

  return `TEXT TO ANALYZE:
${input.text}

RESEARCH GOAL:
${input.researchGoal}

SUBJECT ENTITIES (claims must be ABOUT one of these):
${subjectEntitiesText}

POTENTIAL OBJECT ENTITIES (may be the object of a claim):
${objectEntitiesText}

ENTITY TYPE: ${input.entityType.title}
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
 * Parse tool calls from agent response to extract claims
 */
const parseAgentResponse = (
  result: any,
  subjectEntities: LocalEntitySummary[],
  potentialObjectEntities: LocalEntitySummary[],
): ExtractClaimsOutput => {
  const toolCalls = result.toolCalls ?? [];

  const submitCall = toolCalls.find(
    (tc: any) => tc.name === "submit-claims" || tc.name === "submitClaims",
  );

  if (!submitCall) {
    return {
      claims: [],
      count: 0,
      invalidClaimsCount: 0,
    };
  }

  const rawClaims = submitCall.args?.claims ?? [];
  const allKnownEntities = [...subjectEntities, ...potentialObjectEntities];

  const validClaims: Claim[] = [];
  let invalidCount = 0;

  for (let index = 0; index < rawClaims.length; index++) {
    const raw = rawClaims[index];

    // Skip claims without a subject
    if (!raw.subjectEntityLocalId) {
      invalidCount++;
      continue;
    }

    // Verify subject entity exists
    const subjectEntity = subjectEntities.find(
      (e) => e.localId === raw.subjectEntityLocalId,
    );
    if (!subjectEntity) {
      invalidCount++;
      continue;
    }

    // Verify claim text contains subject name
    if (!raw.text.toLowerCase().includes(subjectEntity.name.toLowerCase())) {
      invalidCount++;
      continue;
    }

    // If there's an object entity, verify it exists
    if (raw.objectEntityLocalId) {
      const objectEntity = allKnownEntities.find(
        (e) => e.localId === raw.objectEntityLocalId,
      );
      if (!objectEntity) {
        invalidCount++;
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

  return {
    claims: validClaims,
    count: validClaims.length,
    invalidClaimsCount: invalidCount,
  };
};

/**
 * Extract Claims Step
 *
 * Workflow step that wraps the claimExtractionAgent with typed I/O.
 *
 * Input: Text + entities + entity type schema
 * Output: Array of structured claims
 */
export const extractClaimsStep = createStep({
  id: "extract-claims",
  description:
    "Extract structured claims about entities from text using claim extraction agent",
  inputSchema: ExtractClaimsInputSchema,
  outputSchema: ExtractClaimsOutputSchema,
  execute: async ({ inputData }) => {
    const prompt = buildPrompt(inputData);

    // Call the agent with the constructed prompt
    const result = await claimExtractionAgent.generate(prompt);

    // Parse the response to extract claims
    const output = parseAgentResponse(
      result,
      inputData.subjectEntities,
      inputData.potentialObjectEntities,
    );

    return output;
  },
});

/**
 * Helper to create input for this step from workflow data
 */
export const createExtractClaimsInput = (params: {
  text: string;
  researchGoal: string;
  subjectEntities: LocalEntitySummary[];
  potentialObjectEntities: LocalEntitySummary[];
  dereferencedType: DereferencedEntityTypeWithSimplifiedKeys;
  sourceUrl?: string;
}): ExtractClaimsInput => ({
  text: params.text,
  researchGoal: params.researchGoal,
  subjectEntities: params.subjectEntities,
  potentialObjectEntities: params.potentialObjectEntities,
  entityType: {
    $id: params.dereferencedType.schema.$id,
    title: params.dereferencedType.schema.title,
    properties: params.dereferencedType.schema.properties,
  },
  sourceUrl: params.sourceUrl,
});
