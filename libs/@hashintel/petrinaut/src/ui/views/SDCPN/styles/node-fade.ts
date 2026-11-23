/**
 * How a node outside the focused neighbourhood fades: each part by the alpha
 * of its own colour, never by an opacity. The rules are in `paneStyle`, and
 * node-fade.mdx names the class of each part and why.
 */

/** How strongly a faded node draws, of 1. The rules of the pane spell it out. */
export const fadedNodeStrength = 0.25;

/** Matches every element inside a node that is faded now. */
export const insideFadedNode =
  "[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) *";

/**
 * `colour` as a faded node draws it, for a keyframe, where no rule of the
 * pane can reach.
 */
export const fadedColor = (colour: string): string =>
  `color-mix(in srgb, ${colour} ${fadedNodeStrength * 100}%, transparent)`;

/**
 * The colour of the canvas, which the editor and the preview paint behind the
 * pane. A cover mixes toward it.
 */
export const canvasColor = "var(--colors-neutral-s25)";

/**
 * The shadows of a faded surface with `glow` for its last, for a keyframe.
 * The list has the shape of the one the pane gives a faded surface, an inset
 * shadow that draws nothing first and one shadow for each of its own: the
 * browser mixes two lists of shadows only where they pair up, and changes
 * from one to the other in one step where they do not.
 */
export const fadedSurfaceShadows = (glow: string): string =>
  `inset 0 0 #0000, var(--node-faded-outline-ring, 0 0 #0000), ${glow}`;

/** `colour` as a cover of a faded node draws it, for a keyframe. */
export const fadedCoverColor = (colour: string): string =>
  `color-mix(in srgb, ${colour} ${fadedNodeStrength * 100}%, ${canvasColor})`;
