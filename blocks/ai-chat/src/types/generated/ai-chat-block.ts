/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  AIChatRequestMessage,
  AIChatRequestMessageHasResponseLink,
  AIChatRequestMessageOutgoingLinkAndTarget,
  AIChatRequestMessageOutgoingLinksByLinkEntityTypeId,
  AIChatRequestMessageProperties,
  AIChatResponseMessage,
  AIChatResponseMessageFollowedByLink,
  AIChatResponseMessageOutgoingLinkAndTarget,
  AIChatResponseMessageOutgoingLinksByLinkEntityTypeId,
  AIChatResponseMessageProperties,
  FollowedBy,
  FollowedByOutgoingLinkAndTarget,
  FollowedByOutgoingLinksByLinkEntityTypeId,
  FollowedByProperties,
  HasResponse,
  HasResponseOutgoingLinkAndTarget,
  HasResponseOutgoingLinksByLinkEntityTypeId,
  HasResponseProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  TextDataType,
  TextualContentPropertyValue,
} from "./shared";

export type {
  AIChatRequestMessage,
  AIChatRequestMessageHasResponseLink,
  AIChatRequestMessageOutgoingLinkAndTarget,
  AIChatRequestMessageOutgoingLinksByLinkEntityTypeId,
  AIChatRequestMessageProperties,
  AIChatResponseMessage,
  AIChatResponseMessageFollowedByLink,
  AIChatResponseMessageOutgoingLinkAndTarget,
  AIChatResponseMessageOutgoingLinksByLinkEntityTypeId,
  AIChatResponseMessageProperties,
  FollowedBy,
  FollowedByOutgoingLinkAndTarget,
  FollowedByOutgoingLinksByLinkEntityTypeId,
  FollowedByProperties,
  HasResponse,
  HasResponseOutgoingLinkAndTarget,
  HasResponseOutgoingLinksByLinkEntityTypeId,
  HasResponseProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  TextDataType,
  TextualContentPropertyValue,
};

export type AIChatBlock = Entity<AIChatBlockProperties>;

export type AIChatBlockHasMessageLink = {
  linkEntity: HasMessage;
  rightEntity: AIChatResponseMessage | AIChatRequestMessage;
};

export type AIChatBlockOutgoingLinkAndTarget =
  | AIChatBlockRootedAtLink
  | AIChatBlockHasMessageLink;

export type AIChatBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@blockprotocol/types/entity-type/rooted-at/v/1": AIChatBlockRootedAtLink;
  "https://blockprotocol.org/@blockprotocol/types/entity-type/has-message/v/1": AIChatBlockHasMessageLink;
};

/**
 * An identifier for the selected preset system prompt used in the “AI Chat” block.
 *
 * Must be one of:
 * - "concise"
 * - "elaborate"
 * - "sensitive"
 * - "pirate"
 */
export type AIChatBlockPresetSystemPromptIDPropertyValue = TextDataType;

/**
 * The block entity of the “AI Chat” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/ai-chat
 */
export type AIChatBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-chat-model-name/"?: OpenAIChatModelNamePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/ai-chat-block-preset-system-prompt-id/"?: AIChatBlockPresetSystemPromptIDPropertyValue;
};

export type AIChatBlockRootedAtLink = {
  linkEntity: RootedAt;
  rightEntity: AIChatRequestMessage;
};

export type BlockEntity = AIChatBlock;

export type BlockEntityOutgoingLinkAndTarget = AIChatBlockOutgoingLinkAndTarget;

export type HasMessage = Entity<HasMessageProperties> & { linkData: LinkData };

export type HasMessageOutgoingLinkAndTarget = never;

export type HasMessageOutgoingLinksByLinkEntityTypeId = {};

/**
 * Contains this message.
 */
export type HasMessageProperties = HasMessageProperties1 &
  HasMessageProperties2;
export type HasMessageProperties1 = LinkProperties;

export type HasMessageProperties2 = {};

/**
 * The name of an OpenAI model supported by the Block Protocol service module, which is capable of producing chat message outputs.
 *
 * Currently only "gpt-3.5-turbo" is supported.
 */
export type OpenAIChatModelNamePropertyValue = TextDataType;

export type RootedAt = Entity<RootedAtProperties> & { linkData: LinkData };

export type RootedAtOutgoingLinkAndTarget = never;

export type RootedAtOutgoingLinksByLinkEntityTypeId = {};

/**
 * Starting, originating, or based at this thing.
 */
export type RootedAtProperties = RootedAtProperties1 & RootedAtProperties2;
export type RootedAtProperties1 = LinkProperties;

export type RootedAtProperties2 = {};
