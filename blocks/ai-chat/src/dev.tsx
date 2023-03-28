import { Entity, EntityId } from "@blockprotocol/graph";
import { MockBlockDock } from "mock-block-dock";
import { createRoot } from "react-dom/client";

import packageJson from "../package.json";
import { defaultChatModelId } from "./complete-chat/chat-model-selector";
import {
  activeKey,
  aiChatMessageLinkTypeId,
  AIChatRequest,
  aiChatRequestEntityTypeId,
  aiChatRequestResponseLinkTypeId,
  AIChatResponse,
  aiChatResponseEntityTypeId,
  chatAIModelKey,
  messageContentKey,
  presetSystemPromptIdKey,
  rootAIChatRequestLinkTypeId,
} from "./complete-chat/graph";
import { defaultSystemPromptId } from "./complete-chat/system-prompt-selector";
import Component from "./index";
import { BlockEntity } from "./types/generated/block-entity";

const node = document.getElementById("app");

const blockEntity: BlockEntity = {
  metadata: {
    recordId: {
      entityId: "block-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId:
      "http://localhost:3000/@alice/types/entity-type/ai-chat-block/v/6",
  },
  properties: {},
} as const;

const blockEntityId = blockEntity.metadata.recordId.entityId;

const aiChatRequestEntity1: AIChatRequest = {
  metadata: {
    recordId: {
      entityId: "ai-chat-request",
      editionId: new Date().toISOString(),
    },
    entityTypeId: aiChatRequestEntityTypeId,
  },
  properties: {
    [messageContentKey]: "Test Request Message",
    [activeKey]: true,
  },
};

const aiChatRequestEntity1Id = aiChatRequestEntity1.metadata.recordId.entityId;

const aiChatResponseEntity1: AIChatResponse = {
  metadata: {
    recordId: {
      entityId: "ai-chat-response",
      editionId: new Date().toISOString(),
    },
    entityTypeId: aiChatResponseEntityTypeId,
  },
  properties: {
    [messageContentKey]: "Test Response Message",
    [activeKey]: true,
  },
};

const aiChatResponseEntity1Id =
  aiChatResponseEntity1.metadata.recordId.entityId;

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
      [chatAIModelKey]: defaultChatModelId,
      [presetSystemPromptIdKey]: defaultSystemPromptId,
    },
  },
  aiChatRequestEntity1,
  createLink({
    linkEntityTypeId: rootAIChatRequestLinkTypeId,
    leftEntityId: blockEntityId,
    rightEntityId: aiChatRequestEntity1Id,
  }),
  createLink({
    linkEntityTypeId: aiChatMessageLinkTypeId,
    leftEntityId: blockEntityId,
    rightEntityId: aiChatRequestEntity1Id,
  }),
  aiChatResponseEntity1,
  createLink({
    linkEntityTypeId: aiChatMessageLinkTypeId,
    leftEntityId: blockEntityId,
    rightEntityId: aiChatResponseEntity1Id,
  }),
  createLink({
    linkEntityTypeId: aiChatRequestResponseLinkTypeId,
    leftEntityId: aiChatRequestEntity1Id,
    rightEntityId: aiChatResponseEntity1Id,
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
      blockProtocolApiKey={process.env.BP_API_KEY}
      blockProtocolSiteHost={process.env.BP_HOST ?? "https://blockprotocol.org"} // update this to a recent staging deployment when testing
      // includeDefaultMockData // this seeds the datastore with sample entities and links, remove this to start with just the contents of `initialData`
      // hideDebugToggle <- uncomment this to disable the debug UI entirely
      // initialEntities={[]} <- customise the entities in the datastore (blockEntity is always added, if you provide it)
      // initialEntityTypes={[]} <- customise the entity types in the datastore
      // initialLinks={[]} <- customise the links in the datastore
      // initialLinkedQueries={[]} <- customise the linkedQueries in the datastore
      // readonly <- uncomment this to start your block in readonly mode. You can also toggle it in the UI
    />
  );
};

if (node) {
  createRoot(node).render(<DevApp />);
} else {
  throw new Error("Unable to find DOM element with id 'app'");
}
