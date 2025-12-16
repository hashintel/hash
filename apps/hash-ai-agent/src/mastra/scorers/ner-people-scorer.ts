import { createScorer } from '@mastra/core/evals';
import { z } from 'zod';

import { DEFAULT_MODEL, NAME_PROPERTY } from '../constants';

/** Schema for extracted person entity */
const zPersonEntity = z
  .object({
    [NAME_PROPERTY]: z.string(),
  })
  .passthrough(); // allow other properties like description

/** Ground truth schema */
const zGroundTruth = z.object({
  expectedPersons: z.array(zPersonEntity),
});

/** Analysis result schema */
const zAnalysisResult = z.object({
  /** Names that were correctly found */
  matchedPersons: z.array(z.string()),
  /** Expected names not found */
  missingPersons: z.array(z.string()),
  /** Names found but not expected (false positives) */
  extraPersons: z.array(z.string()),
  /** Count of extracted persons */
  totalExtracted: z.number(),
  /** Count of expected persons */
  totalExpected: z.number(),
});

/**
 * Scorer for evaluating NER people extraction.
 *
 * Evaluates:
 * 1. Completeness - Were all expected people found?
 * 2. Precision - Were only valid people extracted (no false positives)?
 * 3. Structure validity - Do extracted entities have the correct property keys?
 *
 * Uses fuzzy name matching via LLM judge to handle name variations
 * (e.g., "Bill Gates" matches "William Gates").
 */
export const nerPeopleScorer = createScorer({
  id: 'ner-people',
  description: 'Evaluates NER people extraction against expected persons list',
  judge: {
    model: DEFAULT_MODEL,
    instructions: `You are an expert at comparing person names for semantic equivalence.
Match extracted person names against reference lists.
Consider name variations (e.g., "Bill Gates" matches "William Gates", "Gates").
Be precise: only match names that clearly refer to the same real-world person.`,
  },
})
  .preprocess(({ run }) => {
    // Extract person names from step output (which should be an array)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const output = run.output;
    const extractedNames: string[] = [];

    if (!Array.isArray(output)) {
      // eslint-disable-next-line no-console
      console.warn('[nerPeopleScorer] Expected run.output to be an array, got:', typeof output);
    } else {
      for (const person of output) {
        const personObj = person as Record<string, unknown>;
        const name = personObj[NAME_PROPERTY];
        if (typeof name === 'string') {
          extractedNames.push(name);
        }
      }
    }

    // Parse ground truth
    const groundTruth = zGroundTruth.parse(run.groundTruth);
    const expectedNames = groundTruth.expectedPersons.map((person) => person[NAME_PROPERTY]);

    return { extractedNames, expectedNames };
  })
  .analyze({
    description: 'Match extracted person names against expected persons using fuzzy matching',
    outputSchema: zAnalysisResult,
    createPrompt: ({ results }) => {
      const { extractedNames, expectedNames } = results.preprocessStepResult as {
        extractedNames: string[];
        expectedNames: string[];
      };
      return `Compare extracted person names against expected names.

EXTRACTED PERSONS (from NER step):
${JSON.stringify(extractedNames, null, 2)}

EXPECTED PERSONS (ground truth):
${JSON.stringify(expectedNames, null, 2)}

Match names allowing for variations (nicknames, full names vs short names).
Return JSON with:
- matchedPersons: expected names that were found in extracted
- missingPersons: expected names NOT found in extracted
- extraPersons: extracted names NOT in expected (false positives)
- totalExtracted: count of extracted persons
- totalExpected: count of expected persons`;
    },
  })
  .generateScore(({ results }) => {
    const analysis = results.analyzeStepResult;
    const { matchedPersons, totalExpected, totalExtracted } = analysis;

    if (totalExpected === 0) {
      return 1; // No expectations = pass
    }

    // Weighted scoring:
    // - Recall (finding expected persons): 70% weight
    // - Precision (not having false positives): 30% weight
    const recall = matchedPersons.length / totalExpected;
    const precision = totalExtracted > 0 ? matchedPersons.length / totalExtracted : 1;

    return 0.7 * recall + 0.3 * precision;
  })
  .generateReason(({ results, score }) => {
    const { matchedPersons, missingPersons, extraPersons, totalExtracted, totalExpected } =
      results.analyzeStepResult;

    return (
      `Score: ${score.toFixed(2)}. Found ${matchedPersons.length}/${totalExpected} expected persons. ` +
      `${missingPersons.length > 0 ? `Missing: ${missingPersons.join(', ')}. ` : ''}` +
      `${extraPersons.length > 0 ? `Extra: ${extraPersons.join(', ')}. ` : ''}` +
      `Total extracted: ${totalExtracted}.`
    );
  });
