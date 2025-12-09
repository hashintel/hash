import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  availableEntityTypeIds,
  getDereferencedEntityTypes as getFromFixtures,
} from "../fixtures/entity-types.js";
import type { DereferencedEntityTypeWithSimplifiedKeys } from "../shared/dereference-entity-type.js";

/**
 * Tool: Get Dereferenced Entity Types
 *
 * Retrieves dereferenced entity type schemas for a list of entity type IDs.
 * In test mode, uses fixtures. In production, would call the Graph API.
 *
 * Dereferencing resolves all $ref pointers in the JSON Schema, producing
 * a self-contained schema that LLMs can understand without external references.
 */

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
    entityTypeIds: z.array(z.string()).min(1).meta({
      description:
        "Array of versioned entity type URLs (e.g., https://hash.ai/@h/types/entity-type/person/v/1)",
    }),
    useFixtures: z.boolean().default(true).meta({
      description:
        "Whether to use fixture data (default: true). Set to false for production Graph API calls.",
    }),
  }),
  outputSchema: z.object({
    dereferencedTypes: z
      .record(z.string(), zDereferencedEntityTypeWithSimplifiedKeys)
      .meta({ description: "Map of entity type ID to dereferenced schema" }),
    foundTypeIds: z
      .array(z.string())
      .meta({ description: "Entity type IDs that were found" }),
    missingTypeIds: z
      .array(z.string())
      .meta({ description: "Entity type IDs that were not found" }),
  }),
  execute: async ({ entityTypeIds, useFixtures = true }) => {
    if (useFixtures) {
      // Use fixture data for testing
      const dereferencedTypes = getFromFixtures(entityTypeIds);
      const foundTypeIds = Object.keys(dereferencedTypes);
      const missingTypeIds = entityTypeIds.filter(
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        (id) => !dereferencedTypes[id],
      );

      return Promise.resolve({
        dereferencedTypes,
        foundTypeIds,
        missingTypeIds,
      });
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
