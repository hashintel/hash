import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/entity-type/kanban-block/v/4 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The title of something
 */
export type TitlePropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * order of the columns
 */
export type KanbanColumnOrderPropertyValue = TextDataValue;
/**
 * columns data of kanban block
 */
export type KanbanColumnsPropertyValue = ObjectDataValue;

/**
 * The block entity of the “Table” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/table
 */
export type KanbanBlockProperties = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  /**
   * @minItems 0
   */
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/kanban-column-order/"?: KanbanColumnOrderPropertyValue[];
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/kanban-columns/"?: KanbanColumnsPropertyValue;
};
/**
 * An opaque, untyped JSON object
 */
export type ObjectDataValue = JsonObject;

export type KanbanBlock = Entity<KanbanBlockProperties>;
export type KanbanBlockLinksByLinkTypeId = {};

export type KanbanBlockLinkAndRightEntities = NonNullable<
  KanbanBlockLinksByLinkTypeId[keyof KanbanBlockLinksByLinkTypeId]
>;

export type RootEntity = KanbanBlock;
export type RootEntityLinkedEntities = KanbanBlockLinkAndRightEntities;
export type RootLinkMap = KanbanBlockLinksByLinkTypeId;
