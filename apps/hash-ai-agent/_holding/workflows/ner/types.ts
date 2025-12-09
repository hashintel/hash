import { z } from "zod";

export const zNerWorkflowInput = z.object({
  /** The source text to extract entities from */
  text: z.string().describe("The source text to extract entities from"),

  /** The research goal describing what entities are relevant */
  researchGoal: z
    .string()
    .describe("Research goal describing what entities are relevant"),

  /** Entity type IDs to look for */
  entityTypeIds: z
    .array(z.string())
    .describe("Entity type IDs to extract (e.g., person, organization)"),

  /** Optional source URL for provenance tracking */
  sourceUrl: z.string().optional(),

  /** Whether to use fixtures (default: true for testing) */
  useFixtures: z.boolean().default(true),
});

export const zNerWorkflowOutput = z.object({
  /** Proposed entities with full properties */
  proposedEntities: z.array(z.unknown()), // ProposedEntity

  /** All extracted claims */
  claims: z.array(z.unknown()), // Claim

  /** Entity summaries (before proposals) */
  entitySummaries: z.array(z.unknown()), // LocalEntitySummary

  /** Statistics */
  stats: z.object({
    entityTypesProcessed: z.number(),
    totalEntitiesExtracted: z.number(),
    uniqueEntitiesAfterDedup: z.number(),
    totalClaims: z.number(),
    proposedEntities: z.number(),
    abandonedEntities: z.number(),
  }),
});

export type NerWorkflowInput = z.infer<typeof zNerWorkflowInput>;
export type NerWorkflowOutput = z.infer<typeof zNerWorkflowOutput>;
