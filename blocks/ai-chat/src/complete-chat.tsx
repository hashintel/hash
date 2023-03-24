import { useServiceBlockModule } from "@blockprotocol/service/react";
import { Box, Collapse } from "@mui/material";
import {
  FunctionComponent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { TransitionGroup } from "react-transition-group";

import { ChatMessage } from "./complete-chat/chat-message";
import {
  ChatModelId,
  defaultChatModelId,
} from "./complete-chat/chat-model-selector";
import { ChatTextField } from "./complete-chat/chat-textfield";
import { ExamplePrompts } from "./complete-chat/example-prompts";
import { Header } from "./complete-chat/header";
import {
  defaultSystemPromptId,
  SystemPromptId,
  systemPrompts,
} from "./complete-chat/system-prompt-selector";
import {
  IncompleteOpenAiAssistantMessage,
  OpenAIChatMessage,
} from "./complete-chat/types";

let requestCounter = 0;

type RequestId = `req_${number}`;

const createRequestId = (): RequestId => `req_${requestCounter++}`;

let responseCounter = 0;

type ResponseId = `res_${number}`;

const createResponseId = (): ResponseId => `res_${responseCounter++}`;

const isIdResponseId = (id: RequestId | ResponseId): id is ResponseId =>
  id.startsWith("res_");

type CompleteChatRequest = {
  id: RequestId;
  message: OpenAIChatMessage<"user">;
  active: boolean;
  childResponseIds: ResponseId[];
};

type CompleteChatResponse = {
  id: ResponseId;
  message: OpenAIChatMessage<"assistant"> | IncompleteOpenAiAssistantMessage;
  active: boolean;
  childRequestIds: RequestId[];
};

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

export const CompleteChat: FunctionComponent = () => {
  const blockRootRef = useRef<HTMLDivElement>(null);

  const { serviceModule } = useServiceBlockModule(blockRootRef);

  const [chatModel, setChatModel] = useState<ChatModelId>(defaultChatModelId);

  const [systemPromptId, setSystemPromptId] = useState<SystemPromptId>(
    defaultSystemPromptId,
  );

  const systemPrompt = useMemo<OpenAIChatMessage<"system">>(
    () => ({ role: "system", content: systemPrompts[systemPromptId] }),
    [systemPromptId],
  );

  const [completeChatRequests, setCompleteChatRequests] = useState<
    CompleteChatRequest[]
  >([]);
  const [completeChatResponses, setCompleteChatResponses] = useState<
    CompleteChatResponse[]
  >([]);

  const [rootChatRequestId, setRootChatRequestId] = useState<RequestId>();

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

      if (!rootChatRequestId) {
        setRootChatRequestId(requestId);
      }

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
                (message): message is OpenAIChatMessage<"user" | "assistant"> =>
                  "content" in message,
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
          setCompleteChatResponses((previousResponses) => {
            const existingResponseIndex = previousResponses.findIndex(
              ({ id }) => id === responseId,
            );

            if (existingResponseIndex === -1) {
              return [
                ...previousResponses,
                {
                  ...response,
                  message: firstChoiceMessage as OpenAIChatMessage<"assistant">,
                },
              ];
            }
            return [
              ...previousResponses.slice(0, existingResponseIndex),
              {
                ...response,
                message: firstChoiceMessage as OpenAIChatMessage<"assistant">,
              },
              ...previousResponses.slice(existingResponseIndex + 1),
            ];
          });
        }
      }
    },
    [chatModel, serviceModule, systemPrompt, messageThread, rootChatRequestId],
  );

  const chatHasStarted = completeChatRequests.length > 0;

  return (
    <Box ref={blockRootRef}>
      <Header
        disabled={chatHasStarted}
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
              <ChatMessage message={message} />
            </Collapse>
          ))}
        </TransitionGroup>

        <Box padding={3}>
          <ChatTextField
            loading={loading}
            chatHasStarted={chatHasStarted}
            submitMessageContent={(messageContent) => {
              const lastMessage = messageThread[messageThread.length - 1];

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
            <Box marginX={3} marginTop={3}>
              <ExamplePrompts
                submitPrompt={(prompt) =>
                  submitUserMessage({
                    userMessage: { role: "user", content: prompt },
                  })
                }
              />
            </Box>
          </Collapse>
        </Box>
      </Box>
    </Box>
  );
};
