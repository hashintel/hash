/**
 * This file was automatically generated – do not edit it.
 */

import type {
  HasSubject,
  HasSubjectOutgoingLinkAndTarget,
  HasSubjectOutgoingLinksByLinkEntityTypeId,
  HasSubjectProperties,
  HasSubjectPropertiesWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
} from "./shared.js";
import type { Entity, ObjectMetadata } from "@blockprotocol/type-system";

export type {
  HasSubject,
  HasSubjectOutgoingLinkAndTarget,
  HasSubjectOutgoingLinksByLinkEntityTypeId,
  HasSubjectProperties,
  HasSubjectPropertiesWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
};

/**
 * A conversation between a user and an AI agent, which may be about something, such as a process.
 */
export type AgentConversation = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/agent-conversation/v/1",
  ];
  properties: AgentConversationProperties;
  propertiesWithMetadata: AgentConversationPropertiesWithMetadata;
};

export type AgentConversationHasSubjectLink = {
  linkEntity: HasSubject;
  rightEntity: Entity;
};

export type AgentConversationOutgoingLinkAndTarget =
  AgentConversationHasSubjectLink;

export type AgentConversationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-subject/v/1": AgentConversationHasSubjectLink;
};

/**
 * A conversation between a user and an AI agent, which may be about something, such as a process.
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
 * An identifier for an AI agent.
 */
export type AgentIDPropertyValue = TextDataType;

export type AgentIDPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An identifier for a conversation, in the system that stores its messages.
 */
export type ConversationIDPropertyValue = TextDataType;

export type ConversationIDPropertyValueWithMetadata = TextDataTypeWithMetadata;
