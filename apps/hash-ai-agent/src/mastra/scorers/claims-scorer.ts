import { createScorer } from "@mastra/core/evals";
import { z } from "zod";

/**
 * Zod schema for a claim extracted by the claim extraction agent.
 */
const zClaim = z.object({
  subjectEntityLocalId: z.string().nullable(),
  objectEntityLocalId: z.string().nullable().optional(),
  text: z.string(),
  prepositionalPhrases: z.array(z.string()),
});

/**
 * Schema for discovered entities (from entity summary step).
 */
const zDiscoveredEntity = z.object({
  localId: z.string(),
  name: z.string(),
});

/**
 * Ground truth schema for claims validation.
 */
const zGroundTruth = z.object({
  discoveredEntities: z.array(zDiscoveredEntity),
});

/**
 * Analysis result schema.
 */
const zAnalysisResult = z.object({
  totalClaims: z.number(),
  validClaims: z.number(),
  invalidClaims: z.array(
    z.object({
      claimText: z.string(),
      errors: z.array(z.string()),
    }),
  ),
});

/**
 * Claims structure scorer.
 *
 * Validates that claims from the claim extraction agent:
 * 1. Have valid subject entity IDs (exist in discovered entities)
 * 2. Have valid object entity IDs if provided (exist in discovered entities)
 * 3. Have non-empty text
 * 4. Contain the subject entity name in the claim text
 * 5. Contain the object entity name in the claim text (if object provided)
 */
export const claimsStructureScorer = createScorer({
  id: "claims-structure",
  description: "Validates claim structure and entity ID references",
  type: "agent",
  judge: {
    model: "openrouter/google/gemini-2.5-flash-lite",
    instructions: `You are an expert at validating structured claims extracted from text.
Your task is to check if extracted claims are well-formed and reference valid entities.
Be strict: claims must properly reference entities by their IDs and include entity names in the claim text.`,
  },
})
  .preprocess(({ run }) => {
    // Extract claims from agent's tool call output
    const output = run.output as unknown as Record<string, unknown>;

    // Try to find toolCalls in various locations
    let toolCalls: { toolName: string; args: unknown }[] = [];
    if (Array.isArray(output.toolCalls)) {
      toolCalls = output.toolCalls as { toolName: string; args: unknown }[];
    } else if (Array.isArray(output)) {
      for (const item of output) {
        if (
          typeof item === "object" &&
          item !== null &&
          "toolCalls" in item &&
          Array.isArray((item as Record<string, unknown>).toolCalls)
        ) {
          toolCalls = (item as Record<string, unknown>).toolCalls as {
            toolName: string;
            args: unknown;
          }[];
          break;
        }
      }
    }

    const submitCall = toolCalls.find((tc) => tc.toolName === "submit-claims");

    let claims: z.infer<typeof zClaim>[] = [];
    if (submitCall?.args) {
      const args = submitCall.args as { claims?: unknown[] };
      if (Array.isArray(args.claims)) {
        claims = args.claims.map((claim) => zClaim.parse(claim));
      }
    }

    // Parse ground truth (discovered entities from previous step)
    const groundTruth = zGroundTruth.parse(run.groundTruth);

    return {
      claims,
      discoveredEntities: groundTruth.discoveredEntities,
    };
  })
  .analyze({
    description: "Validate each claim's structure against discovered entities",
    outputSchema: zAnalysisResult,
    createPrompt: ({ results }) => {
      const { claims, discoveredEntities } = results.preprocessStepResult as {
        claims: z.infer<typeof zClaim>[];
        discoveredEntities: z.infer<typeof zDiscoveredEntity>[];
      };

      return `Validate each claim against the discovered entities.

DISCOVERED ENTITIES (from entity extraction step):
${JSON.stringify(discoveredEntities, null, 2)}

CLAIMS TO VALIDATE:
${JSON.stringify(claims, null, 2)}

For each claim, check:
1. If subjectEntityLocalId is provided, it must exist in discovered entities
2. If objectEntityLocalId is provided, it must exist in discovered entities
3. The claim text must be non-empty
4. The claim text should contain the subject entity's name (fuzzy match allowed)
5. If objectEntityLocalId is provided, the claim text should contain the object entity's name

Return JSON with:
- totalClaims: total number of claims
- validClaims: number of claims passing all checks
- invalidClaims: array of objects with claimText and errors (array of error descriptions)`;
    },
  })
  .generateScore(({ results }) => {
    const analysis = results.analyzeStepResult;
    const { totalClaims, validClaims } = analysis;

    // Return ratio of valid claims
    if (totalClaims === 0) {
      // No claims extracted - could be valid if no entities found
      return 0.5;
    }

    return validClaims / totalClaims;
  })
  .generateReason(({ results, score }) => {
    const analysis = results.analyzeStepResult;
    const { totalClaims, validClaims, invalidClaims } = analysis;

    const errorSummary =
      invalidClaims.length > 0
        ? ` Errors: ${invalidClaims
            .slice(0, 3)
            .map((claim) => claim.errors.join(", "))
            .join("; ")}${invalidClaims.length > 3 ? "..." : ""}`
        : "";

    return `Score: ${score.toFixed(2)}. ${validClaims}/${totalClaims} claims valid.${errorSummary}`;
  });
