import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Tool for agent to propose an entity with properties
 */

export const proposeEntityTool = createTool({
  id: "propose-entity",
  description:
    "Propose an entity based on the provided claims. Fill out as many properties as possible.",
  inputSchema: z.object({
    properties: z.record(
      z.string(),
      z.object({
        propertyValue: z
          .unknown()
          .describe("The value for this property, as extracted from claims"),
        claimIdsUsedToDetermineValue: z
          .array(z.string())
          .describe(
            "The claim IDs of the claims used to determine this property value",
          ),
      }),
    ),
  }),
  outputSchema: z.object({
    proposed: z.boolean(),
    propertyCount: z.number(),
  }),
  execute: async ({ properties }) => {
    return Promise.resolve({
      proposed: true,
      propertyCount: Object.keys(properties).length,
    });
  },
});
