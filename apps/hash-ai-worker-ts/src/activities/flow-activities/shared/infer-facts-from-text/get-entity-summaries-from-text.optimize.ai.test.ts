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

      const missingEntitiesPenalty =
        0.5 * (missingGoldEntities.size / goldEntitiesTestSet.size);
      score -= missingEntitiesPenalty;

      const wrongTypeEntitiesPenalty =
        0.3 *
        (wrongTypeEntitiesIdentified.size / wrongTypeEntitiesTestSet.size);
      score -= wrongTypeEntitiesPenalty;

      const irrelevantEntitiesPenalty =
        0.2 *
        (irrelevantEntitiesIdentified.size / irrelevantEntitiesTestSet.size);
      score -= irrelevantEntitiesPenalty;

      return {
        score,
        naturalLanguageReport: `The LLM extracted ${entitySummaries.length} entity summaries.`,
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
      models,
      initialSystemPrompt: generateSystemPrompt({
        includesRelevantEntitiesPrompt: true,
      }),
      directoryPath: baseDirectoryPath,
      metrics,
      numberOfIterations: 10,
    });
  },
  {
    timeout: 10 * 60 * 1000,
  },
);
