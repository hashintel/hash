import { EntityId, GraphBlockHandler } from "@blockprotocol/graph";

import { RequestMessage, ResponseMessage } from "./generated/shared";

/** Entity Type IDs */

export const entityTypeIds = {
  aiChatBlock:
    "https://blockprotocol-imqnt3bj2.stage.hash.ai/@alfie/types/entity-type/ai-chat-block/v/1",
  requestMessage:
    "https://blockprotocol-imqnt3bj2.stage.hash.ai/@alfie/types/entity-type/request-message/v/2",
  responseMessage:
    "https://blockprotocol-imqnt3bj2.stage.hash.ai/@alfie/types/entity-type/request-message/v/2",
} as const;
// } as const satisfies Record<string, VersionedUrl>;

/** Property Type Base URLs */

export const propertyTypeBaseUrls = {
  openAIChatModelName:
    "https://blockprotocol-imqnt3bj2.stage.hash.ai/@alfie/types/property-type/openai-chat-model-name/",
  presetSystemPromptId:
    "https://blockprotocol-imqnt3bj2.stage.hash.ai/@alfie/types/property-type/ai-chat-block-preset-system-prompt-id/",
  textContent:
    "https://blockprotocol-9a7200lt2.stage.hash.ai/@ciaranm/types/property-type/text-content/",
} as const;
// } as const satisfies Record<
//   string,
//   keyof (AIChatBlock["properties"] &
//     RequestMessage["properties"] &
//     ResponseMessage["properties"])
// >;

/** Link Entity Type IDs */

export const linkEntityTypeIds = {
  hasMessage:
    "https://blockprotocol-imqnt3bj2.stage.hash.ai/@alfie/types/entity-type/has-message/v/1",
  rootedAt:
    "https://blockprotocol-imqnt3bj2.stage.hash.ai/@alfie/types/entity-type/rooted-at/v/1",
  hasResponse:
    "https://blockprotocol-imqnt3bj2.stage.hash.ai/@alfie/types/entity-type/has-response/v/1",
  followedBy:
    "https://blockprotocol-imqnt3bj2.stage.hash.ai/@alfie/types/entity-type/followed-by/v/1",
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
    isRootRequest?: boolean;
    parentResponseEntityId?: EntityId;
    messageContent: string;
  }): Promise<RequestMessage> => {
    const { graphModule, aiChatBlockEntityId } = context;
    const { isRootRequest, parentResponseEntityId, messageContent } = params;

    const { data: requestMessageEntity, errors } =
      await graphModule.createEntity<RequestMessage["properties"]>({
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
        isRootRequest
          ? graphModule.createEntity({
              data: {
                properties: {},
                entityTypeId: linkEntityTypeIds.rootedAt,
                linkData: {
                  leftEntityId: aiChatBlockEntityId,
                  rightEntityId: requestMessageEntityId,
                },
              },
            })
          : [],
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
          : [],
      ].flat(),
    );

    return requestMessageEntity as RequestMessage;
  };

export const createResponseMessageEntityMethod =
  (context: {
    graphModule: GraphBlockHandler;
    aiChatBlockEntityId: EntityId;
  }) =>
  async (params: {
    parentRequestEntityId: EntityId;
    messageContent: string;
  }): Promise<ResponseMessage> => {
    const { graphModule, aiChatBlockEntityId } = context;
    const { parentRequestEntityId, messageContent } = params;

    const { data: responseMessageEntity, errors } =
      await graphModule.createEntity<ResponseMessage["properties"]>({
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

    return responseMessageEntity as ResponseMessage;
  };
