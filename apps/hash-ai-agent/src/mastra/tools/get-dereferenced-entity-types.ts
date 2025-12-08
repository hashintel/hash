/**
 * Tool: Get Dereferenced Entity Types
 *
 * Retrieves dereferenced entity type schemas for a list of entity type IDs.
 * In test mode, uses fixtures. In production, would call the Graph API.
 *
 * Dereferencing resolves all $ref pointers in the JSON Schema, producing
 * a self-contained schema that LLMs can understand without external references.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  getDereferencedEntityTypes as getFromFixtures,
  availableEntityTypeIds,
} from "../fixtures/entity-types/index.js";
import type { DereferencedEntityTypeWithSimplifiedKeys } from "../shared/dereference-entity-type.js";

/**
 * Zod schema for a dereferenced property type
 */
const DereferencedPropertyTypeSchema = z.object({
  $id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  oneOf: z.array(z.unknown()),
});

/**
 * Zod schema for a dereferenced entity type's schema portion
 */
const DereferencedEntityTypeSchemaSchema = z.object({
  $id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  labelProperty: z.string().optional(),
  links: z.record(z.unknown()).optional(),
  properties: z.record(
    z.union([
      DereferencedPropertyTypeSchema,
      z.object({
        type: z.literal("array"),
        items: DereferencedPropertyTypeSchema,
        minItems: z.number().optional(),
        maxItems: z.number().optional(),
      }),
    ]),
  ),
  additionalProperties: z.literal(false),
});

/**
 * Zod schema for the full dereferenced entity type with mappings
 */
export const DereferencedEntityTypeWithSimplifiedKeysSchema = z.object({
  isLink: z.boolean(),
  parentIds: z.array(z.string()),
  schema: DereferencedEntityTypeSchemaSchema,
  simplifiedPropertyTypeMappings: z.record(z.string()),
  reverseSimplifiedPropertyTypeMappings: z.record(z.string()),
});

/**
 * Tool to retrieve dereferenced entity types by their IDs
 *
 * This is a deterministic tool (no LLM inference) that resolves
 * entity type schemas. It uses fixtures for testing and would
 * call the Graph API in production.
 */
export const getDereferencedEntityTypesTool = createTool({
  id: "get-dereferenced-entity-types",
  description:
    "Retrieve dereferenced entity type schemas for a list of entity type IDs. Returns self-contained JSON schemas with all $ref pointers resolved.",
  inputSchema: z.object({
    entityTypeIds: z
      .array(z.string())
      .min(1)
      .describe(
        "Array of versioned entity type URLs (e.g., https://hash.ai/@h/types/entity-type/person/v/1)",
      ),
    useFixtures: z
      .boolean()
      .default(true)
      .describe(
        "Whether to use fixture data (default: true). Set to false for production Graph API calls.",
      ),
  }),
  outputSchema: z.object({
    dereferencedTypes: z.record(DereferencedEntityTypeWithSimplifiedKeysSchema),
    foundTypeIds: z.array(z.string()),
    missingTypeIds: z.array(z.string()),
  }),
  execute: async ({ entityTypeIds, useFixtures = true }) => {
    if (useFixtures) {
      // Use fixture data for testing
      const dereferencedTypes = getFromFixtures(entityTypeIds);
      const foundTypeIds = Object.keys(dereferencedTypes);
      const missingTypeIds = entityTypeIds.filter(
        (id) => !dereferencedTypes[id],
      );

      return {
        dereferencedTypes,
        foundTypeIds,
        missingTypeIds,
      };
    }

    // Production mode: would call Graph API here
    // For now, throw an error indicating production mode isn't implemented
    throw new Error(
      "Production mode (Graph API) not yet implemented. Use useFixtures: true for testing.",
    );
  },
});

/**
 * Get available entity type IDs in fixtures
 * Useful for tests to know what types are available
 */
export const getAvailableFixtureEntityTypeIds = (): string[] => {
  return [...availableEntityTypeIds];
};

/**
 * Helper function to get dereferenced types without the tool wrapper
 * Useful for direct calls in workflow steps
 */
export const getDereferencedEntityTypes = (
  entityTypeIds: string[],
  useFixtures = true,
): Record<string, DereferencedEntityTypeWithSimplifiedKeys> => {
  if (useFixtures) {
    return getFromFixtures(entityTypeIds);
  }
  throw new Error(
    "Production mode (Graph API) not yet implemented. Use useFixtures: true for testing.",
  );
};
