import { createUsageRecord } from "@local/hash-backend-utils/service-usage";
import type { GraphApi } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { OwnedById } from "@local/hash-graph-types/web";

import type { LlmUsage } from "./shared/get-llm-response/types";
import type { PermittedOpenAiModel } from "./shared/openai-client";

export const createInferenceUsageRecordActivity = async ({
  assignUsageToWebId,
  graphApiClient,
  modelName,
  usage,
  userAccountId,
}: {
  aiAssistantAccountId: AccountId;
  assignUsageToWebId: OwnedById;
  graphApiClient: GraphApi;
  modelName: PermittedOpenAiModel;
  usage: LlmUsage[];
  userAccountId: AccountId;
}): Promise<Entity> => {
  const { inputUnitCount, outputUnitCount } = usage.reduce(
    (acc, usageRecord) => {
      acc.inputUnitCount += usageRecord.inputTokens;
      acc.outputUnitCount += usageRecord.outputTokens;
      return acc;
    },
    { inputUnitCount: 0, outputUnitCount: 0 },
  );

  return createUsageRecord(
    { graphApi: graphApiClient },
    {
      assignUsageToWebId,
      serviceName: "OpenAI",
      featureName: modelName,
      inputUnitCount,
      outputUnitCount,
      userAccountId,
    },
  );
};
