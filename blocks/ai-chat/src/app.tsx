import { Subgraph } from "@blockprotocol/graph/.";
import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import { getOutgoingLinkAndTargetEntities } from "@blockprotocol/graph/stdlib";
import { theme } from "@hashintel/design-system";
import { ThemeProvider } from "@mui/material";
import { useMemo, useState } from "react";

import {
  CompleteChat,
  CompleteChatRequest,
  CompleteChatResponse,
  createRequestId,
  createResponseId,
  RequestId,
  ResponseId,
} from "./complete-chat";
import {
  activeKey,
  AIChatRequest,
  aiChatRequestEntityTypeId,
  aiChatRequestResponseLinkTypeId,
  AIChatResponse,
  aiChatResponseEntityTypeId,
  aiChatResponseRequestLinkTypeId,
  messageContentKey,
  rootAIChatRequestLinkTypeId,
} from "./complete-chat/graph";
import { AIChatBlock } from "./types/generated/block-entity";

const isMessageEntityAIChatRequest = (
  message: AIChatRequest | AIChatResponse,
): message is AIChatRequest =>
  message.metadata.entityTypeId === aiChatRequestEntityTypeId;

const getRemainingMessagesFromSubgraph = (params: {
  id: RequestId | ResponseId;
  currentMessageEntity: AIChatRequest | AIChatResponse;
  subgraph: Subgraph;
}): {
  requests: CompleteChatRequest[];
  responses: CompleteChatResponse[];
} => {
  const { currentMessageEntity, subgraph } = params;

  const requests: CompleteChatRequest[] = [];
  const responses: CompleteChatResponse[] = [];

  if (isMessageEntityAIChatRequest(currentMessageEntity)) {
    const childResponseEntities = getOutgoingLinkAndTargetEntities(
      subgraph,
      currentMessageEntity.metadata.recordId.entityId,
    )
      .filter(
        ({ linkEntity, rightEntity }) =>
          linkEntity.metadata.entityTypeId ===
            aiChatRequestResponseLinkTypeId &&
          rightEntity.metadata.entityTypeId === aiChatResponseEntityTypeId,
      )
      .map(({ rightEntity }) => rightEntity as AIChatResponse);

    const childResponseIds: ResponseId[] = [];

    for (const childResponseEntity of childResponseEntities) {
      const responseId = createResponseId();
      childResponseIds.push(responseId);

      const childRemainingMessages = getRemainingMessagesFromSubgraph({
        id: responseId,
        currentMessageEntity: childResponseEntity,
        subgraph,
      });

      requests.push(...childRemainingMessages.requests);
      responses.push(...childRemainingMessages.responses);
    }

    const request: CompleteChatRequest = {
      id: params.id as RequestId,
      entityId: currentMessageEntity.metadata.recordId.entityId,
      message: {
        role: "user",
        content: currentMessageEntity.properties[messageContentKey],
      },
      active: currentMessageEntity.properties[activeKey],
      childResponseIds,
    };

    requests.push(request);
  } else {
    /** @todo: figure out why TS is not inferring the `AIChatResponse` type */
    const currentResponseEntity = currentMessageEntity as AIChatResponse;

    const childRequestEntities = getOutgoingLinkAndTargetEntities(
      subgraph,
      currentResponseEntity.metadata.recordId.entityId,
    )
      .filter(
        ({ linkEntity, rightEntity }) =>
          linkEntity.metadata.entityTypeId ===
            aiChatResponseRequestLinkTypeId &&
          rightEntity.metadata.entityTypeId === aiChatRequestEntityTypeId,
      )
      .map(({ rightEntity }) => rightEntity as AIChatRequest);

    const childRequestIds: RequestId[] = [];

    for (const childRequestEntity of childRequestEntities) {
      const requestId = createRequestId();
      childRequestIds.push(requestId);

      const childMessages = getRemainingMessagesFromSubgraph({
        id: requestId,
        currentMessageEntity: childRequestEntity,
        subgraph,
      });

      requests.push(...childMessages.requests);
      responses.push(...childMessages.responses);
    }

    const response: CompleteChatResponse = {
      id: params.id as ResponseId,
      entityId: currentResponseEntity.metadata.recordId.entityId,
      message: {
        role: "assistant",
        content: currentResponseEntity.properties[messageContentKey],
      },
      active: currentResponseEntity.properties[activeKey],
      childRequestIds,
    };

    responses.push(response);
  }

  return { requests, responses };
};

export const App: BlockComponent<AIChatBlock> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity: aiChatBlockEntity } =
    useEntitySubgraph(blockEntitySubgraph);

  const [initialBlockEntitySubgraph] = useState(blockEntitySubgraph);

  const aiChatBlockEntityId = aiChatBlockEntity.metadata.recordId.entityId;

  const {
    initialRootRequestId,
    initialCompleteChatRequests,
    initialCompleteChatResponses,
  } = useMemo(() => {
    const aiChatBlockOutgoingLinkAndTargetEntities =
      getOutgoingLinkAndTargetEntities(
        initialBlockEntitySubgraph,
        aiChatBlockEntityId,
      );

    const rootRequestEntity = aiChatBlockOutgoingLinkAndTargetEntities.find(
      ({ linkEntity, rightEntity }) =>
        linkEntity.metadata.entityTypeId === rootAIChatRequestLinkTypeId &&
        rightEntity.metadata.entityTypeId === aiChatRequestEntityTypeId,
    )?.rightEntity;

    if (!rootRequestEntity) {
      return {
        initialRootRequestId: undefined,
        initialCompleteChatRequests: [],
        initialCompleteChatResponses: [],
      };
    }

    const rootRequestId = createRequestId();

    const { requests, responses } = getRemainingMessagesFromSubgraph({
      id: rootRequestId,
      currentMessageEntity: rootRequestEntity as AIChatRequest,
      subgraph: initialBlockEntitySubgraph,
    });

    return {
      initialRootRequestId: rootRequestId,
      initialCompleteChatRequests: requests,
      initialCompleteChatResponses: responses,
    };
  }, [initialBlockEntitySubgraph, aiChatBlockEntityId]);

  return (
    <ThemeProvider theme={theme}>
      <CompleteChat
        readonly={readonly ?? false}
        aiChatBlockEntity={aiChatBlockEntity}
        initialRootRequestId={initialRootRequestId}
        initialCompleteChatRequests={initialCompleteChatRequests}
        initialCompleteChatResponses={initialCompleteChatResponses}
      />
    </ThemeProvider>
  );
};
