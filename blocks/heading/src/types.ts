import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/heading-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The “level” or size of the heading, this can be an integer between 1 to 6 (inclusive).
 *
 * This corresponds to the equivalent HTML tags (h1, h2, etc.)
 */
export type HTMLHeadingLevelPropertyValue = NumberDataValue;
/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataValue = number;
/**
 * The text color, represented as a CSS-compatible color property expressed as a string.
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
export type CSSTextColorPropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataValue;

/**
 * The block entity for the “Heading” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/heading
 */
export type HeadingBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/html-heading-level/"?: HTMLHeadingLevelPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/css-text-color/"?: CSSTextColorPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
};

export type HeadingBlock = Entity<HeadingBlockProperties>;
export type HeadingBlockLinksByLinkTypeId = {};

export type HeadingBlockLinkAndRightEntities = NonNullable<
  HeadingBlockLinksByLinkTypeId[keyof HeadingBlockLinksByLinkTypeId]
>;

export type RootEntity = HeadingBlock;
export type RootEntityLinkedEntities = HeadingBlockLinkAndRightEntities;
export type RootLinkMap = HeadingBlockLinksByLinkTypeId;
