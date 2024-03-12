/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type AIChatRequestMessage = Entity<AIChatRequestMessageProperties>;

export type AIChatRequestMessageHasResponseLink = {
  linkEntity: HasResponse;
  rightEntity: AIChatResponseMessage;
};

export type AIChatRequestMessageOutgoingLinkAndTarget =
  AIChatRequestMessageHasResponseLink;

export type AIChatRequestMessageOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@blockprotocol/types/entity-type/has-response/v/1": AIChatRequestMessageHasResponseLink;
};

/**
 * Defines a user-provided request message in an “AI Chat” Block’s thread.
 */
export type AIChatRequestMessageProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValue;
};

export type AIChatResponseMessage = Entity<AIChatResponseMessageProperties>;

export type AIChatResponseMessageFollowedByLink = {
  linkEntity: FollowedBy;
  rightEntity: AIChatRequestMessage;
};

export type AIChatResponseMessageOutgoingLinkAndTarget =
  AIChatResponseMessageFollowedByLink;

export type AIChatResponseMessageOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@blockprotocol/types/entity-type/followed-by/v/1": AIChatResponseMessageFollowedByLink;
};

/**
 * Defines an AI-generated response message in an “AI Chat” Block’s thread.
 */
export type AIChatResponseMessageProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValue;
};

export type FollowedBy = Entity<FollowedByProperties> & { linkData: LinkData };

export type FollowedByOutgoingLinkAndTarget = never;

export type FollowedByOutgoingLinksByLinkEntityTypeId = {};

/**
 * This thing came after or occurred subsequently.
 */
export type FollowedByProperties = FollowedByProperties1 &
  FollowedByProperties2;
export type FollowedByProperties1 = LinkProperties;

export type FollowedByProperties2 = {};

export type HasResponse = Entity<HasResponseProperties> & {
  linkData: LinkData;
};

export type HasResponseOutgoingLinkAndTarget = never;

export type HasResponseOutgoingLinksByLinkEntityTypeId = {};

/**
 * A reaction or reply to this thing.
 */
export type HasResponseProperties = HasResponseProperties1 &
  HasResponseProperties2;
export type HasResponseProperties1 = LinkProperties;

export type HasResponseProperties2 = {};

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataType;
