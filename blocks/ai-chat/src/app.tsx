import type { Subgraph } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import { getOutgoingLinkAndTargetEntities } from "@blockprotocol/graph/stdlib";
import { theme } from "@hashintel/design-system/theme";
import { ThemeProvider } from "@mui/material";
import { useMemo, useState } from "react";

import type {
  CompleteChatRequest,
  CompleteChatResponse,
  RequestId,
  ResponseId,
} from "./complete-chat";
import {
  CompleteChat,
  createRequestId,
  createResponseId,
} from "./complete-chat";
import type {
  AIChatBlock,
  AIChatRequestMessage,
  AIChatResponseMessage,
} from "./types/generated/ai-chat-block";
import {
  entityTypeIds,
  linkEntityTypeIds,
  propertyTypeBaseUrls,
} from "./types/graph";

const isMessageRequestMessage = (
  message: AIChatRequestMessage | AIChatResponseMessage,
): message is AIChatRequestMessage =>
  message.metadata.entityTypeId === entityTypeIds.requestMessage;

const getRemainingMessagesFromSubgraph = (params: {
  id: RequestId | ResponseId;
  currentMessageEntity: AIChatRequestMessage | AIChatResponseMessage;
  subgraph: Subgraph;
}): {
  requests: CompleteChatRequest[];
  responses: CompleteChatResponse[];
} => {
  const { currentMessageEntity, subgraph } = params;

  const requests: CompleteChatRequest[] = [];
  const responses: CompleteChatResponse[] = [];

  if (isMessageRequestMessage(currentMessageEntity)) {
    const childResponseEntities = getOutgoingLinkAndTargetEntities(
      subgraph,
      currentMessageEntity.metadata.recordId.entityId,
    )
      .filter(
        ({ linkEntity, rightEntity }) =>
          linkEntity.metadata.entityTypeId === linkEntityTypeIds.hasResponse &&
          rightEntity.metadata.entityTypeId === entityTypeIds.responseMessage,
      )
      .map(({ rightEntity }) => rightEntity as AIChatResponseMessage);

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
        content:
          currentMessageEntity.properties[propertyTypeBaseUrls.textContent],
      },
      active: true,
      childResponseIds,
    };

    requests.push(request);
  } else {
    /** @todo: figure out why TS is not inferring the `AIChatResponseMessage` type */
    const currentResponseEntity = currentMessageEntity as AIChatResponseMessage;

    const childRequestEntities = getOutgoingLinkAndTargetEntities(
      subgraph,
      currentResponseEntity.metadata.recordId.entityId,
    )
      .filter(
        ({ linkEntity, rightEntity }) =>
          linkEntity.metadata.entityTypeId === linkEntityTypeIds.followedBy &&
          rightEntity.metadata.entityTypeId === entityTypeIds.requestMessage,
      )
      .map(({ rightEntity }) => rightEntity as AIChatRequestMessage);

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
        content:
          currentResponseEntity.properties[propertyTypeBaseUrls.textContent],
      },
      active: true,
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
        linkEntity.metadata.entityTypeId === linkEntityTypeIds.rootedAt &&
        rightEntity.metadata.entityTypeId === entityTypeIds.requestMessage,
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
      currentMessageEntity: rootRequestEntity as AIChatRequestMessage,
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
