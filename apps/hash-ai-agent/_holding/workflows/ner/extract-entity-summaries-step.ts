/**
 * Workflow Step: Extract Entity Summaries
 *
 * This step wraps the entitySummaryAgent to provide typed input/output.
 * It takes structured input (text, goal, entity types) and produces
 * a typed array of LocalEntitySummary objects.
 *
 * The step is the "type boundary" - it receives typed workflow data,
 * constructs a prompt string for the agent, and parses the response
 * back into typed output.
 */

import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { entitySummaryAgent } from "../../agents/ner-entity-summary.js";
import type { DereferencedEntityTypeWithSimplifiedKeys } from "../../shared/dereference-entity-type.js";
import { LocalEntitySummarySchema } from "../../types/entities.js";

/**
 * Input schema for the extract entity summaries step
 */
export const ExtractEntitySummariesInputSchema = z.object({
  /** The source text to extract entities from */
  text: z.string().describe("The source text to extract entities from"),

  /** The research goal describing what entities are relevant */
  researchGoal: z
    .string()
    .describe("Research goal describing what entities are relevant"),

  /** The entity type to look for (dereferenced schema with simplified keys) */
  entityType: z.object({
    $id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    properties: z.record(z.unknown()),
  }),

  /** Optional source URL for provenance tracking */
  sourceUrl: z.string().optional(),
});

export type ExtractEntitySummariesInput = z.infer<
  typeof ExtractEntitySummariesInputSchema
>;

/**
 * Output schema for the extract entity summaries step
 */
export const ExtractEntitySummariesOutputSchema = z.object({
  /** Extracted entity summaries */
  entities: z.array(LocalEntitySummarySchema),

  /** The entity type ID these entities belong to */
  entityTypeId: z.string(),

  /** Number of entities extracted */
  count: z.number(),
});

export type ExtractEntitySummariesOutput = z.infer<
  typeof ExtractEntitySummariesOutputSchema
>;

/**
 * Build a prompt string from typed input
 *
 * This is where we serialize the structured input into a format
 * the LLM can understand in its instructions.
 */
const buildPrompt = (input: ExtractEntitySummariesInput): string => {
  const propertyDescriptions = Object.entries(input.entityType.properties)
    .map(
      ([key, prop]: [string, any]) =>
        `  - ${key}: ${prop.description ?? prop.title ?? "no description"}`,
    )
    .join("\n");

  return `TEXT TO ANALYZE:
${input.text}

RESEARCH GOAL:
${input.researchGoal}

ENTITY TYPE TO EXTRACT:
ID: ${input.entityType.$id}
Title: ${input.entityType.title}
Description: ${input.entityType.description ?? "No description"}

Properties for this entity type:
${propertyDescriptions}

INSTRUCTIONS:
1. Read the text carefully and identify all entities that match the entity type "${input.entityType.title}"
2. For each entity found, provide its name as it appears in the text and a brief summary
3. Use the type ID "${input.entityType.$id}" for entities matching this type
4. If you find entities of a different type that might be relevant, you can suggest a new type name
5. Use the registerEntitySummaries tool to report all entities found

Remember: Extract ALL entities matching this type. Be thorough.`;
};

/**
 * Parse tool calls from agent response to extract entity summaries
 */
const parseAgentResponse = (
  result: any,
  entityTypeId: string,
): ExtractEntitySummariesOutput => {
  const toolCalls = result.toolCalls ?? [];

  const registerCall = toolCalls.find(
    (tc: any) =>
      tc.name === "register-entity-summaries" ||
      tc.name === "registerEntitySummaries",
  );

  if (!registerCall) {
    // No tool call found - return empty result
    return {
      entities: [],
      entityTypeId,
      count: 0,
    };
  }

  const rawSummaries = registerCall.args?.entitySummaries ?? [];

  // Convert raw summaries to LocalEntitySummary format
  const entities = rawSummaries.map((raw: any, index: number) => ({
    localId: `entity-${index + 1}`,
    name: raw.name ?? "Unknown",
    summary: raw.summary ?? "",
    entityTypeIds: [raw.type ?? entityTypeId],
  }));

  return {
    entities,
    entityTypeId,
    count: entities.length,
  };
};

/**
 * Extract Entity Summaries Step
 *
 * Workflow step that wraps the entitySummaryAgent with typed I/O.
 *
 * Input: Text + research goal + entity type schema
 * Output: Array of LocalEntitySummary objects
 *
 * Usage in workflow:
 * ```ts
 * const workflow = createWorkflow({ ... })
 *   .then(extractEntitySummariesStep)
 *   .commit();
 * ```
 */
export const extractEntitySummariesStep = createStep({
  id: "extract-entity-summaries",
  description:
    "Extract entity summaries from text using NER agent for a specific entity type",
  inputSchema: ExtractEntitySummariesInputSchema,
  outputSchema: ExtractEntitySummariesOutputSchema,
  execute: async ({ inputData }) => {
    const prompt = buildPrompt(inputData);

    // Call the agent with the constructed prompt
    const result = await entitySummaryAgent.generate(prompt);

    // Parse the response to extract entities
    const output = parseAgentResponse(result, inputData.entityType.$id);

    return output;
  },
});

/**
 * Helper to create input for this step from dereferenced entity types
 */
export const createExtractEntitySummariesInput = (params: {
  text: string;
  researchGoal: string;
  dereferencedType: DereferencedEntityTypeWithSimplifiedKeys;
  sourceUrl?: string;
}): ExtractEntitySummariesInput => ({
  text: params.text,
  researchGoal: params.researchGoal,
  entityType: {
    $id: params.dereferencedType.schema.$id,
    title: params.dereferencedType.schema.title,
    description: params.dereferencedType.schema.description,
    properties: params.dereferencedType.schema.properties,
  },
  sourceUrl: params.sourceUrl,
});
