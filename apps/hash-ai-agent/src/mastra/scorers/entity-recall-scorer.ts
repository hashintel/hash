/**
 * Entity Recall Scorer
 *
 * Measures the completeness of entity extraction - what percentage of expected
 * "gold" entities were found by the extraction agent.
 *
 * Ported from hash-ai-worker-ts evaluation logic:
 *   /activities/flow-activities/shared/infer-summaries-then-claims-from-text/
 *   get-entity-summaries-from-text.optimize.ai.test.ts
 *
 * Scoring methodology:
 * - 1.0 = All gold entities found, no false positives
 * - Penalties applied for:
 *   - Missing gold entities (weighted by importance)
 *   - Identifying irrelevant entities (false positives)
 *   - Identifying wrong-type entities (correct name, wrong classification)
 */

import { createScorer } from '@mastra/evals';
import { z } from 'zod';
import type { NERTestCase } from '../evals/test-data/ner-test-cases';
import { calculateNERScore } from '../evals/test-data/ner-test-cases';

/**
 * Entity Recall Scorer
 *
 * Evaluates entity extraction quality using a 4-step pipeline:
 * 1. Preprocess: Extract entity names from agent output
 * 2. Analyze: Compare against ground truth (gold/irrelevant/wrong-type entities)
 * 3. GenerateScore: Calculate 0-1 score with weighted penalties
 * 4. GenerateReason: Provide natural language explanation
 */
export const entityRecallScorer = createScorer({
  name: 'Entity Recall',
  description: 'Measures percentage of expected entities found and accuracy of extraction',
  type: 'agent',
})
  .preprocess(({ run }) => {
    // Extract entity names from the agent's output
    // Assumes the agent used registerEntitySummaries tool
    const toolCalls = run.output?.toolCalls ?? [];
    const registerCall = toolCalls.find(
      (tc: any) => tc.name === 'register-entity-summaries' || tc.name === 'registerEntitySummaries'
    );

    const entitySummaries = registerCall?.input?.entitySummaries ?? [];
    const extractedEntityNames = entitySummaries.map((e: any) => e.name);

    // Get ground truth from run metadata
    // The test case should be passed in run.metadata.testCase
    const testCase = run.metadata?.testCase as NERTestCase | undefined;

    if (!testCase) {
      throw new Error('Test case not found in run metadata');
    }

    return {
      extractedEntityNames,
      testCase,
    };
  })
  .analyze({
    description: 'Compare extracted entities against ground truth to identify matches and misses',
    outputSchema: z.object({
      foundGold: z.array(z.string()).describe('Gold entities that were found'),
      missedGold: z.array(z.string()).describe('Gold entities that were missed'),
      foundIrrelevant: z.array(z.string()).describe('Irrelevant entities incorrectly identified'),
      foundWrongType: z.array(z.string()).describe('Entities with correct name but wrong type'),
      totalExtracted: z.number().describe('Total number of entities extracted'),
      totalGold: z.number().describe('Total number of gold entities'),
    }),
    createPrompt: ({ results }) => {
      const { extractedEntityNames, testCase } = results.preprocessStepResult;

      return `Compare the extracted entity names against the ground truth.

EXTRACTED ENTITIES:
${extractedEntityNames.join(', ')}

GROUND TRUTH:

Gold Entities (must find these):
${testCase.goldEntities.map(e => e.name).join(', ')}

Irrelevant Entities (should ignore these):
${testCase.irrelevantEntities.map(e => e.name).join(', ')}

Wrong-Type Entities (correct name but wrong entity type):
${testCase.wrongTypeEntities.map(e => e.name).join(', ')}

Identify:
1. Which gold entities were found vs. missed
2. Which irrelevant entities were incorrectly identified
3. Which wrong-type entities were found

Return the analysis in the specified schema.`;
    },
  })
  .generateScore(({ results }) => {
    const { extractedEntityNames, testCase } = results.preprocessStepResult;

    // Use the scoring logic ported from hash-ai-worker-ts
    const { score } = calculateNERScore(testCase, extractedEntityNames);

    return score;
  })
  .generateReason(({ results }) => {
    const { extractedEntityNames, testCase } = results.preprocessStepResult;
    const { report, breakdown } = calculateNERScore(testCase, extractedEntityNames);

    return `${report}

BREAKDOWN:
- Found gold entities: ${breakdown.foundGold.join(', ') || 'none'}
- Missed gold entities: ${breakdown.missedGold.join(', ') || 'none'}
- Found irrelevant entities: ${breakdown.foundIrrelevant.join(', ') || 'none'}
- Found wrong-type entities: ${breakdown.foundWrongType.join(', ') || 'none'}`;
  });
