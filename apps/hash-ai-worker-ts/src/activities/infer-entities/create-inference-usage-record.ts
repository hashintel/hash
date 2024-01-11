import { createUsageRecord } from "@local/hash-backend-utils/service-usage";
import type { EntityMetadata, GraphApi } from "@local/hash-graph-client";
import type { InferenceTokenUsage } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { AccountId } from "@local/hash-subgraph";

import type { PermittedOpenAiModel } from "./inference-types";

export const createInferenceUsageRecord = async ({
  aiAssistantAccountId,
  graphApiClient,
  modelName,
  usage,
  userAccountId,
}: {
  aiAssistantAccountId: AccountId;
  graphApiClient: GraphApi;
  modelName: PermittedOpenAiModel;
  usage: InferenceTokenUsage[];
  userAccountId: AccountId;
}): Promise<EntityMetadata> => {
  const { inputUnitCount, outputUnitCount } = usage.reduce(
    (acc, usageRecord) => {
      acc.inputUnitCount += usageRecord.prompt_tokens;
      acc.outputUnitCount += usageRecord.completion_tokens;
      return acc;
    },
    { inputUnitCount: 0, outputUnitCount: 0 },
  );

  const usageRecordMetadata = await createUsageRecord(
    { graphApi: graphApiClient },
    { actorId: aiAssistantAccountId },
    {
      serviceName: "OpenAI",
      featureName: modelName,
      userAccountId,
      inputUnitCount,
      outputUnitCount,
    },
  );

  return usageRecordMetadata;
};
