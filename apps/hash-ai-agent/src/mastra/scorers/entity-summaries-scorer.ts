import { createScorer } from "@mastra/core/evals";
import { z } from "zod";

const zEntitySummary = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const zGroundTruth = z.object({
  goldEntities: z.array(zEntitySummary),
  irrelevantEntities: z.array(zEntitySummary),
  wrongTypeEntities: z.array(zEntitySummary),
});

const zAnalysisResult = z.object({
  matchedGoldEntities: z.array(z.string()),
  missingGoldEntities: z.array(z.string()),
  matchedIrrelevantEntities: z.array(z.string()),
  matchedWrongTypeEntities: z.array(z.string()),
  totalExtracted: z.number(),
});

export const entitySummariesCompositeScorer = createScorer({
  id: "entity-summaries",
  description:
    "Evaluates entity extraction against gold/irrelevant/wrongType entity lists",
  type: "agent",
  judge: {
    model: "openrouter/google/gemini-2.5-flash-lite",
    instructions: `You are an expert at comparing entity names for semantic equivalence.
Your task is to match extracted entities against reference lists.
Consider name variations (e.g., "OpenAI" matches "Open AI", "Microsoft Corp" matches "Microsoft").
Be precise: only match entities that clearly refer to the same real-world entity.`,
  },
})
  .preprocess(({ run }) => {
    // Extract entity names from agent's tool call output
    // run.output structure varies - try multiple paths to find tool calls
    const output = run.output as unknown as Record<string, unknown>;

    // Try to find toolCalls in various locations
    let toolCalls: { toolName: string; args: unknown }[] = [];
    if (Array.isArray(output.toolCalls)) {
      toolCalls = output.toolCalls as { toolName: string; args: unknown }[];
    } else if (Array.isArray(output)) {
      // Output might be an array of steps/messages
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

    const registerCall = toolCalls.find(
      (tc) => tc.toolName === "register-entity-summaries",
    );

    let extractedNames: string[] = [];
    if (registerCall?.args) {
      const args = registerCall.args as {
        entitySummaries?: { name: string }[];
      };
      if (Array.isArray(args.entitySummaries)) {
        extractedNames = args.entitySummaries.map((entity) => entity.name);
      }
    }

    // Parse ground truth
    const groundTruth = zGroundTruth.parse(run.groundTruth);

    return {
      extractedNames,
      goldNames: groundTruth.goldEntities.map((entity) => entity.name),
      irrelevantNames: groundTruth.irrelevantEntities.map(
        (entity) => entity.name,
      ),
      wrongTypeNames: groundTruth.wrongTypeEntities.map(
        (entity) => entity.name,
      ),
    };
  })
  .analyze({
    description:
      "Match extracted entities against gold/irrelevant/wrongType lists using fuzzy matching",
    outputSchema: zAnalysisResult,
    createPrompt: ({ results }) => {
      const { extractedNames, goldNames, irrelevantNames, wrongTypeNames } =
        results.preprocessStepResult as {
          extractedNames: string[];
          goldNames: string[];
          irrelevantNames: string[];
          wrongTypeNames: string[];
        };
      return `Compare extracted entity names against reference lists.

EXTRACTED ENTITIES (from agent):
${JSON.stringify(extractedNames, null, 2)}

GOLD ENTITIES (should be found):
${JSON.stringify(goldNames, null, 2)}

IRRELEVANT ENTITIES (correct type, but shouldn't be found):
${JSON.stringify(irrelevantNames, null, 2)}

WRONG TYPE ENTITIES (wrong type, shouldn't be found):
${JSON.stringify(wrongTypeNames, null, 2)}

For each list, determine which extracted entities match (fuzzy matching allowed for name variations).
Return JSON with:
- matchedGoldEntities: gold entity names that were found in extracted
- missingGoldEntities: gold entity names NOT found in extracted
- matchedIrrelevantEntities: irrelevant entity names found in extracted
- matchedWrongTypeEntities: wrong-type entity names found in extracted
- totalExtracted: count of all extracted entities`;
    },
  })
  .generateScore(({ results }) => {
    const pre = results.preprocessStepResult as {
      goldNames: string[];
      irrelevantNames: string[];
      wrongTypeNames: string[];
    };
    const analysis = results.analyzeStepResult;

    const goldCount = pre.goldNames.length;
    const irrelevantCount = pre.irrelevantNames.length;
    const wrongTypeCount = pre.wrongTypeNames.length;

    const hasGold = goldCount > 0;
    const hasIrrelevant = irrelevantCount > 0;
    const hasWrongType = wrongTypeCount > 0;

    // Calculate weight for missing gold entities
    let missingWeight = 0;
    if (hasGold) {
      if (hasWrongType && hasIrrelevant) {
        missingWeight = 0.5;
      } else if (hasWrongType) {
        missingWeight = 0.7;
      } else if (hasIrrelevant) {
        missingWeight = 0.8;
      } else {
        missingWeight = 1.0;
      }
    }

    const missingPenalty = hasGold
      ? missingWeight * (analysis.missingGoldEntities.length / goldCount)
      : 0;

    const irrelevantWeight = hasIrrelevant ? 0.2 : 0;
    const irrelevantPenalty = hasIrrelevant
      ? irrelevantWeight *
        (analysis.matchedIrrelevantEntities.length / irrelevantCount)
      : 0;

    const wrongTypeWeight = 1 - missingWeight - irrelevantWeight;
    const wrongTypePenalty = hasWrongType
      ? wrongTypeWeight *
        (analysis.matchedWrongTypeEntities.length / wrongTypeCount)
      : 0;

    return Math.max(
      0,
      1 - missingPenalty - irrelevantPenalty - wrongTypePenalty,
    );
  })
  .generateReason(({ results, score }) => {
    const a = results.analyzeStepResult;
    return `Score: ${score.toFixed(2)}. Found ${a.matchedGoldEntities.length} gold entities, missed ${a.missingGoldEntities.length}. Incorrectly included ${a.matchedIrrelevantEntities.length} irrelevant and ${a.matchedWrongTypeEntities.length} wrong-type entities. Total extracted: ${a.totalExtracted}.`;
  });
