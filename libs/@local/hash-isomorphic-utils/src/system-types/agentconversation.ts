/**
 * This file was automatically generated – do not edit it.
 */

import type {
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
} from "./shared.js";
import type { Entity, ObjectMetadata } from "@blockprotocol/type-system";

export type {
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
};

/**
 * A conversation between a user and an AI agent, which may focus on entities, such as a process.
 */
export type AgentConversation = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/agent-conversation/v/1",
  ];
  properties: AgentConversationProperties;
  propertiesWithMetadata: AgentConversationPropertiesWithMetadata;
};

export type AgentConversationHasAgentConversationFocusLink = {
  linkEntity: HasAgentConversationFocus;
  rightEntity: Entity;
};

export type AgentConversationOutgoingLinkAndTarget =
  AgentConversationHasAgentConversationFocusLink;

export type AgentConversationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-agent-conversation-focus/v/1": AgentConversationHasAgentConversationFocusLink;
};

/**
 * A conversation between a user and an AI agent, which may focus on entities, such as a process.
 */
export type AgentConversationProperties = {
  "https://hash.ai/@h/types/property-type/agent-id/": AgentIDPropertyValue;
  "https://hash.ai/@h/types/property-type/conversation-id/": ConversationIDPropertyValue;
};

export type AgentConversationPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/agent-id/": AgentIDPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/conversation-id/": ConversationIDPropertyValueWithMetadata;
  };
};

/**
 * An identifier for an AI agent and the service that keeps its conversations, such as `brunch/hash`. It is not the name of a model.
 */
export type AgentIDPropertyValue = TextDataType;

export type AgentIDPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An identifier for a conversation, in the system that stores its messages.
 */
export type ConversationIDPropertyValue = TextDataType;

export type ConversationIDPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An entity that an agent conversation focuses on, such as a process. Only for agent conversations: like the conversation, it is private to the user who created it by default.
 */
export type HasAgentConversationFocus = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/has-agent-conversation-focus/v/1",
  ];
  properties: HasAgentConversationFocusProperties;
  propertiesWithMetadata: HasAgentConversationFocusPropertiesWithMetadata;
};

export type HasAgentConversationFocusOutgoingLinkAndTarget = never;

export type HasAgentConversationFocusOutgoingLinksByLinkEntityTypeId = {};

/**
 * An entity that an agent conversation focuses on, such as a process. Only for agent conversations: like the conversation, it is private to the user who created it by default.
 */
export type HasAgentConversationFocusProperties = LinkProperties & {};

export type HasAgentConversationFocusPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };
