import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { type OwnedById } from "@local/hash-subgraph";

import { getLlmResponse } from "../src/activities/shared/get-llm-response";
import type {
  LlmParams,
  LlmResponse,
} from "../src/activities/shared/get-llm-response/types";
import { graphApiClient } from "../src/activities/shared/graph-api-client";
import { getAliceUserAccountId } from "../src/shared/testing-utilities/get-alice-user-account-id";
import type { CompareLlmResponseConfig } from "./compare-llm-response/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configDirectory = `${__dirname}/compare-llm-response/var/config`;

const getCompareLlmResponseConfig = async (params: {
  configName: string;
}): Promise<CompareLlmResponseConfig> => {
  const { configName } = params;

  const configFileName = `${configName}.config.ts`;

  console.log("Loading config file: ", configFileName);

  const configFilePath = `${configDirectory}/${configFileName}`;

  // Dynamically import the config file
  try {
    const module = (await import(configFilePath)) as {
      config?: CompareLlmResponseConfig;
    };

    if (!module.config) {
      throw new Error(
        `No config object exported in the file: ${configFilePath}`,
      );
    }

    return module.config;
  } catch (error) {
    console.error(`Error loading configuration from ${configFilePath}:`, error);
    throw error;
  }
};

const persistCompareLlmResponses = (params: {
  configName: string;
  llmParams: CompareLlmResponseConfig["llmParams"];
  llmResponses: LlmResponse<LlmParams>[];
}) => {
  const { configName, llmParams, llmResponses } = params;

  const now = new Date();
  const resultsDirectory = `${__dirname}/compare-llm-response/var/results/${configName}`;

  mkdirSync(resultsDirectory, { recursive: true });

  const resultsFileName = `${resultsDirectory}/${now.toISOString()}.json`;

  writeFileSync(
    resultsFileName,
    JSON.stringify({ llmParams, llmResponses }, null, 2),
  );
};

export const compareLlmResponses = async () => {
  const configName = process.argv[2];

  if (!configName) {
    throw new Error("No file name provided as an argument of the script");
  }

  const compareLlmResponseConfig = await getCompareLlmResponseConfig({
    configName,
  });

  const { models, llmParams } = compareLlmResponseConfig;

  const userAccountId = await getAliceUserAccountId();

  const webId = userAccountId as OwnedById;

  const llmResponses = await Promise.all(
    models.map((model) => {
      return getLlmResponse(
        // @ts-expect-error - figure out what's going wrong here
        {
          ...llmParams,
          model,
        },
        {
          userAccountId,
          webId,
          incurredInEntities: [],
          graphApiClient,
        },
      );
    }),
  );

  persistCompareLlmResponses({
    configName,
    llmParams,
    llmResponses,
  });
};

await compareLlmResponses();
