/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  Block,
  BlockBlockDataLink,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  TextDataType,
} from "./shared";

export type {
  Block,
  BlockBlockDataLink,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  TextDataType,
};

export type QuickNote = Entity<QuickNoteProperties>;

export type QuickNoteOutgoingLinkAndTarget = never;

export type QuickNoteOutgoingLinksByLinkEntityTypeId = {};

export type QuickNoteProperties = QuickNoteProperties1 & QuickNoteProperties2;
export type QuickNoteProperties1 = BlockCollectionProperties;

export type QuickNoteProperties2 = {};
