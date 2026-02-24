import type { EntityId, UserId, WebId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { FlowUsageRecordCustomMetadata } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
// import { StatusCode } from "@local/status";
import { backOff } from "exponential-backoff";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity.js";
import { logger } from "./activity-logger.js";
import { getFlowContext } from "./get-flow-context.js";
// import { checkWebServiceUsageNotExceeded } from "./get-llm-response/check-web-service-usage-not-exceeded.js";
import { getAnthropicResponse } from "./get-llm-response/get-anthropic-response.js";
import { getGoogleAiResponse } from "./get-llm-response/get-google-ai-response.js";
import { getOpenAiResponse } from "./get-llm-response/get-openai-reponse.js";
import { logLlmRequest } from "./get-llm-response/log-llm-request.js";
import type {
  LlmParams,
  LlmRequestMetadata,
  LlmResponse,
} from "./get-llm-response/types.js";
import {
  isLlmParamsAnthropicLlmParams,
  isLlmParamsGoogleAiParams,
} from "./get-llm-response/types.js";

export type UsageTrackingParams = {
  /**
   * Required for tracking usage on a per-user basis.
   *
   * @todo: consider abstracting this in a wrapper method, or via
   * generic params (via a `logUsage` method).
   */
  userAccountId: UserId;
  customMetadata: FlowUsageRecordCustomMetadata | null;
  webId: WebId;
  graphApiClient: GraphApi;
  incurredInEntities: { entityId: EntityId }[];
};

/**
 * This function sends a request to the Anthropic, OpenAI or Google AI API based on the
 * `model` provided in the parameters.
 */
export const getLlmResponse = async <T extends LlmParams>(
  llmParams: T,
  usageTrackingParams: UsageTrackingParams,
): Promise<LlmResponse<T>> => {
  const { customMetadata, graphApiClient, userAccountId, webId } =
    usageTrackingParams;

  /**
   * Check whether the web has exceeded its usage limit, before proceeding with the LLM request.
   */
  // const usageLimitExceededCheck = await checkWebServiceUsageNotExceeded({
  //   graphApiClient,
  //   userAccountId,
  //   webId,
  // });
  //
  // if (usageLimitExceededCheck.code !== StatusCode.Ok) {
  //   return {
  //     status: "exceeded-usage-limit",
  //     message: usageLimitExceededCheck.message ?? "Usage limit exceeded.",
  //   };
  // }

  const aiAssistantAccountId = await backOff(
    () =>
      getAiAssistantAccountIdActivity({
        authentication: { actorId: userAccountId },
        grantCreatePermissionForWeb: webId,
        graphApiClient,
      }),
    {
      jitter: "full",
      numOfAttempts: 3,
      startingDelay: 1_000,
    },
  );

  if (!aiAssistantAccountId) {
    return {
      status: "internal-error",
      message: `Failed to retrieve AI assistant account ID ${userAccountId}`,
      provider: isLlmParamsAnthropicLlmParams(llmParams)
        ? "anthropic"
        : isLlmParamsGoogleAiParams(llmParams)
          ? "google-vertex-ai"
          : "openai",
    };
  }

  const timeBeforeApiCall = Date.now();

  const requestId = generateUuid();

  const { stepId } = await getFlowContext();

  const { taskName } = customMetadata ?? {};
  let debugMessage = `[LLM Request ${requestId}] Getting response for model ${llmParams.model}`;
  if (taskName) {
    debugMessage += ` for task ${taskName}`;
  }

  debugMessage += ` in step ${stepId}`;

  logger.debug(debugMessage);

  const metadata: LlmRequestMetadata = {
    requestId,
    taskName,
    stepId,
  };

  const { llmResponse, transformedRequest } = isLlmParamsAnthropicLlmParams(
    llmParams,
  )
    ? await getAnthropicResponse(llmParams, metadata)
    : isLlmParamsGoogleAiParams(llmParams)
      ? await getGoogleAiResponse(llmParams, metadata)
      : await getOpenAiResponse(llmParams, metadata);

  const timeAfterApiCall = Date.now();

  const numberOfSeconds = (timeAfterApiCall - timeBeforeApiCall) / 1000;

  logger.debug(
    `[LLM Request ${requestId}]: Total call time including retries: ${numberOfSeconds} seconds`,
  );

  /**
   * Capture incurred usage in a usage record.
   */
  // if (
  //   llmResponse.status === "ok" ||
  //   llmResponse.status === "exceeded-maximum-retries" ||
  //   llmResponse.status === "max-tokens"
  // ) {
  //   const { usage } = llmResponse;

  //   let usageRecordEntity: HashEntity;

  //   try {
  //     usageRecordEntity = await backOff(
  //       () =>
  //         createUsageRecord(
  //           { graphApi: graphApiClient },
  //           {
  //             assignUsageToWebId: webId,
  //             customMetadata,
  //             serviceName: isLlmParamsAnthropicLlmParams(llmParams)
  //               ? "Anthropic"
  //               : isLlmParamsGoogleAiParams(llmParams)
  //                 ? "Google AI"
  //                 : "OpenAI",
  //             featureName: llmParams.model,
  //             inputUnitCount: usage.inputTokens,
  //             outputUnitCount: usage.outputTokens,
  //             userAccountId,
  //             aiAssistantAccountId,
  //           },
  //         ),
  //       {
  //         jitter: "full",
  //         numOfAttempts: 3,
  //         startingDelay: 1_000,
  //       },
  //     );
  //   } catch (error) {
  //     return {
  //       status: "internal-error",
  //       message: `Failed to create usage record: ${stringifyError(error)}`,
  //       provider: llmResponse.provider,
  //     };
  //   }

  //   const { incurredInEntities } = usageTrackingParams;

  //   if (incurredInEntities.length > 0) {
  //     const provenance: ProvidedEntityEditionProvenance = {
  //       actorType: "ai",
  //       origin: {
  //         type: "flow",
  //         id: flowEntityId,
  //         stepIds: [stepId],
  //       } satisfies OriginProvenance,
  //     };

  //     const errors = await Promise.all(
  //       incurredInEntities.map(async ({ entityId }) => {
  //         try {
  //           const incurredInEntityUuid = generateUuid() as EntityUuid;
  //           await HashEntity.create<IncurredIn>(
  //             graphApiClient,
  //             { actorId: aiAssistantAccountId },
  //             {
  //               draft: false,
  //               properties: { value: {} },
  //               provenance,
  //               webId,
  //               entityUuid: incurredInEntityUuid,
  //               entityTypeIds: [
  //                 systemLinkEntityTypes.incurredIn.linkEntityTypeId,
  //               ],
  //               linkData: {
  //                 leftEntityId: usageRecordEntity.metadata.recordId.entityId,
  //                 rightEntityId: entityId,
  //               },
  //             },
  //           );

  //           return [];
  //         } catch (error) {
  //           return {
  //             status: "internal-error",
  //             message: `Failed to link usage record to entity with ID ${entityId}: ${stringify(
  //               error,
  //             )}`,
  //           };
  //         }
  //       }),
  //     ).then((unflattenedErrors) => unflattenedErrors.flat());

  //     if (errors.length > 0) {
  //       return {
  //         status: "internal-error",
  //         provider: llmResponse.provider,
  //         message: `Failed to link usage record to entities: ${stringify(
  //           errors,
  //         )}`,
  //       };
  //     }
  //   }
  // }

  logLlmRequest({
    requestId,
    provider: llmResponse.provider,
    finalized: true,
    taskName,
    stepId,
    secondsTaken: numberOfSeconds,
    request: llmParams,
    response: llmResponse,
    transformedRequest,
  });

  return llmResponse as LlmResponse<T>;
};
