import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/divider-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The height of a UI element in pixels.
 */
export type HeightInPixelsPropertyValue = NumberDataValue;
/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataValue = number;
/**
 * The text color represented as a CSS-compatible color property expressed as a string.
 *
 * This is any ‘legal’ color value in CSS, for example (but not limited to)
 *
 * - a hexadecimal string: “#FFFFFF”
 *
 * - a named color: “skyblue”
 *
 * - an RGB value in functional notation: “rgb(255, 0, 255)”
 *
 * - an HSLA value in functional notation: “hsla(120, 100%, 50%)”
 *
 * See: https://www.w3schools.com/cssref/css_colors_legal.php
 */
export type CSSBackgroundColorPropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;

/**
 * The block entity for the “Divider” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/divider
 */
export type DividerBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/height-in-pixels/"?: HeightInPixelsPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/css-background-color/"?: CSSBackgroundColorPropertyValue;
};

export type DividerBlock = Entity<DividerBlockProperties>;
export type DividerBlockLinksByLinkTypeId = {};

export type DividerBlockLinkAndRightEntities = NonNullable<
  DividerBlockLinksByLinkTypeId[keyof DividerBlockLinksByLinkTypeId]
>;

export type RootEntity = DividerBlock;
export type RootEntityLinkedEntities = DividerBlockLinkAndRightEntities;
export type RootLinkMap = DividerBlockLinksByLinkTypeId;
