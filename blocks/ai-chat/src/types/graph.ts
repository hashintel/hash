import type { EntityId, GraphBlockHandler } from "@blockprotocol/graph";

import type {
  AIChatRequestMessage,
  AIChatResponseMessage,
} from "./generated/shared";

/** @todo: consider splitting this file into smaller ones */

/** Entity Type IDs */

export const entityTypeIds = {
  aiChatBlock:
    "https://blockprotocol.org/@hash/types/entity-type/ai-chat-block/v/1",
  requestMessage:
    "https://blockprotocol.org/@hash/types/entity-type/ai-chat-request-message/v/1",
  responseMessage:
    "https://blockprotocol.org/@hash/types/entity-type/ai-chat-response-message/v/1",
} as const;
// } as const satisfies Record<string, VersionedUrl>;

/** Property Type Base URLs */

export const propertyTypeBaseUrls = {
  openAIChatModelName:
    "https://blockprotocol.org/@blockprotocol/types/property-type/openai-chat-model-name/",
  presetSystemPromptId:
    "https://blockprotocol.org/@hash/types/property-type/ai-chat-block-preset-system-prompt-id/",
  textContent:
    "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/",
} as const;
// } as const satisfies Record<
//   string,
//   keyof (AIChatBlock["properties"] &
//     AIChatRequestMessage["properties"] &
//     AIChatResponseMessage["properties"])
// >;

/** Link Entity Type IDs */

export const linkEntityTypeIds = {
  hasMessage:
    "https://blockprotocol.org/@blockprotocol/types/entity-type/has-message/v/1",
  rootedAt:
    "https://blockprotocol.org/@blockprotocol/types/entity-type/rooted-at/v/1",
  hasResponse:
    "https://blockprotocol.org/@blockprotocol/types/entity-type/has-response/v/1",
  followedBy:
    "https://blockprotocol.org/@blockprotocol/types/entity-type/followed-by/v/1",
} as const;
// } as const satisfies Record<
//   string,
//   keyof (AIChatBlockOutgoingLinksByLinkEntityTypeId &
//     RequestMessageOutgoingLinksByLinkEntityTypeId &
//     ResponseMessageOutgoingLinksByLinkEntityTypeId)
// >;

/** Helper Methods */

export const createRequestMessageEntityMethod =
  (context: {
    graphModule: GraphBlockHandler;
    aiChatBlockEntityId: EntityId;
  }) =>
  async (params: {
    parentResponseEntityId?: EntityId;
    messageContent: string;
  }): Promise<AIChatRequestMessage> => {
    const { graphModule, aiChatBlockEntityId } = context;
    const { parentResponseEntityId, messageContent } = params;

    const { data: requestMessageEntity, errors } =
      await graphModule.createEntity<AIChatRequestMessage["properties"]>({
        data: {
          entityTypeId: entityTypeIds.requestMessage,
          properties: {
            [propertyTypeBaseUrls.textContent]: messageContent,
          },
        },
      });

    if (!requestMessageEntity || errors) {
      /** @todo: better error handling */
      throw new Error("Failed to create AI Chat Request entity");
    }

    const {
      metadata: {
        recordId: { entityId: requestMessageEntityId },
      },
    } = requestMessageEntity;

    await Promise.all(
      [
        graphModule.createEntity({
          data: {
            properties: {},
            entityTypeId: linkEntityTypeIds.hasMessage,
            linkData: {
              leftEntityId: aiChatBlockEntityId,
              rightEntityId: requestMessageEntityId,
            },
          },
        }),
        parentResponseEntityId
          ? graphModule.createEntity({
              data: {
                properties: {},
                entityTypeId: linkEntityTypeIds.followedBy,
                linkData: {
                  leftEntityId: parentResponseEntityId,
                  rightEntityId: requestMessageEntityId,
                },
              },
            })
          : graphModule.createEntity({
              data: {
                properties: {},
                entityTypeId: linkEntityTypeIds.rootedAt,
                linkData: {
                  leftEntityId: aiChatBlockEntityId,
                  rightEntityId: requestMessageEntityId,
                },
              },
            }),
      ].flat(),
    );

    return requestMessageEntity as AIChatRequestMessage;
  };

export const createResponseMessageEntityMethod =
  (context: {
    graphModule: GraphBlockHandler;
    aiChatBlockEntityId: EntityId;
  }) =>
  async (params: {
    parentRequestEntityId: EntityId;
    messageContent: string;
  }): Promise<AIChatResponseMessage> => {
    const { graphModule, aiChatBlockEntityId } = context;
    const { parentRequestEntityId, messageContent } = params;

    const { data: responseMessageEntity, errors } =
      await graphModule.createEntity<AIChatResponseMessage["properties"]>({
        data: {
          entityTypeId: entityTypeIds.responseMessage,
          properties: {
            [propertyTypeBaseUrls.textContent]: messageContent,
          },
        },
      });

    if (!responseMessageEntity || errors) {
      /** @todo: better error handling */
      throw new Error("Failed to create AI Chat Response entity");
    }

    const {
      metadata: {
        recordId: { entityId: responseMessageEntityId },
      },
    } = responseMessageEntity;

    await Promise.all(
      [
        graphModule.createEntity({
          data: {
            properties: {},
            entityTypeId: linkEntityTypeIds.hasMessage,
            linkData: {
              leftEntityId: aiChatBlockEntityId,
              rightEntityId: responseMessageEntityId,
            },
          },
        }),
        parentRequestEntityId
          ? graphModule.createEntity({
              data: {
                properties: {},
                entityTypeId: linkEntityTypeIds.hasResponse,
                linkData: {
                  leftEntityId: parentRequestEntityId,
                  rightEntityId: responseMessageEntityId,
                },
              },
            })
          : [],
      ].flat(),
    );

    return responseMessageEntity as AIChatResponseMessage;
  };
