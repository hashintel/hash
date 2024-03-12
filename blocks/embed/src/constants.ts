// These are arbitary values. Ideally the Embedding Application should provide
// some of them to the block

import type { ProviderName } from "./types";

/**
 * This helps ensure there's space for the edit button
 * when resizing.
 */
const EDIT_BTN_ALLOWANCE = 40;

/**
 * max width of block
 */
export const MAX_WIDTH = 900 - EDIT_BTN_ALLOWANCE;

/**
 * When embeds are loaded, they should take up the default block width. This value acts as a fallback
 */
export const BASE_WIDTH = 600;

/**
 * useful for embeds that don't come with height/width or aspect ratio
 */
export const BASE_HEIGHT = 340;

/**
 * min width of the block
 */
export const MIN_WIDTH = 100;

/**
 * min height of the block
 */
export const MIN_HEIGHT = 200;

/**
 * List of provider names where the aspect ratio should be respected
 * when resizing
 */
export const PROVIDER_NAMES_TO_RESPECT_ASPECT_RATIO = new Set<ProviderName>([
  "YouTube",
  "GIPHY",
]);

/**
 * List of provider names that should not be resized
 * The height and width used are gotten from the fetchEmbed api call
 */
export const PROVIDER_NAMES_THAT_CANT_BE_RESIZED = new Set<ProviderName>([
  "Twitter",
]);
