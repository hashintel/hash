import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import type { BaseUrl } from "@local/hash-subgraph";
import dedent from "dedent";

import { extractErrorMessage } from "../../../infer-entities/shared/extract-validation-failure-details";
import type { EntityPropertyValueWithSimplifiedProperties } from "../../../infer-entities/shared/map-simplified-properties-to-properties";
import { mapSimplifiedPropertiesToProperties } from "../../../infer-entities/shared/map-simplified-properties-to-properties";
import { stripIdsFromDereferencedProperties } from "../../../infer-entities/shared/strip-ids-from-dereferenced-properties";
import type { DereferencedEntityType } from "../../../shared/dereference-entity-type";
import { getFlowContext } from "../../../shared/get-flow-context";
import { getLlmResponse } from "../../../shared/get-llm-response";
import type {
  LlmMessage,
  LlmUserMessage,
} from "../../../shared/get-llm-response/llm-message";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message";
import type { LlmToolDefinition } from "../../../shared/get-llm-response/types";
import { graphApiClient } from "../../../shared/graph-api-client";
import type { EntitySummary } from "../infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../infer-facts-from-text/types";

const toolNames = ["proposeEntity", "abandonEntity"] as const;

type ToolName = (typeof toolNames)[number];

const generateToolDefinitions = (params: {
  dereferencedEntityType: DereferencedEntityType;
}): Record<ToolName, LlmToolDefinition> => {
  const { dereferencedEntityType } = params;

  return {
    proposeEntity: {
      name: "proposeEntity",
      description: "Propose an entity based on the provided facts.",
      inputSchema: {
        type: "object",
        title: dereferencedEntityType.title,
        description: dereferencedEntityType.description,
        properties: {
          properties: {
            description: "The properties to set on the entity",
            default: {},
            type: "object",
            properties: stripIdsFromDereferencedProperties({
              properties: dereferencedEntityType.properties,
            }),
          },
        },
        required: ["properties"],
      },
    },
    abandonEntity: {
      name: "abandonEntity",
      description:
        "If it is not possible to satisfy the entity's schema based on the provided facts, abandon the entity.",
      inputSchema: {
        type: "object",
        properties: {
          explanation: {
            description:
              "The reason why the entity cannot be proposed based on the provided facts.",
            type: "string",
          },
        },
        required: ["explanation"],
      },
    },
  };
};

const systemPrompt = dedent(`
  You are an entity proposal agent.

  The user will provide you with:
    - "facts": a list of facts about the entity
  
  The user has requested that you fill out as many properties as possible, so please do so. Do not optimize for short responses.

  The provided facts are your only source of information, so make sure to extract as much information as possible, 
    and do not rely on other information about the entities in question you may know.

  You must make exactly one tool call.
`);

const retryMax = 3;

export const proposeEntityFromFacts = async (params: {
  entitySummary: EntitySummary;
  facts: Fact[];
  dereferencedEntityType: DereferencedEntityType;
  simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
  retryContext?: {
    retryCount: number;
    retryMessages: LlmMessage[];
  };
}): Promise<
  | {
      status: "ok";
      proposedEntity: ProposedEntity;
    }
  | {
      status: "abandoned";
      reason: string;
    }
  | {
      status: "exceeded-maximum-retries";
    }
> => {
  const {
    entitySummary,
    facts,
    dereferencedEntityType,
    simplifiedPropertyTypeMappings,
    retryContext,
  } = params;

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      model: "gpt-4-0125-preview",
      tools: Object.values(generateToolDefinitions({ dereferencedEntityType })),
      systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                Facts: ${JSON.stringify(facts)}
              `),
            },
          ],
        },
      ],
      ...(retryContext?.retryMessages ?? []),
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    throw new Error(`Failed to get response from LLM: ${llmResponse.status}`);
  }

  const retry = (retryParams: { retryMessage: LlmUserMessage }) => {
    const { retryCount = 0 } = retryContext ?? {};

    if (retryCount >= retryMax) {
      return {
        status: "exceeded-maximum-retries" as const,
      };
    }

    return proposeEntityFromFacts({
      ...params,
      retryContext: {
        retryCount: retryCount + 1,
        retryMessages: [llmResponse.message, retryParams.retryMessage],
      },
    });
  };

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: llmResponse.message,
  });

  /** @todo: handle unexpected number of tool calls */

  const proposeEntityToolCall = toolCalls.find(
    (toolCall) => toolCall.name === "proposeEntity",
  );

  if (proposeEntityToolCall) {
    const { properties: simplifiedProperties } =
      proposeEntityToolCall.input as {
        properties: Record<string, EntityPropertyValueWithSimplifiedProperties>;
      };

    const properties = mapSimplifiedPropertiesToProperties({
      simplifiedProperties,
      simplifiedPropertyTypeMappings,
    });

    try {
      await graphApiClient.validateEntity(userAuthentication.actorId, {
        entityTypes: [dereferencedEntityType.$id],
        components: {
          linkData: false,
          numItems: false,
          requiredProperties: false,
        },
        properties,
      });
    } catch (error) {
      const invalidReason = `${extractErrorMessage(error)}.`;

      return retry({
        retryMessage: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: proposeEntityToolCall.id,
              content: dedent(`
                The provided entity proposal is invalid.

                Invalid reason: ${invalidReason}

                Make another call to "proposeEntity" addressing the issue.
              `),
              is_error: true,
            },
          ],
        },
      });
    }

    const proposedEntity: ProposedEntity = {
      localEntityId: entitySummary.localId,
      entityTypeId: dereferencedEntityType.$id,
      properties,
    };

    return {
      status: "ok",
      proposedEntity,
    };
  }

  const abandonEntityToolCall = toolCalls.find(
    (toolCall) => toolCall.name === "abandonEntity",
  );

  if (abandonEntityToolCall) {
    const { explanation } = abandonEntityToolCall.input as {
      explanation: string;
    };

    return {
      status: "abandoned",
      reason: explanation,
    };
  }

  return retry({
    retryMessage: {
      role: "user",
      content: [
        {
          type: "text",
          text: "You didn't make any tool calls, you must make exactly one tool call.",
        },
      ],
    },
  });
};
