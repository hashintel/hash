/**
 * Simple test script to verify entity extraction agent works
 *
 * Usage:
 *   pnpm tsx src/mastra/evals/test-entity-extraction.ts
 */

import { entitySummaryAgent } from '../agents/entity-summary-agent';
import { nerTestCases } from './test-data/ner-test-cases';

async function testEntityExtraction() {
  console.log('🧪 Testing Entity Summary Agent');
  console.log('━'.repeat(60));

  // Use the first test case for a quick smoke test
  const testCase = nerTestCases[0]!;

  console.log(`\n📝 Test Case: ${testCase.name}`);
  console.log(`🎯 Entity Type: ${testCase.entityType.title}`);
  console.log(`🔍 Goal: ${testCase.relevantEntitiesPrompt}`);
  console.log(`📄 Context length: ${testCase.context.length} chars`);
  console.log('━'.repeat(60));

  const prompt = `TEXT:
${testCase.context}

RESEARCH GOAL:
${testCase.relevantEntitiesPrompt}

ENTITY TYPES:
${testCase.entityType.$id} (${testCase.entityType.title})

Please extract all entities matching the research goal.`;

  console.log('\n🤖 Running agent...\n');

  try {
    const result = await entitySummaryAgent.generate(prompt);

    console.log('✅ Agent Response:');
    console.log(JSON.stringify(result, null, 2));

    // Extract entity names from tool calls
    const toolCalls = result.toolCalls ?? [];
    const registerCall = toolCalls.find(
      (tc) => tc.name === 'register-entity-summaries' || tc.name === 'registerEntitySummaries'
    );

    if (registerCall) {
      const entitySummaries = registerCall.args?.entitySummaries ?? [];
      const extractedNames = entitySummaries.map((e: any) => e.name);

      console.log(`\n📊 Extracted ${extractedNames.length} entities:`);
      extractedNames.forEach((name: string) => console.log(`  - ${name}`));

      console.log(`\n🎯 Expected (gold) entities: ${testCase.goldEntities.length}`);
      testCase.goldEntities.forEach((e) => console.log(`  - ${e.name}`));

      console.log(`\n❌ Should avoid (wrong type): ${testCase.wrongTypeEntities.length}`);
      testCase.wrongTypeEntities.forEach((e) => console.log(`  - ${e.name}`));
    } else {
      console.log('⚠️  No registerEntitySummaries tool call found in response');
    }
  } catch (error) {
    console.error('❌ Error running agent:', error);
    throw error;
  }

  console.log('\n━'.repeat(60));
  console.log('✅ Test complete!');
}

testEntityExtraction()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
