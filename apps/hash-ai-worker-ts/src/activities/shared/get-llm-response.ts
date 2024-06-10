import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import { createUsageRecord } from "@local/hash-backend-utils/service-usage";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { StatusCode } from "@local/status";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity";
import { userExceededServiceUsageLimitActivity } from "../user-exceeded-service-usage-limit-activity";
import { logger } from "./activity-logger";
import { getAnthropicResponse } from "./get-llm-response/get-anthropic-response";
import {
  getOpenAiResponse,
  type UsageTrackingParams,
} from "./get-llm-response/get-openai-reponse";
import { logLlmRequest } from "./get-llm-response/log-llm-request";
import type { LlmParams, LlmResponse } from "./get-llm-response/types";
import { isLlmParamsAnthropicLlmParams } from "./get-llm-response/types";
import { stringify } from "./stringify";

/**
 * This function sends a request to the Anthropic or OpenAI API based on the
 * `model` provided in the parameters.
 */
export const getLlmResponse = async <T extends LlmParams>(
  llmParams: T,
  usageTrackingParams: UsageTrackingParams,
): Promise<LlmResponse<T>> => {
  const { graphApiClient, userAccountId, webId } = usageTrackingParams;

  /**
   * Check whether the user has exceeded their usage limit, before
   * proceeding with the LLM request.
   */
  const userHasExceededUsageStatus =
    await userExceededServiceUsageLimitActivity({
      graphApiClient,
      userAccountId,
    });

  if (userHasExceededUsageStatus.code !== StatusCode.Ok) {
    return {
      status: "exceeded-usage-limit",
      message:
        userHasExceededUsageStatus.message ??
        "You have exceeded your usage limit.",
    };
  }

  const aiAssistantAccountId = await getAiAssistantAccountIdActivity({
    authentication: { actorId: userAccountId },
    grantCreatePermissionForWeb: webId,
    graphApiClient,
  });

  if (webId !== userAccountId) {
    /**
     * If the web isn't the user's, we need to make sure the AI assistant also has permission over the user's web,
     * to be able to create the usage record.
     */
    await getAiAssistantAccountIdActivity({
      authentication: { actorId: userAccountId },
      grantCreatePermissionForWeb: userAccountId as OwnedById,
      graphApiClient,
    });
  }

  if (!aiAssistantAccountId) {
    return {
      status: "internal-error",
      message: `Failed to retrieve AI assistant account ID ${userAccountId}`,
    };
  }

  const timeBeforeApiCall = Date.now();

  const llmResponse = (
    isLlmParamsAnthropicLlmParams(llmParams)
      ? await getAnthropicResponse(llmParams)
      : await getOpenAiResponse(llmParams)
  ) as LlmResponse<T>;

  const timeAfterApiCall = Date.now();

  const numberOfSeconds = (timeAfterApiCall - timeBeforeApiCall) / 1000;

  logger.debug(`LLM API call time: ${numberOfSeconds} seconds`);

  /**
   * Capture incurred usage in a usage record.
   */
  if (
    llmResponse.status === "ok" ||
    llmResponse.status === "exceeded-maximum-retries"
  ) {
    const { usage } = llmResponse;

    let usageRecordEntity: Entity;

    try {
      usageRecordEntity = await createUsageRecord(
        { graphApi: graphApiClient },
        { actorId: aiAssistantAccountId },
        {
          serviceName: isLlmParamsAnthropicLlmParams(llmParams)
            ? "Anthropic"
            : "OpenAI",
          featureName: llmParams.model,
          userAccountId,
          inputUnitCount: usage.inputTokens,
          outputUnitCount: usage.outputTokens,
        },
      );
    } catch (error) {
      return {
        status: "internal-error",
        message: `Failed to create usage record for AI assistant: ${stringify(error)}`,
      };
    }

    const { incurredInEntities } = usageTrackingParams;

    if (incurredInEntities.length > 0) {
      const hashInstanceAdminGroupId = await getHashInstanceAdminAccountGroupId(
        { graphApi: graphApiClient },
        { actorId: aiAssistantAccountId },
      );

      const errors = await Promise.all(
        incurredInEntities.map(async ({ entityId }) => {
          try {
            await Entity.create(
              graphApiClient,
              { actorId: aiAssistantAccountId },
              {
                draft: false,
                properties: {},
                ownedById: webId,
                entityTypeId: systemLinkEntityTypes.incurredIn.linkEntityTypeId,
                linkData: {
                  leftEntityId: usageRecordEntity.metadata.recordId.entityId,
                  rightEntityId: entityId,
                },
                relationships: [
                  {
                    relation: "administrator",
                    subject: {
                      kind: "account",
                      subjectId: aiAssistantAccountId,
                    },
                  },
                  {
                    relation: "viewer",
                    subject: {
                      kind: "account",
                      subjectId: userAccountId,
                    },
                  },
                  {
                    relation: "viewer",
                    subject: {
                      kind: "accountGroup",
                      subjectId: hashInstanceAdminGroupId,
                    },
                  },
                ],
              },
            );

            return [];
          } catch (error) {
            return {
              status: "internal-error",
              message: `Failed to link usage record to entity with ID ${entityId}: ${stringify(error)}`,
            };
          }
        }),
      ).then((unflattenedErrors) => unflattenedErrors.flat());

      if (errors.length > 0) {
        return {
          status: "internal-error",
          message: `Failed to link usage record to entities: ${stringify(errors)}`,
        };
      }
    }
  }

  if (["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    logLlmRequest({ llmParams, llmResponse });
  }

  return llmResponse;
};
