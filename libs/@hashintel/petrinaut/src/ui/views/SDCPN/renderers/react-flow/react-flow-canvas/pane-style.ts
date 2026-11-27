import { css } from "@hashintel/ds-helpers/css";

/**
 * The pane of the canvas: the element around React Flow. It holds the clocks
 * of a fold and of a focus, and every rule that fades what is outside the
 * focused neighbourhood: the arcs, the nodes and the shapes of the minimap.
 */
export const paneStyle = css({
  width: "[100%]",
  height: "[100%]",
  "--canvas-fold-easing": "cubic-bezier(0.22, 1, 0.36, 1)",
  "&[data-animated=false]": {
    "--canvas-fold-duration": "0ms",
  },
  "@media (prefers-reduced-motion: reduce)": {
    "--canvas-fold-duration": "0ms",
  },
  "& .react-flow__pane": {
    cursor: `var(--pane-cursor) !important`,
  },
  // React Flow positions each edge's `svg` with no insets, and such a box is
  // never a layout root: an arc that moves lays out the pane. With the insets
  // it already sits at, the layout stops at the arc.
  "& .react-flow__edges svg": { top: "[0]", left: "[0]" },
  "& .minimap-shape": {
    transition: "[opacity var(--canvas-focus-duration, 200ms) ease]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  // The fade of the arcs: see the rules that set these opacities, below.
  "& .arc-shaft, & .arc-pulse, & .fusion-line": {
    transition: "[stroke-opacity var(--canvas-focus-duration, 200ms) ease]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  // The second stroke of a line comes back once the line has faded back in:
  // any sooner and it would show through the line.
  "& .arc-line": {
    transition:
      "[stroke-opacity 0s linear var(--canvas-focus-duration, 200ms)]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  "& .arc-head": {
    transition: "[fill-opacity var(--canvas-focus-duration, 200ms) ease]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  // A component instance's height animates between folded and unfolded, so
  // the card grows and shrinks rather than jumping. React Flow reads the pins
  // again on every frame the node resizes, which keeps the links on them.
  "& .react-flow__node.react-flow__node-componentInstance": {
    transition:
      "[height var(--canvas-fold-duration, 180ms) var(--canvas-fold-easing)]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
  // A node outside the neighbourhood fades by the colour of each part, with
  // no opacity and no transition: node-fade.mdx holds the rules and why. A
  // node React Flow marks selected stays out: a selection box marks it before
  // the editor's selection has it, and it wears the focus ring until then.
  //
  // The card or box. Its first shadow is inset and draws nothing, so the
  // shadows change at once instead of mixing with those of `nodeFocusStyle`;
  // a faded flash lists them the same way, in `fadedSurfaceShadows`.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-surface":
    {
      backgroundColor:
        "[var(--node-faded-fill, color-mix(in srgb, var(--node-fill) 25%, transparent))]",
      backgroundImage: "[var(--node-faded-fill-image, none)]",
      backgroundClip: "[padding-box]",
      boxShadow:
        "[inset 0 0 #0000, var(--node-faded-outline-ring, 0 0 #0000), var(--focus-glow, 0 0 0 3px #fff0)]",
    },
  // Text. A text with a colour of its own names it as `--node-text`, and
  // any other inherits one. `color` is inherited, so the class goes on the
  // element that holds the text and has no element inside it.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-text":
    {
      color:
        "[color-mix(in srgb, var(--node-text, currentColor) 25%, transparent)]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-fill":
    {
      backgroundColor:
        "[color-mix(in srgb, var(--node-fill) 25%, transparent)]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-border":
    {
      borderColor:
        "[color-mix(in srgb, var(--node-border, currentColor) 25%, transparent)]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-inlay":
    {
      backgroundColor: "[transparent]",
    },
  // A part that hides what it lies on stays opaque, and mixes toward the
  // colour of the canvas, which the editor and the preview paint behind this
  // pane. So do its text and its border, where it has them.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-cover":
    {
      backgroundColor:
        "[color-mix(in srgb, var(--node-fill) 25%, var(--colors-neutral-s25))]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-cover.node-text":
    {
      color:
        "[color-mix(in srgb, var(--node-text, currentColor) 25%, var(--colors-neutral-s25))]",
    },
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) .node-cover.node-border":
    {
      borderColor:
        "[color-mix(in srgb, var(--node-border) 25%, var(--colors-neutral-s25))]",
    },
  // The outline of a node an arc is being drawn onto, found by an attribute
  // one handle has: no rule ends in a class every handle has.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) [data-arc-target]::after":
    {
      outlineColor:
        "[color-mix(in srgb, var(--node-outline, transparent) 25%, transparent)]",
    },
  // An icon keeps its colour, and each of its shapes fades by the opacity of
  // its fill and of its stroke. The bolt of a firing is left out: it is drawn
  // for the length of its animation, which fades it.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) :not(.node-bolt) > svg :is(path, circle, ellipse, rect, line, polyline, polygon)":
    {
      fillOpacity: "[0.25]",
      strokeOpacity: "[0.25]",
    },
  // A filled icon is a fill under a stroke of the same colour, and both at
  // 0.25 would show the inner half of the stroke as a darker rim. So its
  // stroke goes, and the shape is smaller by half the width of that stroke.
  "&[data-focus-active] .react-flow__node:not(.canvas-focus-role):not(.selected) :not(.node-bolt) > svg[fill=currentColor] :is(path, circle, ellipse, rect, line, polyline, polygon)":
    {
      strokeOpacity: "[0]",
    },
  // An arc outside the neighbourhood fades by its strokes, each at an opacity
  // of its own, and its weight stays: arc-layer.mdx holds the rules and why.
  // The whole line, which lies under the shaft and the head, goes at once.
  "&[data-focus-active] .arc-run > .arc-shaft, &[data-focus-active] .arc-own:not(.canvas-focus-role) > .arc-shaft, &[data-focus-active] .react-flow__edge-fusion:not(.canvas-focus-role) .fusion-line":
    {
      strokeOpacity: "[0.45]",
    },
  "&[data-focus-active] .arc-run > .arc-line, &[data-focus-active] .arc-own:not(.canvas-focus-role) > .arc-line":
    {
      strokeOpacity: "[0]",
      transition: "[none]",
    },
  "&[data-focus-active] .arc-run > .arc-head, &[data-focus-active] .arc-own:not(.canvas-focus-role) > .arc-head":
    {
      fillOpacity: "[0.45]",
    },
  // The pulse of a firing is the whole line, which runs on under the head.
  // On a faded arc it stops where the head begins, as the line does: a pulse
  // says what share of its length that is.
  "&[data-focus-active] .arc-run > .arc-pulses > .arc-pulse, &[data-focus-active] .arc-own:not(.canvas-focus-role) > .arc-pulses > .arc-pulse":
    {
      strokeOpacity: "[0.45]",
      strokeDasharray: "[var(--arc-faded-dash)]",
    },
  // Marks that lie on their line fade with it as one group, by an opacity
  // with no transition: those of a read or an inhibitor arc and of a fusion
  // link's knot.
  "&[data-focus-active] .arc-own.arc-strokes:not(.canvas-focus-role), &[data-focus-active] .react-flow__edge-fusion:not(.canvas-focus-role) .arc-strokes":
    {
      opacity: "[0.45]",
    },
  // A minimap shape outside the neighbourhood drops right back: the map is
  // small enough that anything short of that competes with the neighbourhood.
  "&[data-focus-active] .minimap-shape:not(.canvas-focus-role)": {
    opacity: "[0.12]",
  },
});
