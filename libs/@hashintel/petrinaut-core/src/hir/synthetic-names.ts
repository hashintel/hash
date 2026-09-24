/**
 * Names the lowering coins for nodes the user never wrote, shared with the
 * printer so it can re-sugar them. Kept apart from the lowering because the
 * printer runs in the browser and the lowering pulls in the TypeScript
 * compiler.
 */

/** The element parameter the lowering gives a `.map` callback written without one. */
export const SYNTHETIC_MAP_ELEMENT_NAME = "__element";
