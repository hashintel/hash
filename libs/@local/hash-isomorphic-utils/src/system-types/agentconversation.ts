/**
 * This file was automatically generated – do not edit it.
 */

import type {
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
} from "./shared.js";
import type { ObjectMetadata } from "@blockprotocol/type-system";

export type {
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
};

/**
 * A conversation between a user and an AI agent, which may have been started on an entity, such as a process.
 */
export type AgentConversation = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/agent-conversation/v/1",
  ];
  properties: AgentConversationProperties;
  propertiesWithMetadata: AgentConversationPropertiesWithMetadata;
};

export type AgentConversationOutgoingLinkAndTarget = never;

export type AgentConversationOutgoingLinksByLinkEntityTypeId = {};

/**
 * A conversation between a user and an AI agent, which may have been started on an entity, such as a process.
 */
export type AgentConversationProperties = {
  "https://hash.ai/@h/types/property-type/agent-id/": AgentIDPropertyValue;
  "https://hash.ai/@h/types/property-type/context-entity-id/"?: ContextEntityIDPropertyValue;
  "https://hash.ai/@h/types/property-type/conversation-id/": ConversationIDPropertyValue;
};

export type AgentConversationPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/agent-id/": AgentIDPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/context-entity-id/"?: ContextEntityIDPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/conversation-id/": ConversationIDPropertyValueWithMetadata;
  };
};

/**
 * An identifier for an AI agent and the service that keeps its conversations, such as `brunch/hash`. It is not the name of a model.
 */
export type AgentIDPropertyValue = TextDataType;

export type AgentIDPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The ID of the entity that was open where something was started, such as the process a conversation was started on.
 */
export type ContextEntityIDPropertyValue = TextDataType;

export type ContextEntityIDPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An identifier for a conversation, in the system that stores its messages.
 */
export type ConversationIDPropertyValue = TextDataType;

export type ConversationIDPropertyValueWithMetadata = TextDataTypeWithMetadata;
