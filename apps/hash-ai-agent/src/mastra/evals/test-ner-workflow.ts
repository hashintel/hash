/* eslint-disable no-console */
/**
 * Test script for the NER Workflow
 *
 * This script tests the full NER pipeline:
 * 1. Entity extraction
 * 2. Deduplication
 * 3. Claim extraction
 * 4. Entity proposal
 *
 * Usage:
 *   pnpm tsx src/mastra/evals/test-ner-workflow.ts
 */

import {
  nerWorkflow,
  getDefaultEntityTypeIds,
} from "../workflows/ner-workflow.js";

// Sample text with people and organizations
const sampleText = `
OpenAI, founded in 2015 by Sam Altman and Elon Musk, has become one of the leading
AI research companies. Sam Altman serves as the CEO of OpenAI. The company is
headquartered in San Francisco, California.

In November 2022, OpenAI released ChatGPT, which quickly gained millions of users.
Microsoft invested $10 billion in OpenAI in January 2023, making it the largest
investor in the company.

Elon Musk, who is also the CEO of Tesla and SpaceX, left the OpenAI board in 2018
but remains a notable figure in AI discussions. He has been critical of OpenAI's
direction since leaving.

Sam Altman previously ran Y Combinator, one of Silicon Valley's most successful
startup accelerators. He took over as president of Y Combinator in 2014.
`;

async function testNerWorkflow() {
  console.log("🧪 Testing NER Workflow");
  console.log("━".repeat(60));

  const entityTypeIds = getDefaultEntityTypeIds();
  console.log(`\n📋 Entity types to extract: ${entityTypeIds.length}`);
  entityTypeIds.forEach((id) => console.log(`   - ${id}`));

  console.log(`\n📄 Sample text length: ${sampleText.length} chars`);
  console.log("━".repeat(60));

  console.log("\n🚀 Running NER workflow...\n");

  try {
    const startTime = Date.now();

    const result = await nerWorkflow.start({
      inputData: {
        text: sampleText,
        researchGoal:
          "Find all people and organizations mentioned in the text, along with their relationships and key facts.",
        entityTypeIds,
        useFixtures: true,
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Workflow completed in ${elapsed}s`);
    console.log("━".repeat(60));

    // Access the result - it should be the output of the last step
    const output = result.result as any;

    if (output?.stats) {
      console.log("\n📊 Statistics:");
      console.log(
        `   Entity types processed: ${output.stats.entityTypesProcessed}`,
      );
      console.log(
        `   Total entities extracted: ${output.stats.totalEntitiesExtracted}`,
      );
      console.log(
        `   Unique after dedup: ${output.stats.uniqueEntitiesAfterDedup}`,
      );
      console.log(`   Total claims: ${output.stats.totalClaims}`);
      console.log(`   Proposed entities: ${output.stats.proposedEntities}`);
      console.log(`   Abandoned entities: ${output.stats.abandonedEntities}`);
    }

    if (output?.entitySummaries?.length > 0) {
      console.log("\n👤 Entity Summaries:");
      for (const entity of output.entitySummaries) {
        console.log(`   - ${entity.name}: ${entity.summary.substring(0, 80)}...`);
      }
    }

    if (output?.claims?.length > 0) {
      console.log("\n📝 Sample Claims (first 5):");
      for (const claim of output.claims.slice(0, 5)) {
        const phrases =
          claim.prepositionalPhrases?.length > 0
            ? ` (${claim.prepositionalPhrases.join(", ")})`
            : "";
        console.log(`   - ${claim.text}${phrases}`);
      }
    }

    if (output?.proposedEntities?.length > 0) {
      console.log("\n🏢 Proposed Entities:");
      for (const entity of output.proposedEntities) {
        const propCount = Object.keys(entity.properties || {}).length;
        console.log(
          `   - ${entity.summary?.substring(0, 50)}... (${propCount} properties)`,
        );
      }
    }

    console.log("\n━".repeat(60));
    console.log("✅ Test complete!");

    // Return result for programmatic use
    return output;
  } catch (error) {
    console.error("\n❌ Error running workflow:", error);
    throw error;
  }
}

// Run the test
testNerWorkflow()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
