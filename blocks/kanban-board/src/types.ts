import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/entity-type/kanban-block/v/19 for the root JSON Schema these types were generated from
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
 * 123
 */
export type KbnBoardColumnsPropertyValue = {
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/id/": IDPropertyValue;
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/kbn-board-cards/"?: KbnBoardCardsPropertyValue;
}[];
/**
 * An arbitrary ID
 */
export type IDPropertyValue = TextDataValue;
/**
 * 132
 */
export type KbnBoardCardsPropertyValue = {
  "https://blockprotocol-9a7200lt2.stage.hash.ai/@ciaranm/types/property-type/text-content/"?: TextContentPropertyValue;
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/id/": IDPropertyValue;
}[];
/**
 * Textual content
 */
export type TextContentPropertyValue = TextDataValue;

/**
 * The block entity of the “Table” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/table
 */
export type KanbanBlockProperties = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/kbn-board-columns/"?: KbnBoardColumnsPropertyValue;
};

export type KanbanBlock = Entity<KanbanBlockProperties>;
export type KanbanBlockLinksByLinkTypeId = {};

export type KanbanBlockLinkAndRightEntities = NonNullable<
  KanbanBlockLinksByLinkTypeId[keyof KanbanBlockLinksByLinkTypeId]
>;

export type RootEntity = KanbanBlock;
export type RootEntityLinkedEntities = KanbanBlockLinkAndRightEntities;
export type RootLinkMap = KanbanBlockLinksByLinkTypeId;
