/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

export type BlockEntity = KanbanBoardBlock;

export type BlockEntityOutgoingLinkAndTarget =
  KanbanBoardBlockOutgoingLinkAndTarget;

export type KanbanBoardBlock = Entity<KanbanBoardBlockProperties>;

export type KanbanBoardBlockOutgoingLinkAndTarget = never;

export type KanbanBoardBlockOutgoingLinksByLinkEntityTypeId = {};

/**
 * The block entity of the “Kanban Board” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/kanban-board
 */
export type KanbanBoardBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  /**
   * @minItems 0
   */
  "https://blockprotocol.org/@hash/types/property-type/kanban-board-column/"?: KanbanBoardColumnPropertyValue[];
};

/**
 * An identifier for a card stored on a column on the “Kanban Board” block.
 *
 * Each card ID should be unique across all cards within a given board.
 */
export type KanbanBoardCardIDPropertyValue = TextDataType;

/**
 * The definition of a specific card within a column on the “Kanban Board” block.
 */
export type KanbanBoardCardPropertyValue = {
  "https://blockprotocol.org/@hash/types/property-type/kanban-board-card-id/": KanbanBoardCardIDPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
};

/**
 * An identifier for a column stored on the “Kanban Board” block.
 *
 * Each column ID should be unique across all columns within a given board.
 */
export type KanbanBoardColumnIDPropertyValue = TextDataType;

/**
 * The definition of a specific column within the “Kanban Board” block.
 */
export type KanbanBoardColumnPropertyValue = {
  "https://blockprotocol.org/@hash/types/property-type/kanban-board-column-id/": KanbanBoardColumnIDPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/kanban-board-card/"?: KanbanBoardCardPropertyValue[];
};

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataType;

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataType;
