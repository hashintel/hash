import "../../shared/testing-utilities/mock-get-flow-context.js";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import isEqual from "lodash.isequal";
import { test } from "vitest";

import type { LlmParams } from "./get-llm-response/types.js";
import { judgeTestData } from "./judge-ai-output-optimize/judge-test-data.js";
import {
  judgeAiOutputs,
  type JudgeCorrection,
  judgeSystemPrompt,
} from "./judge-ai-outputs.js";
import { optimizeSystemPrompt } from "./optimize-system-prompt.js";
import type { MetricDefinition } from "./optimize-system-prompt/types.js";

const metrics: MetricDefinition[] = judgeTestData.map(
  (testItem): MetricDefinition => {
    return {
      name: testItem.testName,
      description: "",
      executeMetric: async ({ testingParams }) => {
        const { inputData, evaluation } = testItem;

        const {
          score: judgeProvidedScore,
          feedback: judgeProvidedFeedback,
          corrections,
        } = await judgeAiOutputs({
          exchangeToReview: inputData,
          judgeModel: testingParams.model,
          judgeAdditionalInstructions: "",
          testingParams,
        });

        let score = 0.5;

        const {
          alreadyCorrectFieldPaths,
          nonInferrableFieldPaths,
          expectedCorrections,
        } = evaluation;

        const rewardPerCorrection = 0.5 / expectedCorrections.length;
        const penaltyPerMistake =
          0.5 /
          (alreadyCorrectFieldPaths.length + nonInferrableFieldPaths.length);

        const unhandledCorrections: JudgeCorrection[] = [];

        const mistakenlyCorrectedPaths: string[] = [];
        const mistakenlyInferredPaths: string[] = [];
        const missingCorrectionValues: string[] = [];
        const wrongValueCorrections: string[] = [];

        const validCorrections: string[] = [];

        const feedback = "";

        for (const correction of corrections) {
          const isAlreadyCorrect = evaluation.alreadyCorrectFieldPaths.some(
            (jsonPath) => isEqual(correction.jsonPath, jsonPath),
          );

          if (isAlreadyCorrect) {
            mistakenlyCorrectedPaths.push(correction.jsonPath.join("."));
            score -= penaltyPerMistake;
            continue;
          }

          const isNonInferrable = evaluation.nonInferrableFieldPaths.some(
            (jsonPath) => isEqual(correction.jsonPath, jsonPath),
          );
          if (isNonInferrable) {
            mistakenlyInferredPaths.push(correction.jsonPath.join("."));
            score -= penaltyPerMistake;
            continue;
          }

          const applicableCorrection = evaluation.expectedCorrections.find(
            (expectedCorrection) =>
              isEqual(expectedCorrection.jsonPath, correction.jsonPath) &&
              expectedCorrection.type === correction.correctionType,
          );

          if (!applicableCorrection) {
            unhandledCorrections.push(correction);
            continue;
          }

          if (applicableCorrection.type === "delete-unfounded") {
            score += rewardPerCorrection;
            validCorrections.push(correction.jsonPath.join("."));
            continue;
          }

          if (!correction.correctValue) {
            missingCorrectionValues.push(correction.jsonPath.join("."));
            /**
             * technically applying penalties here lets the score go below 0,
             * because penaltyPerMistake doesn't take account of provided corrections that are wrong.
             * But for comparing results the relative score rather than the absolute score is what matters.
             */
            score -= penaltyPerMistake;
            continue;
          }

          const providedValueIsCorrect =
            applicableCorrection.isProvidedValueCorrect(
              correction.correctValue,
            );

          if (providedValueIsCorrect) {
            validCorrections.push(correction.jsonPath.join("."));
            score += rewardPerCorrection;
          } else {
            wrongValueCorrections.push(
              `${correction.jsonPath.join(".")}: ${stringifyPropertyValue(
                correction.correctValue,
              )}`,
            );
            /**
             * technically applying penalties here lets the score go below 0,
             * because penaltyPerMistake doesn't take account of provided corrections that are wrong.
             * But for comparing results the relative score rather than the absolute score is what matters.
             */
            score -= penaltyPerMistake;
          }
        }

        const additionalInfo = {
          judgeProvidedFeedback,
          judgeProvidedScore,
          mistakenlyCorrectedPaths,
          mistakenlyInferredPaths,
          missingCorrectionValues,
          wrongValueCorrections,
          validCorrections,
          unhandledCorrections: JSON.stringify(unhandledCorrections),
        };

        return {
          score: Math.max(score, 0),
          testingParams,
          naturalLanguageReport: feedback,
          additionalInfo,
        };
      },
    };
  },
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDirectoryPath = path.join(__dirname, "/var/judge-ai-output-test");

test(
  "Judge AI outputs",
  async () => {
    const models: LlmParams["model"][] = ["gemini-1.5-pro-002"];

    await optimizeSystemPrompt({
      attemptsPerPrompt: 3,
      models,
      initialSystemPrompt: judgeSystemPrompt,
      directoryPath: baseDirectoryPath,
      metrics,
      promptIterations: 5,
    });
  },
  {
    timeout: 30 * 60 * 1000,
  },
);
