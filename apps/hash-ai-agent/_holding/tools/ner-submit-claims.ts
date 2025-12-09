import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Tool for agent to submit extracted claims
 */

export const submitClaimsTool = createTool({
  id: "submit-claims",
  description:
    "Submit an exhaustive list of claims based on the information provided in the text, ensuring no information about the entity is missed.",
  inputSchema: z.object({
    claims: z.array(
      z.object({
        subjectEntityLocalId: z
          .string()
          .nullable()
          .describe(
            "The localId of the subject entity of the claim. If you don't have a relevant subject entity, pass null.",
          ),
        text: z.string().describe(
          `The text containing the claim, which:
- must follow a consistent sentence structure with a single subject, predicate, and object
- must have one of the subject entities as the singular subject of the claim
- must be concise statements that are true based on the information in the text
- must be standalone and not depend on contextual information
- must not contain pronouns - refer to all entities by name
- must not be lists or contain multiple pieces of information
- must not include prepositional phrases (provide those separately)`,
        ),
        prepositionalPhrases: z
          .array(z.string())
          .describe(
            "A list of prepositional phrases providing additional context. Examples: 'on January 1, 2022', 'for $8.5 billion'",
          ),
        objectEntityLocalId: z
          .string()
          .nullable()
          .describe(
            "The local ID of the entity that the claim is related to. If the claim does not have another entity as its object, provide null.",
          ),
      }),
    ),
  }),
  outputSchema: z.object({
    submitted: z.boolean(),
    count: z.number(),
  }),
  execute: async ({ claims }) => {
    return Promise.resolve({
      submitted: true,
      count: claims.length,
    });
  },
});
