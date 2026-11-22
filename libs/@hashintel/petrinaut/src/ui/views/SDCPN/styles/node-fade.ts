/**
 * How a node outside the focused neighbourhood fades.
 *
 * No element of a node takes an opacity to fade. For an opacity on an element
 * that draws several things, the browser draws that element into a buffer of
 * its own on every frame of a pan, a zoom or a drag, and a net has one such
 * element per node. So each thing a faded node draws takes the fade in the
 * alpha of its own colour, and what lies behind the node shows through it.
 *
 * The rules are in the pane of the canvas, `paneStyle` in `pane-style.ts` of
 * the React Flow renderer. They find what a node draws by the classes below.
 * A colour a rule has to mix is a custom property that its element sets and
 * never changes, and a rule changes nothing that an element with elements
 * inside it hands down: a change of focus then restyles the parts, and not
 * every element of every node.
 *
 * | Class          | What it draws                               | While its node is faded                        |
 * | -------------- | ------------------------------------------- | ---------------------------------------------- |
 * | `node-surface` | The card or box: a fill of `--node-fill`    | The fill and the ring of a classic box at 0.25 |
 * | `node-text`    | Text of `--node-text`, or of the colour it  | That colour at 0.25                            |
 * |                | inherits. It holds no element.              |                                                |
 * | `node-fill`    | A background of `--node-fill`               | 0.25                                           |
 * | `node-border`  | A border of `--node-border`, or of the      | 0.25                                           |
 * |                | text's colour                               |                                                |
 * | `node-inlay`   | A background nearly its card's own          | Not drawn: the card under it draws that colour |
 * | `node-cover`   | A part that hides what it lies on           | Opaque, mixed 0.25 toward the canvas colour    |
 *
 * An icon needs no class: the pane fades every shape of an `svg` in a faded
 * node by the opacity of its fill and of its stroke. The flash and the bolt
 * of a firing are keyframes, which no rule reaches, so the animation asks
 * whether its node is faded, and the bolt carries `node-bolt` to be left out
 * of the rule for icons. The glow of a flash fades back into the shadows of
 * the surface, so the keyframe of a faded flash lists its shadows as the pane
 * lists those of a faded surface. A flash changes the colour of the card
 * under an inlay, so the animation draws the inlay of a faded card for as
 * long, as a cover.
 *
 * A cover is a token count or a port's pin. Each lies across the border of
 * its node, which a translucent part would show through it, and a count is
 * white on black, which only an opaque black keeps white. Where the canvas is
 * behind a cover it looks as it would under an opacity, and what else is
 * behind it does not show.
 *
 * No part takes a transition for the fade: a node dims in one frame and comes
 * back in one, and the arcs fade around it. A transition per part is work on
 * the main thread for every part on every frame of a fade. The surface times
 * the ring and the glow of a node in the neighbourhood, in `nodeFocusStyle`.
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
