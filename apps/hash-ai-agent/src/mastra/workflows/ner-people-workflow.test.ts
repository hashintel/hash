import { runEvals } from "@mastra/core/evals";
import { describe, expect, test } from "vitest";

import { microsoftWikipedia } from "../fixtures/source-texts/microsoft-wikipedia";
import { nerPeopleScorer } from "../scorers/ner-people-scorer";
import { nerPeopleWorkflow } from "./ner-people-workflow";

describe("NER People Step", () => {
  test(
    "extracts people from Microsoft Wikipedia article",
    { timeout: 5 * 60 * 1000 }, // 5 minutes for LLM call
    async () => {
      const evalResult = await runEvals({
        data: [
          {
            input: {
              sourceText: microsoftWikipedia.sourceText,
              researchGoal: "tell me about the key people in this story",
            },
            groundTruth: {
              expectedPersons: microsoftWikipedia.expectedPersons,
            },
          },
        ],
        target: nerPeopleWorkflow,
        scorers: [nerPeopleScorer],
      });

      expect(evalResult.scores["ner-people"]).toBeGreaterThan(0.7);
    },
  );
});
