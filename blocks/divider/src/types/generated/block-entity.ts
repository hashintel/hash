/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

export type BlockEntity = DividerBlock;

export type BlockEntityOutgoingLinkAndTarget =
  DividerBlockOutgoingLinkAndTarget;

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
export type CSSBackgroundColorPropertyValue = TextDataType;

export type DividerBlock = Entity<DividerBlockProperties>;

export type DividerBlockOutgoingLinkAndTarget = never;

export type DividerBlockOutgoingLinksByLinkEntityTypeId = {};

/**
 * The block entity for the “Divider” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/divider
 */
export type DividerBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/height-in-pixels/"?: HeightInPixelsPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/css-background-color/"?: CSSBackgroundColorPropertyValue;
};

/**
 * The height of a UI element in pixels.
 */
export type HeightInPixelsPropertyValue = NumberDataType;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;
