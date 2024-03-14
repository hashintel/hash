import type { Entity, EntityId } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJson from "../package.json";
import { defaultChatModelId } from "./complete-chat/chat-model-selector";
import { defaultSystemPromptId } from "./complete-chat/system-prompt-selector";
import Component from "./index";
import type {
  AIChatRequestMessage,
  AIChatResponseMessage,
  BlockEntity,
} from "./types/generated/ai-chat-block";
import {
  entityTypeIds,
  linkEntityTypeIds,
  propertyTypeBaseUrls,
} from "./types/graph";

const node = document.getElementById("app");

const blockEntity: BlockEntity = {
  metadata: {
    recordId: {
      entityId: "block-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId: entityTypeIds.aiChatBlock,
  },
  properties: {},
} as const;

const blockEntityId = blockEntity.metadata.recordId.entityId;

const requestMessageEntity1: AIChatRequestMessage = {
  metadata: {
    recordId: {
      entityId: "ai-chat-request",
      editionId: new Date().toISOString(),
    },
    entityTypeId: entityTypeIds.requestMessage,
  },
  properties: {
    [propertyTypeBaseUrls.textContent]: "Test Request Message",
  },
};

const requestMessageEntity1Id =
  requestMessageEntity1.metadata.recordId.entityId;

const responseMessageEntity1: AIChatResponseMessage = {
  metadata: {
    recordId: {
      entityId: "ai-chat-response",
      editionId: new Date().toISOString(),
    },
    entityTypeId: entityTypeIds.responseMessage,
  },
  properties: {
    [propertyTypeBaseUrls.textContent]: "Test Response Message",
  },
};

const responseMessageEntity1Id =
  responseMessageEntity1.metadata.recordId.entityId;

let counter = 0;

const createLink = (params: {
  linkEntityTypeId: `${string}v/${number}`;
  leftEntityId: EntityId;
  rightEntityId: EntityId;
}): Entity => ({
  metadata: {
    recordId: {
      entityId: `link-${counter++}`,
      editionId: new Date().toISOString(),
    },
    entityTypeId: params.linkEntityTypeId,
  },
  properties: {},
  linkData: {
    leftEntityId: params.leftEntityId,
    rightEntityId: params.rightEntityId,
  },
});

const _existingChatGraph: Entity[] = [
  {
    ...blockEntity,
    properties: {
      [propertyTypeBaseUrls.openAIChatModelName]: defaultChatModelId,
      [propertyTypeBaseUrls.presetSystemPromptId]: defaultSystemPromptId,
    },
  },
  requestMessageEntity1,
  createLink({
    linkEntityTypeId: linkEntityTypeIds.rootedAt,
    leftEntityId: blockEntityId,
    rightEntityId: requestMessageEntity1Id,
  }),
  createLink({
    linkEntityTypeId: linkEntityTypeIds.hasMessage,
    leftEntityId: blockEntityId,
    rightEntityId: requestMessageEntity1Id,
  }),
  responseMessageEntity1,
  createLink({
    linkEntityTypeId: linkEntityTypeIds.hasResponse,
    leftEntityId: blockEntityId,
    rightEntityId: responseMessageEntity1Id,
  }),
  createLink({
    linkEntityTypeId: linkEntityTypeIds.hasMessage,
    leftEntityId: requestMessageEntity1Id,
    rightEntityId: responseMessageEntity1Id,
  }),
];

/**
 * This is an embedding application for local development and debugging.
 * It is the application loaded into the browser when you run 'yarn dev' (or 'npm run dev')
 * No data from it will be published with your block or included as part of a production build.
 *
 * The component used here, 'MockBlockDock', does the following:
 * 1. It renders your block on the page and provides the initial properties specified below
 * 2. It holds an in-memory datastore of entities and links
 * 3. It listens for messages from your blocks and updates its datastore appropriately (e.g. to create a new entity)
 * 4. It displays a debug UI allowing you to see the contents of its datastore, and messages sent back and forth
 */
const DevApp = () => {
  return (
    <MockBlockDock
      blockDefinition={{ ReactComponent: Component }}
      blockEntityRecordId={blockEntity.metadata.recordId}
      blockInfo={packageJson.blockprotocol}
      debug // remove this to start with the debug UI minimised. You can also toggle it in the UI
      initialData={{
        initialEntities: [blockEntity],
        // initialEntities: _existingChatGraph,
      }}
      simulateDatastoreLatency={{
        // configure this to adjust the range of artificial latency in responses to datastore-related requests (in ms)
        min: 50,
        max: 200,
      }}
      blockProtocolApiKey={process.env.BLOCK_PROTOCOL_API_KEY} // add this to an .env file in the block folder
      blockProtocolSiteHost={
        process.env.BLOCK_PROTOCOL_SITE_HOST ?? "https://blockprotocol.org"
      } // update this to a recent staging deployment when testing
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
