import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Tool to abandon an entity that cannot be properly constructed
 */

export const abandonEntityTool = createTool({
  id: "abandon-entity",
  description:
    "If it is not possible to satisfy the entity schema based on the provided claims, abandon the entity.",
  inputSchema: z.object({
    explanation: z
      .string()
      .describe(
        "The reason why the entity cannot be proposed based on the provided claims.",
      ),
  }),
  outputSchema: z.object({
    abandoned: z.boolean(),
  }),
  execute: async () => {
    return Promise.resolve({
      abandoned: true,
    });
  },
});
