import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Tool for agent to report discovered entity summaries
 */

export const registerEntitySummariesTool = createTool({
  id: "register-entity-summaries",
  description:
    "Register entity summaries for all entities relevant to the research goal.",
  inputSchema: z.object({
    entitySummaries: z.array(
      z.object({
        name: z.string().describe("The name of the entity"),
        summary: z.string().describe("The summary of the entity"),
        type: z
          .string()
          .describe(
            "The type of entity – either the entityTypeId of a type provided to you, or the name of a new type you suggest",
          ),
      }),
    ),
  }),
  outputSchema: z.object({
    registered: z.boolean(),
    count: z.number(),
  }),
  execute: async ({ entitySummaries }) => {
    // Tool execution is handled by the workflow step
    // This tool just provides the schema for the agent to call
    return Promise.resolve({
      registered: true,
      count: entitySummaries.length,
    });
  },
});
