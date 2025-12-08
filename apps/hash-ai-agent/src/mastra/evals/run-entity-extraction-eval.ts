/**
 * Entity Extraction Evaluation Runner
 *
 * Runs baseline evaluation of the entity summary extraction agent
 * using the NER test cases and entity recall scorer.
 *
 * Usage:
 *   pnpm tsx src/mastra/evals/run-entity-extraction-eval.ts
 */

import { runEvals } from "@mastra/core/evals";

import { entitySummaryAgent } from "../agents/entity-summary-agent";
import { entityRecallScorer } from "../scorers/entity-recall-scorer";
import { nerTestCases } from "./test-data/ner-test-cases";

async function main() {
  console.log("🧪 Running Entity Extraction Evaluation");
  console.log(`📊 Test cases: ${nerTestCases.length}`);
  console.log("━".repeat(60));

  const result = await runEvals({
    target: entitySummaryAgent,
    data: nerTestCases.map((testCase) => ({
      // Agent input: construct user message with text + goal
      input: `TEXT:
${testCase.context}

RESEARCH GOAL:
${testCase.relevantEntitiesPrompt}

ENTITY TYPES:
${testCase.entityType.$id} (${testCase.entityType.title})`,
      // Pass test case in metadata for scorer to access ground truth
      requestContext: {
        metadata: {
          testCase,
        },
      },
    })),
    scorers: [entityRecallScorer],
    concurrency: 2, // Run 2 test cases at a time
    onItemComplete: ({ item, targetResult, scorerResults }) => {
      const testCase = item.requestContext?.metadata?.testCase;
      const score = scorerResults[entityRecallScorer.id];

      console.log(`\n✓ ${testCase?.name || "Test case"}`);
      console.log(`  Score: ${score?.score?.toFixed(2) ?? "N/A"}`);
      console.log(`  ${score?.reason ?? "No reason provided"}`);
      console.log("━".repeat(60));
    },
  });

  console.log("\n📈 EVALUATION SUMMARY");
  console.log("━".repeat(60));
  console.log(`Total test cases: ${result.summary.totalItems}`);
  console.log(`\nAverage Scores:`);
  for (const [scorerName, avgScore] of Object.entries(result.scores)) {
    console.log(
      `  ${scorerName}: ${typeof avgScore === "number" ? avgScore.toFixed(3) : avgScore}`,
    );
  }
  console.log("━".repeat(60));

  return result;
}

main()
  .then((result) => {
    console.log("\n✅ Evaluation complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Evaluation failed:", error);
    process.exit(1);
  });
