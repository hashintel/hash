import "../../../../shared/testing-utilities/mock-get-flow-context.js";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "vitest";

import type { LlmParams } from "../../../shared/get-llm-response/types.js";
import { optimizeSystemPrompt } from "../../../shared/optimize-system-prompt.js";
import type { MetricDefinition } from "../../../shared/optimize-system-prompt/types.js";
import {
  generateSystemPrompt,
  getEntitySummariesFromText,
} from "./get-entity-summaries-from-text.js";
import { testData } from "./get-entity-summaries-from-text.optimize/test-data.js";

const metrics: MetricDefinition[] = testData.map((testItem) => {
  return {
    name: testItem.name,
    description: "",
    executeMetric: async ({ testingParams }) => {
      const {
        context,
        entityType,
        relevantEntitiesPrompt,
        wrongTypeEntities,
        goldEntities,
        irrelevantEntities,
      } = testItem;

      const { entitySummaries } = await getEntitySummariesFromText({
        dereferencedEntityType: entityType,
        relevantEntitiesPrompt,
        testingParams,
        text: context,
      });

      const entitySummarySet = new Set(
        entitySummaries.map((entitySummary) => entitySummary.name),
      );

      const wrongTypeEntitiesTestSet = new Set(
        wrongTypeEntities.map((entity) => entity.name),
      );
      const wrongTypeEntitiesIdentified = entitySummarySet.intersection(
        wrongTypeEntitiesTestSet,
      );

      const goldEntitiesTestSet = new Set(
        goldEntities.map((entity) => entity.name),
      );
      const missingGoldEntities =
        goldEntitiesTestSet.difference(entitySummarySet);

      const irrelevantEntitiesTestSet = new Set(
        irrelevantEntities.map((entity) => entity.name),
      );
      const irrelevantEntitiesIdentified = entitySummarySet.intersection(
        irrelevantEntitiesTestSet,
      );

      let score = 1;

      const testDataHasGoldEntities = goldEntitiesTestSet.size > 0;
      const testDataHasWrongTypeEntities = wrongTypeEntitiesTestSet.size > 0;
      const testDataHasIrrelevantEntities = irrelevantEntitiesTestSet.size > 0;

      let missingEntitiesMultiplier = 0;
      if (testDataHasGoldEntities) {
        if (testDataHasWrongTypeEntities && testDataHasIrrelevantEntities) {
          missingEntitiesMultiplier = 0.5;
        } else if (testDataHasWrongTypeEntities) {
          missingEntitiesMultiplier = 0.7;
        } else if (testDataHasIrrelevantEntities) {
          missingEntitiesMultiplier = 0.8;
        } else {
          missingEntitiesMultiplier = 1;
        }
      }

      const missingEntitiesPenalty = testDataHasGoldEntities
        ? missingEntitiesMultiplier *
          (missingGoldEntities.size / goldEntitiesTestSet.size)
        : 0;

      score -= missingEntitiesPenalty;

      const irrelevantEntitiesMultiplier = testDataHasIrrelevantEntities
        ? 0.2
        : 0;

      const irrelevantEntitiesPenalty = testDataHasIrrelevantEntities
        ? irrelevantEntitiesMultiplier *
          (irrelevantEntitiesIdentified.size / irrelevantEntitiesTestSet.size)
        : 0;

      score -= irrelevantEntitiesPenalty;

      const wrongTypeEntitiesMultiplier =
        1 - missingEntitiesMultiplier - irrelevantEntitiesMultiplier;

      const wrongTypeEntitiesPenalty = testDataHasWrongTypeEntities
        ? wrongTypeEntitiesMultiplier *
          (wrongTypeEntitiesIdentified.size / wrongTypeEntitiesTestSet.size)
        : 0;

      score -= wrongTypeEntitiesPenalty;

      return {
        score,
        naturalLanguageReport: `The LLM extracted ${entitySummaries.length} entity summaries in total. They identified ${wrongTypeEntitiesIdentified.size} entities of an incorrect type, identified ${goldEntitiesTestSet.size - missingGoldEntities.size} out of a possible ${goldEntitiesTestSet.size} target entities, and identified ${irrelevantEntitiesIdentified.size} entities which were of the right type but didn't meet the research prompt.`,
        testingParams,
      };
    },
  };
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseDirectoryPath = join(
  __dirname,
  "/var/get-entity-summaries-from-text-test",
);

test(
  "Get entity summaries from text system prompt test",
  async () => {
    const models: LlmParams["model"][] = ["claude-3-haiku-20240307"];

    await optimizeSystemPrompt({
      attemptsPerPrompt: 3,
      models,
      initialSystemPrompt: generateSystemPrompt({
        includesRelevantEntitiesPrompt: true,
      }),
      directoryPath: baseDirectoryPath,
      metrics,
      promptIterations: 4,
    });
  },
  {
    timeout: 30 * 60 * 1000,
  },
);
