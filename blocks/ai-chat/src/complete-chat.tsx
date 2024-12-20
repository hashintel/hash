import type { EntityId } from "@blockprotocol/graph";
import { useGraphBlockModule } from "@blockprotocol/graph/react";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import { Box, Collapse } from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { SizeMe } from "react-sizeme";
import { TransitionGroup } from "react-transition-group";
import { v4 as uuid } from "uuid";

import { ChatMessage } from "./complete-chat/chat-message";
import type { ChatModelId } from "./complete-chat/chat-model-selector";
import {
  defaultChatModelId,
  isChatModelId,
} from "./complete-chat/chat-model-selector";
import { ChatTextField } from "./complete-chat/chat-textfield";
import { ExamplePrompts } from "./complete-chat/example-prompts";
import { Header } from "./complete-chat/header";
import type { SystemPromptId } from "./complete-chat/system-prompt-selector";
import {
  defaultSystemPromptId,
  isSystemPromptId,
  systemPrompts,
} from "./complete-chat/system-prompt-selector";
import type {
  IncompleteOpenAiAssistantMessage,
  OpenAIChatMessage,
} from "./complete-chat/types";
import type {
  AIChatBlock,
  AIChatBlockProperties,
} from "./types/generated/ai-chat-block";
import {
  createRequestMessageEntityMethod,
  createResponseMessageEntityMethod,
  propertyTypeBaseUrls,
} from "./types/graph";

/**
 * The maximum width of the chat box, currently set to allow for
 * 80 characters to be displayed on a single line in an AI generated
 * code-block.
 */
const maximumWidth = 805;

export type RequestId = `req_${string}`;

export const createRequestId = (): RequestId => `req_${uuid()}`;

export type ResponseId = `res_${string}`;

export const createResponseId = (): ResponseId => `res_${uuid()}`;

const isIdResponseId = (id: RequestId | ResponseId): id is ResponseId =>
  id.startsWith("res_");

export type CompleteChatRequest = {
  id: RequestId;
  entityId?: EntityId;
  message: OpenAIChatMessage<"user">;
  active: boolean;
  childResponseIds: ResponseId[];
};

export type CompleteChatResponse = {
  id: ResponseId;
  entityId?: EntityId;
  message: OpenAIChatMessage<"assistant"> | IncompleteOpenAiAssistantMessage;
  active: boolean;
  childRequestIds: RequestId[];
};

const isMessageCompleteChatResponse = (
  message: CompleteChatRequest | CompleteChatResponse,
): message is CompleteChatResponse => isIdResponseId(message.id);

const constructMessageThread = (params: {
  currentRequest: CompleteChatRequest;
  allRequests: CompleteChatRequest[];
  allResponses: CompleteChatResponse[];
}): (CompleteChatRequest | CompleteChatResponse)[] => {
  const { currentRequest, allRequests, allResponses } = params;

  const currentResponses = allResponses.filter(({ id }) =>
    currentRequest.childResponseIds.includes(id),
  );

  const inActiveResponses = currentResponses.filter(({ active }) => !active);
  const activeResponse = currentResponses.find(({ active }) => active === true);

  const nextRequest = activeResponse
    ? allRequests.find(
        ({ id, active }) =>
          active && activeResponse.childRequestIds.includes(id),
      )
    : undefined;

  return [
    currentRequest,
    ...inActiveResponses,
    ...(activeResponse ? [activeResponse] : []),
    ...(nextRequest
      ? constructMessageThread({
          currentRequest: nextRequest,
          allRequests,
          allResponses,
        })
      : []),
  ];
};

export const CompleteChat: FunctionComponent<{
  readonly: boolean;
  aiChatBlockEntity: AIChatBlock;
  initialRootRequestId?: RequestId;
  initialCompleteChatRequests?: CompleteChatRequest[];
  initialCompleteChatResponses?: CompleteChatResponse[];
}> = ({
  readonly,
  aiChatBlockEntity,
  initialRootRequestId,
  initialCompleteChatRequests,
  initialCompleteChatResponses,
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);

  const [hovered, setHovered] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const {
    metadata: {
      recordId: { entityId: aiChatBlockEntityId },
    },
  } = aiChatBlockEntity;

  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating */
  const { serviceModule } = useServiceBlockModule(blockRootRef);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRootRef);

  const [chatModel, setChatModel] = useState<ChatModelId>(defaultChatModelId);

  const aiChatBlockEntityPresetSystemPromptId = useMemo<
    SystemPromptId | undefined
  >(() => {
    const value =
      aiChatBlockEntity.properties[propertyTypeBaseUrls.presetSystemPromptId];

    return value && isSystemPromptId(value) ? value : undefined;
  }, [aiChatBlockEntity]);

  const aiChatBlockEntityChatAiModel = useMemo<ChatModelId | undefined>(() => {
    const value =
      aiChatBlockEntity.properties[propertyTypeBaseUrls.openAIChatModelName];

    return value && isChatModelId(value) ? value : undefined;
  }, [aiChatBlockEntity]);

  const [systemPromptId, setSystemPromptId] = useState<SystemPromptId>(
    aiChatBlockEntityPresetSystemPromptId ?? defaultSystemPromptId,
  );

  const systemPrompt = useMemo<OpenAIChatMessage<"system">>(
    () => ({ role: "system", content: systemPrompts[systemPromptId] }),
    [systemPromptId],
  );

  /**
   * @todo: consider unifying the `completeChatRequests` and `completeChatResponses`
   * arrays into a single `messages` array to simplify the logic in this file. Potentially
   * `RequestId` and `ResponseId` could be unified in a single `MessageId` as part of this.
   */

  const [completeChatRequests, setCompleteChatRequests] = useState<
    CompleteChatRequest[]
  >(initialCompleteChatRequests ?? []);

  const [completeChatResponses, setCompleteChatResponses] = useState<
    CompleteChatResponse[]
  >(initialCompleteChatResponses ?? []);

  const [rootChatRequestId, setRootChatRequestId] = useState<
    RequestId | undefined
  >(initialRootRequestId);

  const messageThread = useMemo(() => {
    const rootChatRequest = completeChatRequests.find(
      ({ id }) => id === rootChatRequestId,
    );

    return rootChatRequest
      ? constructMessageThread({
          currentRequest: rootChatRequest,
          allRequests: completeChatRequests,
          allResponses: completeChatResponses,
        })
      : [];
  }, [rootChatRequestId, completeChatRequests, completeChatResponses]);

  const [loading, setLoading] = useState<boolean>(false);

  const updateAiChatBlockEntity = useCallback(
    async (params: {
      updatedProperties: Partial<AIChatBlock["properties"]>;
    }) => {
      const { updatedProperties } = params;

      const { errors } = await graphModule.updateEntity({
        data: {
          entityId: aiChatBlockEntity.metadata.recordId.entityId,
          entityTypeId: aiChatBlockEntity.metadata.entityTypeId,
          properties: { ...aiChatBlockEntity.properties, ...updatedProperties },
        },
      });

      if (errors) {
        /** @todo: handle errors */
      }
    },
    [aiChatBlockEntity, graphModule],
  );

  const propertiesToUpdate = useMemo<Partial<AIChatBlockProperties>>(
    () => ({
      ...(aiChatBlockEntityPresetSystemPromptId !== systemPromptId
        ? { [propertyTypeBaseUrls.presetSystemPromptId]: systemPromptId }
        : {}),
      ...(aiChatBlockEntityChatAiModel !== chatModel
        ? { [propertyTypeBaseUrls.openAIChatModelName]: chatModel }
        : {}),
    }),
    [
      aiChatBlockEntityPresetSystemPromptId,
      systemPromptId,
      aiChatBlockEntityChatAiModel,
      chatModel,
    ],
  );

  const shouldUpdateProperties = useMemo(
    () => Object.entries(propertiesToUpdate).length > 0,
    [propertiesToUpdate],
  );

  if (shouldUpdateProperties) {
    void updateAiChatBlockEntity({ updatedProperties: propertiesToUpdate });
  }

  const updateOrAddChatMessage = useCallback(
    (message: CompleteChatRequest | CompleteChatResponse) =>
      isMessageCompleteChatResponse(message)
        ? setCompleteChatResponses((previousResponses) => {
            const existingResponseIndex = previousResponses.findIndex(
              ({ id }) => id === message.id,
            );

            return existingResponseIndex === -1
              ? [...previousResponses, message]
              : [
                  ...previousResponses.slice(0, existingResponseIndex),
                  message,
                  ...previousResponses.slice(existingResponseIndex + 1),
                ];
          })
        : setCompleteChatRequests((previousRequests) => {
            const existingRequestIndex = previousRequests.findIndex(
              ({ id }) => id === message.id,
            );

            return existingRequestIndex === -1
              ? [...previousRequests, message]
              : [
                  ...previousRequests.slice(0, existingRequestIndex),
                  message,
                  ...previousRequests.slice(existingRequestIndex + 1),
                ];
          }),
    [setCompleteChatResponses, setCompleteChatRequests],
  );

  const createRequestMessageEntity = useMemo(
    () =>
      createRequestMessageEntityMethod({ graphModule, aiChatBlockEntityId }),
    [graphModule, aiChatBlockEntityId],
  );

  const createResponseMessageEntity = useMemo(
    () =>
      createResponseMessageEntityMethod({ graphModule, aiChatBlockEntityId }),
    [graphModule, aiChatBlockEntityId],
  );

  const submitUserMessage = useCallback(
    async (params: {
      previousResponseId?: ResponseId;
      userMessage: OpenAIChatMessage<"user">;
    }) => {
      const { previousResponseId, userMessage } = params;

      const requestId = createRequestId();
      const responseId = createResponseId();

      const request: CompleteChatRequest = {
        id: requestId,
        message: userMessage,
        active: true,
        childResponseIds: [responseId],
      };

      const previousResponse = completeChatResponses.find(
        ({ id }) => id === previousResponseId,
      );

      if (previousResponse && !previousResponse.entityId) {
        throw new Error("Previous response does not have an entity ID");
      }

      /**
       * Intentionally don't `await` the promise so that calling the `completeChat`
       * method isn't delayed
       */
      const promisedRequestMessageEntity = createRequestMessageEntity({
        parentResponseEntityId: previousResponse?.entityId,
        messageContent: userMessage.content,
      });

      const response: CompleteChatResponse = {
        id: responseId,
        message: { role: "assistant" },
        active: true,
        childRequestIds: [],
      };

      setCompleteChatRequests((previousRequests) => [
        ...previousRequests,
        request,
      ]);

      if (previousResponseId) {
        setCompleteChatResponses((previousResponses) => {
          const previousResponseIndex = previousResponses.findIndex(
            ({ id }) => id === previousResponseId,
          );

          if (previousResponseIndex === -1) {
            throw new Error("Previous response not found");
          }

          return [
            ...previousResponses.slice(0, previousResponseIndex),
            {
              ...previousResponses[previousResponseIndex]!,
              childRequestIds: [
                ...previousResponses[previousResponseIndex]!.childRequestIds,
                requestId,
              ],
            },
            ...previousResponses.slice(previousResponseIndex + 1),
          ];
        });
      } else {
        setRootChatRequestId(requestId);
      }

      setTimeout(() => {
        setCompleteChatResponses((previousResponses) => {
          const existingResponse = previousResponses.find(
            ({ id }) => id === response.id,
          );

          return existingResponse
            ? previousResponses
            : [...previousResponses, response];
        });
      }, 500);

      setLoading(true);

      const { data, errors } = await serviceModule.openaiCompleteChat({
        data: {
          model: chatModel,
          messages: [
            systemPrompt,
            ...messageThread
              .map(({ message }) => message)
              .filter(
                (
                  message,
                ): message is
                  | OpenAIChatMessage<"user">
                  | OpenAIChatMessage<"assistant"> => "content" in message,
              ),
            userMessage,
          ],
        },
      });

      setLoading(false);

      if (errors) {
        /** @todo: handle and display errors */
      }

      if (data) {
        const [firstChoice] = data.choices;

        const firstChoiceMessage = firstChoice?.message;

        if (firstChoiceMessage) {
          response.message =
            firstChoiceMessage as OpenAIChatMessage<"assistant">;

          updateOrAddChatMessage(response);

          const requestMessageEntity = await promisedRequestMessageEntity;
          const responseMessageEntity = await createResponseMessageEntity({
            parentRequestEntityId:
              requestMessageEntity.metadata.recordId.entityId,
            messageContent: firstChoiceMessage.content,
          });

          request.entityId = requestMessageEntity.metadata.recordId.entityId;
          response.entityId = responseMessageEntity.metadata.recordId.entityId;

          updateOrAddChatMessage(request);
          updateOrAddChatMessage(response);
        }
      }
    },
    [
      chatModel,
      serviceModule,
      systemPrompt,
      messageThread,
      completeChatResponses,
      updateOrAddChatMessage,
      createRequestMessageEntity,
      createResponseMessageEntity,
    ],
  );

  const chatHasStarted = completeChatRequests.length > 0;

  return (
    <Box
      ref={blockRootRef}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      sx={{ maxWidth: maximumWidth }}
    >
      <SizeMe>
        {({ size }) => {
          const isMobile = (size.width ?? 0) < 620;

          return (
            <>
              <Header
                readonly={readonly}
                isMobile={isMobile}
                disabled={chatHasStarted}
                hovered={hovered}
                inputFocused={inputFocused}
                chatModel={chatModel}
                setChatModel={setChatModel}
                systemPromptId={systemPromptId}
                setSystemPromptId={setSystemPromptId}
              />
              <Box
                sx={{
                  position: "relative",
                  backgroundColor: ({ palette }) => palette.common.white,
                  borderRadius: 2,
                  borderStyle: "solid",
                  borderColor: ({ palette }) => palette.gray[20],
                  borderSize: 1,
                }}
              >
                <TransitionGroup>
                  {messageThread.map(({ id, message }) => (
                    <Collapse key={id}>
                      <ChatMessage readonly={readonly} message={message} />
                    </Collapse>
                  ))}
                </TransitionGroup>
                {readonly ? null : (
                  <Box padding={3}>
                    <ChatTextField
                      loading={loading}
                      chatHasStarted={chatHasStarted}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      submitMessageContent={(messageContent) => {
                        const lastMessage =
                          messageThread[messageThread.length - 1];

                        void submitUserMessage({
                          previousResponseId:
                            lastMessage && isIdResponseId(lastMessage.id)
                              ? lastMessage.id
                              : undefined,
                          userMessage: {
                            role: "user",
                            content: messageContent,
                          },
                        });
                      }}
                    />
                    <Collapse in={!chatHasStarted}>
                      <Box
                        sx={{
                          marginX: isMobile ? 0 : 3,
                          marginTop: 3,
                        }}
                      >
                        <ExamplePrompts
                          isMobile={isMobile}
                          submitPrompt={(prompt) =>
                            submitUserMessage({
                              userMessage: { role: "user", content: prompt },
                            })
                          }
                        />
                      </Box>
                    </Collapse>
                  </Box>
                )}
              </Box>
            </>
          );
        }}
      </SizeMe>
    </Box>
  );
};
