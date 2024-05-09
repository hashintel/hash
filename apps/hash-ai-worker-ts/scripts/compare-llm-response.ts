import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import {
  type AccountId,
  extractOwnedByIdFromEntityId,
  type OwnedById,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { getLlmResponse } from "../src/activities/shared/get-llm-response";
import type {
  LlmParams,
  LlmResponse,
} from "../src/activities/shared/get-llm-response/types";
import { graphApiClient } from "../src/activities/shared/graph-api-client";
import type { CompareLlmResponseConfig } from "./compare-llm-response/types";

export const publicUserAccountId: AccountId =
  "00000000-0000-0000-0000-000000000000" as AccountId;

const getAliceUserAccountId = async () => {
  const [aliceUserEntity] = await graphApiClient
    .getEntities(publicUserAccountId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.user.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(systemPropertyTypes.shortname.propertyTypeId),
                ],
              },
              { parameter: "alice" },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, publicUserAccountId),
      ),
    );

  if (!aliceUserEntity) {
    throw new Error("Could not find a user entity with shortname 'alice'");
  }

  const aliceUserAccountId = extractOwnedByIdFromEntityId(
    aliceUserEntity.metadata.recordId.entityId,
  );

  return aliceUserAccountId as AccountId;
};

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
