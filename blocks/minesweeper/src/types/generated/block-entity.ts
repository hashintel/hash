/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

export type BlockEntity = MinesweeperBlock;

export type BlockEntityOutgoingLinkAndTarget =
  MinesweeperBlockOutgoingLinkAndTarget;

export type MinesweeperBlock = Entity<MinesweeperBlockProperties>;

export type MinesweeperBlockOutgoingLinkAndTarget = never;

export type MinesweeperBlockOutgoingLinksByLinkEntityTypeId = {};

/**
 * The block entity of the "Minesweeper" block.
 *
 * See: https://blockprotocol.org/@hash/blocks/minesweeper
 */
export type MinesweeperBlockProperties = {
  "https://blockprotocol.org/@hash/types/property-type/number-of-mines/"?: NumberOfMinesPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/number-of-columns/"?: NumberOfColumnsPropertyValue;
};

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * How many columns there are or should be
 */
export type NumberOfColumnsPropertyValue = NumberDataType;

/**
 * How many mines there are or should be
 */
export type NumberOfMinesPropertyValue = NumberDataType;
