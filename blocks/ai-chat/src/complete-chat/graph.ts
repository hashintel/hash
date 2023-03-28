import { EntityId, GraphBlockHandler } from "@blockprotocol/graph";

import {
  AIChatBlockOutgoingLinksByLinkEntityTypeId,
  AIChatRequestV4,
  AIChatRequestV4OutgoingLinksByLinkEntityTypeId,
  AIChatResponseV4,
  AIChatResponseV4OutgoingLinksByLinkEntityTypeId,
} from "../types/generated/block-entity";

export type AIChatRequest = AIChatRequestV4;
export type AIChatRequestOutgoingLinksByLinkEntityTypeId =
  AIChatRequestV4OutgoingLinksByLinkEntityTypeId;

export type AIChatResponse = AIChatResponseV4;
export type AIChatResponseOutgoingLInksByLinkEntityTypeId =
  AIChatResponseV4OutgoingLinksByLinkEntityTypeId;

/** Entity Type IDs */

export const aiChatBlockEntityTypeId =
  "http://localhost:3000/@alice/types/entity-type/ai-chat-block/v/6";

export const aiChatRequestEntityTypeId =
  "http://localhost:3000/@alice/types/entity-type/ai-chat-request/v/3";

export const aiChatResponseEntityTypeId =
  "http://localhost:3000/@alice/types/entity-type/ai-chat-response/v/3";

/** Property Type Keys */

export const presetSystemPromptIdKey =
  "http://localhost:3000/@alice/types/property-type/preset-system-prompt-id/" as const;

export const chatAIModelKey =
  "http://localhost:3000/@alice/types/property-type/chat-ai-model/" as const;

export const messageContentKey =
  "http://localhost:3000/@alice/types/property-type/message-content/" as const;

export const activeKey =
  "http://localhost:3000/@alice/types/property-type/active/" as const;

/** Link Type IDs */

export const aiChatMessageLinkTypeId: keyof AIChatBlockOutgoingLinksByLinkEntityTypeId =
  "http://localhost:3000/@alice/types/entity-type/ai-chat-message/v/1";

export const rootAIChatRequestLinkTypeId: keyof AIChatBlockOutgoingLinksByLinkEntityTypeId =
  "http://localhost:3000/@alice/types/entity-type/root-ai-chat-request/v/1";

export const aiChatRequestResponseLinkTypeId: keyof AIChatRequestOutgoingLinksByLinkEntityTypeId =
  "http://localhost:3000/@alice/types/entity-type/response/v/1";

export const aiChatResponseRequestLinkTypeId: keyof AIChatResponseOutgoingLInksByLinkEntityTypeId =
  "http://localhost:3000/@alice/types/entity-type/request/v/1";

/** Helper Methods */

export const createAiChatRequestEntityMethod =
  (context: {
    graphModule: GraphBlockHandler;
    aiChatBlockEntityId: EntityId;
  }) =>
  async (params: {
    isRootRequest?: boolean;
    parentResponseEntityId?: EntityId;
    messageContent: string;
    active: boolean;
  }): Promise<AIChatRequest> => {
    const { graphModule, aiChatBlockEntityId } = context;
    const { isRootRequest, parentResponseEntityId, messageContent, active } =
      params;

    const { data: aiChatRequestEntity, errors } =
      await graphModule.createEntity<AIChatRequest["properties"]>({
        data: {
          entityTypeId: aiChatRequestEntityTypeId,
          properties: {
            [messageContentKey]: messageContent,
            [activeKey]: active,
          },
        },
      });

    if (!aiChatRequestEntity || errors) {
      /** @todo: better error handling */
      throw new Error("Failed to create AI Chat Request entity");
    }

    const {
      metadata: {
        recordId: { entityId: aiChatRequestEntityId },
      },
    } = aiChatRequestEntity;

    await Promise.all(
      [
        graphModule.createEntity({
          data: {
            properties: {},
            entityTypeId: aiChatMessageLinkTypeId,
            linkData: {
              leftEntityId: aiChatBlockEntityId,
              rightEntityId: aiChatRequestEntityId,
            },
          },
        }),
        isRootRequest
          ? graphModule.createEntity({
              data: {
                properties: {},
                entityTypeId: rootAIChatRequestLinkTypeId,
                linkData: {
                  leftEntityId: aiChatBlockEntityId,
                  rightEntityId: aiChatRequestEntityId,
                },
              },
            })
          : [],
        parentResponseEntityId
          ? graphModule.createEntity({
              data: {
                properties: {},
                entityTypeId: aiChatResponseRequestLinkTypeId,
                linkData: {
                  leftEntityId: parentResponseEntityId,
                  rightEntityId: aiChatRequestEntityId,
                },
              },
            })
          : [],
      ].flat(),
    );

    return aiChatRequestEntity as AIChatRequest;
  };

export const createAiChatResponseEntityMethod =
  (context: {
    graphModule: GraphBlockHandler;
    aiChatBlockEntityId: EntityId;
  }) =>
  async (params: {
    parentRequestEntityId: EntityId;
    messageContent: string;
    active: boolean;
  }): Promise<AIChatResponse> => {
    const { graphModule, aiChatBlockEntityId } = context;
    const { parentRequestEntityId, messageContent, active } = params;

    const { data: aiChatResponseEntity, errors } =
      await graphModule.createEntity<AIChatResponse["properties"]>({
        data: {
          entityTypeId: aiChatResponseEntityTypeId,
          properties: {
            [messageContentKey]: messageContent,
            [activeKey]: active,
          },
        },
      });

    if (!aiChatResponseEntity || errors) {
      /** @todo: better error handling */
      throw new Error("Failed to create AI Chat Response entity");
    }

    const {
      metadata: {
        recordId: { entityId: aiChatResponseEntityId },
      },
    } = aiChatResponseEntity;

    await Promise.all(
      [
        graphModule.createEntity({
          data: {
            properties: {},
            entityTypeId: aiChatMessageLinkTypeId,
            linkData: {
              leftEntityId: aiChatBlockEntityId,
              rightEntityId: aiChatResponseEntityId,
            },
          },
        }),
        parentRequestEntityId
          ? graphModule.createEntity({
              data: {
                properties: {},
                entityTypeId: aiChatRequestResponseLinkTypeId,
                linkData: {
                  leftEntityId: parentRequestEntityId,
                  rightEntityId: aiChatResponseEntityId,
                },
              },
            })
          : [],
      ].flat(),
    );

    return aiChatResponseEntity as AIChatResponse;
  };
